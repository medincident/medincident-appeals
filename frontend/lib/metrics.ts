/**
 * Prometheus-метрики frontend'а. Экспортируются на GET /metrics.
 *
 * Registry + определения метрик лежат в module-scope, чтобы аккумуляция
 * сохранялась между server-action/route вызовами (один Node-процесс).
 *
 * В dev-режиме Next.js с HMR переисполняет модули — защищаемся через
 * globalThis-кэш, чтобы не регистрировать метрики дважды.
 */

import {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from "prom-client"

type MetricsState = {
  registry: Registry
  nlpAnalyzeDuration: Histogram<"outcome">
  nlpAnalyzeTotal: Counter<"outcome">
  appealsCreated: Counter<"is_important">
}

const GLOBAL_KEY = Symbol.for("ai-medincident.frontend.metrics")
type GlobalWithMetrics = typeof globalThis & { [GLOBAL_KEY]?: MetricsState }

function buildMetrics(): MetricsState {
  const registry = new Registry()
  registry.setDefaultLabels({ service: "frontend" })

  // Node-метрики по умолчанию: heap, eventloop lag, gc, handles.
  collectDefaultMetrics({ register: registry, prefix: "frontend_" })

  const nlpAnalyzeDuration = new Histogram({
    name: "frontend_nlp_analyze_duration_seconds",
    help: "Время вызова NLP /analyze (полный round-trip фронтенд→nlp).",
    labelNames: ["outcome"] as const,
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
  })

  const nlpAnalyzeTotal = new Counter({
    name: "frontend_nlp_analyze_total",
    help: "Количество вызовов NLP /analyze по исходу.",
    labelNames: ["outcome"] as const,
    registers: [registry],
  })

  const appealsCreated = new Counter({
    name: "frontend_appeals_created_total",
    help: "Созданные обращения по флагу важности.",
    labelNames: ["is_important"] as const,
    registers: [registry],
  })

  return { registry, nlpAnalyzeDuration, nlpAnalyzeTotal, appealsCreated }
}

const g = globalThis as GlobalWithMetrics
if (!g[GLOBAL_KEY]) {
  g[GLOBAL_KEY] = buildMetrics()
}

const state = g[GLOBAL_KEY]

export const registry = state.registry
export const nlpAnalyzeDuration = state.nlpAnalyzeDuration
export const nlpAnalyzeTotal = state.nlpAnalyzeTotal
export const appealsCreated = state.appealsCreated

/**
 * Детализация outcome NLP-вызова для labels.
 * - `success` — NLP вернул 200 + валидный JSON
 * - `http_error` — NLP вернул не-2xx
 * - `timeout` — AbortSignal.timeout сработал
 * - `network_error` — fetch бросил (DNS, соединение, ...)
 */
export type NlpOutcome = "success" | "http_error" | "timeout" | "network_error"
