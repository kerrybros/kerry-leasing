import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata } from 'next';
import './globals.css';
import Providers from './providers';
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";
import { CLERK_POST_AUTH_PATH } from '@/lib/clerkAuthPaths';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Kerry Leasing - Customer Portal',
  description: 'Fleet management and telematics portal',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const signInFallback =
    process.env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL ?? CLERK_POST_AUTH_PATH;
  const signUpFallback =
    process.env.NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL ?? CLERK_POST_AUTH_PATH;

  return (
    <ClerkProvider
      signInFallbackRedirectUrl={signInFallback}
      signUpFallbackRedirectUrl={signUpFallback}
      appearance={{
        elements: {
          footer: 'hidden',
        },
      }}
    >
      <html lang="en" suppressHydrationWarning className={cn("font-sans", inter.variable)}>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
          <script
            dangerouslySetInnerHTML={{
              __html: `
                (function() {
                  const theme = localStorage.getItem('theme') ||
                    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
                  document.documentElement.setAttribute('data-theme', theme);
                  document.documentElement.classList.toggle('dark', theme === 'dark');
                })();
              `,
            }}
          />
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){try{var b=localStorage.getItem('brandVars');if(b){var v=JSON.parse(b);var r=document.documentElement;Object.entries(v).forEach(function(e){r.style.setProperty(e[0],e[1]);});}}catch(e){}})();`,
            }}
          />
        </head>
        <body>
          <Providers>
            {children}
          </Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
