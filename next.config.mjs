import path from 'node:path';
import { fileURLToPath } from 'node:url';
import withBundleAnalyzer from '@next/bundle-analyzer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const bundleAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { webpack }) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      topLevelAwait: true,
      layers: true,
    };
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      os: false,
      url: false,
      util: false,
      stream: false,
      buffer: false,
      child_process: false,
    };
    config.resolve.alias = {
      ...config.resolve.alias,
      'node:fs': false,
      'node:path': false,
      'node:os': false,
      'node:url': false,
      'node:util': false,
      'node:stream': false,
      'node:buffer': false,
      child_process: false,
    };
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
        resource.request = resource.request.replace(/^node:/, '');
      }),
    );
    return config;
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
          // The browser-local preview can be opened in a tab and receives its
          // in-memory project from this window over a validated MessageChannel.
          // Preserve that opener across the two isolated origins.
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
          // The IDE embeds the preview from a separate origin. This must be a
          // route header (rather than only a middleware response header), as
          // Vercel can serve prerendered routes from cache after a rewrite.
          { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
          {
            key: 'Content-Security-Policy',
            value:
              'frame-ancestors https://www.zakamurai.com https://zakamurai.com http://localhost:3000',
          },
        ],
      },
      {
        source: '/__sw__.js',
        headers: [
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
      {
        source: '/__preview_sw__.js',
        headers: [
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
    ];
  },
};

export default bundleAnalyzer(nextConfig);
