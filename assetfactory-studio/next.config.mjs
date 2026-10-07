import { fileURLToPath } from 'node:url';

const studioRoot = fileURLToPath(new URL('.', import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: studioRoot,
  },
  async headers() {
    return [{
      source: '/:path*',
      headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }],
    }];
  },
};

export default nextConfig;

