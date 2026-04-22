"use client"

import * as React from "react"

export function usePopover<T extends HTMLElement = HTMLDivElement>() {
  const [open, setOpen] = React.useState(false)
  const rootRef = React.useRef<T>(null)

  React.useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return { open, setOpen, rootRef }
}
