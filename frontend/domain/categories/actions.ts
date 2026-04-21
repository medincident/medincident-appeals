"use server"

import type { Category } from "./types"

const BACKEND_URL = process.env.BACKEND_URL ?? "http://backend:8080"

/**
 * Справочник категорий обращений. Источник — backend GET /categories, который
 * берёт данные из NATS KV и обновляется через watcher — то есть меняется
 * только когда реально поменяются категории. Поэтому на фронте их можно
 * кэшировать агрессивно (см. useCategories).
 */
export async function getCategoriesAction(): Promise<Category[]> {
  const res = await fetch(`${BACKEND_URL}/categories`, {
    method: "GET",
    signal: AbortSignal.timeout(10_000),
    // Никакого публичного REST-кэша — хватит SWR на клиенте.
    cache: "no-store",
  })
  if (!res.ok) {
    throw new Error(`backend /categories ${res.status}`)
  }
  const data = (await res.json()) as { categories: Category[] }
  return data.categories ?? []
}
