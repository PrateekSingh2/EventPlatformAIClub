import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PAGE = '/form';
const PUBLIC_API = '/api/public/team-registration';

function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    /\.(ico|png|jpg|jpeg|gif|webp|svg|css|js|map|txt|woff2?)$/i.test(pathname)
  );
}

export function middleware(request: NextRequest) {
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
