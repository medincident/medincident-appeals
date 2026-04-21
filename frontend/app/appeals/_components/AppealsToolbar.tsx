"use client"

import * as React from "react"
import {
  Check,
  CheckCheck,
  Clock,
  Loader2,
  Search,
  X,
} from "lucide-react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { AppealStatus } from "@/domain/appeals/types"

export type StatusFilter = "" | AppealStatus

interface StatusChip {
  value: AppealStatus
  label: string
  Icon: React.ComponentType<{ className?: string }>
  /** Цвет иконки и текста в неактивном состоянии (Tailwind-классы). */
  color: string
}

const STATUS_CHIPS: readonly StatusChip[] = [
  { value: "pending",    label: "В очереди",     Icon: Clock,      color: "text-warning" },
  { value: "processing", label: "Обрабатывается", Icon: Loader2,    color: "text-warning" },
  { value: "processed",  label: "Обработано",    Icon: Check,      color: "text-primary" },
  { value: "resolved",   label: "Завершено",     Icon: CheckCheck, color: "text-muted-foreground" },
  { value: "rejected",   label: "Отклонено",     Icon: X,          color: "text-destructive" },
]

interface AppealsToolbarProps {
  search: string
  onSearchChange: (s: string) => void
  statusFilter: StatusFilter
  onStatusChange: (s: StatusFilter) => void
}

/**
 * Toolbar над списком обращений: поле поиска + чипы-фильтры по статусу
 * обращения (совпадают со статусами на карточках).
 */
export function AppealsToolbar({
  search,
  onSearchChange,
  statusFilter,
  onStatusChange,
}: AppealsToolbarProps) {
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

      <div
        className="flex gap-1.5 overflow-x-auto scrollbar-slim-x -mx-1 px-1 pb-1"
        role="toolbar"
        aria-label="Фильтр по статусу обращения"
      >
        <Chip
          active={statusFilter === ""}
          onClick={() => onStatusChange("")}
        >
          Все
        </Chip>
        {STATUS_CHIPS.map(({ value, label, Icon, color }) => {
          const active = statusFilter === value
          return (
            <Chip
              key={value}
              active={active}
              onClick={() => onStatusChange(active ? "" : value)}
              colorClass={color}
            >
              <Icon className="h-3 w-3" />
              {label}
            </Chip>
          )
        })}
      </div>
    </div>
  )
}

interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active: boolean
  /** В неактивном состоянии — цвет иконки и текста. В активном перебивается на primary-foreground. */
  colorClass?: string
}

function Chip({ active, colorClass, className, children, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      data-active={active}
      className={cn(
        "shrink-0 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 h-7 text-xs font-medium transition-colors",
        "border-border bg-card hover:bg-muted/60",
        colorClass ?? "text-foreground/80",
        // В активном состоянии перекрываем цвет иконки/текста и фон.
        "data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:border-primary",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
