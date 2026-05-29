"use client"

import * as React from "react"
import {
  AlertTriangle,
  Bot,
  Check,
  CheckCheck,
  ChevronDown,
  Clock,
  Loader2,
  X,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import type { Appeal, AppealStatus } from "@/domain/appeals/types"
import { cn } from "@/lib/utils"
import { timeAgo } from "@/lib/time"

const STATUS_CONFIG: Record<
  AppealStatus,
  { label: string; variant: "warning" | "primary" | "default" | "destructive"; Icon: React.ComponentType<{ className?: string }>; spinning: boolean }
> = {
  pending:    { label: "В очереди",     variant: "warning",     Icon: Clock,         spinning: false },
  processing: { label: "Обрабатывается", variant: "warning",    Icon: Loader2,       spinning: true  },
  processed:  { label: "Обработано",    variant: "primary",     Icon: Check,         spinning: false },
  resolved:   { label: "Завершено",     variant: "default",     Icon: CheckCheck,    spinning: false },
  rejected:   { label: "Отклонено",     variant: "destructive", Icon: X,             spinning: false },
  failed:     { label: "Ошибка обработки", variant: "destructive", Icon: AlertTriangle, spinning: false },
  // Статусы после отправки в medincident-backend.
  submitted:  { label: "Отправлено",    variant: "primary",     Icon: CheckCheck,    spinning: false },
  accepted:   { label: "Принято",       variant: "primary",     Icon: Loader2,       spinning: true  },
  closed:     { label: "Закрыто",       variant: "default",     Icon: CheckCheck,    spinning: false },
  cancelled:  { label: "Отменено",      variant: "destructive", Icon: X,             spinning: false },
}

export const IN_PROGRESS_STATUSES = new Set<AppealStatus>(["pending", "processing"])

function AiInfoBlock({ appeal }: { appeal: Appeal }) {
  const confidencePct = typeof appeal.importantConfidence === "number"
    ? Math.round(appeal.importantConfidence * 100)
    : null

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        <Bot className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          Предварительный анализ
        </span>
        <span className="text-xs flex items-center gap-1.5 ml-auto">
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
        </span>
      </div>

      {appeal.formalizedText && (
        <div className="text-xs">
          <p className="font-medium text-foreground mb-1">Формализация:</p>
          <p className="text-foreground leading-relaxed">{appeal.formalizedText}</p>
        </div>
      )}

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
    <Card
      ref={cardRef}
      className={cn(
        "overflow-hidden transition-shadow hover:shadow-sm",
        highlighted && "border-primary ring-2 ring-primary/20",
      )}
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
            <span className="block text-[11px] text-muted-foreground mt-1">
              {timeAgo(appeal.createdAt)}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0 mt-0.5">
            <Badge variant={variant}>
              <Icon className={cn("h-3 w-3", spinning && "animate-spin")} />
              {label}
            </Badge>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
                expanded && "rotate-180",
              )}
            />
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-4 animate-fade-in space-y-4">
          <div className="text-xs">
            <p className="font-medium text-foreground mb-1">Текст пациента:</p>
            <p className="text-foreground leading-relaxed">{appeal.text}</p>
          </div>
          {!IN_PROGRESS_STATUSES.has(appeal.status) && (
            <>
              <div className="h-px bg-border" />
              <AiInfoBlock appeal={appeal} />
            </>
          )}
        </div>
      )}
    </Card>
  )
}
