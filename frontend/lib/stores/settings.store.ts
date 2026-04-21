"use client"

import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

export type FontSize = "md" | "lg" | "xl"
export type Contrast = "normal" | "high-white"
export type LetterSpacing = "normal" | "md" | "lg"

interface SettingsState {
  fontSize: FontSize
  animations: boolean
  contrast: Contrast
  letterSpacing: LetterSpacing

  setFontSize: (size: FontSize) => void
  setAnimations: (enabled: boolean) => void
  setContrast: (contrast: Contrast) => void
  setLetterSpacing: (spacing: LetterSpacing) => void
  resetAccessibility: () => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      fontSize: "md",
      animations: true,
      contrast: "normal",
      letterSpacing: "normal",

      setFontSize: (fontSize) => set({ fontSize }),
      setAnimations: (animations) => set({ animations }),
      setContrast: (contrast) => set({ contrast }),
      setLetterSpacing: (letterSpacing) => set({ letterSpacing }),
      resetAccessibility: () =>
        set({
          fontSize: "md",
          animations: true,
          contrast: "normal",
          letterSpacing: "normal",
        }),
    }),
    {
      name: "app-settings-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        fontSize: state.fontSize,
        animations: state.animations,
        contrast: state.contrast,
        letterSpacing: state.letterSpacing,
      }),
    }
  )
)
