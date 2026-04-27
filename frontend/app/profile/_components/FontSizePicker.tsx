import { Type } from "lucide-react"

import { cn } from "@/lib/utils"
import type { FontSize } from "@/lib/stores/settings.store"

import { OptionButton } from "./OptionButton"

const OPTIONS: { value: FontSize; label: string; previewSize: string }[] = [
  { value: "md", label: "Обычный",  previewSize: "text-base" },
  { value: "lg", label: "Крупный",  previewSize: "text-lg" },
  { value: "xl", label: "Огромный", previewSize: "text-2xl" },
]

interface FontSizePickerProps {
  value: FontSize
  onChange: (value: FontSize) => void
}

export function FontSizePicker({ value, onChange }: FontSizePickerProps) {
  const current = OPTIONS.find((o) => o.value === value)?.label ?? ""
  return (
    <div className="px-4 py-3.5 space-y-3">
      <div className="flex items-center gap-3">
        <Type className="h-5 w-5 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">Размер шрифта</p>
          <p className="text-xs text-muted-foreground">{current}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map(({ value: v, label, previewSize }) => (
          <OptionButton
            key={v}
            active={value === v}
            onClick={() => onChange(v)}
            label={label}
            preview={<span className={cn("font-semibold leading-none", previewSize)}>Аа</span>}
          />
        ))}
      </div>
    </div>
  )
}
