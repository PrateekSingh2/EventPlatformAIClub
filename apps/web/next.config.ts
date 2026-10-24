import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
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
