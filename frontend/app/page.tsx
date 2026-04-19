"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  AlertCircle,
  Bell,
  Check,
  CheckCheck,
  ClipboardList,
  HelpCircle,
  Loader2,
  MessageSquare,
  Mic,
  Send,
  Sparkles,
  Square,
  Tag,
  X,
} from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useProfileStore } from "@/lib/stores/profile.store"
import { useProfileData } from "@/domain/profile/hooks"
import { createAppealAction } from "@/domain/appeals/actions"
import type { Appeal } from "@/domain/appeals/types"
import { useAppeals } from "@/domain/appeals/hooks"
import { useNotifications } from "@/domain/notifications/hooks"
import { markAllReadAction } from "@/domain/notifications/actions"
import type { NotificationItem as DomainNotification } from "@/domain/notifications/types"
import { useVoiceRecorder } from "@/lib/useVoiceRecorder"

type SubmissionState =
  | { kind: "idle" }
  | { kind: "success"; appeal: Appeal; fading: boolean }
  | { kind: "error"; message: string }

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

  const { mutate: mutateAppeals } = useAppeals()

  useProcessedAppealsToast()

  async function handleSubmit() {
    if (!appealText.trim() || submitting) return
    const text = appealText.trim()
    setSubmitting(true)
    setSubmission({ kind: "idle" })

    try {
      const appeal = await createAppealAction(text)
      // Refresh cached appeals list so /appeals shows the new entry
      await mutateAppeals()

      setAppealText("")
      setSubmission({ kind: "success", appeal, fading: false })

      fadeTimerRef.current = window.setTimeout(() => {
        setSubmission((s) => (s.kind === "success" ? { ...s, fading: true } : s))
      }, 5000)

      clearTimerRef.current = window.setTimeout(() => {
        setSubmission({ kind: "idle" })
        setTimeout(() => textareaRef.current?.focus(), 50)
      }, 5500)
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
            <span className="text-sm font-medium">Обращения</span>
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

      {/* ── Main — mobile: hero centered, input pinned bottom; desktop: all centered ── */}
      <main className="flex-1 flex flex-col w-full max-w-xl mx-auto px-4 pb-4 sm:pb-10 sm:justify-center sm:gap-8">

        {/* Hero — grows on mobile to push input to bottom */}
        <div className="flex-1 sm:flex-initial flex flex-col items-center justify-center gap-2 text-center py-6 sm:py-0">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
            AI Medincident
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground max-w-md">
            {firstName
              ? `Здравствуйте, ${firstName}. Расскажите, что вас беспокоит.`
              : "Расскажите, что вас беспокоит."}
          </p>
        </div>

        {/* Input / Success / Error block with stable min-height */}
        <div className="w-full flex flex-col gap-3 min-h-[220px]">

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
            <SuccessPanel appeal={submission.appeal} fading={submission.fading} />
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

const MAX_CHARS = 1000

const AppealInput = React.forwardRef<HTMLTextAreaElement, AppealInputProps>(
  function AppealInput({ value, onChange, onSubmit, submitting }, ref) {
    const trimmed    = value.trim()
    const overLimit  = value.length > MAX_CHARS
    const canSubmit  = !!trimmed && !submitting && !overLimit

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
                  {voice.supported && <span className="ml-2">· 🎙 — продиктовать</span>}
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
                className={cn(
                  "h-8 w-8 p-0 rounded-full transition-all duration-200",
                  recording && "animate-pulse",
                )}
                disabled={micDisabled}
                onClick={() => (recording ? voice.stop() : voice.start())}
                aria-label={recording ? "Остановить запись" : "Записать голосом"}
                title={recording ? "Остановить запись" : "Записать голосом"}
                suppressHydrationWarning
              >
                {recording ? (
                  <Square className="h-3.5 w-3.5" />
                ) : (
                  <Mic className="h-3.5 w-3.5" />
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

function SuccessPanel({ appeal, fading }: { appeal: Appeal; fading: boolean }) {
  const firstThesis = appeal.theses[0]

  return (
    <div
      className={cn(
        "flex flex-col items-center text-center gap-3 py-4",
        fading ? "opacity-0" : "opacity-100 animate-fade-in",
        "transition-opacity duration-500",
      )}
    >
      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
        <Check className="h-5 w-5 text-primary" strokeWidth={3} />
      </div>

      <div className="space-y-1">
        <p className="text-sm text-foreground">
          <Link
            href={`/appeals?select_id=${encodeURIComponent(appeal.id)}`}
            className="font-medium text-primary hover:underline"
          >
            Ваше обращение
          </Link>{" "}
          уже в обработке
        </p>
        <p className="text-xs text-muted-foreground max-w-sm">
          Спасибо, что поделились — это помогает нам становиться лучше.
        </p>
      </div>

      {(appeal.category || firstThesis) && (
        <div className="w-full max-w-sm rounded-xl bg-card border border-border/60 px-3.5 py-2.5 text-left space-y-1.5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-primary" />
            ИИ уже проанализировал
          </p>
          {appeal.category && (
            <p className="text-xs text-foreground flex items-center gap-1.5">
              <Tag className="h-3 w-3 text-primary shrink-0" />
              <span className="truncate">
                {appeal.category.name}
                {appeal.subcategory && (
                  <span className="text-muted-foreground"> · {appeal.subcategory.name}</span>
                )}
              </span>
            </p>
          )}
          {firstThesis && (
            <p className="text-xs text-muted-foreground flex items-start gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
              <span>{firstThesis}</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Processed-appeals toast ────────────────────────────────────────────────

const AUTOSHOWN_KEY = "notifications-autoshown-ids"

function readAutoshown(): Set<string> {
  if (typeof window === "undefined") return new Set()
  try {
    const raw = localStorage.getItem(AUTOSHOWN_KEY)
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
  } catch {
    return new Set()
  }
}

function writeAutoshown(set: Set<string>) {
  try {
    localStorage.setItem(AUTOSHOWN_KEY, JSON.stringify([...set]))
  } catch {}
}

function pluralize(n: number, one: string, few: string, many: string) {
  const mod10  = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
}

function useProcessedAppealsToast() {
  const { notifications } = useNotifications()
  const router            = useRouter()
  const firedRef          = React.useRef(false)

  React.useEffect(() => {
    if (firedRef.current) return
    if (notifications.length === 0) return

    const autoshown = readAutoshown()
    const fresh = notifications.filter(
      (n) => n.type === "processed" && !autoshown.has(n.id)
    )
    if (fresh.length === 0) return

    firedRef.current = true

    const count = fresh.length
    const word  = pluralize(count, "обращение", "обращения", "обращений")
    const verb  = pluralize(count, "Обработано", "Обработаны", "Обработано")

    toast.custom(
      (t) => (
        <button
          type="button"
          onClick={() => {
            router.push("/appeals")
            toast.dismiss(t)
          }}
          className="flex items-center gap-3 rounded-lg bg-primary text-primary-foreground px-4 py-3 shadow-lg text-sm font-medium hover:opacity-90 transition-opacity w-[min(92vw,22rem)]"
        >
          <div className="h-7 w-7 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <Check className="h-4 w-4" strokeWidth={3} />
          </div>
          <span className="flex-1 text-left">
            {verb} {count} {word}
          </span>
          <span className="text-xs text-primary-foreground/70 shrink-0">Открыть →</span>
        </button>
      ),
      { duration: 7000 }
    )

    fresh.forEach((n) => autoshown.add(n.id))
    writeAutoshown(autoshown)
  }, [notifications, router])
}

// ── Notifications popover ──────────────────────────────────────────────────

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
  const { notifications, mutate } = useNotifications()
  const rootRef = React.useRef<HTMLDivElement>(null)

  const unreadCount = notifications.filter((i) => !i.read).length

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

  async function markAllRead() {
    const updated = await markAllReadAction()
    await mutate(updated, false)
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
            {notifications.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">Уведомлений нет</p>
            ) : (
              notifications.map((n) => <NotificationRow key={n.id} notification={n} />)
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

function NotificationRow({ notification }: { notification: DomainNotification }) {
  const Icon =
    notification.type === "processed"     ? Check
    : notification.type === "response"    ? HelpCircle
    : notification.type === "status_change" ? AlertCircle
    : HelpCircle

  const href = notification.appealId
    ? `/appeals?select_id=${encodeURIComponent(notification.appealId)}`
    : null

  const body = (
    <>
      <div className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className="text-xs font-semibold text-popover-foreground leading-snug flex-1">
            {notification.title}
          </p>
          {!notification.read && (
            <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 mt-1.5" />
          )}
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5 line-clamp-2">
          {notification.description}
        </p>
        <p className="text-[10px] text-muted-foreground mt-1">{timeAgo(notification.createdAt)}</p>
      </div>
    </>
  )

  const className =
    "flex items-start gap-3 px-4 py-3 border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors"

  return href ? (
    <Link href={href} className={className}>{body}</Link>
  ) : (
    <div className={className}>{body}</div>
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

