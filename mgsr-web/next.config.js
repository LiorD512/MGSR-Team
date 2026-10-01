/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // satori ships HarfBuzz as hb.wasm and loads it relative to its own
    // package; bundling it leaves the .wasm behind and text shaping fails at
    // runtime. Keeping it external makes it resolve from node_modules.
    serverComponentsExternalPackages: [
      'header-generator',
      'generative-bayesian-network',
      'satori',
    ],
  },
  async headers() {
    return [
      {
        source: '/firebase-messaging-sw.js',
        headers: [
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'Cache-Control', value: 'no-cache' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
