import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ORIGIN = process.argv[2] || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const TEST_FILE = process.argv[3] || 'demo-stage-1.zip';
const BUCKET = 'stages';

if (!url || !key) { console.error('❌ Missing Supabase env vars'); process.exit(1); }
const supabase = createClient(url, key);

let failed = 0;
const ok = (m: string) => console.log(`✅ ${m}`);
const bad = (m: string) => { console.log(`❌ ${m}`); failed++; };

function corsOk(h: Headers) {
  const o = h.get('access-control-allow-origin');
  return o === '*' || o === ORIGIN;
}

async function preflight(target: string, method: string, label: string) {
  const r = await fetch(target, {
    method: 'OPTIONS',
    headers: {
      Origin: ORIGIN,
      'Access-Control-Request-Method': method,
      'Access-Control-Request-Headers': 'content-type',
    },
  });
  const methods = r.headers.get('access-control-allow-methods') || '';
  const headers = r.headers.get('access-control-allow-headers') || '';
  corsOk(r.headers) ? ok(`${label}: AllowedOrigins OK`) : bad(`${label}: origin not allowed`);
  (methods.includes(method) || methods.includes('*'))
    ? ok(`${label}: AllowedMethods includes ${method}`)
    : bad(`${label}: method ${method} not allowed (got "${methods}")`);
  (headers.toLowerCase().includes('content-type') || headers.includes('*'))
    ? ok(`${label}: AllowedHeaders OK`)
    : bad(`${label}: content-type header not allowed (got "${headers}")`);
}

async function main() {
  console.log(`Testing storage CORS for origin: ${ORIGIN}\n`);

  // 1. Bucket
  const { data: bucket } = await supabase.storage.getBucket(BUCKET);
  if (!bucket) bad(`Bucket "${BUCKET}" not found`);
  else if (bucket.public) bad('Bucket is PUBLIC, it must be private');
  else ok('Bucket exists and is private');

  // 2. Signed GET
  const { data: get, error: getErr } = await supabase.storage
    .from(BUCKET).createSignedUrl(TEST_FILE, 60);
  if (getErr || !get) {
    bad(`Signed GET URL failed: ${getErr?.message} (is ${TEST_FILE} uploaded?)`);
  } else {
    ok('Signed GET URL created');
    const head = await fetch(get.signedUrl, { method: 'HEAD', headers: { Origin: ORIGIN } });
    head.ok ? ok('HEAD request succeeded') : bad(`HEAD failed: ${head.status}`);
    const res = await fetch(get.signedUrl, { headers: { Origin: ORIGIN } });
    res.ok ? ok('GET request succeeded') : bad(`GET failed: ${res.status}`);
    corsOk(res.headers) ? ok('GET response has CORS headers') : bad('GET response missing CORS headers');
    await preflight(get.signedUrl, 'GET', 'GET preflight');
  }

  // 3. Signed upload (PUT)
  const { data: up, error: upErr } = await supabase.storage
    .from(BUCKET).createSignedUploadUrl(`cors-test-${Date.now()}.txt`);
  if (upErr || !up) bad(`Signed upload URL failed: ${upErr?.message}`);
  else {
    ok('Signed upload URL created');
    await preflight(up.signedUrl, 'PUT', 'PUT preflight');
  }

  console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed 🎉');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });