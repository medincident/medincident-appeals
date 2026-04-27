"use client"

import { useProfileStore } from "@/lib/stores/profile.store"
import { useProfileData } from "@/domain/profile/hooks"

import { AppealInput } from "./_home/AppealInput"
import { ErrorPanel } from "./_home/ErrorPanel"
import { Header } from "./_home/Header"
import { SuccessPanel } from "./_home/SuccessPanel"
import { useAppealSubmission } from "./_home/useAppealSubmission"
import { useProcessedAppealsToast } from "./_home/useProcessedAppealsToast"

export default function MainPage() {
  useProfileData()
  useProcessedAppealsToast()

  const firstName = useProfileStore((s) => s.firstName)
  const { text, setText, submitting, submission, textareaRef, submit, resetError } =
    useAppealSubmission()

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <Header />

      <main className="flex-1 flex flex-col w-full max-w-xl mx-auto px-4 pb-4 sm:pb-10 sm:justify-center sm:gap-8">
        <div className="flex-1 sm:flex-initial flex flex-col items-center justify-center gap-2 text-center py-6 sm:py-0">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
            МедИнцидент
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground max-w-md">
            Портал для обращений пациентов.
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
              value={text}
              onChange={setText}
              onSubmit={submit}
              submitting={submitting}
            />
          )}
        </div>
      </main>
    </div>
  )
}
