import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  buildFilters,
  parseList,
  qid,
  tableColumns,
} from '../common/list-query';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { DatabaseService } from '../database/database.service';
import { StagesService } from '../stages/stages.service';
import type { Deal, DealBody, DealListQuery } from './deals.dto';

export type { Deal, DealBody, DealListQuery };

const DEAL_FIELDS = [
  'name',
  'contact_id',
  'company_id',
  'product_id',
  'value',
  'stage',
  'close_date',
  'notes',
] as const;

const EXTRAS = `d.*,
  ct.first_name as contact_first_name,
  ct.last_name as contact_last_name,
  COALESCE(co_direct.name, co_via.name) as company_name,
  COALESCE(co_direct.domain, co_via.domain) as company_domain,
  p.name as product_name`;

const JOINS = `deals d
  LEFT JOIN contacts ct ON d.contact_id = ct.id
  LEFT JOIN companies co_direct ON d.company_id = co_direct.id
  LEFT JOIN companies co_via ON ct.company_id = co_via.id
  LEFT JOIN products p ON d.product_id = p.key`;

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function contactId(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const raw =
    typeof v === 'string'
      ? v
      : typeof v === 'number' || typeof v === 'boolean'
        ? String(v)
        : null;
  if (raw === null) return null;
  const s = raw.trim();
  return s === '' ? null : s;
}

function num(v: unknown): number {
  const n =
    typeof v === 'number'
      ? v
      : typeof v === 'string'
        ? Number(v.trim())
        : Number(v);
  if (!Number.isFinite(n))
    throw new BadRequestException('Invalid value — must be a number');
  return n;
}

