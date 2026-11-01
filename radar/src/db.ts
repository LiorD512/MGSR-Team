import { createClient, type Client, type InValue } from '@libsql/client';
import { MIGRATIONS } from './schema.js';
import { log, now } from './util.js';

export type Db = Client;

/** TURSO_URL + TURSO_TOKEN in production; RADAR_DB_FILE=path (or default ./radar-local.db) for local development. */
export function openDb(): Db {
  const url = process.env.TURSO_URL || process.env.TURSO_DATABASE_URL;
  if (url) return createClient({ url, authToken: process.env.TURSO_TOKEN || process.env.TURSO_AUTH_TOKEN });
  const file = process.env.RADAR_DB_FILE || './radar-local.db';
  log.warn(`TURSO_URL not set - using local SQLite file ${file}`);
  return createClient({ url: `file:${file}` });
}

export async function migrate(db: Db): Promise<number> {
  await db.execute(`CREATE TABLE IF NOT EXISTS _migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)`);
  const done = new Set((await db.execute('SELECT id FROM _migrations')).rows.map((r) => Number(r.id)));
  let applied = 0;
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    for (const stmt of m.sql) await db.execute(stmt);
    await db.execute({ sql: 'INSERT INTO _migrations (id, name, applied_at) VALUES (?,?,?)', args: [m.id, m.name, now()] });
    applied++;
    log.info(`migration ${m.id} (${m.name}) applied`);
  }
  return applied;
}

export async function all<T = Record<string, unknown>>(db: Db, sql: string, args: InValue[] = []): Promise<T[]> {
  const r = await db.execute({ sql, args });
  return r.rows.map((row) => ({ ...(row as unknown as Record<string, unknown>) })) as T[];
}
export async function one<T = Record<string, unknown>>(db: Db, sql: string, args: InValue[] = []): Promise<T | null> {
  const rows = await all<T>(db, sql, args);
  return rows[0] ?? null;
}
export async function run(db: Db, sql: string, args: InValue[] = []) {
  return db.execute({ sql, args });
}
