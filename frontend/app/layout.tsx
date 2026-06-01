import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "./providers";
import { InstallBanner } from "./_components/InstallBanner";
import { NetworkStatus } from "./_components/NetworkStatus";
import { ServiceWorkerRegistrar } from "./_components/ServiceWorkerRegistrar";
import { WebAppBootstrap } from "./_components/WebAppBootstrap";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI MedIncident",
  description: "AI MedIncident Platform",
  applicationName: "AI MedIncident",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "MedIncident",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/app-icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: [{ url: "/icons/app-icon.svg", type: "image/svg+xml" }],
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased scroll-smooth`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background">
        <WebAppBootstrap />
        <Providers>
          {children}
          <InstallBanner />
          <NetworkStatus />
          <ServiceWorkerRegistrar />
        </Providers>
      </body>
    </html>
  );
}
