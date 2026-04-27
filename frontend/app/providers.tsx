"use client";

import * as React from "react";
import { SessionProvider, useSession } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { SWRConfig } from "swr";

import { Toaster } from "@/components/ui/sonner";
import { localStorageProvider } from "@/lib/swrCacheProvider";
import { localLogoutAction } from "@/services/auth/actions";
import { SessionExpiredDialog } from "./_components/SessionExpiredDialog";
import { SettingsProvider } from "./_components/SettingsProvider";

function SessionGuard({ children }: { children: React.ReactNode }) {
  const { data, status } = useSession();
  const loggingOutRef = React.useRef(false);

  // RefreshAccessTokenError = был залогинен, refresh-токен умер.
  // Показываем диалог «войдите заново» — автоматически выкидывать нельзя,
  // пользователь может потерять несохранённые данные.
  const refreshFailed = (data as any)?.error === "RefreshAccessTokenError";

  React.useEffect(() => {
    if (status === "loading") return;
    if (loggingOutRef.current) return;
    if (refreshFailed) return;

    // "unauthenticated" без предыдущей сессии — обычный кейс, уводим на /login
    // (там AutoSignIn сам редиректит в Zitadel).
    if (status === "unauthenticated") {
      loggingOutRef.current = true;
      void localLogoutAction();
    }
  }, [status, refreshFailed]);

  return (
    <>
      {children}
      <SessionExpiredDialog open={refreshFailed} />
    </>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider
      // 60s = синхронизируем с ACCESS_TOKEN_MAX_AGE_MS в services/auth/auth.ts,
      // чтобы revoke сессии в Zitadel ловился максимум за минуту.
      refetchInterval={60}
      refetchOnWindowFocus
    >
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem
        disableTransitionOnChange
      >
        <SessionGuard>
          <SWRConfig value={{ provider: localStorageProvider }}>
            <SettingsProvider>
              {children}
              <Toaster position="top-center" offset={72} mobileOffset={64} />
            </SettingsProvider>
          </SWRConfig>
        </SessionGuard>
      </ThemeProvider>
    </SessionProvider>
  );
}
