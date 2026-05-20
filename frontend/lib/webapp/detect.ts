"use client"

import { env } from "@/shared/config/env"

import type { WebAppPlatform } from "./types"

const FORCED_PLATFORM: WebAppPlatform = (() => {
  const v = env.NEXT_PUBLIC_WEBAPP_FORCE
  if (v === "telegram" || v === "vk" || v === "max") return v
  return null
})()

export function getForcedPlatform(): WebAppPlatform {
  return FORCED_PLATFORM
}

export function detectNativeWebApp(): WebAppPlatform {
  if (typeof window === "undefined") return null

  // Telegram Web App: <script src="https://telegram.org/js/telegram-web-app.js">
  // регистрирует window.Telegram.WebApp. initData непустое, если запущено внутри клиента.
  const tg = window.Telegram?.WebApp
  if (tg && typeof tg.initData === "string" && tg.initData.length > 0) {
    return "telegram"
  }

  // VK Mini Apps: vk-bridge.send("VKWebAppInit") + window.vkBridge.
  // Косвенный признак — query string ?vk_app_id=...
  if (window.vkBridge && typeof window.vkBridge.send === "function") {
    return "vk"
  }
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.has("vk_app_id") || params.has("vk_user_id")) return "vk"
  } catch {}

  // MAX (Mail.ru / VK ecosystem) mini-app: window.MAX.WebApp по аналогии с TG.
  // Часть клиентов прокидывают user-agent с "MAX".
  if (window.MAX?.WebApp) return "max"
  if (typeof navigator !== "undefined" && /\bMAX\/[\d.]+/i.test(navigator.userAgent)) {
    return "max"
  }

  return null
}

export function detectWebAppPlatform(): { platform: WebAppPlatform; isNative: boolean; isForced: boolean } {
  const native = detectNativeWebApp()
  if (native) return { platform: native, isNative: true, isForced: false }
  if (FORCED_PLATFORM) return { platform: FORCED_PLATFORM, isNative: false, isForced: true }
  return { platform: null, isNative: false, isForced: false }
}
