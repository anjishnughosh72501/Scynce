import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
  console.log('[Migration] Running SceneSync PostgreSQL migrations...');
  const migrationsDir = path.resolve(__dirname, '../../../../database/migrations');
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    console.log(`[Migration] Applying ${file}...`);
    const sql = fs.readFileSync(filePath, 'utf-8');
    await pool.query(sql);
    console.log(`[Migration] Applied ${file} successfully.`);
  }

  console.log('[Migration] All migrations completed successfully.');
  await pool.end();
}

runMigrations().catch((err) => {
  console.error('[Migration Error]:', err);
  process.exit(1);
});
