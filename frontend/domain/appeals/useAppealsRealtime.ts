"use client"

import * as React from "react"
import { useSWRConfig } from "swr"

import { AuthError, isAuthError } from "@/services/auth/errors"

import { getRealtimeTicketAction } from "./realtime-actions"
import type { Appeal, AppealCategory } from "./types"

interface ResultPayload {
  id: string
  user_id?: string
  is_important: boolean
  important_confidence?: number
  formalized_text?: string
  category?: Record<string, string> | null
  subcategory?: Record<string, string> | null
}

interface ErrorPayload {
  id: string
  user_id?: string
  error: string
}

const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS = 30_000
const RECONNECT_JITTER = 0.3
const APPEALS_KEY_TAG = "appeals"

function toCategory(raw: Record<string, string> | null | undefined): AppealCategory | null {
  if (!raw) return null
  const { id, name } = raw
  return id && name ? { id, name } : null
}

function applyResult(prev: Appeal[] | undefined, payload: ResultPayload): Appeal[] | undefined {
  if (!prev) return prev
  let touched = false
  const next = prev.map((a) => {
    if (a.id !== payload.id) return a
    touched = true
    return {
      ...a,
      formalizedText: payload.formalized_text ?? a.formalizedText,
      isImportant: payload.is_important,
      importantConfidence: payload.important_confidence ?? a.importantConfidence,
      category: toCategory(payload.category) ?? a.category,
      subcategory: toCategory(payload.subcategory) ?? a.subcategory,
      status: "processed" as const,
    }
  })
  return touched ? next : prev
}

function applyError(prev: Appeal[] | undefined, payload: ErrorPayload): Appeal[] | undefined {
  if (!prev) return prev
  let touched = false
  const next = prev.map((a) => {
    if (a.id !== payload.id) return a
    touched = true
    return { ...a, status: "failed" as const }
  })
  return touched ? next : prev
}

function backoff(attempt: number): number {
  const base = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** attempt)
  const jitter = 1 + (Math.random() * 2 - 1) * RECONNECT_JITTER
  return Math.round(base * jitter)
}

function isAppealsKey(key: unknown): boolean {
  return Array.isArray(key) && key[0] === APPEALS_KEY_TAG
}

/**
 * Подписывает /appeals на push-обновления через Server-Sent Events.
 * Мутирует SWR-кэш напрямую, без revalidate — чтобы список не мигал и
 * сохранялись развёрнутые карточки.
 */
export function useAppealsRealtime(enabled: boolean = true): void {
  const { mutate } = useSWRConfig()
  // SWRConfig может пересоздавать объект на каждый рендер; ref защищает
  // useEffect от лишних перезапусков стрима.
  const mutateRef = React.useRef(mutate)
  mutateRef.current = mutate

  React.useEffect(() => {
    if (!enabled) return
    if (typeof window === "undefined" || typeof EventSource === "undefined") return

    let source: EventSource | null = null
    let reconnectTimer: number | null = null
    let attempt = 0
    let cancelled = false

    const apply = <P,>(raw: string, fn: (prev: Appeal[] | undefined, p: P) => Appeal[] | undefined) => {
      try {
        const payload = JSON.parse(raw) as P
        void mutateRef.current(
          isAppealsKey,
          (prev: Appeal[] | undefined) => fn(prev, payload),
          { revalidate: false },
        )
      } catch {
        // malformed frame — ignore
      }
    }

    const scheduleReconnect = () => {
      if (cancelled) return
      reconnectTimer = window.setTimeout(connect, backoff(attempt++))
    }

    const connect = async () => {
      if (cancelled) return
      reconnectTimer = null

      let ticket
      try {
        ticket = await getRealtimeTicketAction()
      } catch (err) {
        if (isAuthError(err) || err instanceof AuthError) return
        scheduleReconnect()
        return
      }

      if (cancelled) return

      const es = new EventSource(`/sse/appeals?ticket=${encodeURIComponent(ticket.token)}`)
      source = es

      es.addEventListener("open", () => {
        attempt = 0
      })

      es.addEventListener("appeal.result", (ev) => {
        apply<ResultPayload>((ev as MessageEvent).data, applyResult)
      })

      es.addEventListener("appeal.error", (ev) => {
        apply<ErrorPayload>((ev as MessageEvent).data, applyError)
      })

      es.addEventListener("error", () => {
        // Автореконнект EventSource ходит со старым токеном; берём свежий сами.
        es.close()
        if (source === es) source = null
        scheduleReconnect()
      })
    }

    void connect()

    return () => {
      cancelled = true
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer)
      source?.close()
    }
  }, [enabled])
}
