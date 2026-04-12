import { NextRequest } from "next/server"

// In-memory store for demo purposes
const appeals: Appeal[] = [
  {
    id: "a-001",
    text: "Уже три дня болит живот, особенно после еды. Сначала думала пройдёт, но становится хуже.",
    formalizedText:
      "Пациент предъявляет жалобы на абдоминальный болевой синдром продолжительностью 72 часа, усиливающийся в постпрандиальный период. Отмечается отрицательная динамика состояния.",
    theses: ["Боли в животе 3 дня", "Усиление после приёма пищи", "Прогрессирующий характер"],
    summary: "Боли в животе после еды, 3 дня",
    category: { id: "cat_2", name: "Жалобы на здоровье" },
    subcategory: { id: "sub_4", name: "Болевой синдром (ЖКТ)" },
    isImportant: true,
    status: "resolved",
    hasChat: true,
    messageCount: 6,
    createdAt: "2026-03-28T09:15:00Z",
  },
  {
    id: "a-002",
    text: "Не понимаю, можно ли принимать аспирин вместе с теми таблетками, что мне назначили. На упаковке написано что-то про сердце.",
    formalizedText:
      "Пациент запрашивает консультацию по совместимости ацетилсалициловой кислоты с назначенными препаратами. Указана возможная кардиологическая составляющая схемы лечения.",
    theses: [
      "Вопрос о совместимости аспирина с назначенными препаратами",
      "Кардиологическое показание в схеме лечения",
    ],
    summary: "Вопрос по совместимости лекарств",
    category: { id: "cat_3", name: "Медикаментозное лечение" },
    subcategory: { id: "sub_7", name: "Взаимодействие препаратов" },
    isImportant: true,
    status: "processed",
    hasChat: true,
    messageCount: 4,
    createdAt: "2026-03-29T14:40:00Z",
  },
  {
    id: "a-003",
    text: "С утра поднялась температура 38.5, болит горло и немного голова. Пью воду, но не помогает.",
    formalizedText:
      "Пациент отмечает гипертермию до 38.5°C, фарингеальный болевой синдром, цефалгию. Дебют симптоматики — утреннее время. Гидратационная терапия без эффекта.",
    theses: [
      "Температура 38.5°C",
      "Боль в горле",
      "Головная боль",
      "Без эффекта от обильного питья",
    ],
    summary: "Температура 38.5°C, боль в горле",
    category: { id: "cat_1", name: "Острое состояние" },
    subcategory: { id: "sub_1", name: "ОРВИ / гипертермический синдром" },
    isImportant: true,
    status: "processing",
    hasChat: true,
    messageCount: 2,
    createdAt: "2026-03-31T07:10:00Z",
  },
]

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

export async function GET() {
  return Response.json([...appeals].reverse())
}

export async function POST(request: NextRequest) {
  const { text } = await request.json()

  const newAppeal: Appeal = {
    id: `a-${Date.now()}`,
    text,
    formalizedText: "Обращение принято в обработку. Формализованный текст будет сформирован системой в ближайшее время.",
    theses: ["Обращение принято", "Ожидает анализа"],
    summary: text.length > 50 ? text.slice(0, 47) + "..." : text,
    category: { id: "cat_0", name: "Классификация..." },
    subcategory: { id: "sub_0", name: "Определяется" },
    isImportant: true,
    status: "processing",
    hasChat: true,
    messageCount: 1,
    createdAt: new Date().toISOString(),
  }

  appeals.unshift(newAppeal)
  return Response.json(newAppeal, { status: 201 })
}
