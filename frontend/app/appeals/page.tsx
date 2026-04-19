"use client"

import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  MessageSquare,
  X,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

import { useAppeals } from "@/domain/appeals/hooks"
import type { Appeal, AppealStatus } from "@/domain/appeals/types"

// ── Status config ──────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  AppealStatus,
  { label: string; variant: "warning" | "primary" | "default" | "destructive"; Icon: React.ComponentType<{ className?: string }>; spinning: boolean }
> = {
  pending:    { label: "В очереди",    variant: "warning",     Icon: Clock,     spinning: false },
  processing: { label: "Обрабатывается", variant: "warning",   Icon: Loader2,   spinning: true  },
  processed:  { label: "Обработано",   variant: "primary",     Icon: Check,     spinning: false },
  resolved:   { label: "Завершено",    variant: "default",     Icon: CheckCheck,spinning: false },
  rejected:   { label: "Отклонено",    variant: "destructive", Icon: X,         spinning: false },
}

const IN_PROGRESS_STATUSES = new Set<AppealStatus>(["pending", "processing"])

// ── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "только что"
  if (m < 60) return `${m} мин назад`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} ч назад`
  return `${Math.floor(h / 24)} д назад`
}

// ── Components ─────────────────────────────────────────────────────────────

function AiInfoBlock({ appeal }: { appeal: Appeal }) {
  return (
    <div className="rounded-xl bg-muted/40 border border-border/60 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/60 bg-muted/30">
        <div className="h-5 w-5 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
          <Bot className="h-3 w-3 text-primary" />
        </div>
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          Предварительный анализ обращения
        </span>
      </div>

      {/* Formalized text */}
      {appeal.formalizedText && (
        <div className="px-3 pt-2.5 pb-2">
          <p className="text-xs text-foreground leading-relaxed">{appeal.formalizedText}</p>
        </div>
      )}

      {/* Theses */}
      {appeal.theses.length > 0 && (
        <div className="px-3 pb-2.5 space-y-1">
          {appeal.theses.map((t, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 mt-1.5" />
              <span className="text-xs text-muted-foreground leading-relaxed">{t}</span>
            </div>
          ))}
        </div>
      )}

      {/* Categories */}
      {(appeal.category || appeal.subcategory || appeal.isImportant) && (
        <div className="px-3 py-2 border-t border-border/60 flex items-center gap-1.5 flex-wrap">
          {appeal.category && (
            <span className="text-[10px] text-muted-foreground bg-background rounded-md px-2 py-0.5 border border-border/50">
              {appeal.category.name}
            </span>
          )}
          {appeal.subcategory && (
            <>
              <span className="text-muted-foreground/40 text-xs">·</span>
              <span className="text-[10px] text-muted-foreground">{appeal.subcategory.name}</span>
            </>
          )}
          {appeal.isImportant && (
            <>
              <span className="text-muted-foreground/40 text-xs">·</span>
              <span className="text-[10px] text-warning font-medium flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Важное
              </span>
            </>
          )}
        </div>
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

function AppealCard({ appeal, expanded, highlighted, onToggle, cardRef }: AppealCardProps) {
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
        <div className="border-t border-border px-4 py-3 space-y-3 animate-fade-in">
          <p className="text-xs text-muted-foreground leading-relaxed">
            {appeal.text}
          </p>
          {!IN_PROGRESS_STATUSES.has(appeal.status) && <AiInfoBlock appeal={appeal} />}
        </div>
      )}
    </div>
  )
}

function SectionHeader({ title, count, icon }: { title: string; count: number; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-xs font-semibold text-foreground uppercase tracking-wide">
          {title} <span className="text-muted-foreground font-medium normal-case tracking-normal">({count})</span>
        </span>
      </div>
      <div className="flex-1 h-px bg-border" />
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function AppealsPage() {
  return (
    <React.Suspense fallback={<div className="min-h-[100dvh] bg-background" />}>
      <AppealsPageInner />
    </React.Suspense>
  )
}

function AppealsPageInner() {
  const searchParams = useSearchParams()
  const selectId     = searchParams.get("select_id")

  const { appeals, isLoading } = useAppeals()
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(() =>
    selectId ? new Set([selectId]) : new Set()
  )

  const selectedRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    if (!selectId || isLoading) return
    const node = selectedRef.current
    if (!node) return
    const timer = window.setTimeout(() => {
      node.scrollIntoView({ behavior: "smooth", block: "center" })
    }, 100)
    return () => window.clearTimeout(timer)
  }, [selectId, isLoading, appeals])

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function renderCard(a: Appeal) {
    return (
      <AppealCard
        key={a.id}
        appeal={a}
        expanded={expandedIds.has(a.id)}
        highlighted={a.id === selectId}
        onToggle={() => toggleExpanded(a.id)}
        cardRef={a.id === selectId ? selectedRef : undefined}
      />
    )
  }

  const inProgress = appeals.filter((a) => IN_PROGRESS_STATUSES.has(a.status))
  const completed  = appeals.filter((a) => !IN_PROGRESS_STATUSES.has(a.status))

  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="mx-auto w-full max-w-xl px-4 py-6 flex flex-col gap-6">

        {/* Back arrow + title — whole row clickable */}
        <Link
          href="/"
          className="flex items-center gap-2 -ml-2 w-fit rounded-md px-2 py-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          aria-label="Назад"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="text-lg font-semibold text-foreground">
            История
            {!isLoading && appeals.length > 0 && (
              <span className="text-muted-foreground font-normal"> ({appeals.length})</span>
            )}
          </span>
        </Link>

        {/* Content */}
        <div className="space-y-5">

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2.5">
                  <div className="flex justify-between items-start gap-3">
                    <Skeleton className="h-4 w-52" />
                    <Skeleton className="h-5 w-28 rounded-full shrink-0" />
                  </div>
                  <Skeleton className="h-3 w-24" />
                </div>
              ))}
            </div>
          ) : appeals.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card flex flex-col items-center justify-center py-14 gap-3">
              <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center">
                <MessageSquare className="h-6 w-6 text-muted-foreground/50" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">Обращений пока нет</p>
                <p className="text-xs text-muted-foreground mt-0.5">Создайте первое обращение</p>
              </div>
              <Link href="/">
                <Button size="sm" variant="outline" className="text-xs mt-1">
                  Оставить обращение
                </Button>
              </Link>
            </div>
          ) : (
            <>
              {inProgress.length > 0 && (
                <section>
                  <SectionHeader
                    title="В процессе"
                    count={inProgress.length}
                    icon={<Loader2 className="h-3.5 w-3.5 text-warning animate-spin" />}
                  />
                  <div className="space-y-2">
                    {inProgress.map(renderCard)}
                  </div>
                </section>
              )}

              {completed.length > 0 && (
                <section>
                  <SectionHeader
                    title="Завершённые"
                    count={completed.length}
                    icon={<CheckCheck className="h-3.5 w-3.5 text-muted-foreground" />}
                  />
                  <div className="space-y-2">
                    {completed.map(renderCard)}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
