"use client"

import { Shield } from "lucide-react"

import { useProfileStore } from "@/lib/stores/profile.store"

import { ProfilePopover } from "./ProfilePopover"

export function Header() {
  const firstName = useProfileStore((s) => s.firstName)
  const lastName  = useProfileStore((s) => s.lastName)
  const photoUrl  = useProfileStore((s) => s.photoUrl)
  const position  = useProfileStore((s) => s.position)

  const fullName = [firstName, lastName].filter(Boolean).join(" ") || null
  const initials = `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase()

  return (
    <header className="w-full px-4 pt-4">
      <div className="mx-auto w-full max-w-xl flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Shield fill="currentColor" className="h-7 w-7 text-primary shrink-0" />
          <div className="leading-tight">
            <p className="text-sm font-semibold text-primary">МедИнцидент</p>
            <p className="text-[11px] text-muted-foreground">Портал для обращений</p>
          </div>
        </div>
        <ProfilePopover fullName={fullName} initials={initials} photoUrl={photoUrl} position={position} />
      </div>
    </header>
  )
}
