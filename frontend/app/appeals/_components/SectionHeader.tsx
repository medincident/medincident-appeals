import * as React from "react"

export function SectionHeader({ title, count, icon }: { title: string; count: number; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-xs font-semibold text-foreground uppercase tracking-wide">
          {title} <span className="text-muted-foreground font-medium normal-case tracking-normal">({count})</span>
        </span>
      </div>
      <div className="flex-1 h-px bg-border" />
    </div>
  )
}
