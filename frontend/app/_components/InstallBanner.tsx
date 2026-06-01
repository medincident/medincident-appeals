"use client"

import * as React from "react"
import Image from "next/image"
import { Download, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useWebApp } from "@/lib/webapp/context"

const DISMISSED_KEY = "aimi:install-banner-dismissed"
const INSTALLED_KEY = "aimi:pwa-installed"

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>
}

function isMobileUA(): boolean {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent || ""
  return /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent || ""
  return /iPhone|iPad|iPod/i.test(ua) && !/CriOS|FxiOS/i.test(ua)
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false
  const mq = window.matchMedia?.("(display-mode: standalone)").matches
  // iOS Safari использует нестандартный navigator.standalone.
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return Boolean(mq || iosStandalone)
}

export function InstallBanner() {
  const [visible, setVisible] = React.useState(false)
  const [deferred, setDeferred] = React.useState<BeforeInstallPromptEvent | null>(null)
  const [iosHint, setIosHint] = React.useState(false)
  const { platform } = useWebApp()

  React.useEffect(() => {
    if (typeof window === "undefined") return
    if (platform) return

    if (isStandalone()) {
      try {
        localStorage.setItem(INSTALLED_KEY, "1")
      } catch {}
      return
    }

    let dismissed = false
    try {
      dismissed = localStorage.getItem(DISMISSED_KEY) === "1"
    } catch {}
    if (dismissed) return

    if (!isMobileUA()) return

    if (isIos()) {
      setIosHint(true)
      setVisible(true)
      return
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      setVisible(true)
    }
    const onInstalled = () => {
      try {
        localStorage.setItem(INSTALLED_KEY, "1")
      } catch {}
      setVisible(false)
      setDeferred(null)
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall)
    window.addEventListener("appinstalled", onInstalled)
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [platform])

  function handleDismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, "1")
    } catch {}
    setVisible(false)
  }

  async function handleInstall() {
    if (!deferred) return
    try {
      await deferred.prompt()
      const choice = await deferred.userChoice
      if (choice.outcome === "accepted") {
        try {
          localStorage.setItem(INSTALLED_KEY, "1")
        } catch {}
      } else {
        try {
          localStorage.setItem(DISMISSED_KEY, "1")
        } catch {}
      }
    } finally {
      setDeferred(null)
      setVisible(false)
    }
  }

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-live="polite"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur sm:bottom-4"
    >
      <div className="flex items-start gap-3">
        <Image
          src="/icons/app-icon.svg"
          alt=""
          width={36}
          height={36}
          className="h-9 w-9 shrink-0 rounded-md"
        />
        <div className="flex-1 text-sm">
          <p className="font-medium text-foreground">Установить приложение</p>
          {iosHint ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Нажмите{" "}
              <span aria-label="кнопка Поделиться" className="font-medium">
                «Поделиться»
              </span>{" "}
              в Safari, затем{" "}
              <span className="font-medium">«На экран «Домой»»</span>.
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Добавьте AI MedIncident на главный экран — работает и офлайн.
            </p>
          )}
          <div className="mt-2 flex items-center gap-2">
            {!iosHint && (
              <Button size="sm" onClick={handleInstall} className="h-8 gap-1.5">
                <Download className="h-3.5 w-3.5" />
                Установить
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDismiss}
              className="h-8"
            >
              {iosHint ? "Понятно" : "Не сейчас"}
            </Button>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Закрыть"
          className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
