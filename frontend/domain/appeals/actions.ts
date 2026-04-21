"use server"

import { revalidatePath } from "next/cache"

import {
  appealsCreated,
  nlpAnalyzeDuration,
  nlpAnalyzeTotal,
  type NlpOutcome,
} from "@/lib/metrics"

import type { Appeal, NlpAnalyzeResult } from "./types"

const NLP_SERVICE_URL = process.env.NLP_SERVICE_URL ?? "http://nlp-service:8000"

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

// ── NLP integration ────────────────────────────────────────────────────────

async function analyzeWithNlp(text: string): Promise<NlpAnalyzeResult | null> {
  let outcome: NlpOutcome = "success"
  const endTimer = nlpAnalyzeDuration.startTimer()
  try {
    const res = await fetch(`${NLP_SERVICE_URL}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      outcome = "http_error"
      return null
    }
    return (await res.json()) as NlpAnalyzeResult
  } catch (err) {
    outcome = err instanceof DOMException && err.name === "TimeoutError" ? "timeout" : "network_error"
    console.error("[appeals.actions] NLP analyze failed:", err)
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

  const nlp = await analyzeWithNlp(trimmed)

  const appeal: Appeal = {
    id: `a-${Date.now()}`,
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
