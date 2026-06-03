"use client"

import { useState } from "react"
import Link from "next/link"
import { LogOut, User, UserRoundCog } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Popover } from "@/components/ui/popover"
import { LogoutConfirmDialog } from "./LogoutConfirmDialog"
import { SwitchAccountConfirmDialog } from "./SwitchAccountConfirmDialog"

interface ProfilePopoverProps {
  fullName: string | null
  initials: string
  photoUrl: string | null
  position: string | null | undefined
}

export function ProfilePopover({ fullName, initials, photoUrl, position }: ProfilePopoverProps) {
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [switchOpen, setSwitchOpen] = useState(false)

  return (
    <>
    <Popover
      placement="bottom-end"
      width="w-56"
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
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
      )}
    >
      {({ close }) => (
        <>
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold text-popover-foreground leading-tight truncate">
              {fullName ?? "Пользователь"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{position ?? "Пациент"}</p>
          </div>

          <div className="py-1">
            <Link
              href="/profile"
              onClick={close}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-popover-foreground hover:bg-muted/40 transition-colors"
            >
              <User className="h-4 w-4 text-muted-foreground" />
              Профиль
            </Link>
          </div>

          <div className="border-t border-border py-1">
            <button
              type="button"
              onClick={() => {
                close()
                setSwitchOpen(true)
              }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-popover-foreground hover:bg-muted/40 transition-colors"
            >
              <UserRoundCog className="h-4 w-4 text-muted-foreground" />
              Сменить аккаунт
            </button>
            <button
              type="button"
              onClick={() => {
                close()
                setLogoutOpen(true)
              }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/5 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Выйти
            </button>
          </div>
        </>
      )}
    </Popover>

    <SwitchAccountConfirmDialog open={switchOpen} onOpenChange={setSwitchOpen} />
    <LogoutConfirmDialog open={logoutOpen} onOpenChange={setLogoutOpen} />
    </>
  )
}
