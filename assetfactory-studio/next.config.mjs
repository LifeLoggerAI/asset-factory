import { fileURLToPath } from 'node:url';

// pnpm links Next and shared dependencies from this repository's workspace.
const workspaceRoot = fileURLToPath(new URL('..', import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }] }];
  },
  turbopack: {
    root: workspaceRoot,
  },
};

export default nextConfig;
