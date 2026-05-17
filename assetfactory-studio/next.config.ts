import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
