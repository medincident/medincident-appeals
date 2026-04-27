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

      <main className="flex-1 min-h-0 flex flex-col justify-end pb-6 sm:justify-center sm:pb-0 w-full max-w-xl mx-auto px-4 pt-4">
        <div className="w-full flex flex-col gap-3 mb-12">
          <Link
            href="/appeals"
            className="self-end inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <ClipboardList className="h-3 w-3" />
            История обращений
          </Link>
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
