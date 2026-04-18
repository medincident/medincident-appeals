"use client"

import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

interface ProfileState {
  id: string | null
  firstName: string | null
  lastName: string | null
  middleName: string | null
  photoUrl: string | null
  email: string | null
  isEmailVerified: boolean
  position: string | null

  setProfile: (data: Partial<ProfileState>) => void
  clearProfile: () => void
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      id: null,
      firstName: null,
      lastName: null,
      middleName: null,
      photoUrl: null,
      email: null,
      isEmailVerified: false,
      position: null,

      setProfile: (data) => set(data),
      clearProfile: () =>
        set({
          id: null,
          firstName: null,
          lastName: null,
          middleName: null,
          photoUrl: null,
          email: null,
          isEmailVerified: false,
          position: null,
        }),
    }),
    {
      name: "app-profile-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        id: state.id,
        firstName: state.firstName,
        lastName: state.lastName,
        middleName: state.middleName,
        photoUrl: state.photoUrl,
        email: state.email,
        isEmailVerified: state.isEmailVerified,
        position: state.position,
      }),
    }
  )
)
