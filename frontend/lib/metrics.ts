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
  Registry,
  collectDefaultMetrics,
} from "prom-client"

type MetricsState = {
  registry: Registry
  appealsCreated: Counter<"is_important">
}

const GLOBAL_KEY = Symbol.for("ai-medincident.frontend.metrics")
type GlobalWithMetrics = typeof globalThis & { [GLOBAL_KEY]?: MetricsState }

function buildMetrics(): MetricsState {
  const registry = new Registry()
  registry.setDefaultLabels({ service: "frontend" })

  // Node-метрики по умолчанию: heap, eventloop lag, gc, handles.
  collectDefaultMetrics({ register: registry, prefix: "frontend_" })

  const appealsCreated = new Counter({
    name: "frontend_appeals_created_total",
    help: "Созданные обращения по флагу важности.",
    labelNames: ["is_important"] as const,
    registers: [registry],
  })

  return { registry, appealsCreated }
}

const g = globalThis as GlobalWithMetrics
if (!g[GLOBAL_KEY]) {
  g[GLOBAL_KEY] = buildMetrics()
}

const state = g[GLOBAL_KEY]

export const registry = state.registry
export const appealsCreated = state.appealsCreated
