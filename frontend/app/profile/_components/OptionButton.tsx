import * as React from "react"

import { cn } from "@/lib/utils"

interface OptionButtonProps {
  active: boolean
  onClick: () => void
  preview: React.ReactNode
  label: string
}

export function OptionButton({ active, onClick, preview, label }: OptionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground hover:bg-muted/40 hover:text-foreground",
      )}
    >
      {preview}
      <span>{label}</span>
    </button>
  )
}
