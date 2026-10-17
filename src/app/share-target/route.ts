import { NextResponse } from "next/server";

/**
 * The manifest's share target (public/manifest.json) POSTs shared files here. Normally the service worker
 * (public/sw.js) catches that request first and parks the files for the /share page. This is only the fallback
 * for the very first share, before the worker has taken control: it can't carry the files, but it still lands
 * on the /share page, which explains how to add them.
 */
export function POST(request: Request) {
  return NextResponse.redirect(new URL("/share", request.url), 303);
}
