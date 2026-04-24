import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isPublicRoute = createRouteMatcher(['/', '/sign-in(.*)', '/sign-up(.*)']);
const isSignUpRoute = createRouteMatcher(['/sign-up(.*)']);

export default clerkMiddleware(
  (auth, request) => {
    // Only allow /sign-up when it carries a Clerk invitation ticket.
    // Direct visits bounce to /sign-in so accounts can only be created by invitation.
    if (isSignUpRoute(request)) {
      const hasInviteTicket = request.nextUrl.searchParams.has('__clerk_ticket');
      if (!hasInviteTicket) {
        return NextResponse.redirect(new URL('/sign-in', request.url));
      }
    }
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
