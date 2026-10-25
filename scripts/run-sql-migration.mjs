import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error('Usage: node scripts/run-sql-migration.mjs <migration.sql>');
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DIRECT_URL;
if (!dbUrl) {
  console.error('No DATABASE_URL / POSTGRES_URL / DIRECT_URL in environment');
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sqlPath = resolve(root, migrationFile);
const sql = readFileSync(sqlPath, 'utf8');

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(sql);
  console.log(`Applied: ${migrationFile}`);
} finally {
  await client.end();
}
