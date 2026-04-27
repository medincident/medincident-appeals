"use client"

import Link from "next/link"
import { Check } from "lucide-react"

import { cn } from "@/lib/utils"
import type { Appeal } from "@/domain/appeals/types"

export function SuccessPanel({ appeal, fading }: { appeal: Appeal; fading: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center text-center gap-3 py-4",
        fading ? "opacity-0" : "opacity-100 animate-fade-in",
        "transition-opacity duration-500",
      )}
    >
      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
        <Check className="h-5 w-5 text-primary" strokeWidth={3} />
      </div>

      <div className="space-y-1">
        <p className="text-sm text-foreground">
          <Link
            href={`/appeals?select_id=${encodeURIComponent(appeal.id)}`}
            className="font-medium text-primary hover:underline"
          >
            Ваше обращение
          </Link>{" "}
          поставлено в очередь
        </p>
        <p className="text-xs text-muted-foreground max-w-sm">
          Спасибо, что поделились — это помогает нам становиться лучше.
        </p>
      </div>
    </div>
  )
}
