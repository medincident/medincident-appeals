"use client"

import useSWR from "swr"
import { getAppealsAction } from "./actions"
import type { Appeal, AppealFilters } from "./types"

/**
 * Список обращений текущего пользователя с серверным поиском и фильтрами.
 *
 * SWR-ключ — кортеж ["appeals", filters], так что каждое уникальное сочетание
 * (search / categoryId / subcategoryId) кэшируется отдельно и автоматически
 * возвращает прежние данные, если пользователь переключается туда-сюда.
 */
export function useAppeals(filters: AppealFilters = {}) {
  const key = [
    "appeals",
    filters.search ?? "",
    filters.categoryId ?? "",
    filters.subcategoryId ?? "",
  ] as const

  const { data, error, isLoading, isValidating, mutate } = useSWR<Appeal[]>(
    key,
    () => getAppealsAction(filters),
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      // Держим прошлый результат пока грузим новый — чтобы список не мигал
      // при вводе в поле поиска или смене фильтра.
      keepPreviousData: true,
    }
  )

  return {
    appeals: data ?? [],
    isLoading,
    isValidating,
    isError: error,
    mutate,
  }
}
