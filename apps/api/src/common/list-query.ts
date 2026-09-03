import type Database from 'better-sqlite3';

/** Raw list query params — plain interface so ValidationPipe passes them through. */
export interface ListQuery {
  page?: string;
  limit?: string;
  sort?: string;
  order?: string;
  search?: string;
  filters?: string;
}

export interface FilterSpec {
  field: string;
  op: string;
  value?: string;
}

/** Quote a SQL identifier (custom-field keys are regex-validated, but quote defensively). */
export function qid(col: string): string {
  return `"${col.replace(/"/g, '""')}"`;
}

export function parseList(query: ListQuery): {
  page: number;
  limit: number;
  offset: number;
  order: 'asc' | 'desc';
  search: string;
} {
  const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(query.limit ?? '25', 10) || 25),
  );
  const order =
    (query.order ?? 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
  return {
    page,
    limit,
    offset: (page - 1) * limit,
    order,
    search: (query.search ?? '').trim(),
  };
}

/**
 * Real column names of a table (from sqlite). Used to validate sort/filter
 * fields against actual columns — the safe allowlist for built-ins + custom.
 */
export function tableColumns(
  sqlite: Database.Database,
  table: string,
): Set<string> {
  const rows = sqlite
    .prepare(`PRAGMA table_info(${qid(table)})`)
    .all() as Array<{
    name: string;
  }>;
  return new Set(rows.map((r) => r.name));
}

/**
 * Build safe WHERE clauses from a JSON filter list. Fields are validated
 * against `cols` (real columns), so identifiers are never user-controlled;
 * values are always parameterised.
 */
export function buildFilters(
  cols: Set<string>,
  raw: string | undefined,
  prefix = '',
): { clauses: string[]; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let filters: FilterSpec[] = [];
  try {
    const parsed: unknown = JSON.parse(raw ?? '[]');
    if (Array.isArray(parsed)) filters = parsed as FilterSpec[];
  } catch {
    /* ignore malformed filters */
  }
  for (const f of filters) {
    if (!f || typeof f.field !== 'string' || !cols.has(f.field)) continue;
    const col = `${prefix}${qid(f.field)}`;
    const v = f.value ?? '';
    switch (f.op) {
      case 'contains':
        clauses.push(`${col} LIKE ?`);
        params.push(`%${v}%`);
        break;
      case 'is':
        clauses.push(`${col} = ?`);
        params.push(v);
        break;
      case 'is_not':
        clauses.push(`(${col} IS NULL OR ${col} != ?)`);
        params.push(v);
        break;
      case 'is_empty':
        clauses.push(`(${col} IS NULL OR ${col} = '')`);
        break;
      case 'is_not_empty':
        clauses.push(`(${col} IS NOT NULL AND ${col} != '')`);
        break;
      case 'gt':
        clauses.push(`${col} > ?`);
        params.push(Number(v));
        break;
      case 'lt':
        clauses.push(`${col} < ?`);
        params.push(Number(v));
        break;
      default:
        break;
    }
  }
  return { clauses, params };
}
