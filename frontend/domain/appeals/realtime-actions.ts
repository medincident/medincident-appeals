"use server"

import { requireSession } from "@/services/auth/session"

export interface RealtimeTicket {
  token: string
  expiresAt?: number
  userId: string
}

export async function getRealtimeTicketAction(): Promise<RealtimeTicket> {
  const session = await requireSession()
  return {
    token: session.accessToken,
    expiresAt: session.expiresAt,
    userId: session.userId,
  }
}
