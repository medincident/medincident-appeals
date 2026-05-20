export type WebAppPlatform = "telegram" | "vk" | "max" | null

export type WebAppColorScheme = "light" | "dark"

export interface WebAppThemeParams {
  bg_color?: string
  text_color?: string
  hint_color?: string
  link_color?: string
  button_color?: string
  button_text_color?: string
  secondary_bg_color?: string
  header_bg_color?: string
  accent_text_color?: string
  section_bg_color?: string
  section_header_text_color?: string
  destructive_text_color?: string
}

export interface SafeAreaInsets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface WebAppInfo {
  platform: WebAppPlatform
  colorScheme: WebAppColorScheme
  themeParams: WebAppThemeParams
  /** Реальный встраиваемый клиент, без эмуляции через ENV. */
  isNative: boolean
  /** Эмуляция через NEXT_PUBLIC_WEBAPP_FORCE (для тестов вёрстки). */
  isForced: boolean
  insets: SafeAreaInsets
}

// Telegram Web App SDK — минимальные типы для интеграции.
export interface TelegramWebApp {
  platform: string
  colorScheme: WebAppColorScheme
  themeParams: WebAppThemeParams
  viewportHeight: number
  viewportStableHeight: number
  isExpanded: boolean
  safeAreaInset?: SafeAreaInsets
  contentSafeAreaInset?: SafeAreaInsets
  initData: string
  initDataUnsafe?: { user?: { id: number; first_name?: string; last_name?: string } }
  ready: () => void
  expand: () => void
  enableClosingConfirmation?: () => void
  disableVerticalSwipes?: () => void
  setHeaderColor?: (color: string) => void
  setBackgroundColor?: (color: string) => void
  onEvent: (event: string, cb: () => void) => void
  offEvent: (event: string, cb: () => void) => void
}

// VK Bridge — минимальный интерфейс через postMessage / window.vkBridge.
export interface VkBridge {
  send: (method: string, params?: Record<string, unknown>) => Promise<unknown>
  subscribe: (cb: (e: { detail: { type: string; data?: unknown } }) => void) => void
  unsubscribe: (cb: (e: { detail: { type: string; data?: unknown } }) => void) => void
}

// MAX WebApp Bridge (mini-app в мессенджере MAX). API похоже на TG: ready/expand/themeParams.
export interface MaxWebApp {
  platform?: string
  colorScheme?: WebAppColorScheme
  themeParams?: WebAppThemeParams
  ready?: () => void
  expand?: () => void
  onEvent?: (event: string, cb: () => void) => void
  offEvent?: (event: string, cb: () => void) => void
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp }
    vkBridge?: VkBridge
    MAX?: { WebApp?: MaxWebApp }
  }
}
