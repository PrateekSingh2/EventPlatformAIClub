import type { NextConfig } from 'next';
import path from 'path';
import { fileURLToPath } from 'url';

const monorepoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingRoot: monorepoRoot,
  // Vercel bundles were ~87MB/route because webpack cache packs were traced into lambdas.
  outputFileTracingExcludes: {
    '*': [
      '**/.next/cache/**',
      '**/node_modules/.cache/**',
      '**/cache/webpack/**',
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  webpack: (config, { isServer, dev }) => {
    // Disable Webpack filesystem cache in development on Windows
    // to prevent PackFileCacheStrategy ENOENT / EPERM file-locking crashes
    if (dev) {
      config.cache = false;
    }

    // Enable browser fallback shims only on the client side
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
};

export default nextConfig;
