"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import { loginAction } from "@/services/auth/actions";

export function AutoSignIn() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    void loginAction(callbackUrl);
  }, [callbackUrl]);

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">Перенаправление на авторизацию…</p>
    </div>
  );
}
