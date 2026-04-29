"use client"

import * as React from "react"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { mutate as swrMutate } from "swr"
import { CheckCircle2, RefreshCcw, Wifi, WifiOff } from "lucide-react"

import { SessionErrorCode } from "@/services/auth/errors"
import { flushQueue } from "@/lib/offline/flush"
import { countPending } from "@/lib/offline/queue"

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

export function NetworkStatus() {
  const { data: session } = useSession()
  const refreshFailed = session?.error === SessionErrorCode.RefreshAccessTokenError

  const phaseRef = React.useRef<Phase>("idle")
  const refreshFailedRef = React.useRef(refreshFailed)
  refreshFailedRef.current = refreshFailed

  const runFlush = React.useCallback(async () => {
    if (refreshFailedRef.current) return
    if (phaseRef.current === "flushing") return
    phaseRef.current = "flushing"

    const pendingCount = await countPending().catch(() => 0)
    if (pendingCount === 0) {
      phaseRef.current = "idle"
      return
    }

    toast.loading(`Отправка неотправленных: ${pendingCount}`, {
      id: FLUSH_TOAST_ID,
      icon: <RefreshCcw className="h-4 w-4 animate-spin" />,
    })

    try {
      const result = await flushQueue()
      toast.dismiss(FLUSH_TOAST_ID)

      if (result.sent > 0) {
        toast.success(
          result.sent === 1
            ? "Обращение отправлено"
            : `Отправлено обращений: ${result.sent}`,
          { icon: <CheckCircle2 className="h-4 w-4" /> },
        )
        revalidateAppeals()
      }
      if (result.failed > 0) {
        toast.error(
          result.failed === 1
            ? "Не удалось отправить 1 обращение — попробуем позже"
            : `Не удалось отправить: ${result.failed}. Попробуем позже.`,
        )
      }
    } finally {
      phaseRef.current = "idle"
    }
  }, [])

  React.useEffect(() => {
    if (typeof window === "undefined") return

    const showOffline = () => {
      toast("Нет подключения к интернету", {
        id: OFFLINE_TOAST_ID,
        description: "Обращения будут сохранены и отправлены при восстановлении сети.",
        icon: <WifiOff className="h-4 w-4" />,
        duration: Infinity,
      })
    }

    const onOnline = () => {
      toast.dismiss(OFFLINE_TOAST_ID)
      toast.success("Соединение восстановлено", {
        icon: <Wifi className="h-4 w-4" />,
      })
      void runFlush()
    }

    const onOffline = () => {
      showOffline()
    }

    if (navigator.onLine === false) {
      showOffline()
    } else {
      void runFlush()
    }

    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)
    return () => {
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
      toast.dismiss(OFFLINE_TOAST_ID)
    }
  }, [runFlush])

  React.useEffect(() => {
    if (!refreshFailed && navigator.onLine !== false) {
      void runFlush()
    }
  }, [refreshFailed, runFlush])

  return null
}
