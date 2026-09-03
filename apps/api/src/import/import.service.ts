import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import freeEmailDomains from 'free-email-domains';
import { qid } from '../common/list-query';
import { DatabaseService } from '../database/database.service';

export interface ImportContactRow {
  first_name?: unknown;
  last_name?: unknown;
  email?: unknown;
  phone?: unknown;
  title?: unknown;
  status?: unknown;
  company?: unknown;
  company_domain?: unknown;
  company_industry?: unknown;
  company_phone?: unknown;
  custom?: unknown;
}

export interface ImportContactsBody {
  contacts?: ImportContactRow[];
  inferCompanyFromEmail?: unknown;
}

export interface ImportCompanyRow {
  name?: unknown;
  domain?: unknown;
  industry?: unknown;
  phone?: unknown;
  email?: unknown;
  notes?: unknown;
  custom?: unknown;
}

export interface ImportCompaniesBody {
  companies?: ImportCompanyRow[];
}

const CONTACT_STATUSES = ['lead', 'active', 'inactive', 'churned'];
const IMPORT_LIMIT = 2000;
const LOOKUP_CHUNK = 500;
const INSERT_CHUNK = 200;

const FREEMAIL_DOMAINS = new Set(freeEmailDomains.map((d) => d.toLowerCase()));

interface CustomDef {
  key: string;
  field_type: string;
  options: Record<string, unknown>;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Work-email domain, or '' for missing/invalid/free-provider emails. */
function workEmailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 0) return '';
  const domain = email
    .slice(at + 1)
    .trim()
    .toLowerCase();
  if (!domain || !domain.includes('.')) return '';
  return FREEMAIL_DOMAINS.has(domain) ? '' : domain;
}

/** First-guess company name from a domain: 'acme.com' → 'Acme'. */
function companyNameFromDomain(domain: string): string {
  const label = domain.replace(/^www\./, '').split('.')[0] || domain;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function parseOptions(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'string' || !raw) return {};
  try {
    const v: unknown = JSON.parse(raw);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Strict single-value coercion (mirrors the single-write path): returns a
 * SQL-bindable value, throws on enum violation.
 */
function coerceCustomValue(
  value: unknown,
  def: CustomDef,
): string | number | null {
  if (value === null || value === undefined || value === '') return null;
  switch (def.field_type) {
    case 'boolean':
      return value ? 1 : 0;
    case 'integer':
      return Math.trunc(Number(value));
    case 'decimal':
      return Number(value);
    case 'json':
      return typeof value === 'string' ? value : JSON.stringify(value);
    case 'enumeration': {
      const enumVals = (def.options as { enum?: unknown }).enum;
      const s = toText(value);
      if (
        Array.isArray(enumVals) &&
        enumVals.length > 0 &&
        !enumVals.map(String).includes(s)
      ) {
        throw new Error(
          `${def.key}: "${s}" is not one of [${enumVals.join(', ')}]`,
        );
      }
      return s;
    }
    default:
      return toText(value);
  }
}

/** Text coercion without Object stringification ([object Object]). */
function toText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null ||
    value === undefined
  )
    return String(value);
  return JSON.stringify(value) ?? '';
}

/** Lenient import coercion: a bad cell becomes null, never aborts the batch. */
function coerceForImport(
  value: unknown,
  def: CustomDef,
): string | number | null {
  try {
    const v = coerceCustomValue(value, def);
    return typeof v === 'number' && Number.isNaN(v) ? null : v;
  } catch {
    return null;
  }
}

@Injectable()
export class ImportService {
  constructor(private readonly database: DatabaseService) {}

  private get sqlite() {
    return this.database.sqlite;
  }

