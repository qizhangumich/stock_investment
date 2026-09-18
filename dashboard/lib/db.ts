import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * Single source of truth for the evolution database location.
 * Resolution order:
 *   1. EVOLUTION_DB environment variable
 *   2. ../db/evolution.db  (local dev: the engine's live database)
 *   3. ./db/evolution.db   (deployed snapshot bundled with the app, e.g. Vercel)
 */
function resolveDbPath(): string {
  if (process.env.EVOLUTION_DB) return process.env.EVOLUTION_DB;
  const local = path.resolve(process.cwd(), "..", "db", "evolution.db");
  if (fs.existsSync(local)) return local;
  return path.resolve(process.cwd(), "db", "evolution.db");
}

export const DB_PATH = resolveDbPath();

declare global {
  var __evolutionDb: DatabaseSync | undefined;
}

export function getDb(): DatabaseSync {
  if (!globalThis.__evolutionDb) {
    globalThis.__evolutionDb = new DatabaseSync(DB_PATH, { readOnly: true });
  }
  return globalThis.__evolutionDb;
}

/** Run a query and return typed rows. Server-side only. */
export function q<T>(sql: string, ...params: (string | number)[]): T[] {
  const stmt = getDb().prepare(sql);
  return stmt.all(...params) as T[];
}

/** Run a query and return the first row or null. Server-side only. */
export function one<T>(sql: string, ...params: (string | number)[]): T | null {
  const rows = q<T>(sql, ...params);
  return rows.length > 0 ? rows[0] : null;
}
