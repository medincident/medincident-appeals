"use client"

import * as React from "react"
import { toast } from "sonner"
import { Loader2, Mic, Send, Square } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useVoiceRecorder } from "@/lib/useVoiceRecorder"

import { GuidePopover } from "./GuidePopover"

const MAX_CHARS = 1000

interface AppealInputProps {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  submitting: boolean
}

export const AppealInput = React.forwardRef<HTMLTextAreaElement, AppealInputProps>(
  function AppealInput({ value, onChange, onSubmit, submitting }, ref) {
    const overLimit = value.length > MAX_CHARS
    const canSubmit = !!value.trim() && !submitting && !overLimit

    const voice = useVoiceRecorder({
      onTranscript: (text) => onChange(value ? `${value.trimEnd()} ${text}` : text),
      onError: (_code, message) => toast.error(message),
    })

    const recording = voice.status === "recording"
    const transcribing = voice.status === "loading"

    const handleSubmit = React.useCallback(() => {
      if (recording || transcribing) voice.stop()
      onSubmit()
    }, [recording, transcribing, voice, onSubmit])

    return (
      <div className="flex flex-col gap-2">
        <div
          className={cn(
            "section-surface rounded-lg overflow-hidden shadow-[var(--shadow-soft)] transition-shadow duration-300 focus-within:shadow-none",
            overLimit && "ring-1 ring-destructive/50",
            recording && "ring-1 ring-destructive/60",
          )}
        >
          <textarea
            ref={ref}
            rows={3}
            className="w-full resize-none bg-transparent px-4 py-3 text-base sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none leading-relaxed"
            placeholder="Расскажите, что произошло…"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleSubmit()
              }
            }}
            disabled={submitting}
            readOnly={recording || transcribing}
            suppressHydrationWarning
          />
          <div className="flex items-center justify-between px-4 py-2 border-t border-border/60 text-[10px] text-muted-foreground">
            <span className="hidden sm:inline">
              {recording ? (
                <span className="text-destructive font-medium inline-flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />
                  идёт запись — говорите
                </span>
              ) : transcribing ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  распознаю речь…
                </span>
              ) : (
                <>
                  <kbd className="rounded bg-muted px-1 py-0.5 font-sans">Enter</kbd>
                  <span className="mx-1">— отправить,</span>
                  <kbd className="rounded bg-muted px-1 py-0.5 font-sans">Shift+Enter</kbd>
                  <span className="ml-1">— перенос</span>
                </>
              )}
            </span>
            <span className="sm:hidden">
              {recording
                ? "Запись — говорите"
                : transcribing
                  ? "Распознаю…"
                  : "Нажмите «Отправить», когда готово"}
            </span>
            <span className={cn("tabular-nums", overLimit && "text-destructive font-medium")}>
              {value.length}/{MAX_CHARS}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 px-1">
          <GuidePopover />
          <div className="flex flex-wrap items-center justify-end gap-2 min-w-0">
            {voice.supported && (
              <Button
                type="button"
                size="sm"
                variant={recording ? "destructive" : "secondary"}
                className="h-8 px-5 gap-1.5"
                // Во время распознавания запись уже завершена — отменять нечего, ждём текст.
                disabled={submitting || transcribing}
                onClick={recording ? voice.stop : voice.start}
                aria-label={
                  transcribing
                    ? "Распознаю речь"
                    : recording
                      ? "Остановить запись"
                      : "Записать голосом"
                }
                suppressHydrationWarning
              >
                {transcribing
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : recording
                    ? <Square className="h-3.5 w-3.5" />
                    : <Mic className="h-3.5 w-3.5" />}
                {transcribing ? "Распознаю…" : recording ? "Остановить" : "Диктовать"}
              </Button>
            )}
            <Button
              size="sm"
              className="h-8 px-5 gap-1.5"
              disabled={!canSubmit}
              onClick={handleSubmit}
              suppressHydrationWarning
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              {submitting ? "Отправляю…" : "Отправить"}
            </Button>
          </div>
        </div>
      </div>
    )
  }
)
