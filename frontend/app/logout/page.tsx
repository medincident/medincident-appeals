"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

// Zitadel RP-Initiated Logout (/oidc/v1/end_session) редиректит сюда после
// завершения OIDC-сессии. Перед уходом на /login очищаем клиентский кэш ПДн:
//  - sessionStorage с ключом шифрования оффлайн-очереди;
//  - IndexedDB-стор оффлайн-обращений (даже зашифрованный — без ключа уже не вскрыть,
//    но логичнее их не таскать);
//  - legacy localStorage-ключи, если остались с предыдущих сборок.
export default function LogoutPage() {
  const router = useRouter()

  React.useEffect(() => {
    try { sessionStorage.removeItem("aimi-offline-key-v1") } catch {}
    try { localStorage.removeItem("app-profile-storage") } catch {}
    try { localStorage.removeItem("notifications-autoshown-ids") } catch {}
    try { indexedDB.deleteDatabase("aimi-offline") } catch {}
    router.replace("/login")
  }, [router])

  return null
}
