import { Contrast } from "lucide-react"

import { cn } from "@/lib/utils"
import type { Contrast as ContrastMode } from "@/lib/stores/settings.store"

const OPTIONS: {
  value: ContrastMode
  label: string
  bg: string
  text: string
}[] = [
  { value: "normal",     label: "Обычный", bg: "bg-background",     text: "text-foreground" },
  { value: "high-white", label: "Белый",   bg: "bg-[var(--white)]", text: "text-[var(--black)]" },
]

interface ContrastPickerProps {
  value: ContrastMode
  onChange: (value: ContrastMode) => void
}

export function ContrastPicker({ value, onChange }: ContrastPickerProps) {
  const current = OPTIONS.find((o) => o.value === value)?.label ?? ""
  return (
    <div className="px-4 py-3.5 space-y-3">
      <div className="flex items-center gap-3">
        <Contrast className="h-5 w-5 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">Контрастность</p>
          <p className="text-xs text-muted-foreground">{current}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {OPTIONS.map(({ value: v, label, bg, text }) => {
          const isActive = value === v
          return (
            <button
              key={v}
              type="button"
              onClick={() => onChange(v)}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-lg border-2 border-border p-3 text-xs font-medium transition-colors",
                bg, text,
                isActive
                  ? "ring-2 ring-primary ring-offset-2 ring-offset-card"
                  : "opacity-80 hover:opacity-100"
              )}
            >
              <span className="text-base font-bold leading-none">Аа</span>
              <span>{label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
