import { fileURLToPath } from 'node:url';

const studioRoot = fileURLToPath(new URL('.', import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: studioRoot,
  },
};

export default nextConfig;
