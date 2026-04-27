"use server"

import { randomUUID } from "node:crypto"

import { revalidatePath } from "next/cache"

import { auth } from "@/services/auth/auth"
import { appealsCreated } from "@/lib/metrics"
import {
  APPEALS_SUBMIT_SUBJECT,
  getNats,
  jsonCodec,
} from "@/lib/nats"

import type { Appeal, AppealFilters } from "./types"

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

async function enqueueViaNats(id: string, text: string, userId: string): Promise<void> {
  const { js } = await getNats()
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

  const url = `${BACKEND_URL}/api/v1/users/${encodeURIComponent(session.userId!)}/appeals${qs.toString() ? "?" + qs.toString() : ""}`

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
 * Ставит обращение в очередь: публикует в NATS (user_id из сессии).
 * Бэкенд сохраняет строку со статусом `pending`, затем переводит в
 * `processing` и `processed` по ходу обработки. Фронт не ждёт результат —
 * показывает «спасибо» со ссылкой на обращение.
 */
export async function createAppealAction(text: string): Promise<Appeal> {
  const trimmed = text.trim()
  if (!trimmed) throw new Error("Текст обращения не может быть пустым")

  const session = await requireSession()

  const id = randomUUID()
  await enqueueViaNats(id, trimmed, session.userId!)

  const appeal: Appeal = {
    id,
    text: trimmed,
    summary: makeSummary(trimmed),
    formalizedText: trimmed,
    theses: [],
    category: null,
    subcategory: null,
    isImportant: true,
    status: "pending",
    createdAt: new Date().toISOString(),
  }

  appealsCreated.inc({ is_important: String(appeal.isImportant) })
  revalidatePath("/appeals")
  return appeal
}
