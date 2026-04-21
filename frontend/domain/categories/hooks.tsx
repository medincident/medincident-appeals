"use client"

import useSWR from "swr"

import { getCategoriesAction } from "./actions"
import type { Category } from "./types"

const CATEGORIES_KEY = "categories"

/**
 * Справочник категорий. Кэшируется у пользователя до тех пор, пока они не
 * поменяются: SWR запросит их один раз, в фоне обновит на mount/reconnect.
 * Фокус-реваллидация и поллинг отключены — меняется только редкими админ-
 * действиями, хватит ручного `mutate()` извне.
 */
export function useCategories() {
  const { data, error, isLoading, mutate } = useSWR<Category[]>(
    CATEGORIES_KEY,
    getCategoriesAction,
    {
      revalidateOnFocus: false,
      revalidateIfStale: false,
      shouldRetryOnError: false,
      dedupingInterval: 5 * 60_000,
    }
  )

  return {
    categories: data ?? [],
    isLoading,
    isError: error,
    mutate,
  }
}
