"use client"

import useSWR from "swr"
import { getNotificationsAction } from "./actions"
import type { NotificationItem } from "./types"

const NOTIFICATIONS_KEY = "notifications"

export function useNotifications() {
  const { data, error, isLoading, mutate } = useSWR<NotificationItem[]>(
    NOTIFICATIONS_KEY,
    getNotificationsAction,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    }
  )

  return {
    notifications: data ?? [],
    isLoading,
    isError: error,
    mutate,
  }
}
