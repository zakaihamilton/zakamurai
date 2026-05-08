/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      topLevelAwait: true,
      layers: true,
    };
    return config;
  },
  turbopack: {
    rules: {
      '*.wasm': {
        loaders: ['wasm-loader'],
        as: '*.js',
      },
    },
  },
  async headers() {
    return [
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
  async rewrites() {
    return {
      // beforeFiles rewrites are checked before pages/public files
      // This ensures /preview/* requests don't 404 on the server
      // and instead fall through to be handled by the Service Worker
      beforeFiles: [
        {
          source: '/preview/:path*',
          destination: '/',
        },
      ],
    };
  },
};

export default nextConfig;
