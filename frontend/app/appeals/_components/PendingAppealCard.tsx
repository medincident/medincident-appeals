"use client"

import { CloudOff, Loader2, Pencil, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { PendingAppeal } from "@/lib/offline/queue"
import { timeAgo } from "@/lib/time"

import { PENDING_MAX_CHARS, usePendingAppealDelete, usePendingAppealEdit } from "./usePendingAppeal"

interface Props {
  pending: PendingAppeal
}

export function PendingAppealCard({ pending }: Props) {
  const { editing, draft, setDraft, saving, overLimit, canSave, startEdit, cancelEdit, saveEdit } =
    usePendingAppealEdit(pending)
  const { deleting, confirmOpen, requestDelete, dismissDelete, confirmDelete } =
    usePendingAppealDelete(pending)

  return (
    <>
      <div className="rounded-xl border border-success/40 bg-success/5 overflow-hidden">
        <div className="px-4 pt-3.5 pb-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[11px] text-muted-foreground flex-1 min-w-0">
              {timeAgo(pending.createdAt)}
            </p>
            <Badge variant="default" className="bg-success/15 text-success border-success/30 hover:bg-success/15">
              <CloudOff className="h-3 w-3" />
              Ожидает отправления
            </Badge>
          </div>

          {editing ? (
            <div className="mt-2 space-y-2">
              <textarea
                rows={4}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={saving}
                autoFocus
                className="w-full resize-none rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring leading-relaxed"
              />
              <div className="flex items-center justify-between">
                <span className={cn("text-[10px] tabular-nums", overLimit ? "text-destructive font-medium" : "text-muted-foreground")}>
                  {draft.length}/{PENDING_MAX_CHARS}
                </span>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={cancelEdit} disabled={saving}>
                    Отмена
                  </Button>
                  <Button size="sm" className="h-8 px-3 text-xs gap-1.5" onClick={saveEdit} disabled={!canSave}>
                    {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                    Сохранить
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words mt-1">
                {pending.text}
              </p>
              <div className="flex items-center justify-end gap-2 mt-3">
                <Button size="sm" variant="outline" className="h-8 px-3 text-xs gap-1.5" onClick={startEdit}>
                  <Pencil className="h-3 w-3" />
                  Изменить
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-3 text-xs gap-1.5 text-destructive hover:text-destructive"
                  onClick={requestDelete}
                >
                  <Trash2 className="h-3 w-3" />
                  Удалить
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={(o) => o ? requestDelete() : dismissDelete()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Удалить обращение?</DialogTitle>
            <DialogDescription>
              Сохранённое локально обращение будет удалено и не отправится на сервер.
              Это действие нельзя отменить.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={dismissDelete} disabled={deleting}>
              Отмена
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting} className="gap-1.5">
              {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
