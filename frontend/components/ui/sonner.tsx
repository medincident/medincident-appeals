"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, ToasterProps } from "sonner"

const Toaster = (props: ToasterProps) => {
  const { resolvedTheme } = useTheme()
  return (
    <Sonner
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      closeButton
      swipeDirections={["left", "right", "top"]}
      style={
        {
          "--normal-bg":     "var(--card)",
          "--normal-text":   "var(--card-foreground)",
          "--normal-border": "var(--border)",

          "--success-bg":     "color-mix(in oklab, var(--success) 10%, var(--card))",
          "--success-text":   "var(--success)",
          "--success-border": "color-mix(in oklab, var(--success) 40%, transparent)",

          "--error-bg":     "color-mix(in oklab, var(--destructive) 10%, var(--card))",
          "--error-text":   "var(--destructive)",
          "--error-border": "color-mix(in oklab, var(--destructive) 40%, transparent)",

          "--info-bg":     "color-mix(in oklab, var(--primary) 10%, var(--card))",
          "--info-text":   "var(--primary)",
          "--info-border": "color-mix(in oklab, var(--primary) 40%, transparent)",

          "--warning-bg":     "color-mix(in oklab, var(--warning) 10%, var(--card))",
          "--warning-text":   "var(--warning)",
          "--warning-border": "color-mix(in oklab, var(--warning) 40%, transparent)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
