"use client"

import { X } from "lucide-react"

export function ErrorPanel({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="animate-fade-in rounded-xl border border-destructive/20 bg-destructive/[0.04] px-4 py-3.5 space-y-2">
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 rounded-full bg-destructive flex items-center justify-center shrink-0">
          <X className="h-2.5 w-2.5 text-white" />
        </div>
        <p className="text-sm font-medium text-foreground">Не получилось отправить</p>
      </div>
      <p className="text-xs text-muted-foreground pl-6">
        Что-то пошло не так на нашей стороне. Попробуйте ещё раз — ваш текст сохранён.
      </p>
      <p className="text-[10px] text-muted-foreground/70 font-mono break-all pl-6">
        {message}
      </p>
      <button
        onClick={onDismiss}
        className="text-xs text-destructive hover:underline pl-6 block"
      >
        Попробовать снова
      </button>
    </div>
  )
}
