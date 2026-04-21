"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { Monitor, Moon, Sun } from "lucide-react"

import { cn } from "@/lib/utils"

const THEMES = [
  { value: "light",  label: "Светлая",   icon: Sun },
  { value: "dark",   label: "Тёмная",    icon: Moon },
  { value: "system", label: "Системная", icon: Monitor },
] as const

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  return (
    <div className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-muted p-1">
      {THEMES.map(({ value, label, icon: Icon }) => {
        const isActive = mounted && theme === value
        return (
          <button
            key={value}
            onClick={() => setTheme(value)}
            title={label}
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium transition-all duration-200",
              isActive
                ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        )
      })}
    </div>
  )
}
