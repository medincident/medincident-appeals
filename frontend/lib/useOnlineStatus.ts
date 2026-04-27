"use client"

import * as React from "react"

export function useOnlineStatus(): boolean {
  const [online, setOnline] = React.useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  )

  React.useEffect(() => {
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)
    return () => {
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
    }
  }, [])

  return online
}
