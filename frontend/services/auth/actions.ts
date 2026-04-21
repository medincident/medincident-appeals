"use server";

import { signIn, signOut } from "./auth";

// MissingCSRF при client-side signOut обходится через Server Action — у него
// собственная защита через Next.js (origin check), CSRF-cookie Auth.js не нужен.
export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}

export async function loginAction(callbackUrl?: string): Promise<void> {
  await signIn("zitadel", { redirectTo: callbackUrl ?? "/" });
}
