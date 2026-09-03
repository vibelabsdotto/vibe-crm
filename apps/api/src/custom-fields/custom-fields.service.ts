import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { qid } from '../common/list-query';
import { DatabaseService } from '../database/database.service';

export type EntityType = 'contact' | 'company' | 'deal';
export type TableName = 'contacts' | 'companies' | 'deals';

/** Base storage types. Widget flavours ride on these via `custom_field` (presentational only). */
export type AttributeType =
  | 'string'
  | 'text'
  | 'integer'
  | 'decimal'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'enumeration'
  | 'json';

const ATTRIBUTE_TYPES: readonly string[] = [
  'string',
  'text',
  'integer',
  'decimal',
  'boolean',
  'date',
  'datetime',
  'enumeration',
  'json',
];

export interface CustomFieldDef {
  id: string;
  entity_type: EntityType;
  key: string;
  label: string;
  field_type: AttributeType;
  custom_field: string;
  options: Record<string, unknown>;
  position: number;
  created_at: string;
  updated_at: string;
}

interface CustomFieldDefRow extends Omit<CustomFieldDef, 'options'> {
  options: string;
}

export interface CustomFieldInput {
  entity_type: EntityType;
  key: string;
  label: string;
  field_type?: string;
  custom_field?: string;
  options?: Record<string, unknown>;
  position?: number;
}

export interface CustomFieldPatch {
  label?: string;
  custom_field?: string;
  options?: Record<string, unknown>;
  position?: number;
}

/** Entity type → real table name. */
export const ENTITY_TABLES: Record<EntityType, TableName> = {
  contact: 'contacts',
  company: 'companies',
  deal: 'deals',
};

export function isEntityType(v: unknown): v is EntityType {
  return v === 'contact' || v === 'company' || v === 'deal';
}

/** Built-in columns per table — a custom key may never collide with these. */
const BUILTIN_COLUMNS: Record<EntityType, ReadonlySet<string>> = {
  company: new Set([
    'id',
    'name',
    'domain',
    'industry',
    'phone',
    'email',
    'notes',
    'created_at',
    'updated_at',
  ]),
  contact: new Set([
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
  ]),
  deal: new Set([
    'id',
    'name',
    'contact_id',
    'value',
    'stage',
    'close_date',
    'notes',
    'created_at',
    'updated_at',
  ]),
};

const KEY_RE = /^[a-z][a-z0-9_]*$/;

function parseOptions(raw: string): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(raw || '{}');
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function sqliteAffinity(t: AttributeType): string {
  switch (t) {
    case 'integer':
    case 'boolean':
      return 'INTEGER';
    case 'decimal':
      return 'REAL';
    default:
      return 'TEXT';
  }
}

@Injectable()
export class CustomFieldsService {
  constructor(private readonly database: DatabaseService) {}

  listDefs(entity?: EntityType): CustomFieldDef[] {
    const rows = (
      entity
        ? this.database.sqlite
            .prepare(
              'SELECT * FROM custom_field_defs WHERE entity_type = ? ORDER BY position, created_at',
            )
            .all(entity)
        : this.database.sqlite
            .prepare(
              'SELECT * FROM custom_field_defs ORDER BY entity_type, position, created_at',
            )
            .all()
    ) as CustomFieldDefRow[];
    return rows.map((row) => ({ ...row, options: parseOptions(row.options) }));
  }

  getDef(id: string): CustomFieldDef | null {
    const row = this.database.sqlite
      .prepare('SELECT * FROM custom_field_defs WHERE id = ?')
      .get(id) as CustomFieldDefRow | undefined;
    return row ? { ...row, options: parseOptions(row.options) } : null;
  }

