import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PAGE = '/form';
const PUBLIC_API = '/api/public/team-registration';

function isFormOnlyPublicSurface(): boolean {
  if (process.env.NODE_ENV === 'development') {
    return process.env.PUBLIC_FORM_ONLY === '1' || process.env.PUBLIC_FORM_ONLY === 'true';
  }

  const flag = (process.env.PUBLIC_FORM_ONLY || '').trim().toLowerCase();
  if (flag === '1' || flag === 'true' || flag === 'yes') return true;
  if (flag === '0' || flag === 'false' || flag === 'no') return false;

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').toLowerCase();
  return appUrl.includes('event-platform-aiclub.vercel.app');
}

function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    /\.(ico|png|jpg|jpeg|gif|webp|svg|css|js|map|txt|woff2?)$/i.test(pathname)
  );
}

export function middleware(request: NextRequest) {
  if (!isFormOnlyPublicSurface()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    if (pathname === PUBLIC_API && (request.method === 'POST' || request.method === 'OPTIONS')) {
      return NextResponse.next();
    }
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (pathname === PUBLIC_PAGE) {
    return NextResponse.next();
  }

  return new NextResponse('Not found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