  /** Defs for an entity, read directly from the registry (no module import). */
  private listDefs(entity: string): Map<string, CustomDef> {
    const rows = this.sqlite
      .prepare(
        'SELECT key, field_type, options FROM custom_field_defs WHERE entity_type = ?',
      )
      .all(entity) as Array<{
      key: string;
      field_type: string;
      options: string;
    }>;
    return new Map(
      rows.map((r) => [
        r.key,
        {
          key: r.key,
          field_type: r.field_type,
          options: parseOptions(r.options),
        },
      ]),
    );
  }

  /**
   * Custom columns to write: defs whose key is present and non-empty in at
   * least one row's `custom` bag, intersected with real table columns so the
   * bulk INSERT stays narrow and can never reference a missing column.
   */
  private importCustomColumns(
    entity: string,
    table: string,
    rows: Array<{ custom?: Record<string, unknown> }>,
  ): { keys: string[]; defByKey: Map<string, CustomDef> } {
    const defByKey = this.listDefs(entity);
    const cols = new Set(
      (
        this.sqlite.prepare(`PRAGMA table_info(${qid(table)})`).all() as Array<{
          name: string;
        }>
      ).map((c) => c.name),
    );
    const present = new Set<string>();
    for (const r of rows) {
      if (!r.custom || typeof r.custom !== 'object') continue;
      for (const [k, v] of Object.entries(r.custom)) {
        if (
          defByKey.has(k) &&
          cols.has(k) &&
          v !== null &&
          v !== undefined &&
          v !== ''
        ) {
          present.add(k);
        }
      }
    }
    return { keys: [...present], defByKey };
  }

