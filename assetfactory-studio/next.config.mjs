import { fileURLToPath } from "node:url";

const studioRoot = fileURLToPath(new URL(".", import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: studioRoot,
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "https://urai-4dc1d.web.app/api/:path*",
      },
    ];
  },
};

export default nextConfig;
