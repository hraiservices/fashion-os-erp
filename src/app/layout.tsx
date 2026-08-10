import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Per-deployment white-labeling: since each customer already runs a separate deployment (see
// src/lib/entitlements.ts's architecture notes), the app name is a build-time env var rather
// than a runtime Supabase read — avoids converting this static metadata export into an async
// generateMetadata(). Favicon/theme-color are swapped per-deployment at the file level instead
// (public/icon*.svg, viewport.themeColor below) — see docs/module-licensing-runbook.md.
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Stitching Manager Pro";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Tailoring shop management — orders, CRM, billing, reports.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon.svg",
    apple: "/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_NAME,
  },
};

export const viewport: Viewport = {
  themeColor: "#6D28D9",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      {/* suppressHydrationWarning: browser extensions (Grammarly, etc.) inject attributes like
          data-gr-ext-installed onto <body> before React hydrates, which otherwise trips a
          hydration-mismatch warning that has nothing to do with our own code. */}
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
