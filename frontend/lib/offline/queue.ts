"use client"

import { decryptString, encryptString } from "./crypto"

export const PENDING_CHANGED_EVENT = "aimi-pending-changed"

function emitChanged(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(PENDING_CHANGED_EVENT))
}

// Локи на отправку: пока пользователь редактирует pending-обращение,
// flushQueue должен его пропускать. Set живёт в памяти таба.
const editLocks = new Set<string>()

export function lockPending(localId: string): void {
  editLocks.add(localId)
}

export function unlockPending(localId: string): void {
  editLocks.delete(localId)
}

export function isPendingLocked(localId: string): boolean {
  return editLocks.has(localId)
}

const DB_NAME = "aimi-offline"
// v2: миграция с plaintext-формата (хранил поле `text`) на encrypted (`cipher`).
const DB_VERSION = 2
const STORE = "pending-appeals"

interface StoredAppeal {
  localId: string
  cipher: string // encrypted base64
  createdAt: string
  attempts: number
}

export interface PendingAppeal {
  /** Локальный id, чтобы не путать с id обращения, которое сгенерирует сервер. */
  localId: string
  text: string
  createdAt: string
  attempts: number
}

function hasIDB(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      // На любом апгрейде с предыдущей версии безопаснее снести стор:
      // данные либо ещё в plaintext-формате (PII!), либо зашифрованы старым
      // ключом, к которому уже нет доступа.
      if (db.objectStoreNames.contains(STORE)) {
        db.deleteObjectStore(STORE)
      }
      db.createObjectStore(STORE, { keyPath: "localId" })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openDB()
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode)
      const store = t.objectStore(STORE)
      let result: T | undefined
      Promise.resolve(fn(store))
        .then((v) => {
          result = v
        })
        .catch(reject)
      t.oncomplete = () => resolve(result as T)
      t.onerror = () => reject(t.error)
      t.onabort = () => reject(t.error)
    })
  } finally {
    db.close()
  }
}

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export async function enqueueAppeal(text: string): Promise<PendingAppeal> {
  if (!hasIDB()) throw new Error("IndexedDB недоступен")
  const localId = randomId()
  const createdAt = new Date().toISOString()
  const cipher = await encryptString(text)
  const stored: StoredAppeal = { localId, cipher, createdAt, attempts: 0 }
  await tx("readwrite", (store) => {
    store.add(stored)
  })
  emitChanged()
  return { localId, text, createdAt, attempts: 0 }
}

export async function updatePending(localId: string, text: string): Promise<void> {
  if (!hasIDB()) throw new Error("IndexedDB недоступен")
  const cipher = await encryptString(text)
  await tx("readwrite", (store) => {
    return new Promise<void>((resolve, reject) => {
      const req = store.get(localId)
      req.onsuccess = () => {
        const current = req.result as StoredAppeal | undefined
        if (!current) return resolve()
        current.cipher = cipher
        const putReq = store.put(current)
        putReq.onsuccess = () => resolve()
        putReq.onerror = () => reject(putReq.error)
      }
      req.onerror = () => reject(req.error)
    })
  })
  emitChanged()
}

export async function listPending(): Promise<PendingAppeal[]> {
  if (!hasIDB()) return []
  const stored = await tx("readonly", (store) => {
    return new Promise<StoredAppeal[]>((resolve, reject) => {
      const req = store.getAll()
      req.onsuccess = () => resolve((req.result as StoredAppeal[]) ?? [])
      req.onerror = () => reject(req.error)
    })
  })

  const items: PendingAppeal[] = []
  for (const row of stored) {
    try {
      const text = await decryptString(row.cipher)
      items.push({ localId: row.localId, text, createdAt: row.createdAt, attempts: row.attempts })
    } catch {
      // Ключ потерян (новый таб, sessionStorage очистился): запись не
      // расшифровать — удаляем, чтобы не висела навсегда.
      await removePending(row.localId).catch(() => {})
    }
  }
  return items
}

export async function removePending(localId: string): Promise<void> {
  if (!hasIDB()) return
  await tx("readwrite", (store) => {
    store.delete(localId)
  })
  unlockPending(localId)
  emitChanged()
}

export async function bumpAttempts(localId: string): Promise<void> {
  if (!hasIDB()) return
  await tx("readwrite", (store) => {
    return new Promise<void>((resolve, reject) => {
      const req = store.get(localId)
      req.onsuccess = () => {
        const current = req.result as StoredAppeal | undefined
        if (!current) return resolve()
        current.attempts += 1
        const putReq = store.put(current)
        putReq.onsuccess = () => resolve()
        putReq.onerror = () => reject(putReq.error)
      }
      req.onerror = () => reject(req.error)
    })
  })
}

export async function countPending(): Promise<number> {
  if (!hasIDB()) return 0
  return tx("readonly", (store) => {
    return new Promise<number>((resolve, reject) => {
      const req = store.count()
      req.onsuccess = () => resolve(req.result ?? 0)
      req.onerror = () => reject(req.error)
    })
  })
}
