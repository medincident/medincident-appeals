"use client"

import * as React from "react"

import { safeError } from "@/lib/log"
import { useWebApp } from "@/lib/webapp/context"

export function ServiceWorkerRegistrar() {
  const { platform } = useWebApp()

  React.useEffect(() => {
    if (typeof window === "undefined") return
    if (!("serviceWorker" in navigator)) return
    if (process.env.NODE_ENV !== "production") return
    if (platform) return

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
  }, [platform])

  return null
}
