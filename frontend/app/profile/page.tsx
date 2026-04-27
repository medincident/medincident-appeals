"use client"

import Link from "next/link"
import { ArrowLeft, ArrowUpRight, Palette, User } from "lucide-react"

import { Card } from "@/components/ui/card"
import { useOnlineStatus } from "@/lib/useOnlineStatus"
import { useProfileStore } from "@/lib/stores/profile.store"
import { useProfileData } from "@/domain/profile/hooks"

import { AccessibilitySettings } from "./_components/AccessibilitySettings"
import { ThemeToggle } from "./_components/ThemeToggle"
import { UserSummaryCard } from "./_components/UserSummaryCard"

const FULL_PROFILE_URL = "https://zitadel-medincident.ulbwa.bombomeow.ru/profile"

export default function ProfilePage() {
  useProfileData()
  const online = useOnlineStatus()

  const firstName  = useProfileStore((s) => s.firstName)
  const lastName   = useProfileStore((s) => s.lastName)
  const middleName = useProfileStore((s) => s.middleName)
  const email      = useProfileStore((s) => s.email)
  const position   = useProfileStore((s) => s.position)
  const photoUrl   = useProfileStore((s) => s.photoUrl)

  const fullName = [firstName, middleName, lastName].filter(Boolean).join(" ")
  const initials = ((firstName?.[0] ?? "") + (lastName?.[0] ?? "")).toUpperCase()

  return (
    <div className="page-bg">
      <div className="page-container py-6 flex flex-col gap-6">
        <Link
          href="/"
          className="flex items-center gap-2 -ml-2 w-fit rounded-md px-2 py-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          aria-label="Назад"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="text-lg font-semibold text-foreground">Профиль</span>
        </Link>

        <Section label="Аккаунт">
          <div className="space-y-2">
            {online && (
              <UserSummaryCard
                fullName={fullName}
                initials={initials}
                photoUrl={photoUrl}
                position={position}
                email={email}
              />
            )}
            <Card asChild className="group flex items-center gap-3 px-4 py-3.5 hover:bg-muted/30 transition-colors">
              <Link
                href={FULL_PROFILE_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <User className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">Полный профиль</p>
                  <p className="text-xs text-muted-foreground">Управление данными аккаунта</p>
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
              </Link>
            </Card>
          </div>
        </Section>

        <Section label="Оформление">
          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Palette className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">Тема интерфейса</p>
                <p className="text-xs text-muted-foreground">Светлая, тёмная или системная</p>
              </div>
            </div>
            <ThemeToggle />
          </Card>
        </Section>

        <AccessibilitySettings />
      </div>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <p className="section-label px-1">{label}</p>
      {children}
    </section>
  )
}
