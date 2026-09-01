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
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Fashion Flow";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Tailoring shop management — orders, CRM, billing, reports.",
  manifest: "/manifest.json",
  icons: {
    // Dynamic — serves the shop's own uploaded logo (Settings → Shop) once one is set,
    // falling back to the default scissors icon otherwise. See that route's comment.
    icon: "/api/branding/icon",
    apple: "/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    // "black-translucent" lets the app draw its own colored bar under the system status-bar
    // icons (via the safe-area-inset padding on the topbar/tab-bar) instead of iOS rendering
    // an opaque system bar on top of the app — this is what makes an installed PWA's status
    // bar look like part of the app rather than browser chrome sitting above it.
    statusBarStyle: "black-translucent",
    title: APP_NAME,
  },
};

export const viewport: Viewport = {
  // Lets the app draw under the notch/home-indicator area so env(safe-area-inset-*) resolves
  // to real values instead of 0 — required for the bottom tab bar and sheets to pad around them.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
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
      <head>
        {/* Warms the DNS/TLS connection for the Google Fonts request FontLoader is about to make,
            shaving a round-trip off however long the fallback font is visible for. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Applies the shop's last-loaded font choice (cached by FontLoader in localStorage) as
            early as possible — before React hydrates and before the fresh Supabase setting comes
            back — so a repeat visit doesn't show a visible swap from the fallback font to the
            shop's actual one. First-ever visit (nothing cached yet) still shows one unavoidable
            flash, same as before; this only fixes the far more common repeat-visit case. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var c=JSON.parse(localStorage.getItem("shop-font-config"));if(!c)return;var h=document.documentElement;h.style.setProperty("font-family",'"'+c.family+'", sans-serif');h.style.setProperty("font-weight",String(c.weight));var boost=window.innerWidth<=640?3:0;h.style.setProperty("font-size",(c.size+boost)+"px");var l=document.createElement("link");l.id="sw-google-font-link";l.rel="stylesheet";l.href="https://fonts.googleapis.com/css2?family="+c.family.replace(/\\s+/g,"+")+":wght@"+c.weight+"&display=swap";document.head.appendChild(l);}catch(e){}})();`,
          }}
        />
      </head>
      {/* suppressHydrationWarning: browser extensions (Grammarly, etc.) inject attributes like
          data-gr-ext-installed onto <body> before React hydrates, which otherwise trips a
          hydration-mismatch warning that has nothing to do with our own code. */}
      {/* body is pinned to the viewport (fixed + overflow-hidden) instead of scrolling itself —
          mobile Safari's rubber-band bounce on the document/body can't be fully suppressed by CSS
          (overscroll-behavior only stops scroll-chaining there, not the bounce itself), so the
          real scrolling happens one level down on #scroll-root, which contains its bounce inside
          its own bg-background box instead of revealing whatever sits behind the document. */}
      <body className="fixed inset-0 overflow-hidden bg-background" suppressHydrationWarning>
        <div id="scroll-root" className="flex h-full w-full flex-col overflow-y-auto overscroll-contain bg-background [-webkit-overflow-scrolling:touch]">
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}
