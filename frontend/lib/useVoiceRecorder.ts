"use client"

/**
 * useVoiceRecorder — hook на Web Speech API (SpeechRecognition).
 *
 * Распознавание идёт прямо в браузере пользователя:
 *  - Chrome / Edge: встроенный Google STT (cloud), хорошо на русском
 *  - Safari:        встроенный Apple STT
 *  - Firefox:       поддержка слабая, хук помечает unsupported
 *
 * Плюсы: нет нагрузки на сервер, работает на любом CPU, низкая latency,
 * interim-результаты (текст появляется по мере речи).
 * Минусы: требует HTTPS или localhost, в Firefox не работает стабильно.
 *
 * Использование:
 *   const { status, interimText, error, start, stop, supported } =
 *     useVoiceRecorder({ onTranscript: (text) => append(text) })
 */

import { useCallback, useEffect, useRef, useState } from "react"

export type RecorderStatus = "idle" | "recording" | "error"

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

    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) {
      fail("unsupported", "Браузер не поддерживает распознавание речи")
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
      const map: Record<string, VoiceRecorderError> = {
        "not-allowed": "permission_denied",
        "service-not-allowed": "permission_denied",
        "audio-capture": "no_device",
        "no-speech": "no_speech",
        aborted: "aborted",
        network: "network",
      }
      const code = map[e.error] ?? "unknown"
      const messages: Record<VoiceRecorderError, string> = {
        unsupported: "Браузер не поддерживает распознавание речи",
        permission_denied: "Доступ к микрофону отклонён",
        no_device: "Микрофон не найден",
        no_speech: "Речь не распознана — попробуйте ещё раз",
        aborted: "Запись отменена",
        network: "Нет соединения с сервисом распознавания",
        unknown: "Не удалось распознать речь",
      }
      if (code === "aborted") {
        // Тихий abort (user stopped) — не показываем ошибку
        return
      }
      fail(code, messages[code])
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
