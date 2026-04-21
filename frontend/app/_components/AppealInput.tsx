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
    const trimmed   = value.trim()
    const overLimit = value.length > MAX_CHARS
    const canSubmit = !!trimmed && !submitting && !overLimit

    const voice = useVoiceRecorder({
      onTranscript: (text) => {
        onChange(value ? `${value.trimEnd()} ${text}` : text)
      },
      onError: (_code, message) => {
        toast.error(message)
      },
    })

    const recording = voice.status === "recording"
    const micDisabled = submitting

    return (
      <div className="flex flex-col gap-2">
        <div
          className={cn(
            "section-surface rounded-lg overflow-hidden shadow-[0_2px_8px_-4px_rgba(15,23,42,0.10)] transition-shadow duration-300 focus-within:shadow-none",
            overLimit && "ring-1 ring-destructive/50",
            recording && "ring-1 ring-red-500/60",
          )}
        >
          <textarea
            ref={ref}
            rows={3}
            className="w-full resize-none bg-transparent px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none leading-relaxed"
            placeholder="Расскажите, что произошло…"
            value={recording && voice.interimText ? `${value}${value ? " " : ""}${voice.interimText}` : value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                onSubmit()
              }
            }}
            disabled={submitting}
            readOnly={recording}
            autoFocus
            suppressHydrationWarning
          />
          <div className="flex items-center justify-between px-4 py-2 border-t border-border/60 text-[10px] text-muted-foreground">
            <span className="hidden sm:inline">
              {recording ? (
                <span className="text-red-600 font-medium">● идёт запись — говорите</span>
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
              {recording ? "Запись — говорите" : "Нажмите «Отправить», когда готово"}
            </span>
            <span className={cn("tabular-nums", overLimit && "text-destructive font-medium")}>
              {value.length}/{MAX_CHARS}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between px-1">
          <GuidePopover />
          <div className="flex items-center gap-2">
            {voice.supported && (
              <Button
                type="button"
                size="sm"
                variant={recording ? "destructive" : "outline"}
                className="h-8 px-5 gap-1.5 transition-all duration-200"
                disabled={micDisabled}
                onClick={() => (recording ? voice.stop() : voice.start())}
                aria-label={recording ? "Остановить запись" : "Записать голосом"}
                suppressHydrationWarning
              >
                {recording ? (
                  <>
                    <Square className="h-3.5 w-3.5" />
                    Остановить
                  </>
                ) : (
                  <>
                    <Mic className="h-3.5 w-3.5" />
                    Диктовать
                  </>
                )}
              </Button>
            )}
            <Button
              size="sm"
              className="h-8 px-5 gap-1.5 transition-all duration-200"
              disabled={!canSubmit}
              onClick={onSubmit}
              suppressHydrationWarning
            >
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Отправляю…
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  Отправить
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    )
  }
)
