"use client"

import { createAppealAction } from "@/domain/appeals/actions"
import { isAuthError } from "@/services/auth/errors"
import { safeError } from "@/lib/log"

import {
  isDue,
  isPendingLocked,
  listPending,
  markFlushFailed,
  removePending,
} from "./queue"

export interface FlushResult {
  sent: number
  failed: number
  skipped: number
  authBlocked?: boolean
}

const LOCK_NAME = "aimi-flush-queue"

function hasWebLocks(): boolean {
  return typeof navigator !== "undefined" && "locks" in navigator && typeof navigator.locks?.request === "function"
}

export async function flushQueue(): Promise<FlushResult> {
  if (!hasWebLocks()) return doFlush()
  const result = await navigator.locks.request(
    LOCK_NAME,
    { ifAvailable: true },
    async (lock) => {
      if (!lock) return null
      return doFlush()
    },
  )
  return result ?? { sent: 0, failed: 0, skipped: 0 }
}

async function doFlush(): Promise<FlushResult> {
  const all = await listPending()
  const candidates = all.filter(
    (p) => !isPendingLocked(p.localId) && isDue(p),
  )
  const skippedByPolicy = all.length - candidates.length

  if (candidates.length === 0) {
    return { sent: 0, failed: 0, skipped: skippedByPolicy }
  }

  let sent = 0
  let failed = 0
  let skipped = skippedByPolicy

  for (const item of candidates) {
    if (isPendingLocked(item.localId)) {
      skipped++
      continue
    }
    try {
      await createAppealAction(item.text, item.localId)
      await removePending(item.localId)
      sent++
    } catch (err) {
      if (isAuthError(err)) {
        const remaining = candidates.length - (sent + failed + 1)
        return {
          sent,
          failed,
          skipped: skipped + remaining,
          authBlocked: true,
        }
      }
      failed++
      await markFlushFailed(item.localId).catch(() => {})
      console.error("[offline-flush] failed:", safeError(err))
    }
  }

  return { sent, failed, skipped }
}

export async function tryFlushQueue(): Promise<FlushResult | null> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return null
  return flushQueue()
}
