"use client"

import * as React from "react"
import {
  Check,
  CheckCheck,
  Clock,
  CloudOff,
  Loader2,
  Search,
  X,
} from "lucide-react"

import { Chip } from "@/components/ui/chip"
import { Input } from "@/components/ui/input"
import { useOnlineStatus } from "@/lib/useOnlineStatus"
import type { AppealStatus } from "@/domain/appeals/types"

interface StatusChip {
  value: AppealStatus
  label: string
  Icon: React.ComponentType<{ className?: string }>
  color: string
}

const STATUS_CHIPS: readonly StatusChip[] = [
  { value: "pending",    label: "В очереди",      Icon: Clock,      color: "text-warning" },
  { value: "processing", label: "Обрабатывается", Icon: Loader2,    color: "text-warning" },
  { value: "processed",  label: "Обработано",     Icon: Check,      color: "text-primary" },
  { value: "resolved",   label: "Завершено",      Icon: CheckCheck, color: "text-muted-foreground" },
  { value: "rejected",   label: "Отклонено",      Icon: X,          color: "text-destructive" },
]

interface AppealsToolbarProps {
  search: string
  onSearchChange: (s: string) => void
  statuses: AppealStatus[]
  onStatusesChange: (s: AppealStatus[]) => void
  showPending: boolean
  onShowPendingChange: (v: boolean) => void
  pendingCount: number
}

export function AppealsToolbar({
  search,
  onSearchChange,
  statuses,
  onStatusesChange,
  showPending,
  onShowPendingChange,
  pendingCount,
}: AppealsToolbarProps) {
  const online = useOnlineStatus()
  const allActive = statuses.length === 0 && !showPending

  function toggleStatus(value: AppealStatus) {
    onStatusesChange(
      statuses.includes(value)
        ? statuses.filter((s) => s !== value)
        : [...statuses, value],
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Поиск по тексту обращения"
          className="pl-9 pr-9 h-10 bg-card"
          aria-label="Поиск по обращениям"
          suppressHydrationWarning
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            aria-label="Очистить поиск"
            className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="-mx-4 scroll-edge-fade-x">
        <div
          className="flex gap-2 overflow-x-auto scrollbar-slim-x px-4 pt-1 pb-1.5"
          role="toolbar"
          aria-label="Фильтр по статусу обращения"
        >
          <Chip active={allActive} onClick={() => { onStatusesChange([]); onShowPendingChange(false) }}>
            Все
          </Chip>
          {!online && pendingCount > 0 && (
            <Chip
              variant="success"
              active={showPending}
              onClick={() => onShowPendingChange(!showPending)}
            >
              <CloudOff className="h-3.5 w-3.5" />
              Оффлайн ({pendingCount})
            </Chip>
          )}
          {STATUS_CHIPS.map(({ value, label, Icon, color }) => (
            <Chip
              key={value}
              active={statuses.includes(value)}
              onClick={() => toggleStatus(value)}
              className={color}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  )
}
