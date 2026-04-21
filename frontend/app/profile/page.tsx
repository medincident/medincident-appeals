"use client"

import Link from "next/link"
import { ArrowLeft, ArrowUpRight, ExternalLink, Palette } from "lucide-react"

import { useProfileStore } from "@/lib/stores/profile.store"
import { useProfileData } from "@/domain/profile/hooks"

import { AccessibilitySettings } from "./_components/AccessibilitySettings"
import { ThemeToggle } from "./_components/ThemeToggle"
import { UserSummaryCard } from "./_components/UserSummaryCard"

const FULL_PROFILE_URL = "https://zitadel-medincident.ulbwa.bombomeow.ru/profile"

export default function ProfilePage() {
  useProfileData()

  const firstName  = useProfileStore((s) => s.firstName)
  const lastName   = useProfileStore((s) => s.lastName)
  const middleName = useProfileStore((s) => s.middleName)
  const email      = useProfileStore((s) => s.email)
  const position   = useProfileStore((s) => s.position)
  const photoUrl   = useProfileStore((s) => s.photoUrl)

  const fullName = [firstName, middleName, lastName].filter(Boolean).join(" ")
  const initials = ((firstName?.[0] ?? "") + (lastName?.[0] ?? "")).toUpperCase()

  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="mx-auto w-full max-w-xl px-4 py-6 flex flex-col gap-6">

        {/* Back arrow + title */}
        <Link
          href="/"
          className="flex items-center gap-2 -ml-2 w-fit rounded-md px-2 py-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          aria-label="Назад"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="text-lg font-semibold text-foreground">Профиль</span>
        </Link>

        {/* Single panel: nested user card + settings rows */}
        <div
          id="settings"
          className="rounded-xl border border-border bg-card p-3 flex flex-col gap-3"
        >
          <UserSummaryCard
            fullName={fullName}
            initials={initials}
            photoUrl={photoUrl}
            position={position}
            email={email}
          />

          <div className="flex flex-col">
            {/* Full profile row */}
            <Link
              href={FULL_PROFILE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/50 transition-colors"
            >
              <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">Полный профиль</p>
                <p className="text-xs text-muted-foreground">Перейти</p>
              </div>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
            </Link>

            {/* Theme row */}
            <div className="rounded-lg px-3 pt-3 pb-2">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Palette className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">Оформление</p>
                  <p className="text-xs text-muted-foreground">Тема интерфейса</p>
                </div>
              </div>
              <ThemeToggle />
            </div>
          </div>
        </div>

        {/* Accessibility panel */}
        <AccessibilitySettings />

      </div>
    </div>
  )
}
