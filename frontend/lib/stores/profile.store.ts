"use client"

import { create } from "zustand"

// Профиль — это PII (ФИО, e-mail, должность). На диск (localStorage) не пишем
// по требованиям 152-ФЗ: при logout/закрытии вкладки данные должны исчезать.
// Источник истины — server-action getProfileAction (см. domain/profile/hooks),
// который SWR вытягивает на маунте каждой авторизованной страницы.

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

const empty: Omit<ProfileState, "setProfile" | "clearProfile"> = {
  id: null,
  firstName: null,
  lastName: null,
  middleName: null,
  photoUrl: null,
  email: null,
  isEmailVerified: false,
  position: null,
}

export const useProfileStore = create<ProfileState>()((set) => ({
  ...empty,
  setProfile: (data) => set(data),
  clearProfile: () => set(empty),
}))

if (typeof window !== "undefined") {
  // Подчищаем легаси-ключ от старой версии стора, которая писала профиль на диск.
  try { localStorage.removeItem("app-profile-storage") } catch {}
}
