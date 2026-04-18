"use client"

import useSWR from "swr"

import { useProfileStore } from "@/lib/stores/profile.store"

export interface PersonalInfo {
  id: string
  firstName: string
  lastName: string
  middleName?: string
  email: string
  isEmailVerified: boolean
  position: string
  avatarUrl?: string
}

const PROFILE_API_KEY = "profile-me"

async function fetchProfile(): Promise<PersonalInfo> {
  const res = await fetch("/api/patient/me")
  if (!res.ok) throw new Error(`Не удалось загрузить профиль (${res.status})`)
  return res.json()
}

/**
 * Loads the authenticated user's profile, caches via SWR, and mirrors it into
 * the persistent zustand store so other components see data instantly on next
 * visit (no default-value flash).
 */
export function useProfileData() {
  const setProfile = useProfileStore((s) => s.setProfile)

  const { data, error, isLoading, isValidating, mutate } = useSWR<PersonalInfo>(
    PROFILE_API_KEY,
    fetchProfile,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      onSuccess: (user) => {
        setProfile({
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          middleName: user.middleName ?? null,
          photoUrl: user.avatarUrl ?? null,
          email: user.email,
          isEmailVerified: user.isEmailVerified,
          position: user.position,
        })
      },
    }
  )

  return {
    user: data,
    isLoading,
    isValidating,
    isError: error,
    mutate,
  }
}
