"use client";

import * as React from "react";
import { SessionProvider, signOut, useSession } from "next-auth/react";
import { ThemeProvider } from "next-themes";

import { Toaster } from "@/components/ui/sonner";

function SessionGuard({ children }: { children: React.ReactNode }) {
  const { data, status } = useSession();

  React.useEffect(() => {
    if (status === "loading") return;
    // Session lost on the server (expired / revoked) while page was open
    if (status === "unauthenticated") {
      signOut({ callbackUrl: "/" });
      return;
    }
    // Refresh token failed — same treatment
    if ((data as any)?.error === "RefreshAccessTokenError") {
      signOut({ callbackUrl: "/" });
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
          {children}
          <Toaster position="top-center" />
        </SessionGuard>
      </ThemeProvider>
    </SessionProvider>
  );
}
