"use client"

import * as React from "react"
import { toast } from "sonner"

import { createAppealAction } from "@/domain/appeals/actions"
import { useAppeals } from "@/domain/appeals/hooks"
import type { Appeal } from "@/domain/appeals/types"
import { enqueueAppeal } from "@/lib/offline/queue"

type SubmissionState =
  | { kind: "idle" }
  | { kind: "success"; appeal: Appeal; fading: boolean }
  | { kind: "error"; message: string }

const FADE_DELAY = 2000
const RESET_DELAY = 2500
const FOCUS_DELAY = 50

const errorMessage = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback

export function useAppealSubmission() {
  const [text, setText] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [submission, setSubmission] = React.useState<SubmissionState>({ kind: "idle" })

  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const timersRef = React.useRef<number[]>([])

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
  const focusInput = () => {
    if (isMobile()) return
    scheduleTimer(() => textareaRef.current?.focus(), FOCUS_DELAY)
  }

  React.useEffect(() => clearTimers, [])

  const reset = React.useCallback(() => {
    setSubmission({ kind: "idle" })
    focusInput()
  }, [])

  const submit = async () => {
    const trimmed = text.trim()
    if (!trimmed || submitting) return

    setSubmitting(true)
    setSubmission({ kind: "idle" })

    const offline = typeof navigator !== "undefined" && navigator.onLine === false

    try {
      if (offline) {
        await enqueueAppeal(trimmed)
        setText("")
        toast.success("Сохранено локально", {
          description: "Отправим автоматически, когда появится интернет.",
        })
        focusInput()
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
      setSubmission({
        kind: "error",
        message: errorMessage(err, offline ? "Не удалось сохранить офлайн" : "Неизвестная ошибка"),
      })
    } finally {
      setSubmitting(false)
    }
  }

  return { text, setText, submitting, submission, textareaRef, submit, resetError: reset }
}
