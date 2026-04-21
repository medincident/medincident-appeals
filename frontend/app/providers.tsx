"use client";

import * as React from "react";
import { SessionProvider, useSession } from "next-auth/react";
import { ThemeProvider } from "next-themes";

import { Toaster } from "@/components/ui/sonner";
import { logoutAction } from "@/services/auth/actions";
import { SettingsProvider } from "./_components/SettingsProvider";

function SessionGuard({ children }: { children: React.ReactNode }) {
  const { data, status } = useSession();
  const loggingOutRef = React.useRef(false);

  React.useEffect(() => {
    if (status === "loading") return;
    if (loggingOutRef.current) return;

    const shouldLogout =
      status === "unauthenticated" || (data as any)?.error === "RefreshAccessTokenError";

    if (shouldLogout) {
      loggingOutRef.current = true;
      void logoutAction();
    }
  }, [status, data]);

  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider
      refetchInterval={5 * 60}
      refetchOnWindowFocus
    >
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem
        disableTransitionOnChange
      >
        <SessionGuard>
          <SettingsProvider>
            {children}
            <Toaster position="top-center" />
          </SettingsProvider>
        </SessionGuard>
      </ThemeProvider>
    </SessionProvider>
  );
}
