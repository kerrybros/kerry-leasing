/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@kerry-leasing/shared'],

  /**
   * A CSP that only set `form-action` was blocking Clerk: `clerk.browser.js` and
   * related assets need script-src / connect-src / frame-src. This follows Clerk’s
   * best-practice shape (FAPI = clerk.<your-domain>).
   * @see https://clerk.com/docs/security/clerk-csp
   */
  async headers() {
    const fapi = 'https://clerk.kerryleasing.com';
    // Next dev + Clerk may need 'unsafe-eval'; omit in production per Clerk CSP guidance
    const devEval = process.env.NODE_ENV !== 'production' ? " 'unsafe-eval'" : '';
    // Service Log (Excel/SharePoint embed) + Microsoft 365 iframes need explicit frame-src
    const msFrame =
      'https://*.sharepoint.com https://*.sharepoint-df.com https://embed.office.com https://*.officeapps.live.com https://view.officeapps.live.com';
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${devEval} https: http: https://challenges.cloudflare.com ${fapi} https://*.clerk.accounts.dev`,
      `connect-src 'self' https: wss: ${fapi} https://*.clerk.accounts.dev https://clerk-telemetry.com https://*.clerk-telemetry.com`,
      "img-src 'self' data: https: https://img.clerk.com",
      "style-src 'self' 'unsafe-inline'",
      `frame-src 'self' https://challenges.cloudflare.com https://*.js.stripe.com https://js.stripe.com ${fapi} https://*.clerk.accounts.dev ${msFrame}`,
      "worker-src 'self' blob:",
      `form-action 'self' ${fapi}`,
    ].join('; ');

    return [
      {
        source: '/(.*)',
        headers: [{ key: 'Content-Security-Policy', value: csp }],
      },
    ];
  },

  /** Use one host for Clerk session + redirect_url (avoids kerryleasing.com vs www issues). */
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'kerryleasing.com' }],
        destination: 'https://www.kerryleasing.com/:path*',
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;
