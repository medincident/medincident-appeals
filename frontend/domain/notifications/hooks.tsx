"use client"

import useSWR from "swr"

import { getNotificationsAction, markAllReadAction } from "./actions"
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

export function useNotificationsController() {
  const { notifications, mutate } = useNotifications()
  const unreadCount = notifications.filter((n) => !n.read).length

  const markAllRead = async () => {
    if (unreadCount === 0) return
    await mutate(await markAllReadAction(), false)
  }

  return { notifications, unreadCount, markAllRead }
}
