"use client"

import * as React from "react"

import { Popover } from "@/components/ui/popover"

export type ListPopupItem = { title: string; text: string }

interface ListPopupProps {
  trigger: React.ReactNode
  header: React.ReactNode
  items: ListPopupItem[]
}

export function ListPopup({ trigger, header, items }: ListPopupProps) {
  return (
    <Popover
      placement="top-start"
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className="flex items-center gap-1 text-xs text-primary hover:underline"
        >
          {trigger}
        </button>
      )}
    >
      <div className="flex items-center gap-2 px-4 pt-3.5 pb-3 border-b border-border">
        {header}
      </div>
      <ol className="px-4 py-3.5 space-y-3">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span className="text-xs font-bold text-primary leading-snug tabular-nums shrink-0">
              {i + 1}.
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-popover-foreground leading-snug">
                {item.title}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                {item.text}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </Popover>
  )
}
