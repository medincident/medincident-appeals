"use client"

import { RotateCcw } from "lucide-react"

import { Card } from "@/components/ui/card"
import { useSettingsStore } from "@/lib/stores/settings.store"

import { AnimationsToggle } from "./AnimationsToggle"
import { ContrastPicker } from "./ContrastPicker"
import { FontSizePicker } from "./FontSizePicker"
import { LetterSpacingPicker } from "./LetterSpacingPicker"

export function AccessibilitySettings() {
  const {
    fontSize, animations, contrast, letterSpacing,
    setFontSize, setAnimations, setContrast, setLetterSpacing,
    resetAccessibility,
  } = useSettingsStore()

  const hasChanges =
    fontSize !== "md" || !animations || contrast !== "normal" || letterSpacing !== "normal"

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-end justify-between gap-2 px-1">
        <p className="section-label">Доступность</p>
        {hasChanges && (
          <button
            type="button"
            onClick={resetAccessibility}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            Сбросить
          </button>
        )}
      </div>
      <Card className="divide-y divide-border overflow-hidden">
        <AnimationsToggle value={animations} onChange={setAnimations} />
        <FontSizePicker value={fontSize} onChange={setFontSize} />
        <LetterSpacingPicker value={letterSpacing} onChange={setLetterSpacing} />
        <ContrastPicker value={contrast} onChange={setContrast} />
      </Card>
    </section>
  )
}
