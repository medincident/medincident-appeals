"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"

import { useAppeals } from "@/domain/appeals/hooks"
import { useAppealsRealtime } from "@/domain/appeals/useAppealsRealtime"
import { usePendingAppeals } from "@/domain/appeals/usePendingAppeals"
import type { AppealStatus } from "@/domain/appeals/types"

import { IN_PROGRESS_STATUSES } from "./AppealCard"

const SEARCH_DEBOUNCE_MS = 300

export function useAppealsPage() {
  const searchParams = useSearchParams()
  const selectId     = searchParams.get("select_id")

  const [searchInput, setSearchInput] = React.useState("")
  const [statuses, setStatusesRaw]    = React.useState<AppealStatus[]>([])
  const [showPending, setShowPendingRaw] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState("")

  React.useEffect(() => {
    const t = window.setTimeout(() => setSearchQuery(searchInput.trim()), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [searchInput])

  const { appeals: rawAppeals, isLoading: swrIsLoading, isValidating } = useAppeals({
    search: searchQuery || undefined,
  })

  useAppealsRealtime()

  const isLoading = swrIsLoading && rawAppeals.length === 0

  const { pending } = usePendingAppeals()

  React.useEffect(() => {
    if (showPending && pending.length === 0) setShowPendingRaw(false)
  }, [showPending, pending.length])

  const setStatuses = React.useCallback((next: AppealStatus[]) => {
    setStatusesRaw(next)
    if (next.length > 0) setShowPendingRaw(false)
  }, [])

  const setShowPending = React.useCallback((next: boolean) => {
    setShowPendingRaw(next)
    if (next) setStatusesRaw([])
  }, [])

  const appeals = React.useMemo(
    () => (statuses.length === 0 ? rawAppeals : rawAppeals.filter((a) => statuses.includes(a.status))),
    [rawAppeals, statuses],
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

  const toggleExpanded = React.useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const resetFilters = React.useCallback(() => {
    setSearchInput("")
    setStatusesRaw([])
    setShowPendingRaw(false)
  }, [])

  const inProgress = appeals.filter((a) => IN_PROGRESS_STATUSES.has(a.status))
  const completed  = appeals.filter((a) => !IN_PROGRESS_STATUSES.has(a.status))

  const hasFilters = !!searchQuery || statuses.length > 0
  const empty      = !isLoading && appeals.length === 0

  return {
    appeals, inProgress, completed, pending,
    isLoading, isValidating, hasFilters, empty,
    searchInput, setSearchInput,
    statuses, setStatuses,
    showPending, setShowPending,
    selectId, selectedRef,
    expandedIds, toggleExpanded,
    resetFilters,
  }
}
