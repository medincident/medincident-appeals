"use client";

import * as React from "react";
import { SessionProvider, useSession } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { SWRConfig } from "swr";

import { Toaster } from "@/components/ui/sonner";
import { localStorageProvider } from "@/lib/swrCacheProvider";
import { clearOfflineData } from "@/lib/offline/cleanup";
import { WebAppProvider } from "@/lib/webapp/context";
import { localLogoutAction } from "@/services/auth/actions";
import { SessionErrorCode } from "@/services/auth/errors";
import { SessionExpiredDialog } from "./_components/SessionExpiredDialog";
import { SettingsProvider } from "./_components/SettingsProvider";

function SessionGuard({ children }: { children: React.ReactNode }) {
  const { data, status } = useSession();
  const loggingOutRef = React.useRef(false);

  const refreshFailed = data?.error === SessionErrorCode.RefreshAccessTokenError;

  React.useEffect(() => {
    if (status === "loading") return;
    if (loggingOutRef.current) return;
    if (refreshFailed) return;

    if (status === "unauthenticated") {
      loggingOutRef.current = true;
      void (async () => {
        await clearOfflineData();
        await localLogoutAction();
      })();
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
      refetchInterval={60}
      refetchOnWindowFocus
    >
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem
        disableTransitionOnChange
      >
        <WebAppProvider>
          <SessionGuard>
            <SWRConfig value={{ provider: localStorageProvider }}>
              <SettingsProvider>
                {children}
                <Toaster position="top-center" offset={72} mobileOffset={64} />
              </SettingsProvider>
            </SWRConfig>
          </SessionGuard>
        </WebAppProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
