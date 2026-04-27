import { ALargeSmall } from "lucide-react"

import { cn } from "@/lib/utils"
import type { LetterSpacing } from "@/lib/stores/settings.store"

import { OptionButton } from "./OptionButton"

const OPTIONS: { value: LetterSpacing; label: string; preview: string; spacing: string }[] = [
  { value: "normal", label: "Обычный", preview: "Аб",   spacing: "tracking-normal" },
  { value: "md",     label: "Средний", preview: "А б",  spacing: "tracking-wide" },
  { value: "lg",     label: "Большой", preview: "А  б", spacing: "tracking-widest" },
]

interface LetterSpacingPickerProps {
  value: LetterSpacing
  onChange: (value: LetterSpacing) => void
}

export function LetterSpacingPicker({ value, onChange }: LetterSpacingPickerProps) {
  const current = OPTIONS.find((o) => o.value === value)?.label ?? ""
  return (
    <div className="px-4 py-3.5 space-y-3">
      <div className="flex items-center gap-3">
        <ALargeSmall className="h-5 w-5 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">Межбуквенный интервал</p>
          <p className="text-xs text-muted-foreground">{current}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map(({ value: v, label, preview, spacing }) => (
          <OptionButton
            key={v}
            active={value === v}
            onClick={() => onChange(v)}
            label={label}
            preview={<span className={cn("text-sm font-semibold", spacing)}>{preview}</span>}
          />
        ))}
      </div>
    </div>
  )
}
