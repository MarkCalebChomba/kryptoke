/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  typescript: {
    ignoreBuildErrors: true,
  },

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co",          pathname: "/storage/v1/object/public/**" },
      { protocol: "https", hostname: "s2.coinmarketcap.com",   pathname: "/static/img/coins/**" },
      { protocol: "https", hostname: "assets.coingecko.com",   pathname: "/coins/images/**" },
      { protocol: "https", hostname: "coin-images.coingecko.com", pathname: "/**" },
      { protocol: "https", hostname: "s3.tradingview.com",     pathname: "/**" },
    ],
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options",          value: "DENY" },
          { key: "X-Content-Type-Options",    value: "nosniff" },
          { key: "X-XSS-Protection",          value: "1; mode=block" },
          { key: "Referrer-Policy",           value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy",        value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://s3.tradingview.com https://*.sentry.io",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https://*.supabase.co https://dd.dexscreener.com https://s3.tradingview.com https://s2.coinmarketcap.com https://assets.coingecko.com https://coin-images.coingecko.com",
              [
                "connect-src 'self'",
                "http://localhost:*",
                "https://*.vercel.app",
                "https://kryptoke.odapap.com",
                "wss://stream.binance.com:9443",
                "wss://ws.okx.com:8443",
                "https://*.supabase.co",
                "wss://*.supabase.co",
                "https://*.upstash.io",
                "https://*.sentry.io",
                "https://api.binance.com",
                "https://api.alternative.me",
                "https://api.frankfurter.app",
                "wss://pushstream.tradingview.com",
                "wss://*.tradingview.com",
                "https://eth.llamarpc.com",
                "https://bsc-dataseed.binance.org",
                "https://bsc-dataseed1.binance.org",
                "https://polygon-rpc.com",
                "https://arb1.arbitrum.io",
                "https://mainnet.optimism.io",
                "https://mainnet.base.org",
                "https://rpc.ftm.tools",
                "https://api.avax.network",
                "https://rpc.linea.build",
                "https://mainnet.era.zksync.io",
                "https://rpc.scroll.io",
                "https://rpc.mantle.xyz",
                "https://rpc.gnosischain.com",
                "https://forno.celo.org",
                "https://ltc1.trezor.io",
                "https://api.blockcypher.com",
                "https://bch1.trezor.io",
                "https://api.trongrid.io",
                "https://xrplcluster.com",
                "https://toncenter.com",
                "https://horizon.stellar.org",
                "https://rpc.mainnet.near.org",
                "https://api.mainnet-beta.solana.com",
                "https://blockstream.info",
              ].join(" "),
              "frame-src https://s.tradingview.com https://www.tradingview.com",
              "worker-src 'self' blob:",
            ].join("; "),
          },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            // Wildcard in dev, locked to your actual domains in prod
            value: process.env.NODE_ENV === "production"
              ? (process.env.NEXT_PUBLIC_APP_URL ?? "https://kryptoke-mu.vercel.app")
              : "*",
          },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, PUT, PATCH, DELETE, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization, X-Sweep-Secret, X-Cron-Secret" },
          { key: "Access-Control-Max-Age",       value: "86400" },
        ],
      },
    ];
  },
};

export default nextConfig;
