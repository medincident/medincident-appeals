"use client"

import * as React from "react"

import { listPending, PENDING_CHANGED_EVENT, type PendingAppeal } from "@/lib/offline/queue"

export function usePendingAppeals() {
  const [items, setItems] = React.useState<PendingAppeal[]>([])
  const [loading, setLoading] = React.useState(true)

  const refresh = React.useCallback(async () => {
    try {
      const pending = await listPending()
      setItems(pending.sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void refresh()
    if (typeof window === "undefined") return

    const onChanged = () => { void refresh() }
    window.addEventListener(PENDING_CHANGED_EVENT, onChanged)
    window.addEventListener("online", onChanged)
    window.addEventListener("offline", onChanged)
    return () => {
      window.removeEventListener(PENDING_CHANGED_EVENT, onChanged)
      window.removeEventListener("online", onChanged)
      window.removeEventListener("offline", onChanged)
    }
  }, [refresh])

  return { pending: items, loading, refresh }
}
