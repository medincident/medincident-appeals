"use client"

const OFFLINE_KEY_STORAGE = "aimi-offline-key-v1"
const OFFLINE_DB = "aimi-offline"
const LEGACY_LOCAL_KEYS = ["app-profile-storage", "notifications-autoshown-ids"]

export async function clearOfflineData(): Promise<void> {
  // Шифровальный ключ сносим первым — без него ciphertext-записи всё равно
  // нечитаемы, даже если последующий IDB.delete упадёт (Safari private и т.п.).
  try { sessionStorage.removeItem(OFFLINE_KEY_STORAGE) } catch {}

  for (const k of LEGACY_LOCAL_KEYS) {
    try { localStorage.removeItem(k) } catch {}
  }

  try { await deleteDatabase(OFFLINE_DB) } catch {}

  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration()
      reg?.active?.postMessage({ type: "clear-shell" })
    }
  } catch {}
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return resolve()
    const req = indexedDB.deleteDatabase(name)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
    req.onblocked = () => resolve() // другие табы держат коннект — не блокируем logout
  })
}
