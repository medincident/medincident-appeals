import { NextRequest } from "next/server"

interface Message {
  id: string
  role: "patient" | "assistant"
  content: string
  createdAt: string
}

// Seeded message history per appeal
const messageStore: Record<string, Message[]> = {
  "a-001": [
    {
      id: "m-001",
      role: "patient",
      content: "Уже три дня болит живот, особенно после еды. Сначала думала пройдёт, но становится хуже.",
      createdAt: "2026-03-28T09:15:00Z",
    },
    {
      id: "m-002",
      role: "assistant",
      content:
        "Принял обращение. Опишите характер боли подробнее: это острая, тянущая или спазматическая боль? Есть ли тошнота, вздутие или изменение стула?",
      createdAt: "2026-03-28T09:15:45Z",
    },
    {
      id: "m-003",
      role: "patient",
      content: "Больше тянущая. Иногда как спазмы. Тошноты нет, но живот вздутый вечером.",
      createdAt: "2026-03-28T09:18:00Z",
    },
    {
      id: "m-004",
      role: "assistant",
      content:
        "Понял. Симптомы указывают на возможный гастрит или дисфункцию ЖКТ. Передаю информацию гастроэнтерологу для первичной консультации. Воздержитесь от острой и жирной пищи. Ожидайте звонка врача в течение двух часов.",
      createdAt: "2026-03-28T09:19:10Z",
    },
    {
      id: "m-005",
      role: "patient",
      content: "Хорошо, спасибо. А пока можно принять что-то от боли?",
      createdAt: "2026-03-28T09:22:00Z",
    },
    {
      id: "m-006",
      role: "assistant",
      content:
        "Из разрешённых — но-шпа (дротаверин) при спазмах. Избегайте аспирина и ибупрофена до консультации врача, так как они могут раздражать слизистую желудка. Обращение переведено в статус «Решено» — врач свяжется с вами.",
      createdAt: "2026-03-28T09:22:50Z",
    },
  ],
  "a-002": [
    {
      id: "m-101",
      role: "patient",
      content:
        "Не понимаю, можно ли принимать аспирин вместе с теми таблетками, что мне назначили. На упаковке написано что-то про сердце.",
      createdAt: "2026-03-29T14:40:00Z",
    },
    {
      id: "m-102",
      role: "assistant",
      content:
        "Уточните, пожалуйста, название назначенного препарата или его действующее вещество — оно написано мелким шрифтом рядом с торговым названием.",
      createdAt: "2026-03-29T14:40:50Z",
    },
    {
      id: "m-103",
      role: "patient",
      content: "Написано «Варфарин», 2.5мг.",
      createdAt: "2026-03-29T14:43:00Z",
    },
    {
      id: "m-104",
      role: "assistant",
      content:
        "Важно: Варфарин и аспирин имеют значимое лекарственное взаимодействие. Одновременный приём существенно повышает риск кровотечения. Не принимайте аспирин без явного назначения врача. Ваш лечащий врач уведомлён — ожидайте его ответа. Обращение обработано.",
      createdAt: "2026-03-29T14:44:15Z",
    },
  ],
  "a-003": [
    {
      id: "m-201",
      role: "patient",
      content:
        "С утра поднялась температура 38.5, болит горло и немного голова. Пью воду, но не помогает.",
      createdAt: "2026-03-31T07:10:00Z",
    },
    {
      id: "m-202",
      role: "assistant",
      content:
        "Принял обращение. Уточните: насморк или заложенность носа есть? Был ли контакт с заболевшими в последние дни? Ваш случай помечен как приоритетный, врач ознакомится в ближайшее время.",
      createdAt: "2026-03-31T07:11:00Z",
    },
  ],
}

function generateAIResponse(content: string): string {
  const lower = content.toLowerCase()
  if (lower.includes("температур") || lower.includes("жар") || lower.includes("лихорад")) {
    return "Повышенная температура зафиксирована. Рекомендую принять парацетамол (500мг) и обеспечить обильное питьё. Если температура поднимется выше 39°C или появится затруднение дыхания — немедленно сообщите персоналу отделения."
  }
  if (lower.includes("бол")) {
    return "Принял информацию о болях. Опишите подробнее: локализацию, характер (острая/тупая/спазматическая) и продолжительность. Это поможет врачу точнее оценить ситуацию."
  }
  if (lower.includes("лекарств") || lower.includes("таблет") || lower.includes("препарат")) {
    return "По вопросам медикаментозного лечения необходима консультация врача. Не корректируйте дозировку самостоятельно. Информация передана лечащему врачу — ожидайте ответа."
  }
  if (lower.includes("насморк") || lower.includes("нос") || lower.includes("заложен")) {
    return "Назальные симптомы зафиксированы. В сочетании с температурой и болью в горле картина соответствует ОРВИ. Врач рассматривает ваш случай. Пока — обильное питьё, проветривание палаты, покой."
  }
  if (lower.includes("контакт") || lower.includes("заболев")) {
    return "Информация об эпидемиологическом анамнезе принята. Это важно для оценки характера заболевания. Передаю дежурному врачу для принятия решения о необходимых мерах."
  }
  return "Обращение зарегистрировано. Специалист рассмотрит его и свяжется с вами. При резком ухудшении состояния — нажмите кнопку вызова медсестры или сообщите персоналу отделения."
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const messages = messageStore[id] ?? []
  return Response.json(messages)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { content } = await request.json()

  if (!messageStore[id]) {
    messageStore[id] = []
  }

  const patientMessage: Message = {
    id: `m-${Date.now()}`,
    role: "patient",
    content,
    createdAt: new Date().toISOString(),
  }

  const assistantMessage: Message = {
    id: `m-${Date.now() + 1}`,
    role: "assistant",
    content: generateAIResponse(content),
    createdAt: new Date(Date.now() + 2000).toISOString(),
  }

  messageStore[id].push(patientMessage, assistantMessage)

  return Response.json({ patientMessage, assistantMessage })
}
