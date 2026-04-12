"use client"

import * as React from "react"
import Link from "next/link"
import {
  ArrowLeft,
  Bot,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  MessageSquare,
  Shield,
  X,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

// ── Types ──────────────────────────────────────────────────────────────────

interface Appeal {
  id: string
  text: string
  formalizedText: string
  theses: string[]
  summary: string
  category: { id: string; name: string }
  subcategory: { id: string; name: string }
  isImportant: boolean
  status: "pending" | "processing" | "processed" | "resolved" | "rejected"
  hasChat: boolean
  messageCount: number
  createdAt: string
}

interface Message {
  id: string
  role: "patient" | "assistant"
  content: string
  createdAt: string
}

// ── Mock data ──────────────────────────────────────────────────────────────

const MOCK_APPEALS: Appeal[] = [
  {
    id: "1",
    text: "Прошлой ночью я несколько раз нажимал кнопку вызова медсестры, но никто не пришёл более 40 минут. Мне было очень плохо.",
    formalizedText: "Пациент сообщает о многократных нажатиях кнопки вызова персонала в ночное время. Время ожидания ответа персонала превысило 40 минут. Состояние пациента ухудшилось в период ожидания.",
    theses: [
      "Многократный вызов персонала в ночное время",
      "Время ожидания ответа превысило 40 минут",
      "Состояние пациента ухудшилось в период ожидания",
    ],
    summary: "Медперсонал не реагировал на вызов 40+ минут",
    category: { id: "cat_1", name: "Организация ухода за пациентами" },
    subcategory: { id: "sub_1_3", name: "Несвоевременная помощь" },
    isImportant: true,
    status: "processing",
    hasChat: true,
    messageCount: 5,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "2",
    text: "Я попросил обезболивающее три часа назад, но мне до сих пор ничего не принесли.",
    formalizedText: "Пациент ожидает выдачу анальгетиков более 3 часов с момента обращения к дежурному медицинскому персоналу.",
    theses: [
      "Запрос обезболивающего не выполнен",
      "Ожидание более 3 часов",
    ],
    summary: "Задержка выдачи обезболивающего",
    category: { id: "cat_2", name: "Лекарственная безопасность" },
    subcategory: { id: "sub_2_1", name: "Несвоевременная выдача лекарств" },
    isImportant: true,
    status: "pending",
    hasChat: false,
    messageCount: 0,
    createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  },
  {
    id: "3",
    text: "В палате очень холодно, батарея не работает. Прошу починить отопление или принести дополнительное одеяло.",
    formalizedText: "Пациент сообщает о неудовлетворительном температурном режиме в палате. Система отопления не функционирует. Пациент испытывает дискомфорт из-за низкой температуры.",
    theses: [
      "Низкая температура воздуха в палате",
      "Система отопления не функционирует",
      "Необходимо дополнительное одеяло",
    ],
    summary: "Неисправное отопление в палате",
    category: { id: "cat_6", name: "Условия пребывания" },
    subcategory: { id: "sub_6_2", name: "Температурный режим" },
    isImportant: false,
    status: "processed",
    hasChat: true,
    messageCount: 3,
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "4",
    text: "Медсестра грубо разговаривала со мной и отказалась объяснять, какие лекарства мне назначены и зачем.",
    formalizedText: "Пациент сообщает о ненадлежащем поведении медицинской сестры: грубость при общении, отказ предоставить информацию о назначенных препаратах и их назначении.",
    theses: [
      "Грубое обращение медицинской сестры",
      "Отказ объяснить назначенные препараты",
      "Нарушение права пациента на информацию",
    ],
    summary: "Грубое поведение медсестры и отказ в информации",
    category: { id: "cat_7", name: "Поведение и отношение персонала" },
    subcategory: { id: "sub_7_1", name: "Грубость персонала" },
    isImportant: false,
    status: "rejected",
    hasChat: true,
    messageCount: 7,
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "5",
    text: "На меня упал прикроватный столик. Я получил небольшой ушиб руки.",
    formalizedText: "Пациент получил травму верхней конечности (ушиб) в результате падения прикроватного столика. Инцидент произошёл в условиях палатного отделения. Обстоятельства падения мебели не установлены.",
    theses: [
      "Падение прикроватного столика в палате",
      "Пациент получил ушиб руки",
      "Требуется осмотр и фиксация происшествия",
    ],
    summary: "Травма от падения прикроватного столика",
    category: { id: "cat_1", name: "Организация ухода за пациентами" },
    subcategory: { id: "sub_1_1", name: "Падения пациентов в МО" },
    isImportant: true,
    status: "resolved",
    hasChat: true,
    messageCount: 4,
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
]

const MOCK_MESSAGES: Message[] = [
  { id: "m1", role: "assistant", content: "Здравствуйте! Уточните, пожалуйста — в котором часу вы первый раз нажали кнопку вызова?", createdAt: new Date(Date.now() - 1.9 * 60 * 60 * 1000).toISOString() },
  { id: "m2", role: "patient", content: "Около 3 часов ночи, наверное. Я нажимал раза 3 или 4.", createdAt: new Date(Date.now() - 1.85 * 60 * 60 * 1000).toISOString() },
  { id: "m3", role: "assistant", content: "Понял вас. Как вы себя чувствовали в это время — была ли боль или другие острые симптомы?", createdAt: new Date(Date.now() - 1.8 * 60 * 60 * 1000).toISOString() },
  { id: "m4", role: "patient", content: "Да, была сильная боль в животе. Я очень беспокоился.", createdAt: new Date(Date.now() - 1.75 * 60 * 60 * 1000).toISOString() },
  { id: "m5", role: "assistant", content: "Спасибо за пояснения. Обращение зафиксировано как приоритетное. Ответственный специалист ознакомится в ближайшее время.", createdAt: new Date(Date.now() - 1.7 * 60 * 60 * 1000).toISOString() },
]

// ── Status config ──────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  pending:    { label: "Подтверждается", variant: "warning"     as const, Icon: Clock,     spinning: false },
  processing: { label: "Подтверждается", variant: "warning"     as const, Icon: Loader2,   spinning: true  },
  processed:  { label: "Подтверждено",   variant: "primary"     as const, Icon: Check,     spinning: false },
  resolved:   { label: "Завершено",      variant: "default"     as const, Icon: CheckCheck, spinning: false },
  rejected:   { label: "Отклонено",      variant: "destructive" as const, Icon: X,         spinning: false },
}

const IN_PROGRESS_STATUSES = new Set<Appeal["status"]>(["pending", "processing"])

// ── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "только что"
  if (m < 60) return `${m} мин назад`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} ч назад`
  return `${Math.floor(h / 24)} д назад`
}

// ── Components ─────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const isPatient = msg.role === "patient"
  return (
    <div className={`flex items-end gap-2 animate-message-in ${isPatient ? "flex-row-reverse" : "flex-row"}`}>
      {!isPatient && (
        <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mb-0.5">
          <Bot className="h-3 w-3 text-primary" />
        </div>
      )}
      <div className={`max-w-[78%] px-3 py-2 text-xs leading-relaxed ${
        isPatient
          ? "bg-primary text-primary-foreground rounded-2xl rounded-br-sm"
          : "bg-muted text-foreground rounded-2xl rounded-bl-sm"
      }`}>
        {msg.content}
      </div>
    </div>
  )
}

function AiInfoBlock({ appeal }: { appeal: Appeal }) {
  return (
    <div className="rounded-xl bg-muted/40 border border-border/60 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/60 bg-muted/30">
        <div className="h-5 w-5 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
          <Bot className="h-3 w-3 text-primary" />
        </div>
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          ИИ-анализ обращения
        </span>
      </div>

      {/* Formalized text */}
      <div className="px-3 pt-2.5 pb-2">
        <p className="text-xs text-foreground leading-relaxed">{appeal.formalizedText}</p>
      </div>

      {/* Theses */}
      {appeal.theses.length > 0 && (
        <div className="px-3 pb-2.5 space-y-1">
          {appeal.theses.map((t, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 mt-1.5" />
              <span className="text-xs text-muted-foreground leading-relaxed">{t}</span>
            </div>
          ))}
        </div>
      )}

      {/* Categories */}
      <div className="px-3 py-2 border-t border-border/60 flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] text-muted-foreground bg-background rounded-md px-2 py-0.5 border border-border/50">
          {appeal.category.name}
        </span>
        <span className="text-muted-foreground/40 text-xs">·</span>
        <span className="text-[10px] text-muted-foreground">
          {appeal.subcategory.name}
        </span>
        {appeal.isImportant && (
          <>
            <span className="text-muted-foreground/40 text-xs">·</span>
            <span className="text-[10px] text-warning font-medium">Важное</span>
          </>
        )}
      </div>
    </div>
  )
}

function AppealCard({ appeal, onViewChat }: { appeal: Appeal; onViewChat: (id: string) => void }) {
  const { label, variant, Icon, spinning } = STATUS_CONFIG[appeal.status]
  const [expanded, setExpanded] = React.useState(false)

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden transition-shadow hover:shadow-sm">
      {/* Main row */}
      <button
        className="w-full text-left px-4 pt-3.5 pb-3 hover:bg-muted/20 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground leading-snug line-clamp-2">
              {appeal.summary}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[11px] text-muted-foreground">{timeAgo(appeal.createdAt)}</span>
              {appeal.hasChat && (
                <>
                  <span className="text-muted-foreground/30 text-xs">·</span>
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <MessageSquare className="h-2.5 w-2.5" />
                    {appeal.messageCount}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 mt-0.5">
            <Badge variant={variant}>
              <Icon className={`h-3 w-3 ${spinning ? "animate-spin" : ""}`} />
              {label}
            </Badge>
            {expanded
              ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
              : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            }
          </div>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-3 animate-fade-in">
          {/* Original patient text */}
          <div>
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-1.5">
              Обращение пациента
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed border-l-2 border-border pl-3">
              {appeal.text}
            </p>
          </div>

          {/* AI analysis block */}
          <AiInfoBlock appeal={appeal} />

          {/* Footer actions */}
          {appeal.hasChat && (
            <div className="flex justify-end pt-0.5">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5 px-3"
                onClick={(e) => { e.stopPropagation(); onViewChat(appeal.id) }}
              >
                <MessageSquare className="h-3 w-3" />
                История чата ({appeal.messageCount})
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SectionHeader({ title, count, icon }: { title: string; count: number; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-xs font-semibold text-foreground uppercase tracking-wide">{title}</span>
      </div>
      <div className="flex-1 h-px bg-border" />
      <span className="text-[11px] text-muted-foreground font-medium">{count}</span>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function AppealsPage() {
  const [appeals, setAppeals]   = React.useState<Appeal[]>(MOCK_APPEALS)
  const [loading, setLoading]   = React.useState(false)
  const [chatDialog, setChatDialog] = React.useState<{
    open: boolean
    summary: string
    messages: Message[]
    loadingMsgs: boolean
  }>({ open: false, summary: "", messages: [], loadingMsgs: false })

  React.useEffect(() => {
    fetch("/api/appeals")
      .then((r) => r.json())
      .then((data: Appeal[]) => {
        if (Array.isArray(data) && data.length > 0) setAppeals(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  async function openChat(appealId: string) {
    const appeal = appeals.find((a) => a.id === appealId)
    setChatDialog({ open: true, summary: appeal?.summary ?? "", messages: [], loadingMsgs: true })
    try {
      const msgs: Message[] = await fetch(`/api/appeals/${appealId}/messages`).then((r) => r.json())
      setChatDialog((prev) => ({ ...prev, messages: msgs.length > 0 ? msgs : MOCK_MESSAGES, loadingMsgs: false }))
    } catch {
      setChatDialog((prev) => ({ ...prev, messages: MOCK_MESSAGES, loadingMsgs: false }))
    }
  }

  const inProgress = appeals.filter((a) => IN_PROGRESS_STATUSES.has(a.status))
  const completed  = appeals.filter((a) => !IN_PROGRESS_STATUSES.has(a.status))

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col items-center px-4 py-4">
      <div className="w-full max-w-lg flex flex-col gap-4">

        {/* ── AppBar — floating card ── */}
        <div className="bg-card border border-border rounded-2xl px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Link href="/">
              <Button variant="ghost" size="icon" className="h-8 w-8 -ml-1 text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20 shrink-0">
              <Shield className="h-5 w-5 text-primary" fill="currentColor" />
            </div>
            <span className="text-sm font-semibold text-foreground">История обращений</span>
          </div>

          {!loading && appeals.length > 0 && (
            <span className="text-xs text-muted-foreground bg-muted rounded-full px-2.5 py-0.5">
              {appeals.length} шт.
            </span>
          )}
        </div>

        {/* ── Content ── */}
        <div className="space-y-5">

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2.5">
                  <div className="flex justify-between items-start gap-3">
                    <Skeleton className="h-4 w-52" />
                    <Skeleton className="h-5 w-28 rounded-full shrink-0" />
                  </div>
                  <Skeleton className="h-3 w-24" />
                </div>
              ))}
            </div>
          ) : appeals.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card flex flex-col items-center justify-center py-14 gap-3">
              <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center">
                <MessageSquare className="h-6 w-6 text-muted-foreground/50" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">Обращений пока нет</p>
                <p className="text-xs text-muted-foreground mt-0.5">Создайте первое обращение</p>
              </div>
              <Link href="/">
                <Button size="sm" variant="outline" className="text-xs mt-1">
                  Оставить обращение
                </Button>
              </Link>
            </div>
          ) : (
            <>
              {/* ── В процессе ── */}
              {inProgress.length > 0 && (
                <section>
                  <SectionHeader
                    title="В процессе"
                    count={inProgress.length}
                    icon={<Loader2 className="h-3.5 w-3.5 text-warning animate-spin" />}
                  />
                  <div className="space-y-2">
                    {inProgress.map((a) => (
                      <AppealCard key={a.id} appeal={a} onViewChat={openChat} />
                    ))}
                  </div>
                </section>
              )}

              {/* ── Завершённые ── */}
              {completed.length > 0 && (
                <section>
                  <SectionHeader
                    title="Завершённые"
                    count={completed.length}
                    icon={<CheckCheck className="h-3.5 w-3.5 text-muted-foreground" />}
                  />
                  <div className="space-y-2">
                    {completed.map((a) => (
                      <AppealCard key={a.id} appeal={a} onViewChat={openChat} />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Chat history dialog ── */}
      <Dialog
        open={chatDialog.open}
        onOpenChange={(open) => setChatDialog((p) => ({ ...p, open }))}
      >
        <DialogContent className="max-w-sm flex flex-col max-h-[78vh] gap-0 p-0 overflow-hidden rounded-2xl">
          <DialogHeader className="px-5 py-4 border-b border-border shrink-0">
            <div className="flex items-center gap-2.5">
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarFallback className="bg-primary/10 text-primary">
                  <Bot className="h-3.5 w-3.5" />
                </AvatarFallback>
              </Avatar>
              <div>
                <DialogTitle className="text-sm font-semibold leading-none">История чата</DialogTitle>
                {chatDialog.summary && (
                  <p className="text-xs text-muted-foreground mt-0.5 font-normal line-clamp-1">
                    {chatDialog.summary}
                  </p>
                )}
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto scrollbar-app px-4 py-4 space-y-3 min-h-0">
            {chatDialog.loadingMsgs ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : chatDialog.messages.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-8">Сообщений нет</p>
            ) : (
              chatDialog.messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
            )}
          </div>

          {!chatDialog.loadingMsgs && chatDialog.messages.length > 0 && (
            <div className="shrink-0 px-5 py-2.5 border-t border-border">
              <p className="text-[10px] text-muted-foreground">
                {chatDialog.messages.length} сообщений
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

