import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kerry Leasing - Customer Portal',
  description: 'Fleet management and telematics portal',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
          <script
            dangerouslySetInnerHTML={{
              __html: `
                (function() {
                  const theme = localStorage.getItem('theme') || 'dark';
                  document.documentElement.setAttribute('data-theme', theme);
                })();
              `,
            }}
          />
        </head>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
