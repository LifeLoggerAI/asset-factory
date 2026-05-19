/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: __dirname,
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
