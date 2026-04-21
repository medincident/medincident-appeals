"use client"

// Очередь неотправленных обращений в IndexedDB.
// Используется, когда клиент офлайн: сервер-экшен createAppealAction недоступен,
// поэтому складываем payload в локальное хранилище и дошлём позже.

const DB_NAME = "aimi-offline"
const DB_VERSION = 1
const STORE = "pending-appeals"

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
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "localId" })
      }
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
  const item: PendingAppeal = {
    localId: randomId(),
    text,
    createdAt: new Date().toISOString(),
    attempts: 0,
  }
  await tx("readwrite", (store) => {
    store.add(item)
  })
  return item
}

export async function listPending(): Promise<PendingAppeal[]> {
  if (!hasIDB()) return []
  return tx("readonly", (store) => {
    return new Promise<PendingAppeal[]>((resolve, reject) => {
      const req = store.getAll()
      req.onsuccess = () => resolve((req.result as PendingAppeal[]) ?? [])
      req.onerror = () => reject(req.error)
    })
  })
}

export async function removePending(localId: string): Promise<void> {
  if (!hasIDB()) return
  await tx("readwrite", (store) => {
    store.delete(localId)
  })
}

export async function bumpAttempts(localId: string): Promise<void> {
  if (!hasIDB()) return
  await tx("readwrite", (store) => {
    return new Promise<void>((resolve, reject) => {
      const req = store.get(localId)
      req.onsuccess = () => {
        const current = req.result as PendingAppeal | undefined
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
