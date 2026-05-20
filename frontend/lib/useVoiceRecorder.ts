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
    const log = (...args: unknown[]) => console.log("[voice]", ...args)

    log("start() called", {
      isSecureContext: typeof window !== "undefined" ? window.isSecureContext : "n/a",
      hasMediaDevices: typeof navigator !== "undefined" && !!navigator.mediaDevices,
      hasGetUserMedia:
        typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia,
      hasPermissionsAPI:
        typeof navigator !== "undefined" && !!(navigator.permissions as unknown),
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "n/a",
      hasSpeechRecognition:
        typeof window !== "undefined" &&
        !!(window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition,
      hasWebkitSpeechRecognition:
        typeof window !== "undefined" &&
        !!(window as unknown as { webkitSpeechRecognition?: unknown })
          .webkitSpeechRecognition,
    })

    if (recogRef.current) {
      log("already running, abort")
      return
    }

    if (typeof window !== "undefined" && window.isSecureContext === false) {
      log("insecure context — getUserMedia blocked by browser")
      fail("insecure_context", ERROR_MESSAGES.insecure_context)
      return
    }

    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) {
      log("no SpeechRecognition ctor")
      fail("unsupported", ERROR_MESSAGES.unsupported)
      return
    }

    setError(null)
    setInterimText("")
    setStatus("loading")

    // КЛЮЧЕВОЙ МОМЕНТ: getUserMedia должен быть вызван СИНХРОННО в обработчике
    // клика, до любых await — иначе iOS Safari теряет связку с user gesture и
    // молча отклоняет доступ без показа prompt'а. То же помогает на Android
    // Chrome, где prompt от webkitSpeechRecognition появляется не всегда.
    // Поэтому permissions.query (опциональная оптимизация) теперь идёт ПОСЛЕ
    // getUserMedia, а не до.
    let gumPromise: Promise<MediaStream> | null = null
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        log("calling getUserMedia({audio:true}) synchronously…")
        gumPromise = navigator.mediaDevices.getUserMedia({ audio: true })
      } catch (err) {
        // Синхронный throw (редко, но бывает в некоторых WebView)
        log("getUserMedia threw synchronously:", {
          name: (err as Error)?.name,
          message: (err as Error)?.message,
        })
        fail("permission_denied", ERROR_MESSAGES.permission_denied)
        return
      }
    } else {
      log("no getUserMedia available; will rely on SpeechRecognition prompt")
    }

    if (gumPromise) {
      try {
        const stream = await gumPromise
        log("getUserMedia OK, tracks:", stream.getTracks().length)
        stream.getTracks().forEach((t) => t.stop())
      } catch (err) {
        const name = (err as DOMException)?.name
        const message = (err as DOMException)?.message
        log("getUserMedia rejected:", { name, message })
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
      log("SR.onstart")
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
      log("SR.onerror:", { error: e.error, message: e.message })
      const code = ERROR_CODE_MAP[e.error] ?? "unknown"
      // Тихий abort (user stopped) — не считаем ошибкой
      if (code === "aborted") return
      fail(code, ERROR_MESSAGES[code])
    }

    rec.onend = () => {
      log("SR.onend")
      recogRef.current = null
      setInterimText("")
      setStatus((prev) => (prev === "error" ? prev : "idle"))
    }

    recogRef.current = rec
    try {
      log("calling SR.start()")
      rec.start()
      log("SR.start() returned without throw")
    } catch (err) {
      log("SR.start() threw:", {
        name: (err as Error)?.name,
        message: (err as Error)?.message,
      })
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
