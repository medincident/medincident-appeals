"use client"

import Link from "next/link"
import { ClipboardList } from "lucide-react"

import { useProfileData } from "@/domain/profile/hooks"

import { AppealInput } from "./_components/appeal/AppealInput"
import { ErrorPanel } from "./_components/appeal/ErrorPanel"
import { SuccessPanel } from "./_components/appeal/SuccessPanel"
import { useProcessedAppealsToast } from "./_components/appeal/useProcessedAppealsToast"
import { Header } from "./_components/toolbar/Header"
import { useAppealSubmission } from "./useAppealSubmission"

export default function MainPage() {
  useProfileData()
  useProcessedAppealsToast()

  const { text, setText, submitting, submission, textareaRef, submit, resetError } =
    useAppealSubmission()

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-background">
      <Header />

      <main className="flex-1 min-h-0 flex flex-col w-full max-w-xl mx-auto px-4 pt-4 pb-6 sm:pb-4">
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center sm:justify-end text-center">
          <div className="space-y-2 max-w-sm sm:mb-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-foreground">
              Поделитесь, что произошло
            </h2>
            <p className="text-sm text-muted-foreground">
              Каждое обращение помогает делать медицинскую помощь лучше.
            </p>
          </div>
        </div>

        <div className="w-full flex flex-col gap-3">
          {submission.kind === "success" ? (
            <SuccessPanel appeal={submission.appeal} fading={submission.fading} />
          ) : submission.kind === "error" ? (
            <ErrorPanel message={submission.message} onDismiss={resetError} />
          ) : (
            <>
              <Link
                href="/appeals"
                className="self-end inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <ClipboardList className="h-3 w-3" />
                История обращений
              </Link>
              <AppealInput
                ref={textareaRef}
                value={text}
                onChange={setText}
                onSubmit={submit}
                submitting={submitting}
              />
            </>
          )}
        </div>

        <div className="hidden sm:block flex-1" />
      </main>
    </div>
  )
}
