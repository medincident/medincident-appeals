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
  Trash2,
  User,
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

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground border-b border-border pb-2">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Row({
  label,
  children,
}: {
  label?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      {label && <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>}
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  )
}

// ─── Color swatch ─────────────────────────────────────────────────────────────

function Swatch({ label, className }: { label: string; className: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className={`w-12 h-12 rounded-lg border border-border ${className}`} />
      <span className="text-xs text-muted-foreground text-center leading-tight">{label}</span>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ComponentsPage() {
  const [loading, setLoading] = React.useState(false)
  const [inputValue, setInputValue] = React.useState("")
  const [searchValue, setSearchValue] = React.useState("")
  const [skeletonVisible, setSkeletonVisible] = React.useState(true)

  function simulateLoading() {
    setLoading(true)
    setTimeout(() => setLoading(false), 2000)
  }

  return (
    <>
      <Toaster position="top-right" richColors />
      <div className="min-h-screen bg-background py-12 px-6">
        <div className="max-w-4xl mx-auto space-y-12">

          {/* Header */}
          <div className="space-y-1">
            <h1 className="text-3xl font-bold text-foreground">UI Components</h1>
            <p className="text-muted-foreground">
              Интерактивная витрина всех компонентов AI MedIncident
            </p>
          </div>

          {/* ── Colors ── */}
          <Section title="Colors">
            <div className="flex flex-wrap gap-6">
              <Swatch label="primary" className="bg-primary" />
              <Swatch label="primary-fg" className="bg-primary-foreground border-2" />
              <Swatch label="secondary" className="bg-secondary" />
              <Swatch label="secondary-fg" className="bg-secondary-foreground" />
              <Swatch label="destructive" className="bg-destructive" />
              <Swatch label="warning" className="bg-warning" />
              <Swatch label="muted" className="bg-muted" />
              <Swatch label="accent" className="bg-accent" />
              <Swatch label="card" className="bg-card" />
              <Swatch label="background" className="bg-background border-2" />
            </div>
            <div className="flex flex-wrap gap-6 pt-2">
              <div className="flex flex-col items-center gap-1.5">
                <div className="w-24 h-12 rounded-lg bg-[image:var(--telegram-gradient)]" />
                <span className="text-xs text-muted-foreground">telegram</span>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <div className="w-24 h-12 rounded-lg bg-[image:var(--max-gradient)]" />
                <span className="text-xs text-muted-foreground">max</span>
              </div>
            </div>
          </Section>

          {/* ── Typography ── */}
          <Section title="Typography">
            <div className="space-y-3">
              <p className="text-3xl font-bold">Heading Large</p>
              <p className="text-2xl font-semibold">Heading Medium</p>
              <p className="text-xl font-medium">Heading Small</p>
              <p className="text-base text-foreground">Body text — основной текст интерфейса</p>
              <p className="text-sm text-muted-foreground">Small muted — вспомогательный текст</p>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Caption — метки, подписи</p>
            </div>
          </Section>

          {/* ── Buttons: variants ── */}
          <Section title="Button — Variants">
            <Row label="default sizes">
              <Button variant="default">Default</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="link">Link</Button>
            </Row>
            <Row label="brand">
              <Button variant="telegram">
                <MessageSquare />
                Telegram
              </Button>
              <Button variant="max">
                <Send />
                Max AI
              </Button>
            </Row>
            <Row label="sizes">
              <Button size="sm">Small</Button>
              <Button size="default">Default</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
              <Button size="icon" variant="outline">
                <Plus />
              </Button>
              <Button size="icon" variant="ghost">
                <Settings />
              </Button>
            </Row>
            <Row label="states">
              <Button disabled>Disabled</Button>
              <Button variant="outline" disabled>Outline disabled</Button>
              <Button onClick={simulateLoading} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Загрузка...
                  </>
                ) : (
                  "Клик → loading 2s"
                )}
              </Button>
              <Button variant="destructive" onClick={() => toast.error("Удалено!", { description: "Запись была удалена" })}>
                <Trash2 />
                Удалить
              </Button>
              <Button variant="default" onClick={() => toast.success("Сохранено!", { description: "Данные успешно сохранены" })}>
                <Check />
                Сохранить
              </Button>
            </Row>
            <Row label="with icon">
              <Button>
                <Bell />
                Уведомления
              </Button>
              <Button variant="outline">
                <Mail />
                Написать
              </Button>
              <Button variant="secondary">
                Далее
                <ChevronRight />
              </Button>
            </Row>
          </Section>

          {/* ── Inputs ── */}
          <Section title="Input & Label">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="default-input">Default</Label>
                <Input
                  id="default-input"
                  placeholder="Введите текст..."
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                />
                {inputValue && (
                  <p className="text-xs text-muted-foreground">Значение: {inputValue}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="search-input">С иконкой (Search)</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search-input"
                    className="pl-9"
                    placeholder="Поиск..."
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="error-input" className="text-destructive">
                  С ошибкой
                </Label>
                <Input
                  id="error-input"
                  className="border-destructive focus-visible:ring-destructive"
                  placeholder="Неверный формат"
                  defaultValue="invalid@"
                />
                <p className="text-xs text-destructive">Введите корректный email</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="disabled-input" className="opacity-50">
                  Disabled
                </Label>
                <Input
                  id="disabled-input"
                  placeholder="Недоступно"
                  disabled
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password-input">Пароль</Label>
                <Input id="password-input" type="password" placeholder="••••••••" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="file-input">Файл</Label>
                <Input id="file-input" type="file" />
              </div>
            </div>
          </Section>

          {/* ── Cards ── */}
          <Section title="Card">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Простая карточка</CardTitle>
                  <CardDescription>Описание карточки с дополнительной информацией</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-foreground">
                    Основное содержимое карточки. Здесь может быть любой контент.
                  </p>
                </CardContent>
                <CardFooter className="gap-2">
                  <Button size="sm">Действие</Button>
                  <Button size="sm" variant="ghost">Отмена</Button>
                </CardFooter>
              </Card>

              <Card className="border-primary/40">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage src="https://github.com/shadcn.png" />
                      <AvatarFallback>ДВ</AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle className="text-base">Дмитрий Воронов</CardTitle>
                      <CardDescription>Врач-терапевт</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Карточка с аватаром и пользовательскими данными
                </CardContent>
                <CardFooter>
                  <Button size="sm" variant="outline" className="w-full">
                    <Mail /> Написать
                  </Button>
                </CardFooter>
              </Card>

              <Card className="bg-primary text-primary-foreground border-primary">
                <CardHeader>
                  <CardTitle>Primary Card</CardTitle>
                  <CardDescription className="text-primary-foreground/70">
                    Акцентная карточка на primary цвете
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-primary-foreground/90">
                  Используется для выделения ключевой информации
                </CardContent>
              </Card>

              <Card className="border-destructive/40">
                <CardHeader>
                  <CardTitle className="text-destructive">Критическая ошибка</CardTitle>
                  <CardDescription>Инцидент требует немедленного внимания</CardDescription>
                </CardHeader>
                <CardContent className="text-sm">
                  Пациент №4821 — критическое состояние
                </CardContent>
                <CardFooter className="gap-2">
                  <Button size="sm" variant="destructive">Реагировать</Button>
                  <Button size="sm" variant="ghost">Подробнее</Button>
                </CardFooter>
              </Card>
            </div>
          </Section>

          {/* ── Avatar ── */}
          <Section title="Avatar">
            <Row label="sizes">
              <Avatar className="h-6 w-6">
                <AvatarImage src="https://github.com/shadcn.png" />
                <AvatarFallback className="text-[8px]">АВ</AvatarFallback>
              </Avatar>
              <Avatar className="h-8 w-8">
                <AvatarImage src="https://github.com/shadcn.png" />
                <AvatarFallback className="text-xs">АВ</AvatarFallback>
              </Avatar>
              <Avatar>
                <AvatarImage src="https://github.com/shadcn.png" />
                <AvatarFallback>АВ</AvatarFallback>
              </Avatar>
              <Avatar className="h-14 w-14">
                <AvatarImage src="https://github.com/shadcn.png" />
                <AvatarFallback>АВ</AvatarFallback>
              </Avatar>
              <Avatar className="h-20 w-20">
                <AvatarImage src="https://github.com/shadcn.png" />
                <AvatarFallback className="text-xl">АВ</AvatarFallback>
              </Avatar>
            </Row>
            <Row label="fallback">
              <Avatar>
                <AvatarImage src="/broken-image.jpg" />
                <AvatarFallback>ДВ</AvatarFallback>
              </Avatar>
              <Avatar className="bg-primary">
                <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
                  АИ
                </AvatarFallback>
              </Avatar>
              <Avatar>
                <AvatarFallback>
                  <User className="h-5 w-5 text-muted-foreground" />
                </AvatarFallback>
              </Avatar>
            </Row>
            <Row label="avatar group">
              <div className="flex -space-x-3">
                {["ДВ", "АМ", "ОС", "ИК"].map((initials, i) => (
                  <Avatar
                    key={i}
                    className="border-2 border-background ring-0"
                    style={{ zIndex: 4 - i }}
                  >
                    <AvatarFallback className="text-xs font-medium bg-secondary text-secondary-foreground">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                ))}
                <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-background bg-muted text-xs font-medium text-muted-foreground" style={{ zIndex: 0 }}>
                  +12
                </div>
              </div>
            </Row>
          </Section>

          {/* ── Skeleton ── */}
          <Section title="Skeleton">
            <Row>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSkeletonVisible((v) => !v)}
              >
                {skeletonVisible ? "Показать контент" : "Показать skeleton"}
              </Button>
            </Row>
            {skeletonVisible ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-3/5" />
                <div className="grid grid-cols-3 gap-3">
                  <Skeleton className="h-24 rounded-xl" />
                  <Skeleton className="h-24 rounded-xl" />
                  <Skeleton className="h-24 rounded-xl" />
                </div>
              </div>
            ) : (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-4">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback className="bg-primary text-primary-foreground">АИ</AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle>AI MedIncident</CardTitle>
                      <CardDescription>Система мониторинга инцидентов</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                  <p>Контент загружен и отображается корректно.</p>
                  <p>Skeleton был заменён реальными данными.</p>
                  <div className="grid grid-cols-3 gap-3 pt-2">
                    {["Инциденты", "Пациенты", "Отчёты"].map((label) => (
                      <div key={label} className="bg-muted rounded-xl h-24 flex items-center justify-center text-sm font-medium">
                        {label}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </Section>

          {/* ── Separator ── */}
          <Section title="Separator">
            <div className="space-y-4">
              <p className="text-sm">Горизонтальный разделитель</p>
              <Separator />
              <p className="text-sm text-muted-foreground">После разделителя</p>
            </div>
            <div className="flex items-center gap-4 h-8 mt-4">
              <span className="text-sm">Слева</span>
              <Separator orientation="vertical" />
              <span className="text-sm text-muted-foreground">По центру</span>
              <Separator orientation="vertical" />
              <span className="text-sm">Справа</span>
            </div>
          </Section>

          {/* ── Dialog ── */}
          <Section title="Dialog">
            <Row>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline">Открыть диалог</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Подтверждение действия</DialogTitle>
                    <DialogDescription>
                      Это действие нельзя отменить. Вы уверены, что хотите продолжить?
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-2 space-y-2">
                    <Label htmlFor="dialog-input">Введите причину</Label>
                    <Input id="dialog-input" placeholder="Причина закрытия инцидента..." />
                  </div>
                  <DialogFooter>
                    <Button variant="ghost">Отмена</Button>
                    <Button
                      variant="default"
                      onClick={() => toast.success("Инцидент закрыт", { description: "Действие выполнено успешно" })}
                    >
                      Подтвердить
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="destructive">
                    <Trash2 /> Удалить запись
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="text-destructive">Удалить запись?</DialogTitle>
                    <DialogDescription>
                      Запись пациента №4821 будет безвозвратно удалена из системы.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="ghost">Отмена</Button>
                    <Button
                      variant="destructive"
                      onClick={() => toast.error("Запись удалена", { description: "Данные пациента №4821 удалены" })}
                    >
                      <Trash2 /> Удалить
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </Row>
          </Section>

          {/* ── Toast / Sonner ── */}
          <Section title="Toast (Sonner)">
            <Row>
              <Button variant="outline" onClick={() => toast("Обычное уведомление")}>
                Default
              </Button>
              <Button
                variant="outline"
                className="border-green-500/40 text-green-600"
                onClick={() => toast.success("Успешно!", { description: "Операция выполнена" })}
              >
                Success
              </Button>
              <Button
                variant="outline"
                className="border-destructive/40 text-destructive"
                onClick={() => toast.error("Ошибка!", { description: "Что-то пошло не так" })}
              >
                Error
              </Button>
              <Button
                variant="outline"
                className="border-warning/40 text-warning"
                onClick={() => toast.warning("Внимание!", { description: "Проверьте данные" })}
              >
                Warning
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  toast.promise(
                    new Promise((resolve) => setTimeout(resolve, 2000)),
                    {
                      loading: "Сохранение...",
                      success: "Данные сохранены",
                      error: "Ошибка сохранения",
                    }
                  )
                }
              >
                Promise
              </Button>
            </Row>
          </Section>

          {/* ── Gradients ── */}
          <Section title="Brand Gradients">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Button variant="telegram" size="lg" className="w-full h-14 text-base">
                <MessageSquare />
                Войти через Telegram
              </Button>
              <Button variant="max" size="lg" className="w-full h-14 text-base">
                <Send />
                Войти через Max
              </Button>
            </div>
          </Section>

        </div>
      </div>
    </>
  )
}
