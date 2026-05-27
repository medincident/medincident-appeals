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
  | "network"
  | "unknown"

type SpeechRecognitionAlternative = { transcript: string }
type SpeechRecognitionResult = {
  isFinal: boolean
  0: SpeechRecognitionAlternative
}
type SpeechRecognitionEventLike = {
  resultIndex: number
  results: ArrayLike<SpeechRecognitionResult>
}
type SpeechRecognitionErrorEventLike = { error: string; message?: string }

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  start(): void
  stop(): void
  abort(): void
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

interface Options {
  onTranscript: (text: string) => void
  onError?: (code: VoiceRecorderError, message: string) => void
  lang?: string
}

interface Result {
  status: RecorderStatus
  interimText: string
  error: VoiceRecorderError | null
  supported: boolean
  start: () => Promise<void>
  stop: () => void
}

const ERROR_MESSAGES: Record<VoiceRecorderError, string> = {
  unsupported:       "Браузер не поддерживает распознавание речи",
  insecure_context:  "Доступ к микрофону требует HTTPS",
  permission_denied: "Доступ к микрофону отклонён",
  no_device:         "Микрофон не найден",
  no_speech:         "Речь не распознана — попробуйте ещё раз",
  aborted:           "Запись отменена",
  network:           "Сервис распознавания недоступен",
  unknown:           "Не удалось распознать речь",
}

const ERROR_CODE_MAP: Record<string, VoiceRecorderError> = {
  "not-allowed":         "permission_denied",
  "service-not-allowed": "permission_denied",
  "audio-capture":       "no_device",
  "no-speech":           "no_speech",
  aborted:               "aborted",
  network:               "network",
}

// В Edge/Opera GX webkitSpeechRecognition есть, но без доступа к Google
// cloud SR.start() возвращается без throw, а onstart никогда не приходит —
// кнопка зависает в loading. Таймаут выводит из этого состояния.
const START_TIMEOUT_MS = 5_000

export function useVoiceRecorder({
  onTranscript,
  onError,
  lang = "ru-RU",
}: Options): Result {
  const [status, setStatus] = useState<RecorderStatus>("idle")
  const [interimText, setInterimText] = useState("")
  const [error, setError] = useState<VoiceRecorderError | null>(null)
  const supported = useSyncExternalStore(
    () => () => {},
    () => getSpeechRecognitionCtor() !== null,
    () => false,
  )

  const recogRef = useRef<SpeechRecognitionLike | null>(null)
  const startTimerRef = useRef<number | null>(null)

  const clearStartTimer = useCallback(() => {
    if (startTimerRef.current !== null) {
      window.clearTimeout(startTimerRef.current)
      startTimerRef.current = null
    }
  }, [])

  const fail = useCallback(
    (code: VoiceRecorderError, message: string) => {
      clearStartTimer()
      setError(code)
      setStatus("error")
      onError?.(code, message)
      setTimeout(() => setStatus("idle"), 1500)
    },
    [onError, clearStartTimer],
  )

  const start = useCallback(async () => {
    if (recogRef.current) return

    if (typeof window !== "undefined" && window.isSecureContext === false) {
      fail("insecure_context", ERROR_MESSAGES.insecure_context)
      return
    }

    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) {
      fail("unsupported", ERROR_MESSAGES.unsupported)
      return
    }

    setError(null)
    setInterimText("")
    setStatus("loading")

    // getUserMedia должен быть вызван синхронно в обработчике клика, до любых
    // await — иначе iOS Safari и часть Android Chrome теряют связку с
    // user-gesture и молча отклоняют доступ без prompt'а.
    let gumPromise: Promise<MediaStream> | null = null
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        gumPromise = navigator.mediaDevices.getUserMedia({ audio: true })
      } catch {
        fail("permission_denied", ERROR_MESSAGES.permission_denied)
        return
      }
    }

    if (gumPromise) {
      try {
        const stream = await gumPromise
        stream.getTracks().forEach((t) => t.stop())
      } catch (err) {
        const name = (err as DOMException)?.name
        const message = (err as DOMException)?.message
        if (name === "NotAllowedError" || name === "SecurityError") {
          fail("permission_denied", ERROR_MESSAGES.permission_denied)
          return
        }
        if (name === "NotFoundError" || name === "OverconstrainedError") {
          fail("no_device", ERROR_MESSAGES.no_device)
          return
        }
        fail("unknown", message || ERROR_MESSAGES.unknown)
        return
      }
    }

    const rec = new Ctor()
    rec.lang = lang
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 1

    rec.onstart = () => {
      clearStartTimer()
      setStatus("recording")
    }

    rec.onresult = (e) => {
      let interim = ""
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        const transcript = res[0].transcript
        if (res.isFinal) {
          const text = transcript.trim()
          if (text) onTranscript(text)
        } else {
          interim += transcript
        }
      }
      setInterimText(interim)
    }

    rec.onerror = (e) => {
      const code = ERROR_CODE_MAP[e.error] ?? "unknown"
      if (code === "aborted") return
      fail(code, ERROR_MESSAGES[code])
    }

    rec.onend = () => {
      clearStartTimer()
      recogRef.current = null
      setInterimText("")
      setStatus((prev) => (prev === "error" ? prev : "idle"))
    }

    recogRef.current = rec
    try {
      rec.start()
      startTimerRef.current = window.setTimeout(() => {
        startTimerRef.current = null
        if (recogRef.current !== rec) return
        try { rec.abort() } catch {}
        recogRef.current = null
        fail("network", ERROR_MESSAGES.network)
      }, START_TIMEOUT_MS)
    } catch (err) {
      recogRef.current = null
      fail("unknown", (err as Error).message || "Не удалось запустить запись")
    }
  }, [fail, lang, onTranscript, clearStartTimer])

  const stop = useCallback(() => {
    clearStartTimer()
    const rec = recogRef.current
    if (!rec) {
      setInterimText("")
      setStatus((prev) => (prev === "error" ? prev : "idle"))
      return
    }
    try {
      rec.stop()
    } catch {
      try { rec.abort() } catch {}
      recogRef.current = null
      setInterimText("")
      setStatus((prev) => (prev === "error" ? prev : "idle"))
    }
  }, [clearStartTimer])

  useEffect(
    () => () => {
      if (startTimerRef.current !== null) {
        window.clearTimeout(startTimerRef.current)
        startTimerRef.current = null
      }
      recogRef.current?.abort()
      recogRef.current = null
    },
    [],
  )

  return { status, interimText, error, supported, start, stop }
}
