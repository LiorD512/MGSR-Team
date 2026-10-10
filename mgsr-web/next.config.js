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
    // Marking satori external (above) stops it being bundled, but Vercel's
    // output file tracing then does NOT follow the HarfBuzz .wasm into the
    // serverless function — so at runtime satori aborts with
    // "ENOENT ... harfbuzzjs/hb.wasm". Force-include the wasm + its package
    // (and satori) into the matchday routes that render with it.
    outputFileTracingIncludes: {
      '/api/matchday/generate-v2': [
        './node_modules/harfbuzzjs/**',
        './node_modules/satori/**',
      ],
      '/api/matchday/generate': [
        './node_modules/harfbuzzjs/**',
        './node_modules/satori/**',
      ],
    },
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
