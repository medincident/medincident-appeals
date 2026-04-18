"use client"

import * as React from "react"
import Link from "next/link"
import {
  AlertCircle,
  Bell,
  Check,
  CheckCheck,
  ClipboardList,
  HelpCircle,
  Loader2,
  MessageSquare,
  Send,
  X,
} from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useProfileStore } from "@/lib/stores/profile.store"
import { useProfileData } from "@/lib/hooks/use-profile"

interface Appeal {
  id: string
  summary: string
  status: string
}

type SubmissionState =
  | { kind: "idle" }
  | { kind: "success"; appeal: Appeal; fading: boolean }
  | { kind: "error"; message: string }

interface NotificationItem {
  id: string
  kind: "new" | "critical" | "done"
  title: string
  text: string
  createdAt: string
  unread: boolean
}

const MOCK_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "n1",
    kind: "new",
    title: "Обращение #1028 принято",
    text: "Ваше обращение о холодной палате зарегистрировано.",
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    unread: true,
  },
  {
    id: "n2",
    kind: "critical",
    title: "Обращение #1022 отмечено важным",
    text: "Команда приоритизировала ваш запрос об обезболивающем.",
    createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    unread: true,
  },
  {
    id: "n3",
    kind: "done",
    title: "Обращение #1019 выполнено",
    text: "Отопление в палате починено. Подтвердите результат.",
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    unread: false,
  },
]

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

function GuidePopover() {
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

export default function MainPage() {
  useProfileData()
  const firstName = useProfileStore((s) => s.firstName)
  const lastName  = useProfileStore((s) => s.lastName)
  const photoUrl  = useProfileStore((s) => s.photoUrl)
  const position  = useProfileStore((s) => s.position)

  const fullName = firstName || lastName
    ? [firstName, lastName].filter(Boolean).join(" ")
    : null
  const initials = ((firstName?.[0] ?? "") + (lastName?.[0] ?? "")).toUpperCase()

  const [appealText, setAppealText] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [submission, setSubmission] = React.useState<SubmissionState>({ kind: "idle" })

  const textareaRef   = React.useRef<HTMLTextAreaElement>(null)
  const fadeTimerRef  = React.useRef<number | null>(null)
  const clearTimerRef = React.useRef<number | null>(null)

  React.useEffect(() => () => {
    if (fadeTimerRef.current)  window.clearTimeout(fadeTimerRef.current)
    if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current)
  }, [])

  async function handleSubmit() {
    if (!appealText.trim() || submitting) return
    const text = appealText.trim()
    setSubmitting(true)
    setSubmission({ kind: "idle" })

    try {
      const appealRes = await fetch("/api/appeals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })
      if (!appealRes.ok) throw new Error(`Сервер вернул ${appealRes.status}`)
      const appeal: Appeal = await appealRes.json()

      // Fire-and-forget analysis (not shown on the main page)
      fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      }).catch(() => {})

      setAppealText("")
      setSubmission({ kind: "success", appeal, fading: false })

      fadeTimerRef.current = window.setTimeout(() => {
        setSubmission((s) => (s.kind === "success" ? { ...s, fading: true } : s))
      }, 3500)

      clearTimerRef.current = window.setTimeout(() => {
        setSubmission({ kind: "idle" })
        setTimeout(() => textareaRef.current?.focus(), 50)
      }, 4000)
    } catch (err) {
      setSubmission({
        kind: "error",
        message: err instanceof Error ? err.message : "Неизвестная ошибка",
      })
    } finally {
      setSubmitting(false)
    }
  }

  function resetError() {
    setSubmission({ kind: "idle" })
    setTimeout(() => textareaRef.current?.focus(), 50)
  }

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">

      {/* ── Header — transparent, History left, notifications + profile right ── */}
      <header className="w-full px-4 pt-4">
        <div className="mx-auto w-full max-w-xl flex items-center justify-between gap-3">
          <Link
            href="/appeals"
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ClipboardList className="h-4 w-4" />
            <span className="text-sm font-medium">История</span>
          </Link>

          <div className="flex items-center gap-3">
            <NotificationsPopover />
            <Link
              href="/profile"
              className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
              aria-label="Профиль"
            >
              <Avatar className="h-9 w-9 shrink-0">
                {photoUrl && (
                  <AvatarImage src={photoUrl} alt={fullName ?? "Профиль"} className="object-cover" />
                )}
                <AvatarFallback className="bg-primary/10 text-primary text-[11px] font-bold">
                  {initials || ""}
                </AvatarFallback>
              </Avatar>
              {fullName && (
                <div className="leading-tight">
                  <p className="text-xs font-semibold text-foreground">{fullName}</p>
                  <p className="text-[10px] text-muted-foreground">{position ?? "Пациент"}</p>
                </div>
              )}
            </Link>
          </div>
        </div>
      </header>

      {/* ── Main — vertically centered on all sizes ── */}
      <main className="flex-1 flex flex-col items-center justify-center w-full max-w-xl mx-auto px-4 pb-10 gap-10">

        {/* Title */}
        <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-foreground text-center">
          AI Medincident
        </h1>

        {/* Input / Success block with stable min-height */}
        <div className="w-full flex flex-col gap-3 min-h-[190px]">

          {/* Tabs */}
          <div className="flex gap-2 justify-center">
            <button
              type="button"
              className="flex items-center justify-center gap-1.5 rounded-md border border-primary bg-primary/5 text-primary px-5 py-2 text-xs font-medium min-w-28"
            >
              <AlertCircle className="h-3.5 w-3.5" />
              Обращение
            </button>
            <button
              type="button"
              disabled
              aria-disabled="true"
              title="Функция в разработке"
              className="flex items-center justify-center gap-1.5 rounded-md border border-border bg-card px-5 py-2 text-xs font-medium text-muted-foreground/60 cursor-not-allowed min-w-28"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Чат
            </button>
          </div>

          {/* Content area */}
          {submission.kind === "success" ? (
            <SuccessPanel appealId={submission.appeal.id} fading={submission.fading} />
          ) : submission.kind === "error" ? (
            <ErrorPanel message={submission.message} onDismiss={resetError} />
          ) : (
            <AppealInput
              ref={textareaRef}
              value={appealText}
              onChange={setAppealText}
              onSubmit={handleSubmit}
              submitting={submitting}
            />
          )}

        </div>
      </main>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

