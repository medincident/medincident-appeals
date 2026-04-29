"use client"

// AES-256-GCM шифрование payload оффлайн-очереди.
// Ключ живёт в sessionStorage (per-tab) — закрытие таба убирает возможность
// расшифровки, что ограничивает blast radius XSS между табами/iframe.
// Формат ciphertext в IDB: base64( [12B nonce] [N ciphertext] [16B tag] ).

const STORAGE_KEY = "aimi-offline-key-v1"
const NONCE_BYTES = 12

async function importKey(rawB64: string): Promise<CryptoKey> {
  const raw = base64ToBytes(rawB64)
  return crypto.subtle.importKey("raw", raw.buffer as ArrayBuffer, { name: "AES-GCM" }, false, ["encrypt", "decrypt"])
}

async function generateAndStoreKey(): Promise<CryptoKey> {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"])
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key))
  sessionStorage.setItem(STORAGE_KEY, bytesToBase64(raw))
  return key
}

let cached: Promise<CryptoKey> | null = null

export function ensureKey(): Promise<CryptoKey> {
  if (cached) return cached
  cached = (async () => {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (stored) {
      try { return await importKey(stored) }
      catch { sessionStorage.removeItem(STORAGE_KEY) }
    }
    return generateAndStoreKey()
  })()
  return cached
}

export async function encryptString(plaintext: string): Promise<string> {
  const key = await ensureKey()
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES))
  const data = new TextEncoder().encode(plaintext)
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, data),
  )
  const out = new Uint8Array(NONCE_BYTES + ciphertext.byteLength)
  out.set(nonce, 0)
  out.set(ciphertext, NONCE_BYTES)
  return bytesToBase64(out)
}

export async function decryptString(b64: string): Promise<string> {
  const key = await ensureKey()
  const all = base64ToBytes(b64)
  const nonce = all.slice(0, NONCE_BYTES)
  const data = all.slice(NONCE_BYTES)
  const plain = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, data),
  )
  return new TextDecoder().decode(plain)
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = ""
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}

function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}
