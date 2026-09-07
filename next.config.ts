import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  // Browsers request /favicon.ico directly regardless of the <link rel="icon"> tag that
  // metadata.icons generates — without this rewrite that bare request 404s (there's no static
  // src/app/favicon.ico anymore, on purpose: a static file there would permanently shadow a
  // shop's uploaded favicon/logo, which is exactly the "can't get rid of the default icon" bug
  // this exists to prevent) and browsers fall back to a generated icon instead of the real one.
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/api/branding/icon" }];
  },
};

export default nextConfig;
