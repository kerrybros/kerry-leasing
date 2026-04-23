import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher(['/', '/sign-in(.*)', '/sign-up(.*)']);

export default clerkMiddleware(
  (auth, request) => {
    if (!isPublicRoute(request)) {
      auth().protect();
    }
  },
  {
    // Verbose request/cookie logging; enable only when debugging auth (very noisy in dev)
    debug: process.env.CLERK_MIDDLEWARE_DEBUG === 'true',
  }
);

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