  /** Create a def and add its column. Throws 400 on bad/duplicate key. */
  createDef(input: CustomFieldInput): CustomFieldDef {
    if (!isEntityType(input.entity_type)) {
      throw new BadRequestException('Invalid entity_type');
    }
    if (!input.key || !input.label) {
      throw new BadRequestException('key and label are required');
    }
    assertValidKey(input.entity_type, input.key);
    const fieldType = input.field_type ?? 'string';
    if (!ATTRIBUTE_TYPES.includes(fieldType)) {
      throw new BadRequestException(
        `Invalid field_type "${fieldType}". Valid: ${ATTRIBUTE_TYPES.join(', ')}`,
      );
    }
    const existing = this.database.sqlite
      .prepare(
        'SELECT id FROM custom_field_defs WHERE entity_type = ? AND key = ?',
      )
      .get(input.entity_type, input.key) as { id: string } | undefined;
    if (existing) {
      throw new BadRequestException(
        `A "${input.key}" property already exists on ${input.entity_type}.`,
      );
    }
    const id = randomUUID();
    const now = new Date().toISOString();
    this.database.sqlite
      .prepare(
        'INSERT INTO custom_field_defs (id, entity_type, key, label, field_type, custom_field, options, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        id,
        input.entity_type,
        input.key,
        String(input.label),
        fieldType,
        input.custom_field ?? '',
        JSON.stringify(input.options ?? {}),
        input.position ?? 0,
        now,
        now,
      );
    this.syncEntityColumns(input.entity_type);
    const def = this.getDef(id);
    if (!def) throw new BadRequestException('Failed to create custom field');
    return def;
  }

  /**
   * Update label/options/position/widget of a def. Key + field_type are
   * immutable. Returns null when the def does not exist.
   */
  updateDef(id: string, patch: CustomFieldPatch): CustomFieldDef | null {
    const def = this.getDef(id);
    if (!def) return null;
    this.database.sqlite
      .prepare(
        'UPDATE custom_field_defs SET label = ?, custom_field = ?, options = ?, position = ?, updated_at = ? WHERE id = ?',
      )
      .run(
        patch.label ?? def.label,
        patch.custom_field ?? def.custom_field,
        JSON.stringify(patch.options ?? def.options),
        patch.position ?? def.position,
        new Date().toISOString(),
        id,
      );
    return this.getDef(id);
  }

  /** Delete a def and drop its column. Returns false when missing. */
  deleteDef(id: string): boolean {
    const def = this.getDef(id);
    if (!def) return false;
    this.database.sqlite
      .prepare('DELETE FROM custom_field_defs WHERE id = ?')
      .run(id);
    // Guard again before touching DDL — never drop a built-in.
    if (
      KEY_RE.test(def.key) &&
      !BUILTIN_COLUMNS[def.entity_type].has(def.key)
    ) {
      const table = ENTITY_TABLES[def.entity_type];
      try {
        this.database.sqlite
          .prepare(`ALTER TABLE ${qid(table)} DROP COLUMN ${qid(def.key)}`)
          .run();
      } catch {
        /* column may already be gone; deletion of the def is the source of truth */
      }
    }
    return true;
  }

  /**
   * Idempotently add a real column for every def on this entity that doesn't
   * yet have one. Never drops here — deletion is explicit via deleteDef.
   */
  syncEntityColumns(entity: EntityType): void {
    const table = ENTITY_TABLES[entity];
    const cols = this.database.sqlite
      .prepare(`PRAGMA table_info(${qid(table)})`)
      .all() as Array<{ name: string }>;
    const have = new Set(cols.map((c) => c.name));
    for (const def of this.listDefs(entity)) {
      if (!KEY_RE.test(def.key) || BUILTIN_COLUMNS[entity].has(def.key))
        continue;
      if (have.has(def.key)) continue;
      this.database.sqlite
        .prepare(
          `ALTER TABLE ${qid(table)} ADD COLUMN ${qid(def.key)} ${sqliteAffinity(def.field_type)}`,
        )
        .run();
      have.add(def.key);
    }
  }

