"use client"

import { decryptString, encryptString } from "./crypto"

export const PENDING_CHANGED_EVENT = "aimi-pending-changed"

function emitChanged(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(PENDING_CHANGED_EVENT))
}

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
const DB_VERSION = 2
const STORE = "pending-appeals"

interface StoredAppeal {
  localId: string
  cipher: string
  createdAt: string
  attempts: number
  nextAttemptAt?: string
}

export interface PendingAppeal {
  localId: string
  text: string
  createdAt: string
  attempts: number
  nextAttemptAt?: string
}

function hasIDB(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
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
        .then((v) => { result = v })
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
      items.push({
        localId: row.localId,
        text,
        createdAt: row.createdAt,
        attempts: row.attempts,
        nextAttemptAt: row.nextAttemptAt,
      })
    } catch {
      // Ключ потерян (новый таб, sessionStorage очищен) — удаляем
      // нечитаемую запись.
      await removePending(row.localId).catch(() => {})
    }
  }
  return items
}

export function isDue(p: PendingAppeal, now: number = Date.now()): boolean {
  if (!p.nextAttemptAt) return true
  const t = Date.parse(p.nextAttemptAt)
  return Number.isFinite(t) ? t <= now : true
}

const BACKOFF_BASE_MS = 30_000
const BACKOFF_CAP_MS = 30 * 60_000

function backoffDelay(attempts: number): number {
  const base = Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1), BACKOFF_CAP_MS)
  const jitter = Math.floor(base * 0.2 * Math.random())
  return base + jitter
}

export async function markFlushFailed(localId: string): Promise<void> {
  if (!hasIDB()) return
  await tx("readwrite", (store) => {
    return new Promise<void>((resolve, reject) => {
      const req = store.get(localId)
      req.onsuccess = () => {
        const current = req.result as StoredAppeal | undefined
        if (!current) return resolve()
        current.attempts += 1
        current.nextAttemptAt = new Date(
          Date.now() + backoffDelay(current.attempts),
        ).toISOString()
        const putReq = store.put(current)
        putReq.onsuccess = () => resolve()
        putReq.onerror = () => reject(putReq.error)
      }
      req.onerror = () => reject(req.error)
    })
  })
  emitChanged()
}

export async function removePending(localId: string): Promise<void> {
  if (!hasIDB()) return
  await tx("readwrite", (store) => {
    store.delete(localId)
  })
  unlockPending(localId)
  emitChanged()
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
