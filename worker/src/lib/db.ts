import type { Bindings } from "../index";

export function getDb(env: Bindings): D1Database {
  return env.DB;
}

export type QueryResult<T> = {
  results: T[];
  success: boolean;
  meta: Record<string, unknown>;
};

export async function dbQuery<T>(
  db: D1Database,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const stmt = db.prepare(sql);
  const bound = params.length > 0 ? stmt.bind(...params) : stmt;
  const result = await bound.all<T>();
  return result.results ?? [];
}

export async function dbQueryFirst<T>(
  db: D1Database,
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const stmt = db.prepare(sql);
  const bound = params.length > 0 ? stmt.bind(...params) : stmt;
  return bound.first<T>();
}

export async function dbRun(
  db: D1Database,
  sql: string,
  params: unknown[] = []
): Promise<D1Result> {
  const stmt = db.prepare(sql);
  const bound = params.length > 0 ? stmt.bind(...params) : stmt;
  return bound.run();
}

export async function dbBatch(
  db: D1Database,
  statements: { sql: string; params?: unknown[] }[]
): Promise<D1Result[]> {
  const stmts = statements.map(({ sql, params = [] }) => {
    const stmt = db.prepare(sql);
    return params.length > 0 ? stmt.bind(...params) : stmt;
  });
  return db.batch(stmts);
}
