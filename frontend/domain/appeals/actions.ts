"use server"

import { randomUUID } from "node:crypto"

import { revalidatePath } from "next/cache"

import {
  appealsCreated,
  nlpAnalyzeDuration,
  nlpAnalyzeTotal,
  type NlpOutcome,
} from "@/lib/metrics"
import {
  APPEALS_RESULT_SUBJECT_PREFIX,
  APPEALS_SUBMIT_SUBJECT,
  getNats,
  jsonCodec,
} from "@/lib/nats"

import type { Appeal, NlpAnalyzeResult } from "./types"

// Сколько ждём ответа от бэкенда AI. p95 NLP ≈ 4.3s, берём с запасом.
const APPEAL_REPLY_TIMEOUT_MS = 20_000

// ── In-memory mock store (seeded once) ─────────────────────────────────────

const MOCK_APPEALS: Appeal[] = [
  {
    id: "a-001",
    text: "Уже три дня болит живот, особенно после еды. Сначала думала пройдёт, но становится хуже.",
    summary: "Боли в животе после еды, 3 дня",
    formalizedText:
      "Пациент предъявляет жалобы на абдоминальный болевой синдром продолжительностью 72 часа, усиливающийся в постпрандиальный период. Отмечается отрицательная динамика состояния.",
    theses: ["Боли в животе 3 дня", "Усиление после приёма пищи", "Прогрессирующий характер"],
    category:    { id: "cat_2", name: "Жалобы на здоровье" },
    subcategory: { id: "sub_4", name: "Болевой синдром (ЖКТ)" },
    isImportant: true,
    importantConfidence: 0.94,
    status: "resolved",
    createdAt: "2026-03-28T09:15:00Z",
  },
  {
    id: "a-002",
    text: "Не понимаю, можно ли принимать аспирин вместе с теми таблетками, что мне назначили. На упаковке написано что-то про сердце.",
    summary: "Вопрос по совместимости лекарств",
    formalizedText:
      "Пациент запрашивает консультацию по совместимости ацетилсалициловой кислоты с назначенными препаратами. Указана возможная кардиологическая составляющая схемы лечения.",
    theses: [
      "Вопрос о совместимости аспирина с назначенными препаратами",
      "Кардиологическое показание в схеме лечения",
    ],
    category:    { id: "cat_3", name: "Медикаментозное лечение" },
    subcategory: { id: "sub_7", name: "Взаимодействие препаратов" },
    isImportant: true,
    importantConfidence: 0.87,
    status: "processed",
    createdAt: "2026-03-29T14:40:00Z",
  },
  {
    id: "a-003",
    text: "С утра поднялась температура 38.5, болит горло и немного голова. Пью воду, но не помогает.",
    summary: "Температура 38.5°C, боль в горле",
    formalizedText:
      "Пациент отмечает гипертермию до 38.5°C, фарингеальный болевой синдром, цефалгию. Дебют симптоматики — утреннее время. Гидратационная терапия без эффекта.",
    theses: [
      "Температура 38.5°C",
      "Боль в горле",
      "Головная боль",
      "Без эффекта от обильного питья",
    ],
    category:    { id: "cat_1", name: "Острое состояние" },
    subcategory: { id: "sub_1", name: "ОРВИ / гипертермический синдром" },
    isImportant: true,
    importantConfidence: 0.98,
    status: "processing",
    createdAt: "2026-03-31T07:10:00Z",
  },
]

// Module-level store survives between server-action invocations within one
// Next.js server process. Good enough for a demo/mock.
const runtime: Appeal[] = [...MOCK_APPEALS]

// ── Payload shape for NATS messages (совпадает с backend/main.go) ──────────

interface AppealSubmitPayload {
  id: string
  text: string
  created_at: string
  user_id?: string
}

interface AppealResultPayload {
  id: string
  is_important?: boolean
  important_confidence?: number
  reason?: string
  formalized_text?: string
  theses?: string[]
  category?: { id: string; name: string } | null
  subcategory?: { id: string; name: string } | null
  error?: string
}

// ── NATS integration ───────────────────────────────────────────────────────

