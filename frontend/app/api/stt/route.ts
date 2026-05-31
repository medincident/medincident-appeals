/**
 * POST /api/stt — прокси к self-hosted stt-service (faster-whisper).
 *
 * Принимает аудио из MediaRecorder, форвардит в stt-service на внутренней сети
 * и возвращает { text }. Сделано route-хендлером, а не server action: у server
 * actions дефолтный лимит тела 1MB, а аудио диктовки легко его превышает.
 */

import { isAuthError } from "@/services/auth/errors"
import { requireSession } from "@/services/auth/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const STT_SERVICE_URL = process.env.STT_SERVICE_URL ?? "http://stt-service:8000"

export async function POST(request: Request) {
  try {
    await requireSession()
  } catch (err) {
    if (isAuthError(err)) {
      return Response.json({ error: "unauthorized" }, { status: 401 })
    }
    throw err
  }

  const form = await request.formData()
  const audio = form.get("audio")
  if (!(audio instanceof Blob) || audio.size === 0) {
    return Response.json({ error: "empty audio" }, { status: 422 })
  }

  const upstream = new FormData()
  upstream.append("audio", audio, "recording.webm")

  let res: Response
  try {
    res = await fetch(`${STT_SERVICE_URL}/transcribe`, {
      method: "POST",
      body: upstream,
      // Распознавание на CPU может занять секунды — даём запас, но не висим вечно.
      signal: AbortSignal.timeout(60_000),
      cache: "no-store",
    })
  } catch {
    return Response.json({ error: "stt unavailable" }, { status: 502 })
  }

  if (!res.ok) {
    return Response.json({ error: "transcription failed" }, { status: 502 })
  }

  const { text } = (await res.json()) as { text: string }
  return Response.json({ text })
}
