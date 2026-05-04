"use client"

import * as React from "react"
import { toast } from "sonner"

import { createAppealAction } from "@/domain/appeals/actions"
import { useAppeals } from "@/domain/appeals/hooks"
import type { Appeal } from "@/domain/appeals/types"
import { isAuthError } from "@/services/auth/errors"
import { useOnlineStatus } from "@/lib/useOnlineStatus"
import { enqueueAppeal } from "@/lib/offline/queue"

type SubmissionState =
  | { kind: "idle" }
  | { kind: "success"; appeal: Appeal; fading: boolean }
  | { kind: "error"; message: string }

const FADE_DELAY = 2000
const RESET_DELAY = 2500
const FOCUS_DELAY = 50

function isLikelyNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const msg = err.message.toLowerCase()
  return (
    err.name === "TypeError" ||
    err.name === "AbortError" ||
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("timeout") ||
    msg.includes("econnrefused") ||
    msg.includes("enotfound")
  )
}

const errorMessage = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback

export function useAppealSubmission() {
  const [text, setText] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [submission, setSubmission] = React.useState<SubmissionState>({ kind: "idle" })

  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const timersRef = React.useRef<number[]>([])

  const online = useOnlineStatus()
  const { mutate: mutateAppeals } = useAppeals()

  const clearTimers = () => {
    timersRef.current.forEach(window.clearTimeout)
    timersRef.current = []
  }
  const scheduleTimer = (fn: () => void, ms: number) => {
    timersRef.current.push(window.setTimeout(fn, ms))
  }
  const isMobile = () =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches
  const focusInput = React.useCallback(() => {
    if (isMobile()) return
    scheduleTimer(() => textareaRef.current?.focus(), FOCUS_DELAY)
  }, [])

  React.useEffect(() => clearTimers, [])

  const reset = React.useCallback(() => {
    setSubmission({ kind: "idle" })
    focusInput()
  }, [focusInput])

  const enqueueAndNotify = async (trimmed: string, savedOfflineMsg: string) => {
    await enqueueAppeal(trimmed)
    setText("")
    toast.success("Сохранено локально", { description: savedOfflineMsg })
    focusInput()
  }

  const submit = async () => {
    const trimmed = text.trim()
    if (!trimmed || submitting) return

    setSubmitting(true)
    setSubmission({ kind: "idle" })

    try {
      if (!online) {
        await enqueueAndNotify(trimmed, "Отправим автоматически, когда появится интернет.")
        return
      }

      const appeal = await createAppealAction(trimmed)
      await mutateAppeals()

      setText("")
      setSubmission({ kind: "success", appeal, fading: false })

      scheduleTimer(() => {
        setSubmission((s) => (s.kind === "success" ? { ...s, fading: true } : s))
      }, FADE_DELAY)
      scheduleTimer(() => {
        setSubmission({ kind: "idle" })
        focusInput()
      }, RESET_DELAY)
    } catch (err) {
      if (isAuthError(err)) {
        setSubmission({ kind: "idle" })
        return
      }
      if (isLikelyNetworkError(err)) {
        try {
          await enqueueAndNotify(trimmed, "Сервер не ответил — отправим, как только будет связь.")
          return
        } catch (saveErr) {
          setSubmission({ kind: "error", message: errorMessage(saveErr, "Не удалось сохранить локально") })
          return
        }
      }
      setSubmission({ kind: "error", message: errorMessage(err, "Неизвестная ошибка") })
    } finally {
      setSubmitting(false)
    }
  }

  return { text, setText, submitting, submission, textareaRef, submit, resetError: reset }
}
