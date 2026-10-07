import { fileURLToPath } from 'node:url';

// pnpm links Next and shared dependencies from this repository's workspace.
const workspaceRoot = fileURLToPath(new URL('..', import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: workspaceRoot,
  },
};

export default nextConfig;
