"use client"

import * as React from "react"

import { detectWebAppPlatform } from "./detect"
import type {
  SafeAreaInsets,
  WebAppColorScheme,
  WebAppInfo,
  WebAppPlatform,
  WebAppThemeParams,
} from "./types"

const ZERO_INSETS: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 }

const DEFAULT_INFO: WebAppInfo = {
  platform: null,
  colorScheme: "light",
  themeParams: {},
  isNative: false,
  isForced: false,
  insets: ZERO_INSETS,
}

const WebAppContext = React.createContext<WebAppInfo>(DEFAULT_INFO)

export function useWebApp(): WebAppInfo {
  return React.useContext(WebAppContext)
}

function readTelegramInsets(tg: NonNullable<Window["Telegram"]>["WebApp"]): SafeAreaInsets {
  if (!tg) return ZERO_INSETS
  const safe = tg.safeAreaInset ?? ZERO_INSETS
  const content = tg.contentSafeAreaInset ?? ZERO_INSETS
  return {
    top: Math.max(safe.top || 0, content.top || 0),
    right: Math.max(safe.right || 0, content.right || 0),
    bottom: Math.max(safe.bottom || 0, content.bottom || 0),
    left: Math.max(safe.left || 0, content.left || 0),
  }
}

function applyInsetsToDom(insets: SafeAreaInsets): void {
  const root = document.documentElement
  root.style.setProperty("--webapp-safe-top", `${insets.top}px`)
  root.style.setProperty("--webapp-safe-right", `${insets.right}px`)
  root.style.setProperty("--webapp-safe-bottom", `${insets.bottom}px`)
  root.style.setProperty("--webapp-safe-left", `${insets.left}px`)
}

function applyThemeParamsToDom(params: WebAppThemeParams): void {
  const root = document.documentElement
  const map: Array<[keyof WebAppThemeParams, string]> = [
    ["bg_color", "--webapp-bg"],
    ["text_color", "--webapp-text"],
    ["hint_color", "--webapp-hint"],
    ["link_color", "--webapp-link"],
    ["button_color", "--webapp-button"],
    ["button_text_color", "--webapp-button-text"],
    ["secondary_bg_color", "--webapp-secondary-bg"],
    ["section_bg_color", "--webapp-section-bg"],
    ["header_bg_color", "--webapp-header-bg"],
    ["accent_text_color", "--webapp-accent-text"],
    ["destructive_text_color", "--webapp-destructive-text"],
  ]
  for (const [key, cssVar] of map) {
    const value = params[key]
    if (value) root.style.setProperty(cssVar, value)
    else root.style.removeProperty(cssVar)
  }
}

interface State {
  colorScheme: WebAppColorScheme
  themeParams: WebAppThemeParams
  insets: SafeAreaInsets
}

const INITIAL_STATE: State = {
  colorScheme: "light",
  themeParams: {},
  insets: ZERO_INSETS,
}

export function WebAppProvider({ children }: { children: React.ReactNode }) {
  const [detected, setDetected] = React.useState<{
    platform: WebAppPlatform
    isNative: boolean
    isForced: boolean
  }>(() => {
    if (typeof window === "undefined") return { platform: null, isNative: false, isForced: false }
    return detectWebAppPlatform()
  })
  const { platform, isNative, isForced } = detected

  React.useEffect(() => {
    if (typeof window === "undefined") return
    const onReady = () => setDetected(detectWebAppPlatform())
    window.addEventListener("aimi-webapp-ready", onReady)
    return () => window.removeEventListener("aimi-webapp-ready", onReady)
  }, [])

  const [state, setState] = React.useState<State>(INITIAL_STATE)

  React.useEffect(() => {
    if (typeof window === "undefined") return
    if (!platform) return

    // data-webapp на html — для CSS-селекторов вида html[data-webapp="telegram"].
    document.documentElement.dataset.webapp = platform

    let cleanup: (() => void) | undefined

    if (platform === "telegram" && isNative) {
      cleanup = initTelegram(setState)
    } else if (platform === "vk" && isNative) {
      cleanup = initVk(setState)
    } else if (platform === "max" && isNative) {
      cleanup = initMax(setState)
    } else if (isForced) {
      // Эмуляция: insets как у мобильного клиента, чтобы видно было safe-area.
      const forcedInsets: SafeAreaInsets =
        platform === "telegram" ? { top: 44, right: 0, bottom: 0, left: 0 }
        : platform === "vk"     ? { top: 0,  right: 0, bottom: 34, left: 0 }
        : platform === "max"    ? { top: 44, right: 0, bottom: 16, left: 0 }
        : ZERO_INSETS
      setState({ colorScheme: "light", themeParams: {}, insets: forcedInsets })
    }

    return () => {
      cleanup?.()
      delete document.documentElement.dataset.webapp
      applyInsetsToDom(ZERO_INSETS)
      applyThemeParamsToDom({})
    }
  }, [platform, isNative, isForced])

  React.useEffect(() => {
    applyInsetsToDom(state.insets)
  }, [state.insets])

  React.useEffect(() => {
    applyThemeParamsToDom(state.themeParams)
  }, [state.themeParams])

  const value = React.useMemo<WebAppInfo>(() => ({
    platform,
    isNative,
    isForced,
    colorScheme: state.colorScheme,
    themeParams: state.themeParams,
    insets: state.insets,
  }), [platform, isNative, isForced, state])

  return <WebAppContext.Provider value={value}>{children}</WebAppContext.Provider>
}

