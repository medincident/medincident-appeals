"use client"

import * as React from "react"
import {
  AlertTriangle,
  Bot,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  X,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { Appeal, AppealStatus } from "@/domain/appeals/types"
import { timeAgo } from "@/lib/time"

const STATUS_CONFIG: Record<
  AppealStatus,
  { label: string; variant: "warning" | "primary" | "default" | "destructive"; Icon: React.ComponentType<{ className?: string }>; spinning: boolean }
> = {
  pending:    { label: "В очереди",     variant: "warning",     Icon: Clock,     spinning: false },
  processing: { label: "Обрабатывается", variant: "warning",    Icon: Loader2,   spinning: true  },
  processed:  { label: "Обработано",    variant: "primary",     Icon: Check,     spinning: false },
  resolved:   { label: "Завершено",     variant: "default",     Icon: CheckCheck,spinning: false },
  rejected:   { label: "Отклонено",     variant: "destructive", Icon: X,         spinning: false },
}

export const IN_PROGRESS_STATUSES = new Set<AppealStatus>(["pending", "processing"])

function AiInfoBlock({ appeal }: { appeal: Appeal }) {
  const confidencePct = typeof appeal.importantConfidence === "number"
    ? Math.round(appeal.importantConfidence * 100)
    : null

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Bot className="h-6 w-6 text-primary" />
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          Предварительный анализ обращения /
        </span>
        {/* Важно / Не важно + confidence */}
      <p className="text-xs flex items-center gap-1.5">
        {appeal.isImportant ? (
          <>
            <AlertTriangle className="h-3.5 w-3.5 text-warning" />
            <span className="font-medium text-warning">Важно</span>
          </>
        ) : (
          <span className="font-medium text-muted-foreground">Не важно</span>
        )}
        {confidencePct !== null && (
          <span className="text-muted-foreground">({confidencePct}%)</span>
        )}
      </p>
      </div>

      {/* Формализованный текст */}
      {appeal.formalizedText && (
        <p className="text-xs text-foreground leading-relaxed">{appeal.formalizedText}</p>
      )}

      {/* Тезисы — ключевые слова */}
      {appeal.theses.length > 0 && (
        <div className="text-xs">
          <p className="font-medium text-foreground mb-1">Ключевые слова:</p>
          <ul className="space-y-0.5">
            {appeal.theses.map((t, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 mt-1.5" />
                <span className="text-muted-foreground leading-relaxed">{t}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Категория / подкатегория */}
      {appeal.category && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Категория: </span>
          {appeal.category.name}
          {appeal.subcategory && (
            <>
              <span className="mx-1">/</span>
              {appeal.subcategory.name}
            </>
          )}
        </p>
      )}
    </div>
  )
}

interface AppealCardProps {
  appeal: Appeal
  expanded: boolean
  highlighted?: boolean
  onToggle: () => void
  cardRef?: React.Ref<HTMLDivElement>
}

export function AppealCard({ appeal, expanded, highlighted, onToggle, cardRef }: AppealCardProps) {
  const { label, variant, Icon, spinning } = STATUS_CONFIG[appeal.status]

  return (
    <div
      ref={cardRef}
      className={`rounded-xl border bg-card overflow-hidden transition-shadow hover:shadow-sm ${
        highlighted ? "border-primary ring-2 ring-primary/20" : "border-border"
      }`}
    >
      <button
        className="w-full text-left px-4 pt-3.5 pb-3 hover:bg-muted/20 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground leading-snug line-clamp-2">
              {appeal.summary}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[11px] text-muted-foreground">{timeAgo(appeal.createdAt)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 mt-0.5">
            <Badge variant={variant}>
              <Icon className={`h-3 w-3 ${spinning ? "animate-spin" : ""}`} />
              {label}
            </Badge>
            {expanded
              ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
              : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            }
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-4 animate-fade-in">
          <p className="text-xs text-foreground leading-relaxed">
            {appeal.text}
          </p>
          {!IN_PROGRESS_STATUSES.has(appeal.status) && (
            <>
              <div className="h-px bg-border my-4" />
              <AiInfoBlock appeal={appeal} />
            </>
          )}
        </div>
      )}
    </div>
  )
}
