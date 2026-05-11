import { type SQL, sql } from 'drizzle-orm';

// `AND (clause1 OR clause2 OR …)` — null entries are dropped. Returns the
// empty fragment when no clauses survive, so callers can interpolate
// unconditionally without a guard.
export function sqlOr(parts: Array<SQL | null>): SQL {
  const live = parts.filter((p): p is SQL => p !== null);
  if (live.length === 0) return sql``;
  if (live.length === 1) return sql`AND ${live[0]}`;
  return sql`AND (${sql.join(live, sql` OR `)})`;
}
