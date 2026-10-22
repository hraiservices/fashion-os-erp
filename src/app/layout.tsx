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
    // Dynamic — serves the shop's own uploaded favicon/logo (Settings → Personalize) once one
    // is set, falling back to the default scissors icon otherwise. See that route's comment.
    // `apple` used to point at the static default /icon-192.png regardless of what a shop
    // uploaded, so an uploaded logo never actually showed up as the Home Screen/bookmark icon
    // on iOS — pointing at a dynamic route fixes that. The touch icon is the padded app-icon variant so launcher masks don't clip a wide logo.
    icon: "/api/branding/icon",
    apple: "/api/branding/app-icon?size=180",
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
  // Explicit, not left to Next's defaults: Next only emits the <meta name="viewport"> keys
  // actually present on this object, so a version of this file that specified viewportFit/
  // themeColor without width/initialScale rendered a viewport tag with NO width=device-width at
  // all. Without it, some mobile browsers (Xiaomi/MIUI's Chrome-based browser in particular) fall
  // back to laying the page out at a fixed desktop-ish viewport width and pillarboxing it — a
  // narrow rendered column with blank space filling the rest of the actual screen, in both
  // orientations, exactly matching the "distorted tablet dashboard" report.
  width: "device-width",
  initialScale: 1,
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
            __html: `(function(){try{var c=JSON.parse(localStorage.getItem("shop-font-config"));if(!c)return;var h=document.documentElement;h.style.setProperty("font-family",'"'+c.family+'", sans-serif');h.style.setProperty("font-weight",String(c.weight));h.style.setProperty("font-size",c.size+"px");var l=document.createElement("link");l.id="sw-google-font-link";l.rel="stylesheet";l.href="https://fonts.googleapis.com/css2?family="+c.family.replace(/\\s+/g,"+")+":wght@"+c.weight+"&display=swap";document.head.appendChild(l);}catch(e){}})();`,
          }}
        />
        {/* Same reasoning as the font script above, for the shop's accent color, sidebar style,
            and corner radius (cached by ColorThemeLoader in localStorage): without this, every
            load — not just the first — painted the default black/white theme for a moment before
            ColorThemeLoader's Supabase fetch resolved and swapped it to the shop's actual color,
            since that swap was happening in a useEffect with nothing to go on until then. The id
            lists here must stay in sync with src/lib/color-themes.ts (COLOR_THEMES/SIDEBAR_STYLES/
            CORNER_STYLES) — this script runs before any app code is loaded, so it can't import
            from there. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var c=JSON.parse(localStorage.getItem("shop-color-config"));if(!c)return;var h=document.documentElement;["default","violet","blue","indigo","sky","cyan","teal","emerald","amber","orange","rose","pink","slate"].forEach(function(t){h.classList.remove("theme-"+t)});if(c.colorTheme)h.classList.add("theme-"+c.colorTheme);["dark","black","light","colored"].forEach(function(s){h.classList.remove("sidebar-"+s)});if(c.sidebarStyle)h.classList.add("sidebar-"+c.sidebarStyle);var radii={sharp:"0rem",small:"0.3rem",default:"0.625rem",large:"1rem",full:"1.5rem"};if(c.cornerStyle&&radii[c.cornerStyle])h.style.setProperty("--radius",radii[c.cornerStyle]);}catch(e){}})();`,
          }}
        />
      </head>
      {/* suppressHydrationWarning: browser extensions (Grammarly, etc.) inject attributes like
          data-gr-ext-installed onto <body> before React hydrates, which otherwise trips a
          hydration-mismatch warning that has nothing to do with our own code. */}
      {/* On phones/tablets (below lg) body is pinned to the viewport (fixed + overflow-hidden) instead of scrolling itself; on computer screens the normal page scroll is used, since the pinned layout could clip the bottom of long pages there —
          mobile Safari's rubber-band bounce on the document/body can't be fully suppressed by CSS
          (overscroll-behavior only stops scroll-chaining there, not the bounce itself), so the
          real scrolling happens one level down on #scroll-root, which contains its bounce inside
          its own bg-background box instead of revealing whatever sits behind the document. */}
      <body className="bg-background max-lg:fixed max-lg:inset-0 max-lg:overflow-hidden" suppressHydrationWarning>
        <div id="scroll-root" className="flex w-full flex-col bg-background max-lg:h-full max-lg:overflow-y-auto max-lg:overscroll-contain [-webkit-overflow-scrolling:touch]">
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}
