"use client"

import * as React from "react"
import { toast } from "sonner"
import {
  Bell,
  Check,
  ChevronRight,
  Heart,
  Loader2,
  Mail,
  MessageSquare,
  Plus,
  Search,
  Send,
  Settings,
  Star,
  Trash2,
  User,
  X,
} from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Toaster } from "@/components/ui/sonner"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Section({
  id,
  title,
  description,
  children,
}: {
  id?: string
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-8">
      <div className="mb-6">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  )
}

function Block({
  label,
  children,
  className,
}: {
  label?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className="space-y-2.5">
      {label && (
        <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
      )}
      <div className={`flex flex-wrap items-center gap-2.5 ${className ?? ""}`}>
        {children}
      </div>
    </div>
  )
}

// ─── Color token row ──────────────────────────────────────────────────────────

function TokenRow({
  name,
  bg,
  text,
  border,
}: {
  name: string
  bg: string
  text?: string
  border?: boolean
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`h-8 w-8 rounded-md flex-shrink-0 ${bg} ${border ? "border-2 border-border" : ""}`}
      />
      <span className="text-sm text-foreground font-mono">{name}</span>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ComponentsNewPage() {
  const [loadingBtn, setLoadingBtn] = React.useState(false)
  const [skeletonMode, setSkeletonMode] = React.useState(true)
  const [inputVal, setInputVal] = React.useState("")

  function handleLoadingClick() {
    setLoadingBtn(true)
    setTimeout(() => {
      setLoadingBtn(false)
      toast.success("Готово!", { description: "Операция выполнена успешно" })
    }, 2000)
  }

  return (
    <>
      <Toaster position="top-right" richColors />

      <div className="min-h-screen bg-background">
        {/* ── Nav ── */}
        <header className="sticky top-0 z-40 border-b border-border bg-card px-6 py-3.5">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
                <Heart className="h-3.5 w-3.5 text-primary-foreground" />
              </div>
              <span className="font-semibold text-foreground text-sm">UI Components</span>
              <span className="text-muted-foreground text-sm">/</span>
              <span className="text-muted-foreground text-sm">ai-medincident</span>
            </div>
            <div className="flex items-center gap-2">
              <Button size="icon" variant="ghost">
                <Bell />
              </Button>
              <Avatar className="h-7 w-7">
                <AvatarFallback className="text-[10px] bg-secondary text-secondary-foreground">
                  АИ
                </AvatarFallback>
              </Avatar>
            </div>
          </div>
        </header>

        <div className="max-w-5xl mx-auto px-6 py-10 space-y-16">

          {/* ── Page title ── */}
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">
              Design System
            </p>
            <h1 className="text-4xl font-bold tracking-tight text-foreground">
              Component Library
            </h1>
            <p className="mt-2 text-base text-muted-foreground max-w-xl">
              Витрина всех UI-компонентов. Все компоненты интерактивны — можно тыкать.
            </p>
          </div>

          {/* ═══════════════════════════════════════════════
              COLORS
          ═══════════════════════════════════════════════ */}
          <Section id="colors" title="Colors" description="Семантические токены темы">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              <div className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Brand</p>
                <div className="space-y-2">
                  <TokenRow name="primary" bg="bg-primary" />
                  <TokenRow name="secondary" bg="bg-secondary" />
                  <TokenRow name="destructive" bg="bg-destructive" />
                  <TokenRow name="warning" bg="bg-warning" />
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Neutral</p>
                <div className="space-y-2">
                  <TokenRow name="background" bg="bg-background" border />
                  <TokenRow name="card" bg="bg-card" border />
                  <TokenRow name="muted" bg="bg-muted" />
                  <TokenRow name="border" bg="bg-border" />
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Gradients</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-md flex-shrink-0 bg-[image:var(--telegram-gradient)]" />
                    <span className="text-sm font-mono text-foreground">telegram</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-md flex-shrink-0 bg-[image:var(--max-gradient)]" />
                    <span className="text-sm font-mono text-foreground">max</span>
                  </div>
                </div>
              </div>
            </div>
          </Section>

          {/* ═══════════════════════════════════════════════
              TYPOGRAPHY
          ═══════════════════════════════════════════════ */}
          <Section id="typography" title="Typography">
            <div className="space-y-4 border border-border rounded-xl p-6 bg-card">
              <div className="flex items-baseline gap-3">
                <span className="text-[10px] font-mono text-muted-foreground w-20 shrink-0">4xl / bold</span>
                <p className="text-4xl font-bold tracking-tight">Инцидент открыт</p>
              </div>
              <Separator />
              <div className="flex items-baseline gap-3">
                <span className="text-[10px] font-mono text-muted-foreground w-20 shrink-0">2xl / semi</span>
                <p className="text-2xl font-semibold tracking-tight">Пациент №4821</p>
              </div>
              <Separator />
              <div className="flex items-baseline gap-3">
                <span className="text-[10px] font-mono text-muted-foreground w-20 shrink-0">xl / med</span>
                <p className="text-xl font-medium">Диагноз: острый аппендицит</p>
              </div>
              <Separator />
              <div className="flex items-baseline gap-3">
                <span className="text-[10px] font-mono text-muted-foreground w-20 shrink-0">base</span>
                <p className="text-base text-foreground">Состояние пациента стабильное, мониторинг продолжается.</p>
              </div>
              <Separator />
              <div className="flex items-baseline gap-3">
                <span className="text-[10px] font-mono text-muted-foreground w-20 shrink-0">sm / muted</span>
                <p className="text-sm text-muted-foreground">Последнее обновление: 31 марта 2026, 14:22</p>
              </div>
              <Separator />
              <div className="flex items-baseline gap-3">
                <span className="text-[10px] font-mono text-muted-foreground w-20 shrink-0">xs / caps</span>
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Критический статус</p>
              </div>
            </div>
          </Section>

          {/* ═══════════════════════════════════════════════
              BUTTONS
          ═══════════════════════════════════════════════ */}
          <Section id="buttons" title="Button" description="Все варианты, размеры и состояния">
            <div className="space-y-8">

              <Block label="Variants">
                <Button variant="default">Default</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="destructive">Destructive</Button>
                <Button variant="link">Link</Button>
              </Block>

              <Block label="Sizes">
                <Button size="sm">Small</Button>
                <Button size="default">Default</Button>
                <Button size="md">Medium</Button>
                <Button size="lg">Large</Button>
                <Button size="icon" variant="outline"><Plus /></Button>
                <Button size="icon" variant="ghost"><Settings /></Button>
              </Block>

              <Block label="With icons">
                <Button><Bell />Уведомления</Button>
                <Button variant="secondary"><Mail />Написать</Button>
                <Button variant="outline"><Star />Избранное</Button>
                <Button variant="ghost"><Settings />Настройки</Button>
                <Button variant="destructive"><Trash2 />Удалить</Button>
              </Block>

              <Block label="States">
                <Button disabled>Disabled</Button>
                <Button variant="outline" disabled>Outline disabled</Button>
                <Button
                  disabled={loadingBtn}
                  onClick={handleLoadingClick}
                >
                  {loadingBtn
                    ? <><Loader2 className="animate-spin" />Загрузка...</>
                    : <><Check />Сохранить</>
                  }
                </Button>
              </Block>

              <Block label="Brand (gradient)">
                <Button variant="telegram" size="md">
                  <MessageSquare />Войти через Telegram
                </Button>
                <Button variant="max" size="md">
                  <Send />Войти через Max
                </Button>
              </Block>

            </div>
          </Section>

          {/* ═══════════════════════════════════════════════
              INPUTS
          ═══════════════════════════════════════════════ */}
          <Section id="inputs" title="Input & Label" description="Варианты полей ввода">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

              {/* Default */}
              <div className="space-y-2">
                <Label htmlFor="i-default">Default (transparent)</Label>
                <Input
                  id="i-default"
                  placeholder="Введите текст..."
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                />
                {inputVal && (
                  <p className="text-xs text-muted-foreground">→ {inputVal}</p>
                )}
              </div>

              {/* onbackground */}
              <div className="space-y-2">
                <Label htmlFor="i-onbg">onbackground (белый фон)</Label>
                <Input
                  id="i-onbg"
                  variant="onbackground"
                  placeholder="На цветном фоне..."
                />
                <p className="text-xs text-muted-foreground">bg-white в light / bg-card в dark</p>
              </div>

              {/* onbackground on colored bg */}
              <div className="sm:col-span-2 rounded-xl p-5 bg-secondary space-y-2">
                <Label htmlFor="i-onbg-demo" className="text-secondary-foreground">
                  onbackground на secondary фоне
                </Label>
                <div className="flex gap-3">
                  <Input
                    id="i-onbg-demo"
                    variant="onbackground"
                    placeholder="Поиск инцидентов..."
                    className="max-w-sm"
                  />
                  <Button size="icon" className="bg-white/15 hover:bg-white/25 text-white border-0 shrink-0">
                    <Search />
                  </Button>
                </div>
              </div>

              {/* With icon */}
              <div className="space-y-2">
                <Label htmlFor="i-icon">С иконкой</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input id="i-icon" className="pl-9" placeholder="Поиск..." />
                </div>
              </div>

              {/* Error */}
              <div className="space-y-2">
                <Label htmlFor="i-error" className="text-destructive">С ошибкой</Label>
                <Input
                  id="i-error"
                  className="border-destructive focus-visible:ring-destructive"
                  defaultValue="invalid@"
                />
                <p className="text-xs text-destructive">Введите корректный email</p>
              </div>

              {/* Disabled */}
              <div className="space-y-2">
                <Label htmlFor="i-disabled">Disabled</Label>
                <Input id="i-disabled" placeholder="Недоступно" disabled />
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="i-pass">Пароль</Label>
                <Input id="i-pass" type="password" placeholder="••••••••" />
              </div>
            </div>
          </Section>

          {/* ═══════════════════════════════════════════════
              CARDS
          ═══════════════════════════════════════════════ */}
          <Section id="cards" title="Card" description="Карточки в разных конфигурациях">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              <Card>
                <CardHeader>
                  <CardTitle>Инцидент #1042</CardTitle>
                  <CardDescription>Открыт 31 марта 2026 в 09:14</CardDescription>
                </CardHeader>
                <CardContent className="text-sm">
                  Пациент поступил с жалобами на острые боли в животе. Назначено обследование.
                </CardContent>
                <CardFooter className="gap-2">
                  <Button size="sm">Открыть</Button>
                  <Button size="sm" variant="ghost">Позже</Button>
                </CardFooter>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src="https://github.com/shadcn.png" />
                      <AvatarFallback className="bg-secondary text-secondary-foreground text-sm">ДВ</AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle className="text-base">Дмитрий Воронов</CardTitle>
                      <CardDescription>Врач-терапевт · Отд. №3</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  На дежурстве до 20:00. Ведёт 4 активных инцидента.
                </CardContent>
                <CardFooter>
                  <Button size="sm" variant="outline" className="w-full">
                    <Mail />Написать
                  </Button>
                </CardFooter>
              </Card>

              <Card className="border-primary/30 bg-primary/[0.03]">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                    <CardTitle className="text-base text-primary">Активный мониторинг</CardTitle>
                  </div>
                  <CardDescription>4 пациента под наблюдением</CardDescription>
                </CardHeader>
                <CardContent className="text-sm">
                  Все показатели в норме. Следующий обход в 16:00.
                </CardContent>
              </Card>

              <Card className="border-destructive/30 bg-destructive/[0.03]">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
                    <CardTitle className="text-base text-destructive">Критический статус</CardTitle>
                  </div>
                  <CardDescription>Пациент №4821 · Реанимация</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Требуется немедленное вмешательство.
                </CardContent>
                <CardFooter className="gap-2">
                  <Button size="sm" variant="destructive">Реагировать</Button>
                  <Button size="sm" variant="ghost">Подробнее</Button>
                </CardFooter>
              </Card>

            </div>
          </Section>

          {/* ═══════════════════════════════════════════════
              AVATAR
          ═══════════════════════════════════════════════ */}
          <Section id="avatars" title="Avatar" description="Размеры, fallback, группа">
            <div className="space-y-8">

              <Block label="Sizes">
                {[
                  { size: "h-6 w-6", text: "text-[9px]" },
                  { size: "h-8 w-8", text: "text-[10px]" },
                  { size: "h-10 w-10", text: "text-xs" },
                  { size: "h-12 w-12", text: "text-sm" },
                  { size: "h-16 w-16", text: "text-base" },
                ].map(({ size, text }) => (
                  <Avatar key={size} className={size}>
                    <AvatarImage src="https://github.com/shadcn.png" />
                    <AvatarFallback className={text}>АВ</AvatarFallback>
                  </Avatar>
                ))}
              </Block>

              <Block label="Fallback styles">
                <Avatar>
                  <AvatarImage src="/broken.jpg" />
                  <AvatarFallback>ДВ</AvatarFallback>
                </Avatar>
                <Avatar>
                  <AvatarFallback className="bg-primary text-primary-foreground font-semibold">АМ</AvatarFallback>
                </Avatar>
                <Avatar>
                  <AvatarFallback className="bg-secondary text-secondary-foreground font-semibold">ОС</AvatarFallback>
                </Avatar>
                <Avatar>
                  <AvatarFallback className="bg-destructive/15 text-destructive font-semibold">ИК</AvatarFallback>
                </Avatar>
                <Avatar>
                  <AvatarFallback>
                    <User className="h-4 w-4 text-muted-foreground" />
                  </AvatarFallback>
                </Avatar>
              </Block>

              <Block label="Group">
                <div className="flex -space-x-2.5">
                  {["ДВ", "АМ", "ОС", "ИК", "МП"].map((initials, i) => (
                    <Avatar
                      key={i}
                      className="h-9 w-9 border-2 border-card ring-0"
                      style={{ zIndex: 5 - i }}
                    >
                      <AvatarFallback className="text-xs font-medium bg-secondary text-secondary-foreground">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-card bg-muted text-xs font-medium text-muted-foreground"
                    style={{ zIndex: 0 }}
                  >
                    +8
                  </div>
                </div>
              </Block>

            </div>
          </Section>

          {/* ═══════════════════════════════════════════════
              SKELETON
          ═══════════════════════════════════════════════ */}
          <Section id="skeleton" title="Skeleton" description="Состояние загрузки">
            <div className="space-y-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSkeletonMode((v) => !v)}
              >
                {skeletonMode ? "Показать контент" : "Показать skeleton"}
              </Button>

              {skeletonMode ? (
                <Card>
                  <CardContent className="pt-6 space-y-5">
                    <div className="flex items-center gap-4">
                      <Skeleton className="h-12 w-12 rounded-full" />
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-3 w-28" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-5/6" />
                      <Skeleton className="h-3 w-4/6" />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <Skeleton className="h-20 rounded-xl" />
                      <Skeleton className="h-20 rounded-xl" />
                      <Skeleton className="h-20 rounded-xl" />
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="pt-6 space-y-5">
                    <div className="flex items-center gap-4">
                      <Avatar className="h-12 w-12">
                        <AvatarFallback className="bg-primary text-primary-foreground font-semibold">АИ</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-semibold">AI MedIncident</p>
                        <p className="text-sm text-muted-foreground">Система управления инцидентами</p>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Данные загружены и отображаются корректно.
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      {["Инциденты", "Пациенты", "Отчёты"].map((label) => (
                        <div key={label} className="h-20 rounded-xl bg-muted flex items-center justify-center text-sm font-medium text-muted-foreground">
                          {label}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </Section>

          {/* ═══════════════════════════════════════════════
              SEPARATOR
          ═══════════════════════════════════════════════ */}
          <Section id="separator" title="Separator">
            <div className="border border-border rounded-xl p-6 bg-card space-y-5">
              <p className="text-sm text-foreground">Контент выше разделителя</p>
              <Separator />
              <p className="text-sm text-muted-foreground">Контент ниже разделителя</p>

              <div className="flex items-center gap-4 h-5 pt-2">
                <span className="text-sm text-foreground">Слева</span>
                <Separator orientation="vertical" />
                <span className="text-sm text-muted-foreground">Центр</span>
                <Separator orientation="vertical" />
                <span className="text-sm text-foreground">Справа</span>
              </div>
            </div>
          </Section>

          {/* ═══════════════════════════════════════════════
              DIALOG
          ═══════════════════════════════════════════════ */}
          <Section id="dialog" title="Dialog" description="Модальные окна">
            <div className="flex flex-wrap gap-3">

              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline">Подтверждение</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Закрыть инцидент?</DialogTitle>
                    <DialogDescription>
                      Инцидент #1042 будет помечен как решённый. Это действие можно отменить.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2 py-1">
                    <Label htmlFor="d-reason">Причина закрытия</Label>
                    <Input id="d-reason" placeholder="Введите причину..." />
                  </div>
                  <DialogFooter>
                    <Button variant="ghost">Отмена</Button>
                    <Button
                      onClick={() =>
                        toast.success("Инцидент закрыт", {
                          description: "Инцидент #1042 успешно закрыт",
                        })
                      }
                    >
                      Закрыть инцидент
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="destructive">
                    <Trash2 />Удалить запись
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Удалить запись?</DialogTitle>
                    <DialogDescription>
                      Данные пациента №4821 будут удалены безвозвратно.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="ghost">Отмена</Button>
                    <Button
                      variant="destructive"
                      onClick={() =>
                        toast.error("Запись удалена", {
                          description: "Данные пациента №4821 удалены",
                        })
                      }
                    >
                      <Trash2 />Удалить
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="secondary">Информация</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>О системе</DialogTitle>
                    <DialogDescription>
                      AI MedIncident — система мониторинга и управления медицинскими инцидентами.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 py-2 text-sm text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Версия</span>
                      <span className="font-mono text-foreground">0.1.0</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between">
                      <span>Next.js</span>
                      <span className="font-mono text-foreground">16.2.1</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between">
                      <span>UI</span>
                      <span className="font-mono text-foreground">shadcn / Radix</span>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline">Закрыть</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

            </div>
          </Section>

          {/* ═══════════════════════════════════════════════
              TOAST
          ═══════════════════════════════════════════════ */}
          <Section id="toast" title="Toast (Sonner)" description="Уведомления">
            <div className="flex flex-wrap gap-2.5">
              <Button variant="outline" onClick={() => toast("Уведомление")}>
                Default
              </Button>
              <Button
                variant="outline"
                className="border-primary/40 text-primary"
                onClick={() =>
                  toast.success("Сохранено!", { description: "Данные успешно сохранены" })
                }
              >
                Success
              </Button>
              <Button
                variant="outline"
                className="border-destructive/40 text-destructive"
                onClick={() =>
                  toast.error("Ошибка!", { description: "Не удалось выполнить операцию" })
                }
              >
                Error
              </Button>
              <Button
                variant="outline"
                className="border-warning/40 text-warning"
                onClick={() =>
                  toast.warning("Внимание!", { description: "Проверьте введённые данные" })
                }
              >
                Warning
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  toast.promise(new Promise((r) => setTimeout(r, 2000)), {
                    loading: "Сохранение...",
                    success: "Данные сохранены",
                    error: "Ошибка сохранения",
                  })
                }
              >
                Promise (2s)
              </Button>
            </div>
          </Section>

        </div>
      </div>
    </>
  )
}
