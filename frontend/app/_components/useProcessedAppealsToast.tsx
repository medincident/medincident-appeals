"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Check } from "lucide-react"

import { useNotifications } from "@/domain/notifications/hooks"

const AUTOSHOWN_KEY = "notifications-autoshown-ids"

function readAutoshown(): Set<string> {
  if (typeof window === "undefined") return new Set()
  try {
    const raw = localStorage.getItem(AUTOSHOWN_KEY)
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
  } catch {
    return new Set()
  }
}

function writeAutoshown(set: Set<string>) {
  try {
    localStorage.setItem(AUTOSHOWN_KEY, JSON.stringify([...set]))
  } catch {}
}

function pluralize(n: number, one: string, few: string, many: string) {
  const mod10  = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
}

export function useProcessedAppealsToast() {
  const { notifications } = useNotifications()
  const router            = useRouter()
  const firedRef          = React.useRef(false)

  React.useEffect(() => {
    if (firedRef.current) return
    if (notifications.length === 0) return

    const autoshown = readAutoshown()
    const fresh = notifications.filter(
      (n) => n.type === "processed" && !autoshown.has(n.id)
    )
    if (fresh.length === 0) return

    firedRef.current = true

    const count = fresh.length
    const word  = pluralize(count, "обращение", "обращения", "обращений")
    const verb  = pluralize(count, "Обработано", "Обработаны", "Обработано")

    toast.custom(
      (t) => (
        <button
          type="button"
          onClick={() => {
            router.push("/appeals")
            toast.dismiss(t)
          }}
          className="flex items-center gap-3 rounded-lg bg-primary text-primary-foreground px-4 py-3 shadow-lg text-sm font-medium hover:opacity-90 transition-opacity w-[min(92vw,22rem)]"
        >
          <div className="h-7 w-7 rounded-full bg-primary-foreground/20 flex items-center justify-center shrink-0">
            <Check className="h-4 w-4" strokeWidth={3} />
          </div>
          <span className="flex-1 text-left">
            {verb} {count} {word}
          </span>
          <span className="text-xs text-primary-foreground/70 shrink-0">Открыть →</span>
        </button>
      ),
      { duration: 7000 }
    )

    fresh.forEach((n) => autoshown.add(n.id))
    writeAutoshown(autoshown)
  }, [notifications, router])
}
