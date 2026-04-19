/**
 * GET /metrics — Prometheus scrape-эндпоинт.
 *
 * Возвращает метрики в text-format (prom-client), который Prometheus умеет
 * читать без дополнительных экспортеров.
 */

import { registry } from "@/lib/metrics"

// Route handler должен обслуживаться динамически на каждом запросе,
// чтобы метрики всегда были свежие.
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  const body = await registry.metrics()
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": registry.contentType },
  })
}
