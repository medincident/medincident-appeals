"use client"

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"

export type RecorderStatus = "idle" | "loading" | "recording" | "error"

export type VoiceRecorderError =
  | "unsupported"
  | "insecure_context"
  | "permission_denied"
  | "no_device"
  | "no_speech"
  | "aborted"
  | "unauthorized"
  | "network"
  | "unknown"

interface Options {
  onTranscript: (text: string) => void
  onError?: (code: VoiceRecorderError, message: string) => void
  lang?: string
}

interface Result {
  status: RecorderStatus
  // Сохранено в интерфейсе ради совместимости с потребителем: Whisper батчевый,
  // промежуточного текста по словам нет — всегда "".
  interimText: string
  error: VoiceRecorderError | null
  supported: boolean
  start: () => Promise<void>
  stop: () => void
}

const ERROR_MESSAGES: Record<VoiceRecorderError, string> = {
  unsupported:       "Браузер не поддерживает запись звука",
  insecure_context:  "Доступ к микрофону требует HTTPS",
  permission_denied: "Доступ к микрофону отклонён",
  no_device:         "Микрофон не найден",
  no_speech:         "Речь не распознана — попробуйте ещё раз",
  aborted:           "Запись отменена",
  unauthorized:      "Сессия истекла — войдите снова",
  network:           "Сервис распознавания недоступен",
  unknown:           "Не удалось распознать речь",
}

function isRecordingSupported(): boolean {
  if (typeof window === "undefined") return false
  return (
    typeof window.MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  )
}

// Бросаем код ошибки строкой — вызывающий маппит его в VoiceRecorderError,
// чтобы протухшая сессия (401) не выглядела как «сервис недоступен».
async function uploadForTranscription(blob: Blob): Promise<string> {
  const form = new FormData()
  form.append("audio", blob, "recording.webm")
  const res = await fetch("/api/stt", { method: "POST", body: form })
  if (res.status === 401) throw new Error("unauthorized")
  if (!res.ok) throw new Error("network")
  const { text } = (await res.json()) as { text: string }
  return text.trim()
}

export function useVoiceRecorder({ onTranscript, onError }: Options): Result {
  const [status, setStatus] = useState<RecorderStatus>("idle")
  const [error, setError] = useState<VoiceRecorderError | null>(null)
  const supported = useSyncExternalStore(
    () => () => {},
    () => isRecordingSupported(),
    () => false,
  )

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  // Останавливаемся по нажатию "Отменить" — тогда результат не транскрибируем.
  const cancelledRef = useRef(false)

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const fail = useCallback(
    (code: VoiceRecorderError, message: string) => {
      setError(code)
      setStatus("error")
      onError?.(code, message)
      setTimeout(() => setStatus("idle"), 1500)
    },
    [onError],
  )

  const start = useCallback(async () => {
    if (recorderRef.current) return

    if (typeof window !== "undefined" && window.isSecureContext === false) {
      fail("insecure_context", ERROR_MESSAGES.insecure_context)
      return
    }
    if (!isRecordingSupported()) {
      fail("unsupported", ERROR_MESSAGES.unsupported)
      return
    }

    setError(null)
    cancelledRef.current = false

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      const name = (err as DOMException)?.name
      if (name === "NotAllowedError" || name === "SecurityError") {
        fail("permission_denied", ERROR_MESSAGES.permission_denied)
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        fail("no_device", ERROR_MESSAGES.no_device)
      } else {
        fail("unknown", (err as Error)?.message || ERROR_MESSAGES.unknown)
      }
      return
    }

    streamRef.current = stream
    chunksRef.current = []

    const recorder = new MediaRecorder(stream)
    recorderRef.current = recorder

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = async () => {
      stopTracks()
      recorderRef.current = null
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" })
      chunksRef.current = []

      if (cancelledRef.current || blob.size === 0) {
        setStatus((prev) => (prev === "error" ? prev : "idle"))
        return
      }

      setStatus("loading")
      try {
        const text = await uploadForTranscription(blob)
        if (text) onTranscript(text)
        else fail("no_speech", ERROR_MESSAGES.no_speech)
        setStatus((prev) => (prev === "error" ? prev : "idle"))
      } catch (err) {
        const code: VoiceRecorderError = (err as Error)?.message === "unauthorized" ? "unauthorized" : "network"
        fail(code, ERROR_MESSAGES[code])
      }
    }

    try {
      recorder.start()
      setStatus("recording")
    } catch (err) {
      stopTracks()
      recorderRef.current = null
      fail("unknown", (err as Error)?.message || ERROR_MESSAGES.unknown)
    }
  }, [fail, onTranscript, stopTracks])

  const stop = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder) {
      setStatus((prev) => (prev === "error" ? prev : "idle"))
      return
    }
    // onstop сам разрулит загрузку/очистку — здесь только инициируем остановку.
    if (recorder.state !== "inactive") recorder.stop()
  }, [])

  useEffect(
    () => () => {
      const recorder = recorderRef.current
      if (recorder && recorder.state !== "inactive") recorder.stop()
      streamRef.current?.getTracks().forEach((t) => t.stop())
    },
    [],
  )

  return { status, interimText: "", error, supported, start, stop }
}