/**
 * Отправляет текст в backend ИИ через NATS JetStream и ждёт результат.
 *
 * Гарантии:
 *   - js.publish возвращает ack только после записи на диск → submit не
 *     пропадёт при рестарте NATS/бэкенда;
 *   - durable consumer в бэкенде переживает рестарт — необработанные
 *     сообщения доставятся снова;
 *   - результат публикуется с MsgId (дедупликация при повторных доставках).
 *
 * Таймаут здесь только на ожидание ответа фронтендом. Если он истёк — submit
 * всё равно в JetStream, и бэкенд его обработает, просто этот запрос не увидит
 * результат (у него будет status: "processing").
 */
async function analyzeViaNats(
  id: string,
  text: string,
): Promise<NlpAnalyzeResult | null> {
  let outcome: NlpOutcome = "success"
  const endTimer = nlpAnalyzeDuration.startTimer()
  try {
    const { nc, js } = await getNats()

    // Подписываемся ДО публикации, иначе можем пропустить быстрый ответ.
    // max: 1 — автоматически закрываем после первого сообщения.
    const sub = nc.subscribe(`${APPEALS_RESULT_SUBJECT_PREFIX}${id}`, { max: 1 })
    // flush гарантирует, что сервер увидел нашу SUB до PUB.
    await nc.flush()

    try {
      const payload: AppealSubmitPayload = {
        id,
        text,
        created_at: new Date().toISOString(),
      }
      // JetStream publish с MsgId — защищает от дублей submit при retry сети.
      await js.publish(APPEALS_SUBMIT_SUBJECT, jsonCodec.encode(payload), {
        msgID: `submit-${id}`,
        timeout: 5_000,
      })

      const msg = await Promise.race([
        (async () => {
          for await (const m of sub) return m
          throw new Error("subscription closed before reply")
        })(),
        new Promise<never>((_, rej) =>
          setTimeout(
            () => rej(new Error("timeout waiting for appeal result")),
            APPEAL_REPLY_TIMEOUT_MS,
          ),
        ),
      ])

      const data = jsonCodec.decode(msg.data) as AppealResultPayload
      if (data.error) {
        outcome = "http_error"
        console.error("[appeals.actions] NLP returned error:", data.error)
        return null
      }
      return {
        is_important: data.is_important ?? true,
        important_confidence: data.important_confidence,
        reason: data.reason,
        formalized_text: data.formalized_text,
        theses: data.theses,
        category: data.category ?? null,
        subcategory: data.subcategory ?? null,
      }
    } finally {
      sub.unsubscribe()
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    outcome = msg.includes("timeout") ? "timeout" : "network_error"
    console.error("[appeals.actions] NATS analyze failed:", err)
    return null
  } finally {
    endTimer({ outcome })
    nlpAnalyzeTotal.inc({ outcome })
  }
}

function makeSummary(text: string, max = 50): string {
  const trimmed = text.trim().replace(/\s+/g, " ")
  return trimmed.length > max ? trimmed.slice(0, max - 1) + "…" : trimmed
}

// ── Public server actions ──────────────────────────────────────────────────

export async function getAppealsAction(): Promise<Appeal[]> {
  // Newest first
  return [...runtime].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function createAppealAction(text: string): Promise<Appeal> {
  const trimmed = text.trim()
  if (!trimmed) throw new Error("Текст обращения не может быть пустым")

  const id = `a-${randomUUID()}`
  const nlp = await analyzeViaNats(id, trimmed)

  const appeal: Appeal = {
    id,
    text: trimmed,
    summary: makeSummary(trimmed),
    formalizedText: nlp?.formalized_text?.trim() || trimmed,
    theses: nlp?.theses ?? [],
    category:    nlp?.category    ?? null,
    subcategory: nlp?.subcategory ?? null,
    isImportant: nlp?.is_important ?? true,
    importantConfidence: nlp?.important_confidence,
    status: nlp ? "processed" : "processing",
    createdAt: new Date().toISOString(),
  }

  runtime.unshift(appeal)
  appealsCreated.inc({ is_important: String(appeal.isImportant) })
  revalidatePath("/appeals")
  return appeal
}
