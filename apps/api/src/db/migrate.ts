/// <reference types="node" />
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { sql } from 'drizzle-orm';
import { createDb } from '../config/database';

async function migrate() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const db = createDb(dbUrl);
  const migrationsFolder = path.resolve(import.meta.dir, '../../drizzle/migrations');
  const journalPath = path.join(migrationsFolder, 'meta/_journal.json');

  if (!fs.existsSync(journalPath)) {
    throw new Error(`Can't find meta/_journal.json file at ${journalPath}`);
  }

  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));

  // Ensure drizzle migration schema & table exist
  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS "drizzle";`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    );
  `);

  const result = await db.execute<{ created_at: string | number }>(
    sql`SELECT "created_at" FROM "drizzle"."__drizzle_migrations"`
  );
  const rows = (result.rows ?? result) as Array<{ created_at: string | number }>;
  const appliedTimestamps = new Set(rows.map((r) => Number(r.created_at)));

  console.log(`Found ${journal.entries.length} migration(s) in journal. Checking applied migrations...`);

  for (const entry of journal.entries) {
    const when = Number(entry.when);
    if (appliedTimestamps.has(when)) {
      continue;
    }

    const migrationFile = path.join(migrationsFolder, `${entry.tag}.sql`);
    if (!fs.existsSync(migrationFile)) {
      throw new Error(`Migration file not found: ${migrationFile}`);
    }

    const sqlContent = fs.readFileSync(migrationFile, 'utf8');
    const statements = sqlContent
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    console.log(`Applying migration: ${entry.tag}...`);
    for (const stmt of statements) {
      await db.execute(sql.raw(stmt));
    }

    const hash = crypto.createHash('sha256').update(sqlContent).digest('hex');
    await db.execute(
      sql`INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES (${hash}, ${when})`
    );
    console.log(`Applied migration: ${entry.tag}`);
  }

  console.log('Migrations up to date.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
