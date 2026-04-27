"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

interface UserSummaryCardProps {
  fullName: string
  initials: string
  photoUrl: string | null
  position: string | null | undefined
  email: string | null | undefined
}

export function UserSummaryCard({ fullName, initials, photoUrl, position, email }: UserSummaryCardProps) {
  return (
    <section className="relative overflow-hidden rounded-xl bg-primary/5 border border-primary/20 p-5">
      <div className="pointer-events-none absolute -top-8 -right-8 h-40 w-40 rounded-full bg-primary/10 blur-2xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-24 w-48 rounded-full bg-primary/5 blur-2xl" />

      <div className="relative flex items-center gap-5">
        <div className="shrink-0">
          <div className="rounded-full p-0.5 bg-gradient-to-br from-primary/60 via-primary/30 to-transparent">
            <div className="rounded-full bg-card">
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
            <p className="text-2xs text-muted-foreground">{email}</p>
          )}
        </div>
      </div>
    </section>
  )
}
