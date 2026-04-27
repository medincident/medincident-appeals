"use client"

import * as React from "react"
import { toast } from "sonner"
import { mutate as swrMutate } from "swr"
import { CheckCircle2, RefreshCcw, Wifi, WifiOff } from "lucide-react"

import { createAppealAction } from "@/domain/appeals/actions"
import { safeError } from "@/lib/log"
import {
  bumpAttempts,
  countPending,
  isPendingLocked,
  listPending,
  removePending,
} from "@/lib/offline/queue"

function revalidateAppeals(): void {
  void swrMutate(
    (key) => Array.isArray(key) && key[0] === "appeals",
    undefined,
    { revalidate: true },
  )
}

const OFFLINE_TOAST_ID = "aimi-offline"
const FLUSH_TOAST_ID = "aimi-flush"

type Phase = "idle" | "flushing"

async function flushQueue(onAfterFlush?: () => void): Promise<void> {
  const all = await listPending()
  // Пользователь редактирует — не отправляем, пока не сохранит/отменит.
  const pending = all.filter((p) => !isPendingLocked(p.localId))
  if (pending.length === 0) return

  toast.loading(`Отправка неотправленных: ${pending.length}`, {
    id: FLUSH_TOAST_ID,
    icon: <RefreshCcw className="h-4 w-4 animate-spin" />,
  })

  let sent = 0
  let failed = 0

  for (const item of pending) {
    if (isPendingLocked(item.localId)) continue
    try {
      await createAppealAction(item.text)
      await removePending(item.localId)
      sent++
    } catch (err) {
      failed++
      await bumpAttempts(item.localId).catch(() => {})
      console.error("[NetworkStatus] failed to flush appeal:", safeError(err))
    }
  }

  toast.dismiss(FLUSH_TOAST_ID)

  if (sent > 0) {
    toast.success(
      sent === 1
        ? "Обращение отправлено"
        : `Отправлено обращений: ${sent}`,
      {
        icon: <CheckCircle2 className="h-4 w-4" />,
      },
    )
    revalidateAppeals()
  }
  if (failed > 0) {
    toast.error(
      failed === 1
        ? "Не удалось отправить 1 обращение — попробуем позже"
        : `Не удалось отправить: ${failed}. Попробуем позже.`,
    )
  }

  onAfterFlush?.()
}

// Публичный хелпер — дергаем из места, где добавили элемент в очередь,
// чтобы сразу попробовать отправить если сеть в порядке.
export async function tryFlushQueue(): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return
  await flushQueue()
}

export function NetworkStatus() {
  const phaseRef = React.useRef<Phase>("idle")
  const mountedRef = React.useRef(false)

  const runFlush = React.useCallback(async () => {
    if (phaseRef.current === "flushing") return
    phaseRef.current = "flushing"
    try {
      await flushQueue()
    } finally {
      phaseRef.current = "idle"
    }
  }, [])

  React.useEffect(() => {
    if (typeof window === "undefined") return
    mountedRef.current = true

    const showOffline = () => {
      toast(
        "Нет подключения к интернету",
        {
          id: OFFLINE_TOAST_ID,
          description: "Обращения будут сохранены и отправлены при восстановлении сети.",
          icon: <WifiOff className="h-4 w-4" />,
          duration: Infinity,
        },
      )
    }

    const onOnline = async () => {
      toast.dismiss(OFFLINE_TOAST_ID)
      toast.success("Соединение восстановлено", {
        icon: <Wifi className="h-4 w-4" />,
      })
      const pending = await countPending().catch(() => 0)
      if (pending > 0) {
        void runFlush()
      }
    }

    const onOffline = () => {
      showOffline()
    }

    if (navigator.onLine === false) {
      showOffline()
    } else {
      // При запуске онлайн, но есть очередь — попробуем дослать.
      void countPending().then((n) => {
        if (n > 0) void runFlush()
      })
    }

    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)
    return () => {
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
      toast.dismiss(OFFLINE_TOAST_ID)
    }
  }, [runFlush])

  return null
}
