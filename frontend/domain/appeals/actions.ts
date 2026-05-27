"use server"

import { randomUUID } from "node:crypto"

import { revalidatePath } from "next/cache"

import { AuthError, AuthErrorCode } from "@/services/auth/errors"
import { requireSession } from "@/services/auth/session"
import { appealsCreated } from "@/lib/metrics"

import type { Appeal, AppealFilters } from "./types"

const BACKEND_URL = process.env.BACKEND_URL ?? "http://backend:8080"

interface BackendAppealRow {
  id: string
  user_id: string
  text: string
  formalized_text: string
  is_important: boolean
  important_confidence?: number
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
    summary: r.text.slice(0, 50),
    formalizedText: r.formalized_text || r.text,
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

interface BackendSubmitResponse {
  id: string
  createdAt: string
}

async function submitViaBackend(
  text: string,
  userId: string,
  accessToken: string,
  idempotencyKey: string,
): Promise<BackendSubmitResponse> {
  const url = `${BACKEND_URL}/api/v1/users/${encodeURIComponent(userId)}/appeals`
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ text, idempotencyKey }),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  })

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new AuthError(AuthErrorCode.RefreshFailed)
    }
    const body = await res.text().catch(() => "")
    throw new Error(`backend POST /users/.../appeals ${res.status}: ${body}`)
  }

  const data = (await res.json()) as BackendSubmitResponse
  if (!data?.id || !data?.createdAt) {
    throw new Error("backend submit response missing id/createdAt")
  }
  return data
}

function makeSummary(text: string, max = 50): string {
  const trimmed = text.trim().replace(/\s+/g, " ")
  return trimmed.length > max ? trimmed.slice(0, max - 1) + "…" : trimmed
}

export async function getAppealsAction(
  filters: AppealFilters = {},
): Promise<Appeal[]> {
  const session = await requireSession()

  const qs = new URLSearchParams()
  if (filters.search) qs.set("search", filters.search)
  if (filters.categoryId) qs.set("category", filters.categoryId)
  if (filters.subcategoryId) qs.set("subcategory", filters.subcategoryId)

  const url = `${BACKEND_URL}/api/v1/users/${encodeURIComponent(session.userId)}/appeals${qs.toString() ? "?" + qs.toString() : ""}`

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${session.accessToken}` },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  })
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new AuthError(AuthErrorCode.RefreshFailed)
    }
    const body = await res.text().catch(() => "")
    throw new Error(`backend /users/.../appeals ${res.status}: ${body}`)
  }
  const data = (await res.json()) as { appeals: BackendAppealRow[] }
  return (data.appeals ?? []).map(rowToAppeal)
}

/**
 * @param idempotencyKey стабильный ключ (например, localId оффлайн-очереди)
 *   для дедупа в JetStream при повторных flush'ах. По умолчанию — свежий UUID.
 */
export async function createAppealAction(
  text: string,
  idempotencyKey?: string,
): Promise<Appeal> {
  const trimmed = text.trim()
  if (!trimmed) throw new Error("Текст обращения не может быть пустым")

  const session = await requireSession()

  const submitted = await submitViaBackend(
    trimmed,
    session.userId,
    session.accessToken,
    idempotencyKey ?? randomUUID(),
  )

  const appeal: Appeal = {
    id: submitted.id,
    text: trimmed,
    summary: makeSummary(trimmed),
    formalizedText: trimmed,
    category: null,
    subcategory: null,
    isImportant: true,
    status: "pending",
    createdAt: submitted.createdAt,
  }

  appealsCreated.inc({ is_important: String(appeal.isImportant) })
  revalidatePath("/appeals")
  return appeal
}
