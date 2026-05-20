"use client"

import * as React from "react"

import { detectNativeWebApp, getForcedPlatform } from "@/lib/webapp/detect"

const TELEGRAM_SDK_SRC = "https://telegram.org/js/telegram-web-app.js?56"
const VK_BRIDGE_SRC = "https://unpkg.com/@vkontakte/vk-bridge@2/dist/browser.min.js"

function looksLikeTelegram(): boolean {
  if (typeof window === "undefined") return false
  if (window.Telegram?.WebApp) return true
  if (window.location.hash.includes("tgWebApp")) return true
  return false
}

function looksLikeVk(): boolean {
  if (typeof window === "undefined") return false
  if (window.vkBridge) return true
  try {
    const params = new URLSearchParams(window.location.search)
    return params.has("vk_app_id") || params.has("vk_user_id")
  } catch {
    return false
  }
}

function loadScriptOnce(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) return resolve()
    const s = document.createElement("script")
    s.id = id
    s.src = src
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`failed to load ${src}`))
    document.head.appendChild(s)
  })
}

export function WebAppBootstrap() {
  React.useEffect(() => {
    if (typeof window === "undefined") return
    const forced = getForcedPlatform()
    const alreadyDetected = detectNativeWebApp()
    if (alreadyDetected) return

    const wantTelegram = looksLikeTelegram() || forced === "telegram"
    const wantVk = looksLikeVk() || forced === "vk"

    const tasks: Promise<unknown>[] = []
    if (wantTelegram && !window.Telegram?.WebApp) {
      tasks.push(loadScriptOnce(TELEGRAM_SDK_SRC, "aimi-tg-sdk").catch(() => {}))
    }
    if (wantVk && !window.vkBridge) {
      tasks.push(loadScriptOnce(VK_BRIDGE_SRC, "aimi-vk-bridge").catch(() => {}))
    }
    if (tasks.length === 0) return

    Promise.all(tasks).then(() => {
      window.dispatchEvent(new CustomEvent("aimi-webapp-ready"))
    })
  }, [])

  return null
}
