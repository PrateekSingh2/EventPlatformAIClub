import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const dbUrl = process.env.DATABASE_URL;

if (!url || !key) {
  console.error('❌ Missing Supabase env vars in .env');
  process.exit(1);
}

const supabase = createClient(url, key);

// CHECK: match these column names to schema.sql
const SEED_STAGES = [
  {
    stage_number: 1,
    title: 'Stage 1: The Briefing',
    storage_path: 'demo-stage-1.zip',
    is_password_protected: false,
    zip_password: '',
    allowed_copy_filename: 'ai_prompt.txt',
    min_expected_seconds: 120,
    points: 100,
  },
  {
    stage_number: 2,
    title: 'Stage 2: Quantum Secrets',
    storage_path: 'demo-stage-2-encrypted.zip',
    is_password_protected: true,
    zip_password: 'cyber2026',
    allowed_copy_filename: 'ai_prompt.txt',
    min_expected_seconds: 120,
    points: 200,
  },
  {
    stage_number: 3,
    title: 'Stage 3: The Final Flag',
    storage_path: 'demo-stage-3-encrypted.zip',
    is_password_protected: true,
    zip_password: 'quantum4096',
    allowed_copy_filename: '',
    min_expected_seconds: 120,
    points: 300,
  },
];

async function tableExists(name: string) {
  const { error } = await supabase.from(name).select('*').limit(1);
  return !error;
}

async function main() {
  console.log('🔍 Checking tables...');
  const tables = ['stages', 'users', 'stage_telemetry', 'contest_settings'];
  const missing: string[] = [];
  for (const t of tables) if (!(await tableExists(t))) missing.push(t);

  if (missing.length) {
    console.log(`⚠️  Missing: ${missing.join(', ')}. Running schema.sql...`);
    if (!dbUrl) {
      console.error('❌ Set DATABASE_URL in .env so I can run schema.sql');
      process.exit(1);
    }
    const sql = readFileSync(resolve(__dirname, 'schema.sql'), 'utf8');
    const pg = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await pg.connect();
    await pg.query(sql);
    await pg.end();
    console.log('✅ schema.sql applied');
  } else {
    console.log('✅ All tables exist');
  }

  // Verify the RPC exists
  if (dbUrl) {
    const pg = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await pg.connect();
    const r = await pg.query(
      "select 1 from pg_proc where proname = 'complete_stage_and_award_points'"
    );
    await pg.end();
    console.log(r.rowCount ? '✅ RPC complete_stage_and_award_points installed'
                           : '❌ RPC missing, check schema.sql');
  }

  // Storage bucket
  console.log('🔍 Checking storage bucket...');
  const { data: bucket } = await supabase.storage.getBucket('stages');
  if (!bucket) {
    const { error } = await supabase.storage.createBucket('stages', {
      public: false,
      fileSizeLimit: 100 * 1024 * 1024,
    });
    console.log(error ? `❌ ${error.message}` : '✅ Created private "stages" bucket');
  } else {
    console.log(`✅ Bucket exists (public: ${bucket.public})`);
    if (bucket.public) console.warn('⚠️  Bucket is PUBLIC, it must be private!');
  }

  // Seed stages (safe to re-run)
  console.log('🌱 Seeding stages...');
  const { error } = await supabase
    .from('stages')
    .upsert(SEED_STAGES, { onConflict: 'stage_number' });
  console.log(error ? `❌ ${error.message}` : `✅ Seeded ${SEED_STAGES.length} stages`);
}

main().catch((e) => { console.error(e); process.exit(1); });