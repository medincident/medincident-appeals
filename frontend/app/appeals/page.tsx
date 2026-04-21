"use client"

import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  ArrowLeft,
  CheckCheck,
  Loader2,
  MessageSquare,
  SearchX,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

import { useAppeals } from "@/domain/appeals/hooks"
import type { Appeal } from "@/domain/appeals/types"

import { AppealCard, IN_PROGRESS_STATUSES } from "./_components/AppealCard"
import { AppealsToolbar, type StatusFilter } from "./_components/AppealsToolbar"
import { SectionHeader } from "./_components/SectionHeader"

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

  const [searchInput, setSearchInput]   = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("")

  // Debounce на 300мс — чтобы не гонять запросы на каждую нажатую клавишу.
  const [searchQuery, setSearchQuery] = React.useState("")
  React.useEffect(() => {
    const t = window.setTimeout(() => setSearchQuery(searchInput.trim()), 300)
    return () => window.clearTimeout(t)
  }, [searchInput])

  const { appeals: rawAppeals, isLoading, isValidating } = useAppeals({
    search: searchQuery || undefined,
  })

  const appeals = React.useMemo(
    () => (statusFilter ? rawAppeals.filter((a) => a.status === statusFilter) : rawAppeals),
    [rawAppeals, statusFilter],
  )

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

  const hasFilters = !!searchQuery || !!statusFilter
  const empty      = !isLoading && appeals.length === 0

  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="mx-auto w-full max-w-xl px-4 py-6 flex flex-col gap-5">

        <Link
          href="/"
          className="flex items-center gap-2 -ml-2 w-fit rounded-md px-2 py-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          aria-label="Назад"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="text-lg font-semibold text-foreground">
            Обращения
            {!isLoading && !hasFilters && appeals.length > 0 && (
              <span className="text-muted-foreground font-normal"> ({appeals.length})</span>
            )}
            {hasFilters && !isLoading && (
              <span className="text-muted-foreground font-normal"> ({appeals.length})</span>
            )}
          </span>
        </Link>

        <AppealsToolbar
          search={searchInput}
          onSearchChange={setSearchInput}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
        />

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
          ) : empty && hasFilters ? (
            <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
              <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center">
                <SearchX className="h-6 w-6 text-muted-foreground/50" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">Ничего не найдено</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Попробуйте изменить запрос или сбросить фильтры
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="text-xs mt-1"
                onClick={() => {
                  setSearchInput("")
                  setStatusFilter("")
                }}
              >
                Сбросить
              </Button>
            </div>
          ) : empty ? (
            <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
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
              {isValidating && (
                <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 px-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Обновляю…
                </div>
              )}
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
