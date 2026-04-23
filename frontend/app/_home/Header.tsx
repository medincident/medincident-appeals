"use client"

import Link from "next/link"
import { ClipboardList } from "lucide-react"

import { useProfileStore } from "@/lib/stores/profile.store"

import { NotificationsPopover } from "./NotificationsPopover"
import { ProfilePopover } from "./ProfilePopover"

export function Header() {
  const firstName = useProfileStore((s) => s.firstName)
  const lastName  = useProfileStore((s) => s.lastName)
  const photoUrl  = useProfileStore((s) => s.photoUrl)
  const position  = useProfileStore((s) => s.position)

  const fullName = firstName || lastName
    ? [firstName, lastName].filter(Boolean).join(" ")
    : null
  const initials = ((firstName?.[0] ?? "") + (lastName?.[0] ?? "")).toUpperCase()

  return (
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
  )
}
