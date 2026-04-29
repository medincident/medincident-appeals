"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { clearOfflineData } from "@/lib/offline/cleanup"

// Сюда редиректит Zitadel RP-Initiated Logout. Перед уходом на /login чистим
// клиентские следы предыдущей сессии.
export default function LogoutPage() {
  const router = useRouter()

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      await clearOfflineData()
      if (!cancelled) router.replace("/login")
    })()
    return () => { cancelled = true }
  }, [router])

  return null
}
