import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from '@clerk/nextjs'
import { CustomerProvider } from '@/lib/use-customer'
import { QueryProvider } from '@/lib/providers/query-provider'
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Kerry Leasing - Fleet Management Portal",
  description: "Manage your fleet with Kerry Leasing's comprehensive portal",
  icons: {
    icon: '/Kerry Leasing with background.png',
    shortcut: '/Kerry Leasing with background.png',
    apple: '/Kerry Leasing with background.png',
  },
};

/**
 * Root Layout Component
 * 
 * This layout wraps the entire application with ClerkProvider for authentication.
 * ClerkProvider is configured to work with Next.js 15 App Router and handles:
 * - User session management
 * - Authentication state across the app
 * - Integration with Next.js 15 server components
 * 
 * Environment variables required:
 * - NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: Your Clerk publishable key
 * - CLERK_SECRET_KEY: Your Clerk secret key
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      appearance={{
        baseTheme: undefined,
        variables: {
          colorPrimary: '#2563eb', // Blue-600 from your design
          colorBackground: '#f8fafc', // Slate-50 background
          colorInputBackground: '#ffffff',
          colorInputText: '#1e293b', // Slate-800
          colorText: '#1e293b', // Slate-800
          colorTextSecondary: '#64748b', // Slate-500
          colorSuccess: '#059669',
          colorWarning: '#d97706',
          colorDanger: '#dc2626',
          colorNeutral: '#64748b',
          borderRadius: '0.75rem', // Rounded-xl to match your cards
          fontFamily: '"Inter", sans-serif',
          fontSize: '0.875rem'
        },
        elements: {
          // Modal and form container styling
          modalContent: {
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(8px)',
            borderRadius: '1rem',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
          },
          card: {
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(8px)',
            borderRadius: '1rem',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
          },
          // Header styling
          headerTitle: {
            color: '#1e293b',
            fontSize: '1.5rem',
            fontWeight: '600'
          },
          headerSubtitle: {
            color: '#64748b',
            fontSize: '0.875rem'
          },
          // Form elements
          formButtonPrimary: {
            backgroundColor: '#2563eb',
            borderRadius: '0.75rem',
            fontSize: '1rem',
            fontWeight: '600',
            padding: '0.75rem 1.5rem',
            transition: 'all 0.2s ease',
            '&:hover': {
              backgroundColor: '#1d4ed8',
              transform: 'scale(1.02)'
            }
          },
          formFieldInput: {
            backgroundColor: '#ffffff',
            borderColor: '#cbd5e1',
            borderRadius: '0.75rem',
            fontSize: '1rem',
            padding: '0.75rem 1rem',
            '&:focus': {
              borderColor: '#2563eb',
              boxShadow: '0 0 0 3px rgba(37, 99, 235, 0.1)'
            }
          },
          // Social buttons
          socialButtonsBlockButton: {
            backgroundColor: '#ffffff',
            borderColor: '#2563eb',
            borderWidth: '2px',
            borderRadius: '0.75rem',
            color: '#2563eb',
            fontSize: '1rem',
            fontWeight: '600',
            padding: '0.75rem 1.5rem',
            transition: 'all 0.2s ease',
            '&:hover': {
              backgroundColor: '#2563eb',
              color: '#ffffff',
              transform: 'scale(1.02)'
            }
          },
          // Links and text
          footerActionLink: {
            color: '#2563eb',
            fontSize: '0.875rem',
            fontWeight: '500',
            '&:hover': {
              color: '#1d4ed8'
            }
          },
          identityPreviewText: {
            color: '#64748b',
            fontSize: '0.875rem'
          },
          // Logo area
          logoImage: {
            height: '3rem',
            width: 'auto'
          },
          // Footer
          footer: {
            display: 'none' // Hide Clerk branding
          }
        }
      }}
      signInFallbackRedirectUrl="/portal"
      signUpFallbackRedirectUrl="/portal"
      signInUrl="/"
      signUpUrl="/"
        >
          <html lang="en">
            <body className={inter.className}>
              <QueryProvider>
                <CustomerProvider>
                  {children}
                </CustomerProvider>
              </QueryProvider>
            </body>
          </html>
        </ClerkProvider>
  );
}