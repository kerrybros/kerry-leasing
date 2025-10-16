/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable experimental features for better performance
  experimental: {
    optimizePackageImports: ['mapbox-gl', 'react-map-gl']
  },
  
  // Configure webpack for Mapbox GL JS
  webpack: (config, { isServer }) => {
    // Mapbox GL JS requires some Node.js modules that aren't available in the browser
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      }
    }
    
    return config
  },
  
  // Add CSP headers for Mapbox
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: `
              default-src 'self';
              script-src 'self' 'unsafe-eval' 'unsafe-inline' https://api.mapbox.com https://*.clerk.accounts.dev https://*.clerk.dev;
              style-src 'self' 'unsafe-inline' https://api.mapbox.com https://*.clerk.accounts.dev https://*.clerk.dev;
              img-src 'self' data: https: https://api.mapbox.com https://*.clerk.accounts.dev https://*.clerk.dev;
              connect-src 'self' https://api.mapbox.com https://events.mapbox.com https://*.clerk.accounts.dev https://*.clerk.dev https://api.clerk.dev https://clerk-telemetry.com;
              worker-src 'self' blob:;
              frame-src 'self' https://*.clerk.accounts.dev https://*.clerk.dev;
            `.replace(/\s+/g, ' ').trim()
          }
        ]
      }
    ]
  }
}

module.exports = nextConfig