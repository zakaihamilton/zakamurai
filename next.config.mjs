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
};

export default nextConfig;
