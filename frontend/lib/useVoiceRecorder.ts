"use client"

/**
 * useVoiceRecorder — хук для push-to-talk записи с микрофона и транскрибации
 * через /api/transcribe (backend whisper.cpp).
 *
 * Использование:
 *   const { status, elapsedMs, error, start, stop } = useVoiceRecorder({
 *     maxDurationMs: 60_000,
 *     onTranscript: (text) => setInput((prev) => (prev ? `${prev} ${text}` : text)),
 *   })
 */

import { useCallback, useEffect, useRef, useState } from "react"

export type RecorderStatus = "idle" | "recording" | "transcribing" | "error"

export type VoiceRecorderError =
  | "unsupported"
  | "permission_denied"
  | "no_device"
  | "too_short"
  | "transcribe_failed"
  | "unknown"

interface Options {
  /** Максимальная длительность записи в мс. По достижении — автоматический stop. */
  maxDurationMs?: number
  /** Колбэк с распознанным текстом после успешной транскрибации. */
  onTranscript: (text: string) => void
  /** Колбэк на ошибку (удобно для toast). */
  onError?: (code: VoiceRecorderError, message: string) => void
}

interface Result {
  status: RecorderStatus
  elapsedMs: number
  error: VoiceRecorderError | null
  supported: boolean
  start: () => Promise<void>
  stop: () => void
}

function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ]
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return null
}

function isSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined" &&
    pickMimeType() !== null
  )
}

export function useVoiceRecorder({
  maxDurationMs = 60_000,
  onTranscript,
  onError,
}: Options): Result {
  const [status, setStatus] = useState<RecorderStatus>("idle")
  const [elapsedMs, setElapsedMs] = useState(0)
  const [error, setError] = useState<VoiceRecorderError | null>(null)
  const [supported, setSupported] = useState(false)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const startedAtRef = useRef<number>(0)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mimeRef = useRef<string>("")

  useEffect(() => {
    setSupported(isSupported())
  }, [])

  const cleanup = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current)
      tickRef.current = null
    }
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current)
      autoStopRef.current = null
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    recorderRef.current = null
    chunksRef.current = []
  }, [])

  useEffect(() => cleanup, [cleanup])

  const fail = useCallback(
    (code: VoiceRecorderError, message: string) => {
      setError(code)
      setStatus("error")
      onError?.(code, message)
      cleanup()
      setTimeout(() => setStatus("idle"), 1500)
    },
    [cleanup, onError],
  )

  const start = useCallback(async () => {
    if (status !== "idle" && status !== "error") return
    setError(null)

    if (!isSupported()) {
      fail("unsupported", "Браузер не поддерживает запись с микрофона")
      return
    }

    const mime = pickMimeType()!
    mimeRef.current = mime

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      const name = (err as DOMException)?.name
      if (name === "NotAllowedError" || name === "SecurityError") {
        fail("permission_denied", "Доступ к микрофону отклонён")
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        fail("no_device", "Микрофон не найден")
      } else {
        fail("unknown", "Не удалось получить доступ к микрофону")
      }
      return
    }

    streamRef.current = stream
    const rec = new MediaRecorder(stream, { mimeType: mime })
    recorderRef.current = rec
    chunksRef.current = []

    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
    }

    rec.onstop = async () => {
      const tracks = streamRef.current?.getTracks()
      tracks?.forEach((t) => t.stop())
      streamRef.current = null

      if (tickRef.current) {
        clearInterval(tickRef.current)
        tickRef.current = null
      }
      if (autoStopRef.current) {
        clearTimeout(autoStopRef.current)
        autoStopRef.current = null
      }

      const blob = new Blob(chunksRef.current, { type: mimeRef.current })
      chunksRef.current = []

      if (blob.size < 1024) {
        fail("too_short", "Слишком короткая запись")
        return
      }

      setStatus("transcribing")
      try {
        const form = new FormData()
        const ext = mimeRef.current.includes("mp4") ? "mp4" : "webm"
        form.append("audio", blob, `voice.${ext}`)
        const res = await fetch("/api/transcribe", {
          method: "POST",
          body: form,
          signal: AbortSignal.timeout(45_000),
        })
        if (!res.ok) {
          fail("transcribe_failed", "Распознавание не удалось")
          return
        }
        const data = (await res.json()) as { text?: string }
        const text = (data.text ?? "").trim()
        if (text) onTranscript(text)
        setStatus("idle")
        setElapsedMs(0)
      } catch {
        fail("transcribe_failed", "Распознавание не удалось")
      }
    }

    startedAtRef.current = Date.now()
    setStatus("recording")
    setElapsedMs(0)
    rec.start(250)

    tickRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current)
    }, 250)

    autoStopRef.current = setTimeout(() => {
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop()
      }
    }, maxDurationMs)
  }, [fail, maxDurationMs, onTranscript, status])

  const stop = useCallback(() => {
    const rec = recorderRef.current
    if (rec && rec.state === "recording") rec.stop()
  }, [])

  return { status, elapsedMs, error, supported, start, stop }
}
