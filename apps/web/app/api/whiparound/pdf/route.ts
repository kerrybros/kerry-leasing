import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_HOSTS = ['whip-around.com', 's3.amazonaws.com', 's3.us-east-1.amazonaws.com'];

function isAllowedUrl(raw: string): boolean {
  try {
    const { protocol, hostname } = new URL(raw);
    if (protocol !== 'https:') return false;
    return ALLOWED_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  const url = req.nextUrl.searchParams.get('url');
  if (!url || !isAllowedUrl(url)) {
    return new NextResponse('Invalid or disallowed URL', { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(url);
  } catch {
    return new NextResponse('Failed to fetch PDF', { status: 502 });
  }

  if (!upstream.ok) {
    return new NextResponse('Upstream error', { status: upstream.status });
  }

  const headers = new Headers();
  headers.set('Content-Type', 'application/pdf');
  headers.set('Content-Disposition', 'inline; filename="dvir.pdf"');
  const length = upstream.headers.get('content-length');
  if (length) headers.set('Content-Length', length);

  return new NextResponse(upstream.body, { status: 200, headers });
}
