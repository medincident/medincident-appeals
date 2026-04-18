export type NotificationType =
  | "processed"
  | "response"
  | "status_change"
  | "info"

export interface NotificationItem {
  id: string
  type: NotificationType
  title: string
  description: string
  read: boolean
  createdAt: string
  appealId: string | null
}
