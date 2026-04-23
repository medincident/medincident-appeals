"use client"

import Link from "next/link"
import { LogOut, User } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { usePopover } from "@/lib/usePopover"
import { logoutAction } from "@/services/auth/actions"

interface ProfilePopoverProps {
  fullName: string | null
  initials: string
  photoUrl: string | null
  position: string | null | undefined
}

export function ProfilePopover({ fullName, initials, photoUrl, position }: ProfilePopoverProps) {
  const { open, setOpen, rootRef } = usePopover()

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
        aria-label="Профиль"
      >
        <Avatar className="h-9 w-9 shrink-0">
          {photoUrl && (
            <AvatarImage src={photoUrl} alt={fullName ?? "Профиль"} className="object-cover" />
          )}
          <AvatarFallback className="bg-primary/10 text-primary text-[11px] font-bold">
            {initials || ""}
          </AvatarFallback>
        </Avatar>
        {fullName && (
          <div className="leading-tight text-left">
            <p className="text-xs font-semibold text-foreground">{fullName}</p>
            <p className="text-[10px] text-muted-foreground">{position ?? "Пациент"}</p>
          </div>
        )}
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 w-56 rounded-xl border border-border bg-popover shadow-xl z-30 animate-fade-in overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold text-popover-foreground leading-tight truncate">
              {fullName ?? "Пользователь"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{position ?? "Пациент"}</p>
          </div>

          <div className="py-1">
            <Link
              href="/profile"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-popover-foreground hover:bg-muted/40 transition-colors"
            >
              <User className="h-4 w-4 text-muted-foreground" />
              Профиль
            </Link>
          </div>

          <div className="border-t border-border py-1">
            <form action={logoutAction}>
              <button
                type="submit"
                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/5 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Выйти
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
