"use client"

/**
 * Вайб распознователь, на свой SST нет мощностей
 * 
 * useVoiceRecorder — hook на Web Speech API (SpeechRecognition).
 *
 * Распознавание идёт прямо в браузере пользователя:
 *  - Chrome / Edge (Chromium): webkitSpeechRecognition (Google STT cloud)
 *  - Safari (macOS 14.5+/iOS 14.5+): встроенный Apple STT
 *  - Firefox: API нет — supported = false
 *
 * Требования: secure context (HTTPS или localhost).
 *
 * Состояния:
 *  - idle      — ничего не происходит
 *  - loading   — пользователь нажал «Записать», ждём прогрев STT-движка
 *                (от рукопожатия с бэкендом до onstart). Кнопка должна быть disabled.
 *  - recording — поток открыт, говорим
 *  - error     — последняя попытка упала; через 1.5s вернёмся в idle, можно ретраить
 */

import { useCallback, useEffect, useRef, useState } from "react"

export type RecorderStatus = "idle" | "loading" | "recording" | "error"

export type VoiceRecorderError =
  | "unsupported"
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
  /** Коллбэк с финальным куском распознанного текста. Может вызываться несколько раз за сессию. */
  onTranscript: (text: string) => void
  onError?: (code: VoiceRecorderError, message: string) => void
  lang?: string
}

interface Result {
  status: RecorderStatus
  interimText: string
  error: VoiceRecorderError | null
  supported: boolean
  start: () => void
  stop: () => void
}

const ERROR_MESSAGES: Record<VoiceRecorderError, string> = {
  unsupported:       "Браузер не поддерживает распознавание речи",
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

export function useVoiceRecorder({
  onTranscript,
  onError,
  lang = "ru-RU",
}: Options): Result {
  const [status, setStatus] = useState<RecorderStatus>("idle")
  const [interimText, setInterimText] = useState("")
  const [error, setError] = useState<VoiceRecorderError | null>(null)
  const [supported, setSupported] = useState(false)

  const recogRef = useRef<SpeechRecognitionLike | null>(null)

  useEffect(() => {
    setSupported(getSpeechRecognitionCtor() !== null)
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

  const start = useCallback(() => {
    if (recogRef.current) return
    setError(null)
    setInterimText("")
    setStatus("loading")

    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) {
      fail("unsupported", ERROR_MESSAGES.unsupported)
      return
    }

    const rec = new Ctor()
    rec.lang = lang
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 1

    rec.onstart = () => setStatus("recording")

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
      // Тихий abort (user stopped) — не считаем ошибкой
      if (code === "aborted") return
      fail(code, ERROR_MESSAGES[code])
    }

    rec.onend = () => {
      recogRef.current = null
      setInterimText("")
      setStatus((prev) => (prev === "error" ? prev : "idle"))
    }

    recogRef.current = rec
    try {
      rec.start()
    } catch (err) {
      recogRef.current = null
      fail("unknown", (err as Error).message || "Не удалось запустить запись")
    }
  }, [fail, lang, onTranscript])

  const stop = useCallback(() => {
    recogRef.current?.stop()
  }, [])

  useEffect(
    () => () => {
      recogRef.current?.abort()
      recogRef.current = null
    },
    [],
  )

  return { status, interimText, error, supported, start, stop }
}
