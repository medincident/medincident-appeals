"use server"

import { randomUUID } from "node:crypto"

import { revalidatePath } from "next/cache"

import { auth } from "@/services/auth/auth"
import {
  appealsCreated,
  nlpAnalyzeDuration,
  nlpAnalyzeTotal,
  type NlpOutcome,
} from "@/lib/metrics"
import {
  APPEALS_RESULT_SUBJECT_PREFIX,
  APPEALS_SUBMIT_SUBJECT,
  getNats,
  jsonCodec,
} from "@/lib/nats"

import type { Appeal, AppealFilters, NlpAnalyzeResult } from "./types"

const APPEAL_REPLY_TIMEOUT_MS = 20_000

// BACKEND_URL обязателен — фронт ходит в бэкенд за REST-списком обращений.
// В compose прокинут как http://backend:8080, для локального dev — либо тот же
// хост (если dev запущен в той же сети), либо http://localhost:8081 через
// проброшенный порт.
const BACKEND_URL = process.env.BACKEND_URL ?? "http://backend:8080"

// ── session helpers ────────────────────────────────────────────────────────

interface SessionLike {
  userId?: string
  accessToken?: string
  error?: string
}

async function requireSession(): Promise<SessionLike> {
  const session = (await auth()) as unknown as SessionLike | null
  if (!session?.userId || !session.accessToken) {
    throw new Error("NOT_AUTHENTICATED")
  }
  if (session.error === "RefreshAccessTokenError") {
    throw new Error("AUTH_REFRESH_FAILED")
  }
  return session
}

// ── Payload shape (совпадает с backend/main.go appealSubmit / AppealRow) ───

interface AppealSubmitPayload {
  id: string
  text: string
  created_at: string
  user_id: string
}

interface AppealResultPayload {
  id: string
  is_important?: boolean
  important_confidence?: number
  reason?: string
  formalized_text?: string
  theses?: string[]
  category?: { id: string; name: string } | null
  subcategory?: { id: string; name: string } | null
  error?: string
}

// Shape строк из бэкенд-REST /users/:id/appeals (backend.AppealRow).
interface BackendAppealRow {
  id: string
  user_id: string
  text: string
  summary: string
  formalized_text: string
  is_important: boolean
  important_confidence?: number
  reason: string
  theses: string[]
  category_id?: string
  category_name?: string
  subcategory_id?: string
  subcategory_name?: string
  status: string
  created_at: string
}

function rowToAppeal(r: BackendAppealRow): Appeal {
  return {
    id: r.id,
    text: r.text,
    summary: r.summary || r.text.slice(0, 50),
    formalizedText: r.formalized_text || r.text,
    theses: r.theses ?? [],
    category: r.category_id && r.category_name
      ? { id: r.category_id, name: r.category_name }
      : null,
    subcategory: r.subcategory_id && r.subcategory_name
      ? { id: r.subcategory_id, name: r.subcategory_name }
      : null,
    isImportant: r.is_important,
    importantConfidence: r.important_confidence,
    status: (r.status as Appeal["status"]) ?? "processed",
    createdAt: r.created_at,
  }
}

// ── NATS integration ───────────────────────────────────────────────────────

async function analyzeViaNats(
  id: string,
  text: string,
  userId: string,
): Promise<NlpAnalyzeResult | null> {
  let outcome: NlpOutcome = "success"
  const endTimer = nlpAnalyzeDuration.startTimer()
  try {
    const { nc, js } = await getNats()

    const sub = nc.subscribe(`${APPEALS_RESULT_SUBJECT_PREFIX}${id}`, { max: 1 })
    await nc.flush()

    try {
      const payload: AppealSubmitPayload = {
        id,
        text,
        user_id: userId,
        created_at: new Date().toISOString(),
      }
      await js.publish(APPEALS_SUBMIT_SUBJECT, jsonCodec.encode(payload), {
        msgID: `submit-${id}`,
        timeout: 5_000,
      })

      const msg = await Promise.race([
        (async () => {
          for await (const m of sub) return m
          throw new Error("subscription closed before reply")
        })(),
        new Promise<never>((_, rej) =>
          setTimeout(
            () => rej(new Error("timeout waiting for appeal result")),
            APPEAL_REPLY_TIMEOUT_MS,
          ),
        ),
      ])

      const data = jsonCodec.decode(msg.data) as AppealResultPayload
      if (data.error) {
        outcome = "http_error"
        console.error("[appeals.actions] NLP returned error:", data.error)
        return null
      }
      return {
        is_important: data.is_important ?? true,
        important_confidence: data.important_confidence,
        reason: data.reason,
        formalized_text: data.formalized_text,
        theses: data.theses,
        category: data.category ?? null,
        subcategory: data.subcategory ?? null,
      }
    } finally {
      sub.unsubscribe()
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    outcome = msg.includes("timeout") ? "timeout" : "network_error"
    console.error("[appeals.actions] NATS analyze failed:", err)
    return null
  } finally {
    endTimer({ outcome })
    nlpAnalyzeTotal.inc({ outcome })
  }
}

function makeSummary(text: string, max = 50): string {
  const trimmed = text.trim().replace(/\s+/g, " ")
  return trimmed.length > max ? trimmed.slice(0, max - 1) + "…" : trimmed
}

// ── Public server actions ──────────────────────────────────────────────────

/**
 * Забирает список обращений пользователя из backend REST.
 * Фильтры серверные: search (ILIKE) + category + subcategory.
 */
export async function getAppealsAction(
  filters: AppealFilters = {},
): Promise<Appeal[]> {
  const session = await requireSession()

  const qs = new URLSearchParams()
  if (filters.search) qs.set("search", filters.search)
  if (filters.categoryId) qs.set("category", filters.categoryId)
  if (filters.subcategoryId) qs.set("subcategory", filters.subcategoryId)

  const url = `${BACKEND_URL}/users/${encodeURIComponent(session.userId!)}/appeals${qs.toString() ? "?" + qs.toString() : ""}`

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${session.accessToken}` },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`backend /users/.../appeals ${res.status}: ${body}`)
  }
  const data = (await res.json()) as { appeals: BackendAppealRow[] }
  return (data.appeals ?? []).map(rowToAppeal)
}

/**
 * Создаёт обращение: публикует в NATS (user_id прикладывается из сессии),
 * ждёт ответ от backend/nlp. Сама строка сохраняется в БД бэкендом — здесь
 * мы только возвращаем видимый результат для оптимистичного обновления UI.
 */
export async function createAppealAction(text: string): Promise<Appeal> {
  const trimmed = text.trim()
  if (!trimmed) throw new Error("Текст обращения не может быть пустым")

  const session = await requireSession()

  const id = randomUUID()
  const nlp = await analyzeViaNats(id, trimmed, session.userId!)

  const appeal: Appeal = {
    id,
    text: trimmed,
    summary: makeSummary(trimmed),
    formalizedText: nlp?.formalized_text?.trim() || trimmed,
    theses: nlp?.theses ?? [],
    category:    nlp?.category    ?? null,
    subcategory: nlp?.subcategory ?? null,
    isImportant: nlp?.is_important ?? true,
    importantConfidence: nlp?.important_confidence,
    status: nlp ? "processed" : "processing",
    createdAt: new Date().toISOString(),
  }

  appealsCreated.inc({ is_important: String(appeal.isImportant) })
  revalidatePath("/appeals")
  return appeal
}
