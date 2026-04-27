"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { usePopover } from "@/lib/usePopover"

export type PopoverPlacement = "bottom-start" | "bottom-end" | "top-start" | "top-end"

interface PopoverProps {
  trigger: (args: { open: boolean; toggle: () => void }) => React.ReactNode
  children: React.ReactNode | ((args: { close: () => void }) => React.ReactNode)
  placement?: PopoverPlacement
  width?: string
  panelClassName?: string
}

const PLACEMENT_CLASS: Record<PopoverPlacement, string> = {
  "bottom-start": "top-full left-0 mt-2",
  "bottom-end":   "top-full right-0 mt-2",
  "top-start":    "bottom-full left-0 mb-2",
  "top-end":      "bottom-full right-0 mb-2",
}

export function Popover({
  trigger,
  children,
  placement = "bottom-start",
  width = "w-80",
  panelClassName,
}: PopoverProps) {
  const { open, setOpen, rootRef } = usePopover()
  const toggle = React.useCallback(() => setOpen((v) => !v), [setOpen])
  const close = React.useCallback(() => setOpen(false), [setOpen])

  return (
    <div className="relative" ref={rootRef}>
      {trigger({ open, toggle })}
      {open && (
        <div
          className={cn(
            "absolute z-30 rounded-lg border border-border bg-popover shadow-xl animate-fade-in overflow-hidden",
            PLACEMENT_CLASS[placement],
            width,
            panelClassName,
          )}
        >
          {typeof children === "function" ? children({ close }) : children}
        </div>
      )}
    </div>
  )
}