  /**
   * Merge a request body's flat top-level custom keys with its nested
   * `custom` bag, then classify against the entity's registry. Both shapes
   * are accepted (the bag wins on a key conflict); built-in base keys pass
   * through untouched. Returns the writable custom values and any unknown
   * keys the caller rejects with 422.
   */
  resolveWrite(
    entity: EntityType,
    body: Record<string, unknown>,
  ): { values: Record<string, unknown>; unknown: string[] } {
    const candidates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (k !== 'custom') candidates[k] = v;
    }
    const bag = body.custom;
    if (bag && typeof bag === 'object') {
      Object.assign(candidates, bag as Record<string, unknown>);
    }
    const known = new Set(this.listDefs(entity).map((d) => d.key));
    const builtins = BUILTIN_COLUMNS[entity];
    const values: Record<string, unknown> = {};
    const unknown: string[] = [];
    for (const [k, v] of Object.entries(candidates)) {
      if (known.has(k)) values[k] = v;
      else if (!builtins.has(k)) unknown.push(k);
    }
    return { values, unknown };
  }

  /** 422 body for unknown keys, or null when the write is clean. */
  unknownFieldsError(
    entity: EntityType,
    unknown: string[],
  ): {
    error: string;
    unknown_fields: string[];
    valid_fields: string[];
  } | null {
    if (unknown.length === 0) return null;
    return {
      error: `Unknown field(s) for ${entity}: ${unknown.join(', ')}. Send a base field or a registered custom field, or define it first via POST /v1/custom-fields.`,
      unknown_fields: unknown,
      valid_fields: this.writableFieldKeys(entity),
    };
  }

  /**
   * Labels of required custom fields (`options.required === true`) that a
   * write violates. Create: the value must be present and non-empty. Update:
   * only an explicit unset (null / "") violates. Bulk import stays lenient
   * (no enforcement there).
   */
  missingRequired(
    entity: EntityType,
    values: Record<string, unknown>,
    mode: 'create' | 'update',
  ): string[] {
    const required = this.listDefs(entity).filter(
      (d) => d.options.required === true,
    );
    const missing: string[] = [];
    for (const def of required) {
      const v = values[def.key];
      const empty = v === null || v === undefined || v === '';
      if (mode === 'create' ? empty : def.key in values && empty) {
        missing.push(def.label || def.key);
      }
    }
    return missing;
  }

  /** Human-facing writable keys (built-ins + registered custom) for the 422 body. */
  writableFieldKeys(entity: EntityType): string[] {
    const managed = new Set(['id', 'created_at', 'updated_at']);
    const builtins = [...BUILTIN_COLUMNS[entity]].filter(
      (k) => !managed.has(k),
    );
    const custom = this.listDefs(entity).map((d) => d.key);
    return [...builtins, ...custom];
  }

  /**
   * Write custom-property values for one entity row as a follow-up UPDATE.
   * Throws 400 on enum violation.
   */
  applyValues(
    entity: EntityType,
    id: string,
    values: Record<string, unknown>,
  ): void {
    if (!values || typeof values !== 'object') return;
    const defs = this.listDefs(entity);
    const byKey = new Map(defs.map((d) => [d.key, d]));
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [key, raw] of Object.entries(values)) {
      const def = byKey.get(key);
      if (!def) continue;
      sets.push(`${qid(key)} = ?`);
      try {
        params.push(coerceCustomValue(raw, def));
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error ? error.message : `Invalid value for "${key}"`,
        );
      }
    }
    if (sets.length === 0) return;
    const table = ENTITY_TABLES[entity];
    params.push(id);
    this.database.sqlite
      .prepare(`UPDATE ${qid(table)} SET ${sets.join(', ')} WHERE id = ?`)
      .run(...params);
  }

  /**
   * Lenient coercion for bulk import: an invalid cell (bad enum, unparseable
   * number) becomes null rather than aborting the whole import batch.
   */
  coerceForImport(value: unknown, def: CustomFieldDef): string | number | null {
    try {
      const v = coerceCustomValue(value, def);
      return typeof v === 'number' && Number.isNaN(v) ? null : v;
    } catch {
      return null;
    }
  }
}

/** Throws a human-readable Error if `key` is not a safe, non-reserved column. */
export function assertValidKey(entity: EntityType, key: string): void {
  if (!KEY_RE.test(key)) {
    throw new BadRequestException(
      `Invalid field key "${key}" — use lowercase letters, digits, and underscores (must start with a letter).`,
    );
  }
  if (BUILTIN_COLUMNS[entity].has(key)) {
    throw new BadRequestException(
      `"${key}" is a built-in ${entity} field and can't be used as a custom property.`,
    );
  }
}

/**
 * Coerce + validate one incoming custom value for its def. Returns a
 * SQL-bindable value (string | number | null). Throws on enum violation.
 */
export function coerceCustomValue(
  value: unknown,
  def: CustomFieldDef,
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
      const enumVals = def.options.enum;
      const s = toCustomText(value);
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
      return toCustomText(value);
  }
}

/** Text coercion without Object stringification ([object Object]). */
function toCustomText(value: unknown): string {
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
