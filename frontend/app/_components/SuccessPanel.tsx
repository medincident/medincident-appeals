"use client"

import Link from "next/link"
import { Check, Sparkles, Tag } from "lucide-react"

import { cn } from "@/lib/utils"
import type { Appeal } from "@/domain/appeals/types"

export function SuccessPanel({ appeal, fading }: { appeal: Appeal; fading: boolean }) {
  const firstThesis = appeal.theses[0]

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
          уже в обработке
        </p>
        <p className="text-xs text-muted-foreground max-w-sm">
          Спасибо, что поделились — это помогает нам становиться лучше.
        </p>
      </div>

      {(appeal.category || firstThesis) && (
        <div className="w-full max-w-sm rounded-xl bg-card border border-border/60 px-3.5 py-2.5 text-left space-y-1.5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-primary" />
            ИИ уже проанализировал
          </p>
          {appeal.category && (
            <p className="text-xs text-foreground flex items-center gap-1.5">
              <Tag className="h-3 w-3 text-primary shrink-0" />
              <span className="truncate">
                {appeal.category.name}
                {appeal.subcategory && (
                  <span className="text-muted-foreground"> · {appeal.subcategory.name}</span>
                )}
              </span>
            </p>
          )}
          {firstThesis && (
            <p className="text-xs text-muted-foreground flex items-start gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
              <span>{firstThesis}</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
