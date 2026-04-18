"use client"

import useSWR from "swr"
import { getAppealsAction } from "./actions"
import type { Appeal } from "./types"

const APPEALS_KEY = "appeals"

export function useAppeals() {
  const { data, error, isLoading, isValidating, mutate } = useSWR<Appeal[]>(
    APPEALS_KEY,
    getAppealsAction,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
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