  importContacts(body: ImportContactsBody): {
    imported: number;
    companiesCreated: number;
    skipped: number;
  } {
    const rows = Array.isArray(body?.contacts) ? body.contacts : [];
    if (rows.length === 0) throw new BadRequestException('No rows to import');
    if (rows.length > IMPORT_LIMIT) {
      throw new BadRequestException('Import is limited to 2000 rows at a time');
    }
    const inferFromEmail = body.inferCompanyFromEmail === true;

    const clean = rows
      .map((r) => {
        const email = str(r?.email);
        const company = str(r?.company);
        const statusRaw = str(r?.status);
        return {
          first_name: str(r?.first_name),
          last_name: str(r?.last_name),
          email,
          phone: str(r?.phone),
          title: str(r?.title),
          status: CONTACT_STATUSES.includes(statusRaw) ? statusRaw : 'lead',
          company,
          company_domain: str(r?.company_domain),
          company_industry: str(r?.company_industry),
          company_phone: str(r?.company_phone),
          inferDomain:
            inferFromEmail && !company && email ? workEmailDomain(email) : '',
          custom:
            r?.custom && typeof r.custom === 'object'
              ? (r.custom as Record<string, unknown>)
              : undefined,
        };
      })
      .filter((r) => r.first_name);
    const skipped = rows.length - clean.length;
    if (clean.length === 0) {
      throw new BadRequestException('No rows had a first name to import');
    }

    // ── Resolve company names → ids (set-based, case-insensitive) ──
    // First-seen casing wins for created companies; domain/industry/phone are
    // taken from the first row carrying each attribute. Existing companies
    // are reused untouched — never overwritten from an import.
    const nameByKey = new Map<
      string,
      { name: string; domain: string; industry: string; phone: string }
    >();
    for (const r of clean) {
      if (!r.company) continue;
      const key = r.company.toLowerCase();
      const existing = nameByKey.get(key);
      if (!existing) {
        nameByKey.set(key, {
          name: r.company,
          domain: r.company_domain,
          industry: r.company_industry,
          phone: r.company_phone,
        });
      } else {
        if (!existing.domain) existing.domain = r.company_domain;
        if (!existing.industry) existing.industry = r.company_industry;
        if (!existing.phone) existing.phone = r.company_phone;
      }
    }
    const companyIds = new Map<string, string>();
    const loadIds = (names: string[]): void => {
      for (const group of chunk(names, LOOKUP_CHUNK)) {
        const placeholders = group.map(() => '?').join(', ');
        const found = this.sqlite
          .prepare(
            `SELECT id, name FROM companies WHERE name COLLATE NOCASE IN (${placeholders})`,
          )
          .all(...group) as Array<{ id: string; name: string }>;
        for (const co of found) companyIds.set(co.name.toLowerCase(), co.id);
      }
    };
    loadIds([...nameByKey.values()].map((co) => co.name));

    const now = new Date().toISOString();
    const missing = [...nameByKey]
      .filter(([key]) => !companyIds.has(key))
      .map(([, co]) => co);
    for (const group of chunk(missing, INSERT_CHUNK)) {
      const placeholders = group.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
      const params: unknown[] = group.flatMap((co) => [
        randomUUID(),
        co.name,
        co.domain,
        co.industry,
        co.phone,
        now,
        now,
      ]);
      this.sqlite
        .prepare(
          `INSERT INTO companies (id, name, domain, industry, phone, created_at, updated_at) VALUES ${placeholders}`,
        )
        .run(...params);
    }
    if (missing.length > 0) loadIds(missing.map((co) => co.name));

    // ── Infer companies from work-email domains (opt-in) ──
    // Runs after the name phase so a domain match can land on a company that
    // phase just created. Existing companies match by domain first; unmatched
    // domains create a company named from the domain.
    const domainSet = new Set<string>();
    for (const r of clean) if (r.inferDomain) domainSet.add(r.inferDomain);
    const companyIdByDomain = new Map<string, string>();
    const loadIdsByDomain = (domains: string[]): void => {
      for (const group of chunk(domains, LOOKUP_CHUNK)) {
        const placeholders = group.map(() => '?').join(', ');
        const found = this.sqlite
          .prepare(
            `SELECT id, domain FROM companies WHERE domain <> '' AND domain COLLATE NOCASE IN (${placeholders})`,
          )
          .all(...group) as Array<{ id: string; domain: string }>;
        for (const co of found) {
          if (co.domain) companyIdByDomain.set(co.domain.toLowerCase(), co.id);
        }
      }
    };
    const allDomains = [...domainSet];
    if (allDomains.length > 0) loadIdsByDomain(allDomains);
    const missingDomains = allDomains.filter((d) => !companyIdByDomain.has(d));
    for (const group of chunk(missingDomains, INSERT_CHUNK)) {
      const placeholders = group.map(() => '(?, ?, ?, ?, ?)').join(', ');
      const params: unknown[] = group.flatMap((d) => [
        randomUUID(),
        companyNameFromDomain(d),
        d,
        now,
        now,
      ]);
      this.sqlite
        .prepare(
          `INSERT INTO companies (id, name, domain, created_at, updated_at) VALUES ${placeholders}`,
        )
        .run(...params);
    }
    if (missingDomains.length > 0) loadIdsByDomain(missingDomains);

    const companiesCreated = missing.length + missingDomains.length;

    // ── Bulk-insert contacts (multi-row VALUES, chunked) ──
    const custom = this.importCustomColumns('contact', 'contacts', clean);
    const builtinCols = [
      'id',
      'first_name',
      'last_name',
      'email',
      'phone',
      'company_id',
      'title',
      'status',
      'created_at',
      'updated_at',
    ];
    const cols = [...builtinCols, ...custom.keys];
    const rowPlaceholder = `(${cols.map(() => '?').join(', ')})`;

    let imported = 0;
    for (const group of chunk(clean, INSERT_CHUNK)) {
      const placeholders = group.map(() => rowPlaceholder).join(', ');
      const params: unknown[] = [];
      for (const r of group) {
        const companyId = r.company
          ? (companyIds.get(r.company.toLowerCase()) ?? null)
          : r.inferDomain
            ? (companyIdByDomain.get(r.inferDomain) ?? null)
            : null;
        params.push(
          randomUUID(),
          r.first_name,
          r.last_name,
          r.email,
          r.phone,
          companyId,
          r.title,
          r.status,
          now,
          now,
        );
        for (const k of custom.keys) {
          params.push(coerceForImport(r.custom?.[k], custom.defByKey.get(k)!));
        }
      }
      this.sqlite
        .prepare(
          `INSERT INTO contacts (${cols.map((c) => qid(c)).join(', ')}) VALUES ${placeholders}`,
        )
        .run(...params);
      imported += group.length;
    }

    return { imported, companiesCreated, skipped };
  }

