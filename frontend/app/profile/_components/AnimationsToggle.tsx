import { Check, Zap } from "lucide-react"

import { cn } from "@/lib/utils"

interface AnimationsToggleProps {
  value: boolean
  onChange: (value: boolean) => void
}

export function AnimationsToggle({ value, onChange }: AnimationsToggleProps) {
  return (
    <label
      htmlFor="animations-toggle"
      className="flex cursor-pointer items-center gap-3 px-4 py-3.5 hover:bg-muted/30 transition-colors"
    >
      <Zap className="h-5 w-5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">Анимации</p>
        <p className="text-xs text-muted-foreground">Плавные переходы и эффекты</p>
      </div>
      <div className="relative flex size-5 shrink-0 items-center justify-center">
        <input
          id="animations-toggle"
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
          className="peer absolute inset-0 cursor-pointer opacity-0"
        />
        <div
          className={cn(
            "flex size-5 items-center justify-center rounded border-2 transition-colors",
            value ? "border-primary bg-primary" : "border-input bg-card"
          )}
        >
          <Check
            className={cn(
              "size-3 text-primary-foreground transition-opacity",
              value ? "opacity-100" : "opacity-0"
            )}
          />
        </div>
      </div>
    </label>
  )
}
