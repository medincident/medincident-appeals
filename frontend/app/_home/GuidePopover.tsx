"use client"

import * as React from "react"
import { HelpCircle } from "lucide-react"

const GUIDE_TIPS = [
  {
    title: "Опишите ситуацию подробно",
    text: "Укажите, что именно произошло, когда и где. Чем больше деталей — тем точнее ИИ определит категорию.",
  },
  {
    title: "Не скрывайте симптомы",
    text: "Если обращение касается здоровья, опишите все симптомы — их характер, длительность и интенсивность.",
  },
  {
    title: "Пишите своими словами",
    text: "Не нужно использовать медицинские термины. ИИ поймёт обычную речь и сам сформулирует обращение.",
  },
  {
    title: "Одно обращение — одна проблема",
    text: "Если у вас несколько вопросов, создайте отдельное обращение для каждого. Так будет быстрее.",
  },
]

export function GuidePopover() {
  const [open, setOpen] = React.useState(false)
  const rootRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-primary hover:underline"
      >
        <HelpCircle className="h-3 w-3" />
        Памятка
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-72 rounded-md border border-border bg-popover shadow-lg p-4 z-20 animate-fade-in">
          <div className="flex items-center gap-2.5 pb-3 mb-3 border-b border-border">
            <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
              <HelpCircle className="h-3 w-3 text-primary" />
            </div>
            <p className="text-xs font-semibold text-popover-foreground">
              Как оставить обращение
            </p>
          </div>
          <div className="space-y-3">
            {GUIDE_TIPS.map((tip, i) => (
              <div key={i} className="flex gap-2.5">
                <span className="text-[11px] font-bold text-primary mt-0.5 w-3 shrink-0">
                  {i + 1}.
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-popover-foreground leading-snug">
                    {tip.title}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                    {tip.text}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
