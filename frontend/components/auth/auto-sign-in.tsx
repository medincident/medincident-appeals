"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

export function AutoSignIn() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";

  useEffect(() => {
    signIn("zitadel", { callbackUrl });
  }, [callbackUrl]);

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">Перенаправление на авторизацию…</p>
    </div>
  );
}
