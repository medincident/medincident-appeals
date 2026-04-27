"use client"

import * as React from "react"

import { safeError } from "@/lib/log"

export function ServiceWorkerRegistrar() {
  React.useEffect(() => {
    if (typeof window === "undefined") return
    if (!("serviceWorker" in navigator)) return
    // В dev Next.js отдаёт HMR-ассеты, SW будет мешать — регистрируем только в продовой сборке.
    if (process.env.NODE_ENV !== "production") return

    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) => {
          console.error("[pwa] service worker registration failed:", safeError(err))
        })
    }

    if (document.readyState === "complete") {
      onLoad()
    } else {
      window.addEventListener("load", onLoad, { once: true })
      return () => window.removeEventListener("load", onLoad)
    }
  }, [])

  return null
}
