import { readFileSync } from 'fs';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  const sql = readFileSync(new URL('../database/migrations.sql', import.meta.url), 'utf8');
  try {
    await pool.query(sql);
    console.log('Migration applied OK');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();