interface AppealInputProps {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  submitting: boolean
}

const AppealInput = React.forwardRef<HTMLTextAreaElement, AppealInputProps>(
  function AppealInput({ value, onChange, onSubmit, submitting }, ref) {
    return (
      <div className="flex flex-col gap-2">
        <div className="rounded-2xl border border-input bg-card overflow-hidden shadow-[0_6px_24px_-12px_rgba(15,23,42,0.15)] transition-shadow duration-300 focus-within:shadow-none">
          <textarea
            ref={ref}
            rows={3}
            className="w-full resize-none bg-transparent px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none leading-relaxed"
            placeholder="Опишите ситуацию"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                onSubmit()
              }
            }}
            disabled={submitting}
            autoFocus
            suppressHydrationWarning
          />
        </div>
        <div className="flex items-center justify-between px-1">
          <GuidePopover />
          <Button
            size="sm"
            className="h-8 px-5 gap-1.5"
            disabled={!value.trim() || submitting}
            onClick={onSubmit}
            suppressHydrationWarning
          >
            {submitting
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Send className="h-3.5 w-3.5" />
            }
            Отправить
          </Button>
        </div>
      </div>
    )
  }
)

function SuccessPanel({ appealId, fading }: { appealId: string; fading: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center text-center py-6 gap-2",
        fading ? "opacity-0" : "opacity-100 animate-fade-in",
        "transition-opacity duration-500",
      )}
    >
      <div className="flex items-center gap-1.5 flex-wrap justify-center">
        <Link
          href={`/appeals?select_id=${encodeURIComponent(appealId)}`}
          className="text-sm font-medium text-primary hover:underline"
        >
          Ваше обращение
        </Link>
        <span className="text-sm text-foreground">направлено в обработку</span>
        <Check className="h-4 w-4 text-primary" />
      </div>
      <p className="text-xs text-muted-foreground">
        Спасибо, что помогаете нам стать лучше
      </p>
    </div>
  )
}

// ── Notifications ──────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "только что"
  if (m < 60) return `${m} мин назад`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} ч назад`
  const d = Math.floor(h / 24)
  if (d === 1) return "Вчера"
  return `${d} д назад`
}

function NotificationsPopover() {
  const [open, setOpen] = React.useState(false)
  const [items, setItems] = React.useState<NotificationItem[]>(MOCK_NOTIFICATIONS)
  const rootRef = React.useRef<HTMLDivElement>(null)

  const unreadCount = items.filter((i) => i.unread).length

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

  function markAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, unread: false })))
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
        aria-label="Уведомления"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
        )}
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 w-80 rounded-lg border border-border bg-popover shadow-xl z-30 animate-fade-in overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-3.5 pb-3 border-b border-border">
            <p className="text-sm font-semibold text-popover-foreground">Уведомления</p>
            <button
              type="button"
              onClick={markAllRead}
              disabled={unreadCount === 0}
              className="flex items-center gap-1 text-xs text-primary hover:underline disabled:text-muted-foreground disabled:no-underline disabled:cursor-not-allowed"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Пометить все
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto scrollbar-app">
            {items.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">Уведомлений нет</p>
            ) : (
              items.map((n) => <NotificationRow key={n.id} notification={n} />)
            )}
          </div>

          <Link
            href="/appeals"
            onClick={() => setOpen(false)}
            className="block border-t border-border py-2.5 text-center text-xs font-medium text-primary hover:bg-muted/30 transition-colors"
          >
            Показать все
          </Link>
        </div>
      )}
    </div>
  )
}

function NotificationRow({ notification }: { notification: NotificationItem }) {
  const Icon =
    notification.kind === "critical" ? AlertCircle
      : notification.kind === "done" ? Check
      : HelpCircle

  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors">
      <div className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className="text-xs font-semibold text-popover-foreground leading-snug flex-1">
            {notification.title}
          </p>
          {notification.unread && (
            <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 mt-1.5" />
          )}
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5 line-clamp-2">
          {notification.text}
        </p>
        <p className="text-[10px] text-muted-foreground mt-1">{timeAgo(notification.createdAt)}</p>
      </div>
    </div>
  )
}

// ── Error ──────────────────────────────────────────────────────────────────

function ErrorPanel({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="animate-fade-in rounded-xl border border-destructive/20 bg-destructive/[0.04] px-4 py-3.5 space-y-2">
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 rounded-full bg-destructive flex items-center justify-center shrink-0">
          <X className="h-2.5 w-2.5 text-white" />
        </div>
        <p className="text-sm font-medium text-foreground">Ошибка отправки</p>
      </div>
      <p className="text-xs text-muted-foreground font-mono break-all pl-6">
        {message}
      </p>
      <button
        onClick={onDismiss}
        className="text-xs text-destructive hover:underline pl-6 block"
      >
        Попробуйте снова
      </button>
    </div>
  )
}

