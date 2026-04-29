"use server"

import { requireSession } from "@/services/auth/session"
import { getProfile } from "@/services/auth/requests/profile"
import type { PersonalInfo } from "./types"

export async function getProfileAction(): Promise<PersonalInfo> {
  const session = await requireSession()
  const result = await getProfile(session.userId)

  if (!result.success) {
    throw new Error(result.error.message || "Не удалось получить данные пользователя")
  }

  const user    = result.data.user
  const profile = user?.human?.profile
  const email   = user?.human?.email

  return {
    id: user?.id ?? "",
    firstName: profile?.givenName ?? "",
    lastName:  profile?.familyName ?? "",
    email:     email?.email ?? "",
    isEmailVerified: email?.isVerified ?? false,
    position:  "Пациент",
    avatarUrl: profile?.avatarUrl ?? undefined,
  }
}
