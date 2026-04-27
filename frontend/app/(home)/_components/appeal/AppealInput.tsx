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
    const longText = value.length > 150 || value.split("\n").length > 2

    const voice = useVoiceRecorder({
      onTranscript: (text) => onChange(value ? `${value.trimEnd()} ${text}` : text),
      onError: (_code, message) => toast.error(message),
    })

    const recording = voice.status === "recording"
    const loadingVoice = voice.status === "loading"
    const displayValue = recording && voice.interimText
      ? [value, voice.interimText].filter(Boolean).join(" ")
      : value

    const handleSubmit = React.useCallback(() => {
      if (recording || loadingVoice) voice.stop()
      onSubmit()
    }, [recording, loadingVoice, voice, onSubmit])

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
            className="w-full resize-none bg-transparent px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none leading-relaxed"
            placeholder="Расскажите, что произошло…"
            value={displayValue}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleSubmit()
              }
            }}
            disabled={submitting}
            readOnly={recording}
            suppressHydrationWarning
          />
          <div className="flex items-center justify-between px-4 py-2 border-t border-border/60 text-[10px] text-muted-foreground">
            <span className="hidden sm:inline">
              {recording ? (
                <span className="text-destructive font-medium inline-flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />
                  идёт запись — говорите
                </span>
              ) : loadingVoice ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  подключение к распознаванию…
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
                : loadingVoice
                  ? "Подключение…"
                  : "Нажмите «Отправить», когда готово"}
            </span>
            <span className={cn("tabular-nums", overLimit && "text-destructive font-medium")}>
              {value.length}/{MAX_CHARS}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between px-1">
          <GuidePopover />
          <div className={cn("flex gap-2", longText ? "flex-col-reverse items-end" : "items-center")}>
            {voice.supported && (
              <Button
                type="button"
                size="sm"
                variant={recording ? "destructive" : "secondary"}
                className="h-8 px-5 gap-1.5"
                disabled={submitting || loadingVoice}
                onClick={recording ? voice.stop : voice.start}
                aria-label={recording ? "Остановить запись" : "Записать голосом"}
                suppressHydrationWarning
              >
                {loadingVoice
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : recording
                    ? <Square className="h-3.5 w-3.5" />
                    : <Mic className="h-3.5 w-3.5" />}
                {loadingVoice ? "Подключение…" : recording ? "Остановить" : "Диктовать"}
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
