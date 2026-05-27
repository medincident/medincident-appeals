"use server"

import { AuthError, AuthErrorCode } from "@/services/auth/errors"
import { requireSession } from "@/services/auth/session"

const BACKEND_URL = process.env.BACKEND_URL ?? "http://backend:8080"

export interface RealtimeTicket {
  token: string
  expiresAt: number
  userId: string
}

interface BackendTicketResponse {
  token: string
  expiresAt: string
}

export async function getRealtimeTicketAction(): Promise<RealtimeTicket> {
  const session = await requireSession()

  const url = `${BACKEND_URL}/api/v1/users/${encodeURIComponent(session.userId)}/realtime/tickets`
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.accessToken}` },
    signal: AbortSignal.timeout(5_000),
    cache: "no-store",
  })

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new AuthError(AuthErrorCode.RefreshFailed)
    }
    const body = await res.text().catch(() => "")
    throw new Error(`backend realtime/tickets ${res.status}: ${body}`)
  }

  const data = (await res.json()) as BackendTicketResponse
  if (!data?.token) throw new Error("backend ticket response missing token")

  return {
    token: data.token,
    expiresAt: Date.parse(data.expiresAt),
    userId: session.userId,
  }
}
