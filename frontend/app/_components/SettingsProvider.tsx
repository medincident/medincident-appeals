"use client"

import { useEffect } from "react"

import { useSettingsStore } from "@/lib/stores/settings.store"

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const fontSize      = useSettingsStore((s) => s.fontSize)
  const animations    = useSettingsStore((s) => s.animations)
  const contrast      = useSettingsStore((s) => s.contrast)
  const letterSpacing = useSettingsStore((s) => s.letterSpacing)

  useEffect(() => {
    if (fontSize !== "md") document.documentElement.dataset.fontSize = fontSize
    else delete document.documentElement.dataset.fontSize
  }, [fontSize])

  useEffect(() => {
    if (!animations) document.documentElement.dataset.animations = "false"
    else delete document.documentElement.dataset.animations
  }, [animations])

  useEffect(() => {
    if (contrast !== "normal") document.documentElement.dataset.contrast = contrast
    else delete document.documentElement.dataset.contrast
  }, [contrast])

  useEffect(() => {
    if (letterSpacing !== "normal") document.documentElement.dataset.letterSpacing = letterSpacing
    else delete document.documentElement.dataset.letterSpacing
  }, [letterSpacing])

  return <>{children}</>
}
