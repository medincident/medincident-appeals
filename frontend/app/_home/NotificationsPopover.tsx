"use client"

import Link from "next/link"
import { AlertCircle, Bell, Check, CheckCheck, HelpCircle } from "lucide-react"

import { useNotifications } from "@/domain/notifications/hooks"
import { markAllReadAction } from "@/domain/notifications/actions"
import type { NotificationItem as DomainNotification } from "@/domain/notifications/types"
import { timeAgo } from "@/lib/time"
import { usePopover } from "@/lib/usePopover"

function NotificationRow({ notification }: { notification: DomainNotification }) {
  const Icon =
    notification.type === "processed"      ? Check
    : notification.type === "response"     ? HelpCircle
    : notification.type === "status_change"? AlertCircle
    : HelpCircle

  const href = notification.appealId
    ? `/appeals?select_id=${encodeURIComponent(notification.appealId)}`
    : null

  const body = (
    <>
      <div className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className="text-xs font-semibold text-popover-foreground leading-snug flex-1">
            {notification.title}
          </p>
          {!notification.read && (
            <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 mt-1.5" />
          )}
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5 line-clamp-2">
          {notification.description}
        </p>
        <p className="text-[10px] text-muted-foreground mt-1">{timeAgo(notification.createdAt)}</p>
      </div>
    </>
  )

  const className =
    "flex items-start gap-3 px-4 py-3 border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors"

  return href ? (
    <Link href={href} className={className}>{body}</Link>
  ) : (
    <div className={className}>{body}</div>
  )
}

export function NotificationsPopover() {
  const { open, setOpen, rootRef } = usePopover()
  const { notifications, mutate } = useNotifications()

  const unreadCount = notifications.filter((i) => !i.read).length

  async function markAllRead() {
    const updated = await markAllReadAction()
    await mutate(updated, false)
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
        aria-label="Уведомления"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
        )}
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 w-80 rounded-lg border border-border bg-popover shadow-xl z-30 animate-fade-in overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-3.5 pb-3 border-b border-border">
            <p className="text-sm font-semibold text-popover-foreground">Уведомления</p>
            <button
              type="button"
              onClick={markAllRead}
              disabled={unreadCount === 0}
              className="flex items-center gap-1 text-xs text-primary hover:underline disabled:text-muted-foreground disabled:no-underline disabled:cursor-not-allowed"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Пометить все
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto scrollbar-app">
            {notifications.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">Уведомлений нет</p>
            ) : (
              notifications.map((n) => <NotificationRow key={n.id} notification={n} />)
            )}
          </div>

          <Link
            href="/appeals"
            onClick={() => setOpen(false)}
            className="block border-t border-border py-2.5 text-center text-xs font-medium text-primary hover:bg-muted/30 transition-colors"
          >
            Показать все
          </Link>
        </div>
      )}
    </div>
  )
}
