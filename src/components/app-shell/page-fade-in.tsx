"use client";

import { usePathname } from "next/navigation";

/**
 * Fades the routed page's own content in on mount instead of it just popping into place —
 * pairs with RouteProgressBar finishing, so the bar completing hands off to something rather
 * than vanishing into a page that was already fully there.
 *
 * `key={pathname}` is what replays the animation on every genuine navigation: Next's App
 * Router already unmounts/remounts the actual route component when the pathname changes (a
 * different page.tsx), so this adds no *extra* remounting beyond what already happens there —
 * it just gives that already-happening swap something to animate. A same-page change that only
 * touches the query string (a tab switch via ?tab=, a report's own filters) leaves the
 * pathname, and so this key, untouched, which is deliberate: those aren't "opening a page".
 */
export function PageFadeIn({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="animate-page-in">
      {children}
    </div>
  );
}
