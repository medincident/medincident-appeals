"use client"

import * as React from "react"
import { toast } from "sonner"

import { tryFlushQueue } from "@/lib/offline/flush"
import { safeError } from "@/lib/log"
import {
  type PendingAppeal,
  lockPending,
  removePending,
  unlockPending,
  updatePending,
} from "@/lib/offline/queue"

export const PENDING_MAX_CHARS = 1000

export function usePendingAppealEdit(pending: PendingAppeal) {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(pending.text)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!editing) setDraft(pending.text)
  }, [pending.text, editing])

  React.useEffect(() => {
    const id = pending.localId
    return () => { unlockPending(id) }
  }, [pending.localId])

  const overLimit = draft.length > PENDING_MAX_CHARS
  const canSave = !!draft.trim() && !saving && !overLimit

  function startEdit() {
    setDraft(pending.text)
    lockPending(pending.localId)
    setEditing(true)
  }

  function cancelEdit() {
    unlockPending(pending.localId)
    setEditing(false)
    setDraft(pending.text)
    void tryFlushQueue()
  }

  async function saveEdit() {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === pending.text.trim()) {
      cancelEdit()
      return
    }
    if (trimmed.length > PENDING_MAX_CHARS) return
    setSaving(true)
    try {
      await updatePending(pending.localId, trimmed)
      unlockPending(pending.localId)
      setEditing(false)
      toast.success("Изменения сохранены")
      void tryFlushQueue()
    } catch (err) {
      console.error("[PendingAppealCard] update failed:", safeError(err))
      toast.error("Не удалось сохранить изменения")
    } finally {
      setSaving(false)
    }
  }

  return { editing, draft, setDraft, saving, overLimit, canSave, startEdit, cancelEdit, saveEdit }
}

export function usePendingAppealDelete(pending: PendingAppeal) {
  const [deleting, setDeleting] = React.useState(false)
  const [confirmOpen, setConfirmOpen] = React.useState(false)

  function requestDelete() { setConfirmOpen(true) }
  function dismissDelete() { if (!deleting) setConfirmOpen(false) }

  async function confirmDelete() {
    setDeleting(true)
    try {
      await removePending(pending.localId)
      toast.success("Обращение удалено")
    } catch (err) {
      console.error("[PendingAppealCard] delete failed:", safeError(err))
      toast.error("Не удалось удалить обращение")
    } finally {
      setDeleting(false)
      setConfirmOpen(false)
    }
  }

  return { deleting, confirmOpen, requestDelete, dismissDelete, confirmDelete }
}