function initTelegram(setState: React.Dispatch<React.SetStateAction<State>>): () => void {
  const tg = window.Telegram?.WebApp
  if (!tg) return () => {}

  try { tg.ready() } catch {}
  try { tg.expand() } catch {}
  try { tg.disableVerticalSwipes?.() } catch {}

  const sync = () => {
    setState({
      colorScheme: tg.colorScheme ?? "light",
      themeParams: tg.themeParams ?? {},
      insets: readTelegramInsets(tg),
    })
  }
  sync()

  const onTheme = () => sync()
  const onViewport = () => sync()
  const onSafeArea = () => sync()
  try { tg.onEvent("themeChanged", onTheme) } catch {}
  try { tg.onEvent("viewportChanged", onViewport) } catch {}
  try { tg.onEvent("safeAreaChanged", onSafeArea) } catch {}
  try { tg.onEvent("contentSafeAreaChanged", onSafeArea) } catch {}

  return () => {
    try { tg.offEvent("themeChanged", onTheme) } catch {}
    try { tg.offEvent("viewportChanged", onViewport) } catch {}
    try { tg.offEvent("safeAreaChanged", onSafeArea) } catch {}
    try { tg.offEvent("contentSafeAreaChanged", onSafeArea) } catch {}
  }
}

function initVk(setState: React.Dispatch<React.SetStateAction<State>>): () => void {
  const bridge = window.vkBridge
  if (!bridge) return () => {}

  // VKWebAppInit обязателен для получения init-data; ошибки игнорируем — на десктопе
  // может вернуть error_data, но subscribe всё равно работает.
  bridge.send("VKWebAppInit").catch(() => {})

  // Запрашиваем тему. VKWebAppGetConfig возвращает { app, appearance, scheme }.
  bridge.send("VKWebAppGetConfig").then((config) => {
    const c = config as { appearance?: string; scheme?: string } | undefined
    const appearance = c?.appearance === "dark" ? "dark" : "light"
    setState((s) => ({ ...s, colorScheme: appearance }))
  }).catch(() => {})

  // safe-area через VKWebAppGetInsets (доступно на iOS/Android клиентах).
  bridge.send("VKWebAppGetInsets").then((insets) => {
    const i = insets as Partial<SafeAreaInsets> | undefined
    if (i && typeof i === "object") {
      setState((s) => ({
        ...s,
        insets: {
          top: i.top ?? 0,
          right: i.right ?? 0,
          bottom: i.bottom ?? 0,
          left: i.left ?? 0,
        },
      }))
    }
  }).catch(() => {})

  const handler = (e: { detail: { type: string; data?: unknown } }) => {
    const { type, data } = e.detail
    if (type === "VKWebAppUpdateConfig") {
      const d = data as { appearance?: string; scheme?: string } | undefined
      const appearance = d?.appearance === "dark" ? "dark" : "light"
      setState((s) => ({ ...s, colorScheme: appearance }))
    }
    if (type === "VKWebAppUpdateInsets") {
      const d = data as Partial<SafeAreaInsets> | undefined
      if (d && typeof d === "object") {
        setState((s) => ({
          ...s,
          insets: {
            top: d.top ?? s.insets.top,
            right: d.right ?? s.insets.right,
            bottom: d.bottom ?? s.insets.bottom,
            left: d.left ?? s.insets.left,
          },
        }))
      }
    }
  }
  bridge.subscribe(handler)

  return () => {
    try { bridge.unsubscribe(handler) } catch {}
  }
}

function initMax(setState: React.Dispatch<React.SetStateAction<State>>): () => void {
  const max = window.MAX?.WebApp
  if (!max) return () => {}

  try { max.ready?.() } catch {}
  try { max.expand?.() } catch {}

  const sync = () => {
    setState({
      colorScheme: max.colorScheme ?? "light",
      themeParams: max.themeParams ?? {},
      insets: ZERO_INSETS,
    })
  }
  sync()

  const onTheme = () => sync()
  try { max.onEvent?.("themeChanged", onTheme) } catch {}

  return () => {
    try { max.offEvent?.("themeChanged", onTheme) } catch {}
  }
}
