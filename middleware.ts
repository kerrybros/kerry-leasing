import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

// Define which routes require authentication
// All routes under /portal (including /portal/fleet) will be protected
const isProtectedRoute = createRouteMatcher([
  '/portal(.*)',
])

export default clerkMiddleware(async (auth, req) => {
  // Next.js 15 requires async/await for auth operations
  // This properly handles the headers() API in Next.js 15
  if (isProtectedRoute(req)) {
    await auth.protect() // Use await for Next.js 15 compatibility
  }
})

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}