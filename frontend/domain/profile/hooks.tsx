"use client"

import useSWR from "swr"

import { useProfileStore } from "@/lib/stores/profile.store"
import { getProfileAction } from "./actions"
import type { PersonalInfo } from "./types"

const PROFILE_KEY = "profile-me"

export function useProfileData() {
  const setProfile = useProfileStore((s) => s.setProfile)

  const { data, error, isLoading, isValidating, mutate } = useSWR<PersonalInfo>(
    PROFILE_KEY,
    getProfileAction,
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

  return { user: data, isLoading, isValidating, isError: error, mutate }
}
