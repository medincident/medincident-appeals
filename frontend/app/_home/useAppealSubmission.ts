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

interface UseAppealSubmissionResult {
  text: string
  setText: (v: string) => void
  submitting: boolean
  submission: SubmissionState
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  submit: () => Promise<void>
  resetError: () => void
}

export function useAppealSubmission(): UseAppealSubmissionResult {
  const [text, setText] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [submission, setSubmission] = React.useState<SubmissionState>({ kind: "idle" })

  const textareaRef   = React.useRef<HTMLTextAreaElement>(null)
  const fadeTimerRef  = React.useRef<number | null>(null)
  const clearTimerRef = React.useRef<number | null>(null)

  const { mutate: mutateAppeals } = useAppeals()

  React.useEffect(() => () => {
    if (fadeTimerRef.current)  window.clearTimeout(fadeTimerRef.current)
    if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current)
  }, [])

  async function submit() {
    if (!text.trim() || submitting) return
    const trimmed = text.trim()
    setSubmitting(true)
    setSubmission({ kind: "idle" })

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      try {
        await enqueueAppeal(trimmed)
        setText("")
        setSubmission({ kind: "idle" })
        toast.success("Сохранено локально", {
          description: "Отправим автоматически, когда появится интернет.",
        })
        setTimeout(() => textareaRef.current?.focus(), 50)
      } catch (err) {
        setSubmission({
          kind: "error",
          message: err instanceof Error ? err.message : "Не удалось сохранить офлайн",
        })
      } finally {
        setSubmitting(false)
      }
      return
    }

    try {
      const appeal = await createAppealAction(trimmed)
      await mutateAppeals()

      setText("")
      setSubmission({ kind: "success", appeal, fading: false })

      fadeTimerRef.current = window.setTimeout(() => {
        setSubmission((s) => (s.kind === "success" ? { ...s, fading: true } : s))
      }, 2000)

      clearTimerRef.current = window.setTimeout(() => {
        setSubmission({ kind: "idle" })
        setTimeout(() => textareaRef.current?.focus(), 50)
      }, 2500)
    } catch (err) {
      setSubmission({
        kind: "error",
        message: err instanceof Error ? err.message : "Неизвестная ошибка",
      })
    } finally {
      setSubmitting(false)
    }
  }

  function resetError() {
    setSubmission({ kind: "idle" })
    setTimeout(() => textareaRef.current?.focus(), 50)
  }

  return { text, setText, submitting, submission, textareaRef, submit, resetError }
}
