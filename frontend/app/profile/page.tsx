"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { ArrowLeft, ExternalLink, Monitor, Moon, Sun } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { useProfileStore } from "@/lib/stores/profile.store"
import { useProfileData } from "@/domain/profile/hooks"

const FULL_PROFILE_URL = "https://zitadel-medincident.ulbwa.bombomeow.ru/profile"

const THEMES = [
  { value: "light",  label: "Светлая",   icon: Sun },
  { value: "dark",   label: "Тёмная",    icon: Moon },
  { value: "system", label: "Системная", icon: Monitor },
] as const

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  return (
    <div className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-muted p-1">
      {THEMES.map(({ value, label, icon: Icon }) => {
        const isActive = mounted && theme === value
        return (
          <button
            key={value}
            onClick={() => setTheme(value)}
            title={label}
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium transition-all duration-200",
              isActive
                ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        )
      })}
    </div>
  )
}

export default function ProfilePage() {
  const router = useRouter()
  useProfileData()

  const firstName      = useProfileStore((s) => s.firstName)
  const lastName       = useProfileStore((s) => s.lastName)
  const middleName     = useProfileStore((s) => s.middleName)
  const email          = useProfileStore((s) => s.email)
  const isEmailVerified= useProfileStore((s) => s.isEmailVerified)
  const position       = useProfileStore((s) => s.position)
  const photoUrl       = useProfileStore((s) => s.photoUrl)

  const fullName = [firstName, middleName, lastName].filter(Boolean).join(" ")
  const initials = ((firstName?.[0] ?? "") + (lastName?.[0] ?? "")).toUpperCase()

  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="mx-auto w-full max-w-xl px-4 py-6 flex flex-col gap-6">

        {/* Back arrow + title — whole row clickable */}
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-2 -ml-2 w-fit rounded-md px-2 py-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          aria-label="Назад"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="text-lg font-semibold text-foreground">Профиль</span>
        </button>

        {/* User summary — matches zitadel/custom-ui UserHeaderCard style */}
        <section className="relative overflow-hidden rounded-2xl bg-primary/5 border border-primary/20 p-5">
          <div className="pointer-events-none absolute -top-8 -right-8 h-40 w-40 rounded-full bg-primary/10 blur-2xl" />
          <div className="pointer-events-none absolute bottom-0 left-1/3 h-24 w-48 rounded-full bg-primary/5 blur-2xl" />

          <div className="relative flex items-center gap-5">
            <div className="shrink-0">
              <div className="rounded-full p-0.5 bg-gradient-to-br from-primary/60 via-primary/30 to-transparent">
                <div className="rounded-full bg-background">
                  <Avatar className="h-16 w-16 shrink-0">
                    {photoUrl && <AvatarImage src={photoUrl} alt={fullName} className="object-cover" />}
                    <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </div>
              </div>
            </div>

            <div className="flex-1 min-w-0 space-y-1">
              <h2 className="text-xl font-bold text-foreground leading-tight truncate">{fullName}</h2>
              {position && (
                <p className="text-sm text-muted-foreground font-medium">{position}</p>
              )}
              {email && (
                <p className="text-2xs text-muted-foreground">
                  {email}
                  {isEmailVerified && <span className="ml-1.5 text-success">✓</span>}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Full profile — transparent button under user info */}
        <Link
          href={FULL_PROFILE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted/40 transition-colors"
        >
          Полный профиль
          <ExternalLink className="h-4 w-4 text-muted-foreground" />
        </Link>

        <Separator />

        {/* Settings — matches zitadel/custom-ui section style */}
        <section className="space-y-3">
          <p className="section-label flex items-center gap-2">
            <Sun className="size-4" />
            Тема
          </p>
          <ThemeToggle />
        </section>

      </div>
    </div>
  )
}
