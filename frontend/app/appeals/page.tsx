"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowLeft, CheckCheck, Loader2 } from "lucide-react"

import { AppealsEmpty } from "./_components/AppealsEmpty"
import { AppealsSection } from "./_components/AppealsSection"
import { AppealsSkeleton } from "./_components/AppealsSkeleton"
import { AppealsToolbar } from "./_components/AppealsToolbar"
import { PendingAppealCard } from "./_components/PendingAppealCard"
import { useAppealsPage } from "./_components/useAppealsPage"

export default function AppealsPage() {
  return (
    <React.Suspense fallback={<div className="page-bg" />}>
      <AppealsPageInner />
    </React.Suspense>
  )
}

function AppealsPageInner() {
  const state = useAppealsPage()

  return (
    <div className="page-bg">
      <div className="page-container py-6 flex flex-col gap-5">

        <Link
          href="/"
          className="flex items-center gap-2 -ml-2 w-fit rounded-md px-2 py-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          aria-label="Назад"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="text-lg font-semibold text-foreground">
            Обращения
            {!state.isLoading && state.appeals.length > 0 && (
              <span className="text-muted-foreground font-normal"> ({state.appeals.length})</span>
            )}
          </span>
        </Link>

        <AppealsToolbar
          search={state.searchInput}
          onSearchChange={state.setSearchInput}
          statuses={state.statuses}
          onStatusesChange={state.setStatuses}
          showPending={state.showPending}
          onShowPendingChange={state.setShowPending}
          pendingCount={state.pending.length}
        />

        <div className="space-y-5">
          {state.showPending ? (
            <section className="space-y-2">
              {state.pending.map((pa) => (
                <PendingAppealCard key={pa.localId} pending={pa} />
              ))}
            </section>
          ) : state.isLoading ? (
            <AppealsSkeleton />
          ) : state.empty ? (
            <AppealsEmpty hasFilters={state.hasFilters} onReset={state.resetFilters} />
          ) : (
            <>
              <AppealsSection
                title="В процессе"
                icon={<Loader2 className="h-3.5 w-3.5 text-warning animate-spin" />}
                appeals={state.inProgress}
                expandedIds={state.expandedIds}
                onToggle={state.toggleExpanded}
                selectId={state.selectId}
                selectedRef={state.selectedRef}
              />
              <AppealsSection
                title="Завершённые"
                icon={<CheckCheck className="h-3.5 w-3.5 text-muted-foreground" />}
                appeals={state.completed}
                expandedIds={state.expandedIds}
                onToggle={state.toggleExpanded}
                selectId={state.selectId}
                selectedRef={state.selectedRef}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
