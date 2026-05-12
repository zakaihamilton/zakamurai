import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
      '@lancedb/lancedb-darwin-arm64': false,
      '@lancedb/lancedb-linux-x64-gnu': false,
      '@lancedb/lancedb-linux-arm64-gnu': false,
      '@lancedb/lancedb-linux-x64-musl': false,
      '@lancedb/lancedb-linux-arm64-musl': false,
      '@lancedb/lancedb-win32-x64-msvc': false,
      '@lancedb/lancedb-win32-arm64-msvc': false,
    };
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
        resource.request = resource.request.replace(/^node:/, '');
      }),
      new webpack.DefinePlugin({
        'process.platform': JSON.stringify('browser'),
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
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
      {
        // Allow Service Worker to control all routes
        source: '/__sw__.js',
        headers: [
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
    ];
  },
};

export default nextConfig;