@Injectable()
export class DealsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly customFields: CustomFieldsService,
    private readonly stages: StagesService,
  ) {}

  list(query: DealListQuery): {
    deals: Deal[];
    total: number;
    total_value: number;
    page: number;
    limit: number;
  } {
    const { page, limit, offset, order, search } = parseList(query);
    const stage = (query.stage ?? '').trim();
    const product = (query.product ?? '').trim();
    const cols = tableColumns(this.database.sqlite, 'deals');
    let sortCol = query.sort ?? 'id';
    if (!cols.has(sortCol)) sortCol = 'id';

    const where: string[] = [];
    const params: unknown[] = [];
    if (search) {
      where.push('(d.name LIKE ? OR d.notes LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    if (stage) {
      where.push('d.stage = ?');
      params.push(stage);
    }
    if (product) {
      where.push('d.product_id = ?');
      params.push(product);
    }
    const flt = buildFilters(cols, query.filters, 'd.');
    where.push(...flt.clauses);
    params.push(...flt.params);
    const whereSQL = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';

    const countRow = this.database.sqlite
      .prepare(`SELECT COUNT(*) as total FROM ${JOINS}${whereSQL}`)
      .get(...params) as { total: number };
    const sumRow = this.database.sqlite
      .prepare(
        `SELECT COALESCE(SUM(d.value), 0) as total_value FROM ${JOINS}${whereSQL}`,
      )
      .get(...params) as { total_value: number };
    const rows = this.database.sqlite
      .prepare(
        `SELECT ${EXTRAS} FROM ${JOINS}${whereSQL} ORDER BY d.${qid(sortCol)} ${order}, d.id LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as Deal[];
    return {
      deals: rows,
      total: countRow?.total ?? 0,
      total_value: sumRow?.total_value ?? 0,
      page,
      limit,
    };
  }

  board(): { deals: Deal[] } {
    const rows = this.database.sqlite
      .prepare(`SELECT ${EXTRAS} FROM ${JOINS} ORDER BY d.created_at ASC, d.id`)
      .all() as Deal[];
    return { deals: rows };
  }

  create(body: DealBody): Deal {
    // company_id/product_id are new base columns (contract v2) — the
    // custom-field registry only knows contact|company|deal built-ins, so
    // keep them out of resolveWrite to avoid false 422s.
    const customBody = { ...body };
    delete customBody.company_id;
    delete customBody.product_id;
    const { values, unknown } =
      this.customFields.resolveWrite('deal', customBody);
    const unknownErr = this.customFields.unknownFieldsError('deal', unknown);
    if (unknownErr) throw new UnprocessableEntityException(unknownErr);
    const missing = this.customFields.missingRequired('deal', values, 'create');
    if (missing.length > 0) {
      throw new BadRequestException(
        `Missing required field(s): ${missing.join(', ')}`,
      );
    }
    const name = str(body.name);
    if (!name) throw new BadRequestException('Name is required');
    const stage = this.resolveStage(body.stage, true);
    const value = body.value === undefined ? 0 : num(body.value);
    const companyId = this.checkedCompany(contactId(body.company_id));
    const productId = this.checkedProduct(contactId(body.product_id));
    const id = randomUUID();
    const now = new Date().toISOString();
    this.database.sqlite
      .prepare(
        'INSERT INTO deals (id, name, contact_id, company_id, product_id, value, stage, close_date, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        id,
        name,
        contactId(body.contact_id),
        companyId,
        productId,
        value,
        stage,
        str(body.close_date),
        str(body.notes),
        now,
        now,
      );
    this.customFields.applyValues('deal', id, values);
    return this.require(id);
  }

  update(id: string, body: DealBody): Deal {
    const customBody = { ...body };
    delete customBody.company_id;
    delete customBody.product_id;
    const { values, unknown } =
      this.customFields.resolveWrite('deal', customBody);
    const unknownErr = this.customFields.unknownFieldsError('deal', unknown);
    if (unknownErr) throw new UnprocessableEntityException(unknownErr);
    const missing = this.customFields.missingRequired('deal', values, 'update');
    if (missing.length > 0) {
      throw new BadRequestException(
        `Missing required field(s): ${missing.join(', ')}`,
      );
    }
    const fields: string[] = [];
    const params: unknown[] = [];
    let nextStage: string | undefined;
    for (const key of DEAL_FIELDS) {
      if (body[key] === undefined) continue;
      switch (key) {
        case 'name':
          fields.push('name = ?');
          params.push(str(body.name));
          break;
        case 'contact_id':
          fields.push('contact_id = ?');
          params.push(contactId(body.contact_id));
          break;
        case 'company_id':
          fields.push('company_id = ?');
          params.push(this.checkedCompany(contactId(body.company_id)));
          break;
        case 'product_id':
          fields.push('product_id = ?');
          params.push(this.checkedProduct(contactId(body.product_id)));
          break;
        case 'value':
          fields.push('value = ?');
          params.push(num(body.value));
          break;
        case 'stage':
          nextStage = this.resolveStage(body.stage, false);
          fields.push('stage = ?');
          params.push(nextStage);
          break;
        case 'close_date':
          fields.push('close_date = ?');
          params.push(str(body.close_date));
          break;
        case 'notes':
          fields.push('notes = ?');
          params.push(str(body.notes));
          break;
      }
    }
    const hasCustom = Object.keys(values).length > 0;
    if (fields.length === 0 && !hasCustom) {
      throw new BadRequestException('No fields to update');
    }
    const existing = this.require(id);
    if (fields.length > 0) {
      if (body.name !== undefined && str(body.name) === '') {
        throw new BadRequestException('Name cannot be empty');
      }
      fields.push('updated_at = ?');
      params.push(new Date().toISOString(), id);
      this.database.sqlite
        .prepare(`UPDATE deals SET ${fields.join(', ')} WHERE id = ?`)
        .run(...params);
    }
    this.customFields.applyValues('deal', id, values);
    if (nextStage !== undefined && nextStage !== existing.stage) {
      this.writeStageChangeActivity(id, existing.stage, nextStage);
    }
    return this.require(id);
  }

  remove(id: string): { ok: boolean } {
    const res = this.database.sqlite
      .prepare('DELETE FROM deals WHERE id = ?')
      .run(id);
    if ((res.changes ?? 0) === 0) throw new NotFoundException('not_found');
    return { ok: true };
  }

  /** Validate an incoming stage key, or fall back to the first stage by position. */
  private resolveStage(v: unknown, allowDefault: boolean): string {
    const s = str(v);
    if (!s) {
      if (allowDefault) {
        return this.stages.list()[0]?.key ?? 'prospect';
      }
      throw new BadRequestException('Stage cannot be empty');
    }
    if (!this.stages.find(s)) {
      throw new BadRequestException(this.stages.unknownStageError(s));
    }
    return s;
  }

  /** 400 when a company ref points at a non-existent company. */
  private checkedCompany(id: string | null): string | null {
    if (id === null) return null;
    const row = this.database.sqlite
      .prepare('SELECT id FROM companies WHERE id = ?')
      .get(id) as { id: string } | undefined;
    if (!row) {
      throw new BadRequestException(`Unknown company_id "${id}".`);
    }
    return id;
  }

  /** 400 when a product ref points at a non-existent product. */
  private checkedProduct(key: string | null): string | null {
    if (key === null) return null;
    const row = this.database.sqlite
      .prepare('SELECT key FROM products WHERE key = ?')
      .get(key) as { key: string } | undefined;
    if (!row) {
      throw new BadRequestException(
        `Unknown product "${key}". Create it first via POST /v1/products.`,
      );
    }
    return key;
  }

  private writeStageChangeActivity(
    id: string,
    from: string,
    to: string,
  ): void {
    const target = this.stages.find(to);
    let bodyText = `Stage changed from ${from} to ${to}`;
    if (target?.is_won === 1) bodyText = `Deal moved to ${target.label} — won`;
    else if (target?.is_lost === 1)
      bodyText = `Deal moved to ${target.label} — lost`;
    this.database.sqlite
      .prepare(
        'INSERT INTO activities (id, entity_type, entity_id, type, body, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        randomUUID(),
        'deal',
        id,
        'stage_change',
        bodyText,
        JSON.stringify({ stage: to }),
        new Date().toISOString(),
      );
  }

  private require(id: string): Deal {
    const row = this.database.sqlite
      .prepare(`SELECT ${EXTRAS} FROM ${JOINS} WHERE d.id = ?`)
      .get(id) as Deal | undefined;
    if (!row) throw new NotFoundException('not_found');
    return row;
  }
}
