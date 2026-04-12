"use client"

import * as React from "react"
import Link from "next/link"
import {
  AlertCircle,
  AlertTriangle,
  Check,
  ChevronRight,
  ClipboardList,
  HelpCircle,
  Info,
  Loader2,
  MessageSquare,
  Send,
  Shield,
  Tag,
  X,
} from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

const PROFILE_URL = process.env.NEXT_PUBLIC_AUTH_APP_URL
  ? `${process.env.NEXT_PUBLIC_AUTH_APP_URL}/profile`
  : "/profile"

interface Patient {
  id: string
  name: string
  initials: string
  avatarUrl: string | null
  position?: string
}

interface Appeal {
  id: string
  summary: string
  status: string
}

interface NlpResult {
  is_important: boolean
  reason: string
  formalized_text: string
  theses: string[]
  category: { id: string; name: string } | null
  subcategory: { id: string; name: string } | null
}

type SubmissionResult =
  | { type: "success"; appeal: Appeal; nlp: NlpResult | null }
  | { type: "error"; message: string }

const MOCK_PATIENT: Patient = {
  id: "USR-7734-21",
  name: "Алексей Смирнов",
  initials: "АС",
  avatarUrl: "/disco_cat.jpg",
  position: "Ведущий хирург",
}

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

// ── Guide Dialog ────────────────────────────────────────────────────────────

function GuideDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
              <HelpCircle className="h-3.5 w-3.5 text-primary" />
            </div>
            <DialogTitle className="text-sm font-semibold">
              Как оставить обращение
            </DialogTitle>
          </div>
        </DialogHeader>
        <div className="px-5 py-4 space-y-4">
          {GUIDE_TIPS.map((tip, i) => (
            <div key={i} className="flex gap-3">
              <span className="text-xs font-bold text-primary mt-0.5 w-4 shrink-0">
                {i + 1}.
              </span>
              <div>
                <p className="text-xs font-semibold text-foreground leading-snug">
                  {tip.title}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {tip.text}
                </p>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── NLP Result Card ─────────────────────────────────────────────────────────

function NlpResultCard({ nlp }: { nlp: NlpResult }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-muted/30">
        <div className="h-5 w-5 rounded-md bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
          <Shield className="h-3 w-3 text-primary" fill="currentColor" />
        </div>
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex-1">
          ИИ-анализ
        </span>
        {/* Importance badge */}
        {nlp.is_important ? (
          <div className="flex items-center gap-1 text-[10px] font-medium text-warning bg-warning/10 px-2 py-0.5 rounded-full">
            <AlertTriangle className="h-3 w-3" />
            Важное
          </div>
        ) : (
          <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            <Info className="h-3 w-3" />
            Не срочное
          </div>
        )}
      </div>

      <div className="px-3 py-3 space-y-3">
        {/* Category */}
        {nlp.category && (
          <div className="flex items-start gap-2">
            <Tag className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed">
              <span className="font-medium text-foreground">{nlp.category.name}</span>
              {nlp.subcategory && (
                <span className="text-muted-foreground"> · {nlp.subcategory.name}</span>
              )}
            </div>
          </div>
        )}

        {/* Formalized text */}
        {nlp.formalized_text && (
          <div className="rounded-lg bg-muted/40 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Формализованное описание
            </p>
            <p className="text-xs text-foreground leading-relaxed">{nlp.formalized_text}</p>
          </div>
        )}

        {/* Theses */}
        {nlp.theses.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Ключевые тезисы
            </p>
            {nlp.theses.map((t, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 mt-1.5" />
                <span className="text-xs text-muted-foreground leading-relaxed">{t}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main page ───────────────────────────────────────────────────────────────

export default function MainPage() {
  const [patient, setPatient]       = React.useState<Patient>(MOCK_PATIENT)
  const [activeTab, setActiveTab]   = React.useState<"appeals" | "chat">("appeals")
  const [appealText, setAppealText] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [result, setResult]         = React.useState<SubmissionResult | null>(null)
  const [guideOpen, setGuideOpen]   = React.useState(false)

  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  React.useEffect(() => {
    fetch("/api/patient/me")
      .then((r) => r.json())
      .then((p: Patient) => setPatient(p))
      .catch(() => {})
  }, [])

  async function handleSubmit() {
    if (!appealText.trim() || submitting) return
    const text = appealText.trim()
    setSubmitting(true)
    setResult(null)

    try {
      const [appealRes, nlpRes] = await Promise.allSettled([
        fetch("/api/appeals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        }),
        fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        }),
      ])

      if (appealRes.status === "rejected" || !appealRes.value.ok) {
        throw new Error(
          appealRes.status === "rejected"
            ? "Не удалось отправить обращение"
            : `Сервер вернул ${appealRes.value.status}`
        )
      }

      const appeal: Appeal = await appealRes.value.json()
      let nlp: NlpResult | null = null
      if (nlpRes.status === "fulfilled" && nlpRes.value.ok) {
        nlp = await nlpRes.value.json()
      }

      setAppealText("")
      setResult({ type: "success", appeal, nlp })
    } catch (err) {
      setResult({
        type: "error",
        message: err instanceof Error ? err.message : "Неизвестная ошибка",
      })
    } finally {
      setSubmitting(false)
    }
  }

  function resetForm() {
    setResult(null)
    setAppealText("")
    setTimeout(() => textareaRef.current?.focus(), 50)
  }

  const firstName = patient?.name?.split(" ")[0] ?? "Пациент"

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col items-center px-4 py-4">
      <div className="w-full max-w-lg flex flex-col gap-3">

        {/* ── AppBar — floating card, not full width ── */}
        <div className="bg-card border border-border rounded-2xl px-5 py-4 flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20 shrink-0">
              <Shield className="h-5 w-5 text-primary" fill="currentColor" />
            </div>
            <div className="leading-none">
              <p className="text-sm font-semibold text-foreground">AI MedIncident</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Система обращений</p>
            </div>
          </div>

          {/* Right: history + user */}
          <div className="flex items-center gap-3">
            <Link href="/appeals">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                title="История обращений"
              >
                <ClipboardList className="h-4 w-4" />
              </Button>
            </Link>

            <a href={PROFILE_URL} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
              <Avatar className="h-8 w-8 ring-2 ring-primary/20 shrink-0">
                {patient?.avatarUrl && (
                  <AvatarImage src={patient.avatarUrl} alt={patient.name} className="object-cover" />
                )}
                <AvatarFallback className="bg-primary/10 text-primary text-[11px] font-bold">
                  {patient?.initials ?? "?"}
                </AvatarFallback>
              </Avatar>
              <div className="hidden sm:block leading-none">
                <p className="text-xs font-semibold text-foreground">{patient?.name ?? "Профиль"}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{patient?.position ?? "Пациент"}</p>
              </div>
            </a>
          </div>
        </div>

        {/* ── Greeting ── */}
        <h1 className="text-xl font-semibold text-foreground px-1">
          Здравствуйте, {firstName}!
        </h1>

        {/* ── Separated outlined tabs ── */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("appeals")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 rounded-xl border px-4 py-2 text-xs font-medium transition-colors",
              activeTab === "appeals"
                ? "border-primary bg-primary/5 text-primary"
                : "border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/30"
            )}
          >
            <AlertCircle className="h-3.5 w-3.5" />
            Обращение
          </button>
          <button
            onClick={() => setActiveTab("chat")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 rounded-xl border px-4 py-2 text-xs font-medium transition-colors",
              activeTab === "chat"
                ? "border-primary bg-primary/5 text-primary"
                : "border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/30"
            )}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Чат с ИИ
          </button>
        </div>

        {/* ── Tab content ── */}
        {activeTab === "appeals" ? (
          <>
            {/* Hint row */}
            <div className="flex items-center justify-between px-1">
              <p className="text-xs text-muted-foreground">
                Опишите ситуацию своими словами
              </p>
              <button
                onClick={() => setGuideOpen(true)}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <HelpCircle className="h-3 w-3" />
                Памятка
              </button>
            </div>

            {/* Textarea */}
            <div className="relative" suppressHydrationWarning>
              <textarea
                ref={textareaRef}
                rows={4}
                className="w-full resize-none rounded-xl border border-input bg-card px-4 py-3 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 transition-shadow leading-relaxed"
                placeholder="Опишите жалобу или вопрос… (Enter — отправить, Shift+Enter — перенос)"
                value={appealText}
                onChange={(e) => setAppealText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleSubmit()
                  }
                }}
                disabled={submitting}
                autoFocus
                suppressHydrationWarning
              />
              <Button
                size="icon"
                className="absolute bottom-3 right-3 h-8 w-8 shrink-0 z-10"
                disabled={!appealText.trim() || submitting}
                onClick={handleSubmit}
                suppressHydrationWarning
              >
                {submitting
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Send className="h-3.5 w-3.5" />
                }
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground px-1">
              ИИ задаст уточняющие вопросы и поможет разобраться
            </p>
            <div className="relative">
              <textarea
                rows={4}
                className="w-full resize-none rounded-xl border border-input bg-card/50 px-4 py-3 pr-12 text-sm placeholder:text-muted-foreground cursor-not-allowed opacity-50 leading-relaxed"
                placeholder="Напишите сообщение…"
                disabled
              />
              <Button
                size="icon"
                className="absolute bottom-3 right-3 h-8 w-8 opacity-40"
                disabled
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="text-center text-[11px] text-muted-foreground">
              Функция в разработке
            </p>
          </>
        )}

        {/* ── Result ── */}
        {result && (
          <div className="animate-fade-in space-y-2">
            {result.type === "success" ? (
              <>
                {/* Success header */}
                <div className="rounded-xl border border-primary/20 bg-primary/[0.04] px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 rounded-full bg-primary flex items-center justify-center shrink-0">
                      <Check className="h-2.5 w-2.5 text-primary-foreground" />
                    </div>
                    <p className="text-sm font-medium text-foreground">Обращение принято</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Link
                      href="/appeals"
                      className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
                    >
                      История
                      <ChevronRight className="h-3 w-3" />
                    </Link>
                    <button
                      onClick={resetForm}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Новое →
                    </button>
                  </div>
                </div>

                {/* NLP analysis */}
                {result.nlp && <NlpResultCard nlp={result.nlp} />}

                {/* NLP unavailable notice */}
                {!result.nlp && (
                  <p className="text-[11px] text-muted-foreground text-center">
                    ИИ-анализ недоступен
                  </p>
                )}
              </>
            ) : (
              <div className="rounded-xl border border-destructive/20 bg-destructive/[0.04] px-4 py-3.5 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded-full bg-destructive flex items-center justify-center shrink-0">
                    <X className="h-2.5 w-2.5 text-white" />
                  </div>
                  <p className="text-sm font-medium text-foreground">Ошибка отправки</p>
                </div>
                <p className="text-xs text-muted-foreground font-mono break-all pl-6">
                  {result.message}
                </p>
                <button
                  onClick={resetForm}
                  className="text-xs text-destructive hover:underline pl-6 block"
                >
                  Попробуйте снова
                </button>
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── Guide Dialog ── */}
      <GuideDialog open={guideOpen} onOpenChange={setGuideOpen} />
    </div>
  )
}
