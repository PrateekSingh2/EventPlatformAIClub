import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PAGE = '/form';
const PUBLIC_API = '/api/public/team-registration';

/** Naitik Vercel project (form-only public site). Olive / Prateek repo deploys skip this. */
function isNaitikFormDeploy(): boolean {
    const owner = (process.env.VERCEL_GIT_REPO_OWNER || '').toLowerCase();
    const slug = (process.env.VERCEL_GIT_REPO_SLUG || '').toLowerCase();
    if (owner === 'naitikk-j' && slug === 'event-platform-aiclub') return true;

    const host = [
        process.env.NEXT_PUBLIC_APP_URL || '',
        process.env.VERCEL_URL || '',
        process.env.VERCEL_PROJECT_PRODUCTION_URL || '',
    ]
        .join(' ')
        .toLowerCase();

    return host.includes('event-platform-aiclub.vercel.app');
}

function isFormOnlyPublicSurface(): boolean {
    // Naitik Vercel project: always form-only — never open /admin, /arena, or other APIs via env override.
    if (isNaitikFormDeploy()) {
        return true;
    }

    if (process.env.NODE_ENV === 'development') {
        return process.env.PUBLIC_FORM_ONLY === '1' || process.env.PUBLIC_FORM_ONLY === 'true';
    }

    const flag = (process.env.PUBLIC_FORM_ONLY || '').trim().toLowerCase();
    if (flag === '0' || flag === 'false' || flag === 'no') return false;
    if (flag === '1' || flag === 'true' || flag === 'yes') return true;

    return false;
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
