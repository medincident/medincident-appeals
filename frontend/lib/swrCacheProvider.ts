"use client"

import type { Cache } from "swr"

const STORAGE_KEY = "aimi-swr-cache"

export function localStorageProvider(): Cache {
  if (typeof window === "undefined") return new Map()

  let initial: [string, unknown][] = []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) initial = JSON.parse(raw) as [string, unknown][]
  } catch {}

  const map = new Map(initial)

  const persist = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(map.entries())))
    } catch {}
  }

  window.addEventListener("beforeunload", persist)
  window.addEventListener("pagehide", persist)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") persist()
  })

  return map as unknown as Cache
}