  importCompanies(body: ImportCompaniesBody): {
    imported: number;
    skipped: number;
    duplicates: number;
  } {
    const rows = Array.isArray(body?.companies) ? body.companies : [];
    if (rows.length === 0) throw new BadRequestException('No rows to import');
    if (rows.length > IMPORT_LIMIT) {
      throw new BadRequestException('Import is limited to 2000 rows at a time');
    }

    // Keep only rows with a name; collapse to the first-seen row per name
    // (case-insensitive) so a duplicated name in the file yields one company.
    const byKey = new Map<
      string,
      {
        name: string;
        domain: string;
        industry: string;
        phone: string;
        email: string;
        notes: string;
        custom?: Record<string, unknown>;
      }
    >();
    for (const r of rows) {
      const name = str(r?.name);
      if (!name) continue;
      const key = name.toLowerCase();
      if (byKey.has(key)) continue;
      byKey.set(key, {
        name,
        domain: str(r?.domain),
        industry: str(r?.industry),
        phone: str(r?.phone),
        email: str(r?.email),
        notes: str(r?.notes),
        custom:
          r?.custom && typeof r.custom === 'object'
            ? (r.custom as Record<string, unknown>)
            : undefined,
      });
    }
    const named = rows.filter((r) => str(r?.name)).length;
    const noName = rows.length - named;
    const fileDuplicates = named - byKey.size;
    if (byKey.size === 0) {
      throw new BadRequestException('No rows had a company name to import');
    }

    // Dedupe by name (case-insensitive): existing companies are skipped,
    // never duplicated or overwritten.
    const existing = new Set<string>();
    for (const group of chunk(
      [...byKey.values()].map((co) => co.name),
      LOOKUP_CHUNK,
    )) {
      const placeholders = group.map(() => '?').join(', ');
      const found = this.sqlite
        .prepare(
          `SELECT name FROM companies WHERE name COLLATE NOCASE IN (${placeholders})`,
        )
        .all(...group) as Array<{ name: string }>;
      for (const co of found) existing.add(co.name.toLowerCase());
    }
    const fresh = [...byKey]
      .filter(([key]) => !existing.has(key))
      .map(([, co]) => co);
    const duplicates = fileDuplicates + (byKey.size - fresh.length);

    const custom = this.importCustomColumns('company', 'companies', fresh);
    const builtinCols = [
      'id',
      'name',
      'domain',
      'industry',
      'phone',
      'email',
      'notes',
      'created_at',
      'updated_at',
    ];
    const cols = [...builtinCols, ...custom.keys];
    const rowPlaceholder = `(${cols.map(() => '?').join(', ')})`;
    const now = new Date().toISOString();

    let imported = 0;
    for (const group of chunk(fresh, INSERT_CHUNK)) {
      const placeholders = group.map(() => rowPlaceholder).join(', ');
      const params: unknown[] = [];
      for (const co of group) {
        params.push(
          randomUUID(),
          co.name,
          co.domain,
          co.industry,
          co.phone,
          co.email,
          co.notes,
          now,
          now,
        );
        for (const k of custom.keys) {
          params.push(coerceForImport(co.custom?.[k], custom.defByKey.get(k)!));
        }
      }
      this.sqlite
        .prepare(
          `INSERT INTO companies (${cols.map((c) => qid(c)).join(', ')}) VALUES ${placeholders}`,
        )
        .run(...params);
      imported += group.length;
    }

    return { imported, skipped: noName, duplicates };
  }
}
