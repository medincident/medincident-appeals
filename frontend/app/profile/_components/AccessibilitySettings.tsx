"use client"

import { ALargeSmall, Check, Contrast, RotateCcw, Type, Zap } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  useSettingsStore,
  type Contrast as ContrastMode,
  type FontSize,
  type LetterSpacing,
} from "@/lib/stores/settings.store"

const FONT_SIZES: { value: FontSize; label: string; preview: string }[] = [
  { value: "md", label: "Обычный",  preview: "Аа" },
  { value: "lg", label: "Крупный",  preview: "Аа" },
  { value: "xl", label: "Огромный", preview: "Аа" },
]

const LETTER_SPACINGS: { value: LetterSpacing; label: string; preview: string }[] = [
  { value: "normal", label: "Обычный", preview: "Аб" },
  { value: "md",     label: "Средний", preview: "А б" },
  { value: "lg",     label: "Большой", preview: "А  б" },
]

const CONTRAST_OPTIONS: {
  value: ContrastMode
  label: string
  bg: string
  text: string
  border: string
}[] = [
  { value: "normal",     label: "Обычный", bg: "bg-background", text: "text-foreground", border: "border-border" },
  { value: "high-white", label: "Белый",   bg: "bg-[var(--white)]", text: "text-[var(--black)]", border: "border-border" },
]

export function AccessibilitySettings() {
  const {
    fontSize, animations, contrast, letterSpacing,
    setFontSize, setAnimations, setContrast, setLetterSpacing,
    resetAccessibility,
  } = useSettingsStore()

  const hasChanges =
    fontSize !== "md" || !animations || contrast !== "normal" || letterSpacing !== "normal"

  return (
    <div className="rounded-xl border border-border bg-card p-3 flex flex-col gap-4">

      {/* Header with reset */}
      <div className="flex items-center gap-3 px-1 pt-1">
        <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
          <Contrast className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">Специальные возможности</p>
          <p className="text-xs text-muted-foreground">Настройте интерфейс под себя</p>
        </div>
        {hasChanges && (
          <button
            type="button"
            onClick={resetAccessibility}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <RotateCcw className="h-3 w-3" />
            Сбросить
          </button>
        )}
      </div>

      {/* Animations toggle */}
      <label
        htmlFor="animations-toggle"
        className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/50 transition-colors"
      >
        <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
          <Zap className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">Анимации</p>
          <p className="text-xs text-muted-foreground">Плавные переходы и эффекты</p>
        </div>
        <div className="relative flex size-5 shrink-0 items-center justify-center">
          <input
            id="animations-toggle"
            type="checkbox"
            checked={animations}
            onChange={(e) => setAnimations(e.target.checked)}
            className="peer absolute inset-0 cursor-pointer opacity-0"
          />
          <div
            className={cn(
              "flex size-5 items-center justify-center rounded border-2 transition-colors",
              animations ? "border-primary bg-primary" : "border-input bg-card"
            )}
          >
            <Check
              className={cn(
                "size-3 text-primary-foreground transition-opacity",
                animations ? "opacity-100" : "opacity-0"
              )}
            />
          </div>
        </div>
      </label>

      {/* Font size */}
      <div className="px-1 space-y-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Type className="h-3.5 w-3.5" />
          Размер шрифта
        </p>
        <div className="grid grid-cols-3 gap-2">
          {FONT_SIZES.map(({ value, label, preview }) => {
            const isActive = fontSize === value
            const previewSize =
              value === "md" ? "text-base" : value === "lg" ? "text-lg" : "text-2xl"
            return (
              <button
                key={value}
                type="button"
                onClick={() => setFontSize(value)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs font-medium transition-colors",
                  isActive
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <span className={cn("font-semibold leading-none", previewSize)}>{preview}</span>
                <span>{label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Letter spacing */}
      <div className="px-1 space-y-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <ALargeSmall className="h-3.5 w-3.5" />
          Межбуквенный интервал
        </p>
        <div className="grid grid-cols-3 gap-2">
          {LETTER_SPACINGS.map(({ value, label, preview }) => {
            const isActive = letterSpacing === value
            const spacing =
              value === "normal" ? "tracking-normal" : value === "md" ? "tracking-wide" : "tracking-widest"
            return (
              <button
                key={value}
                type="button"
                onClick={() => setLetterSpacing(value)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs font-medium transition-colors",
                  isActive
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <span className={cn("text-sm font-semibold", spacing)}>{preview}</span>
                <span>{label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Contrast */}
      <div className="px-1 space-y-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Contrast className="h-3.5 w-3.5" />
          Контрастность
        </p>
        <div className="grid grid-cols-2 gap-2">
          {CONTRAST_OPTIONS.map(({ value, label, bg, text, border }) => {
            const isActive = contrast === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => setContrast(value)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 text-xs font-medium transition-colors",
                  bg, text, border,
                  isActive
                    ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
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

    </div>
  )
}
