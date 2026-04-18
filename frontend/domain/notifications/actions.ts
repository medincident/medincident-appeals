"use server"

import type { NotificationItem } from "./types"

const MOCK_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "n-001",
    type: "processed",
    title: "Обращение обработано",
    description:
      "Жалоба от 28 марта рассмотрена. Назначена консультация гастроэнтеролога.",
    read: false,
    createdAt: "2026-03-31T10:00:00Z",
    appealId: "a-001",
  },
  {
    id: "n-002",
    type: "response",
    title: "Ответ от врача",
    description:
      "Лечащий врач прокомментировал ваше обращение по поводу приёма лекарств.",
    read: false,
    createdAt: "2026-03-31T08:30:00Z",
    appealId: "a-002",
  },
  {
    id: "n-003",
    type: "status_change",
    title: "Статус изменён",
    description:
      "Обращение «Температура 38.5°C» переведено в статус «В обработке».",
    read: false,
    createdAt: "2026-03-31T07:14:00Z",
    appealId: "a-003",
  },
  {
    id: "n-004",
    type: "info",
    title: "Плановый обход",
    description: "Дежурный врач проведёт обход в 15:00 сегодня.",
    read: true,
    createdAt: "2026-03-30T18:00:00Z",
    appealId: null,
  },
]

const runtime: NotificationItem[] = [...MOCK_NOTIFICATIONS]

export async function getNotificationsAction(): Promise<NotificationItem[]> {
  return [...runtime].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function markAllReadAction(): Promise<NotificationItem[]> {
  for (const n of runtime) n.read = true
  return [...runtime].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
