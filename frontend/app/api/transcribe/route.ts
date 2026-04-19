/**
 * POST /api/transcribe — проксирует аудио в backend/transcribe (whisper.cpp).
 *
 * Клиент присылает multipart/form-data с полем `audio`. Ответ: `{ text }` или
 * `{ error }` с соответствующим HTTP-статусом.
 */

import {
  sttRequestDuration,
  sttRequestTotal,
  type SttOutcome,
} from "@/lib/metrics"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const STT_SERVICE_URL = process.env.STT_SERVICE_URL ?? "http://stt-service:8001"
const STT_TIMEOUT_MS = 45_000

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null)
  const audio = form?.get("audio")

  if (!(audio instanceof Blob) || audio.size === 0) {
    return Response.json(
      { error: "Ожидается поле audio в multipart/form-data" },
      { status: 400 },
    )
  }

  const upstream = new FormData()
  upstream.append("audio", audio, "audio.webm")

  let outcome: SttOutcome = "success"
  const endTimer = sttRequestDuration.startTimer()
  try {
    const res = await fetch(`${STT_SERVICE_URL}/transcribe`, {
      method: "POST",
      body: upstream,
      signal: AbortSignal.timeout(STT_TIMEOUT_MS),
    })

    if (!res.ok) {
      outcome = "http_error"
      const text = await res.text().catch(() => "")
      return Response.json(
        { error: text || "Бэкенд вернул ошибку" },
        { status: res.status },
      )
    }

    const data = (await res.json()) as { text?: string }
    return Response.json({ text: (data.text ?? "").trim() })
  } catch (err) {
    outcome =
      err instanceof DOMException && err.name === "TimeoutError"
        ? "timeout"
        : "network_error"
    console.error("[api/transcribe] failed:", err)
    return Response.json(
      { error: "Не удалось распознать аудио" },
      { status: 502 },
    )
  } finally {
    endTimer({ outcome })
    sttRequestTotal.inc({ outcome })
  }
}
