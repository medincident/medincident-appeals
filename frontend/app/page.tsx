"use client"

import * as React from "react"
import Link from "next/link"
import { ClipboardList } from "lucide-react"
import { toast } from "sonner"

import { useProfileStore } from "@/lib/stores/profile.store"
import { useProfileData } from "@/domain/profile/hooks"
import { createAppealAction } from "@/domain/appeals/actions"
import type { Appeal } from "@/domain/appeals/types"
import { useAppeals } from "@/domain/appeals/hooks"
import { enqueueAppeal } from "@/lib/offline/queue"

import { AppealInput } from "./_components/AppealInput"
import { ErrorPanel } from "./_components/ErrorPanel"
import { NotificationsPopover } from "./_components/NotificationsPopover"
import { ProfilePopover } from "./_components/ProfilePopover"
import { SuccessPanel } from "./_components/SuccessPanel"
import { useProcessedAppealsToast } from "./_components/useProcessedAppealsToast"

type SubmissionState =
  | { kind: "idle" }
  | { kind: "success"; appeal: Appeal; fading: boolean }
  | { kind: "error"; message: string }

export default function MainPage() {
  useProfileData()
  const firstName = useProfileStore((s) => s.firstName)
  const lastName  = useProfileStore((s) => s.lastName)
  const photoUrl  = useProfileStore((s) => s.photoUrl)
  const position  = useProfileStore((s) => s.position)

  const fullName = firstName || lastName
    ? [firstName, lastName].filter(Boolean).join(" ")
    : null
  const initials = ((firstName?.[0] ?? "") + (lastName?.[0] ?? "")).toUpperCase()

  const [appealText, setAppealText] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [submission, setSubmission] = React.useState<SubmissionState>({ kind: "idle" })

  const textareaRef   = React.useRef<HTMLTextAreaElement>(null)
  const fadeTimerRef  = React.useRef<number | null>(null)
  const clearTimerRef = React.useRef<number | null>(null)

  React.useEffect(() => () => {
    if (fadeTimerRef.current)  window.clearTimeout(fadeTimerRef.current)
    if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current)
  }, [])

  const { mutate: mutateAppeals } = useAppeals()

  useProcessedAppealsToast()

  async function handleSubmit() {
    if (!appealText.trim() || submitting) return
    const text = appealText.trim()
    setSubmitting(true)
    setSubmission({ kind: "idle" })

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      try {
        await enqueueAppeal(text)
        setAppealText("")
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
      const appeal = await createAppealAction(text)
      await mutateAppeals()

      setAppealText("")
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

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">

      {/* Header */}
      <header className="w-full px-4 pt-4">
        <div className="mx-auto w-full max-w-xl flex items-center justify-between gap-3">
          <Link
            href="/appeals"
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ClipboardList className="h-4 w-4" />
            <span className="text-sm font-medium">Обращения</span>
          </Link>

          <div className="flex items-center gap-3">
            <NotificationsPopover />
            <ProfilePopover
              fullName={fullName}
              initials={initials}
              photoUrl={photoUrl}
              position={position}
            />
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col w-full max-w-xl mx-auto px-4 pb-4 sm:pb-10 sm:justify-center sm:gap-8">

        <div className="flex-1 sm:flex-initial flex flex-col items-center justify-center gap-2 text-center py-6 sm:py-0">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
            Medincident
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground max-w-md">
            {firstName
              ? `Здравствуйте, ${firstName}. Поделитесь обращением, благодарностью или предложением.`
              : "Портал обращений, благодарностей и предложений."}
          </p>
        </div>

        <div className="w-full flex flex-col gap-3 min-h-[220px]">

          {submission.kind === "success" ? (
            <SuccessPanel appeal={submission.appeal} fading={submission.fading} />
          ) : submission.kind === "error" ? (
            <ErrorPanel message={submission.message} onDismiss={resetError} />
          ) : (
            <AppealInput
              ref={textareaRef}
              value={appealText}
              onChange={setAppealText}
              onSubmit={handleSubmit}
              submitting={submitting}
            />
          )}
        </div>

      </main>
    </div>
  )
}
