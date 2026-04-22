/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@kerry-leasing/shared'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            // Allow forms to submit to Clerk's frontend API subdomain
            value: "form-action 'self' https://clerk.kerryleasing.com",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
