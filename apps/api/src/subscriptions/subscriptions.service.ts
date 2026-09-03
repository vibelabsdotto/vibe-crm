import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  buildFilters,
  parseList,
  qid,
  tableColumns,
} from '../common/list-query';
import { DatabaseService } from '../database/database.service';
import type {
  Subscription,
  SubscriptionBody,
  SubscriptionListQuery,
  SubscriptionSummary,
} from './subscriptions.dto';

export type {
  Subscription,
  SubscriptionBody,
  SubscriptionListQuery,
  SubscriptionSummary,
};

export const SUBSCRIPTION_INTERVALS = [
  'monthly',
  'quarterly',
  'yearly',
  'one_time',
] as const;

export const SUBSCRIPTION_STATUSES = [
  'active',
  'trial',
  'paused',
  'cancelled',
  'expired',
] as const;

const SUB_FIELDS = [
  'company_id',
  'contact_id',
  'product_id',
  'name',
  'amount',
  'currency',
  'interval',
  'start_date',
  'end_date',
  'status',
  'notes',
] as const;

const EXTRAS = `s.*,
  co.name as company_name,
  p.name as product_name`;

const JOINS = `subscriptions s
  LEFT JOIN companies co ON s.company_id = co.id
  LEFT JOIN products p ON s.product_id = p.key`;

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Nullable FK input: undefined/null/'' → null, otherwise the trimmed id. */
function refId(v: unknown): string | null {
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
    throw new BadRequestException('Invalid amount — must be a number');
  return n;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

@Injectable()
export class SubscriptionsService {
  constructor(private readonly database: DatabaseService) {}

  list(query: SubscriptionListQuery): {
    subscriptions: Subscription[];
    total: number;
    page: number;
    limit: number;
  } {
    const { page, limit, offset, order, search } = parseList(query);
    const status = str(query.status);
    const companyId = str(query.company_id);
    const product = str(query.product);
    const cols = tableColumns(this.database.sqlite, 'subscriptions');
    let sortCol = query.sort ?? 'id';
    if (!cols.has(sortCol)) sortCol = 'id';

    const where: string[] = [];
    const params: unknown[] = [];
    if (search) {
      where.push('(s.name LIKE ? OR s.notes LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    if (status) {
      where.push('s.status = ?');
      params.push(status);
    }
    if (companyId) {
      where.push('s.company_id = ?');
      params.push(companyId);
    }
    if (product) {
      where.push('s.product_id = ?');
      params.push(product);
    }
    const flt = buildFilters(cols, query.filters, 's.');
    where.push(...flt.clauses);
    params.push(...flt.params);
    const whereSQL = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';

    const countRow = this.database.sqlite
      .prepare(`SELECT COUNT(*) as total FROM ${JOINS}${whereSQL}`)
      .get(...params) as { total: number };
    const rows = this.database.sqlite
      .prepare(
        `SELECT ${EXTRAS} FROM ${JOINS}${whereSQL} ORDER BY s.${qid(sortCol)} ${order}, s.id LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as Subscription[];
    return {
      subscriptions: rows,
      total: countRow?.total ?? 0,
      page,
      limit,
    };
  }

  summary(): SubscriptionSummary {
    const rows = this.database.sqlite
      .prepare(
        'SELECT status, "interval" as subscription_interval, amount, product_id FROM subscriptions',
      )
      .all() as Array<{
      status: string;
      subscription_interval: string;
      amount: number;
      product_id: string | null;
    }>;
    const names = this.database.sqlite
      .prepare('SELECT key, name FROM products')
      .all() as Array<{ key: string; name: string }>;
    const productName = new Map(names.map((p) => [p.key, p.name]));

    let mrr = 0;
    let active = 0;
    let trial = 0;
    let paused = 0;
    const by = new Map<
      string,
      { product: string; productName: string; mrr: number; active: number }
    >();
    for (const row of rows) {
      if (row.status === 'active') active += 1;
      else if (row.status === 'trial') trial += 1;
      else if (row.status === 'paused') paused += 1;
      // MRR rule (contract §1): active|trial only; one_time contributes 0.
      if (row.status !== 'active' && row.status !== 'trial') continue;
      const weight =
        row.subscription_interval === 'monthly'
          ? 1
          : row.subscription_interval === 'quarterly'
            ? 1 / 3
            : row.subscription_interval === 'yearly'
              ? 1 / 12
              : 0;
      const contribution = (Number(row.amount) || 0) * weight;
      mrr += contribution;
      const key = row.product_id ?? '';
      const entry = by.get(key) ?? {
        product: key,
        productName: key ? (productName.get(key) ?? '') : '',
        mrr: 0,
        active: 0,
      };
      entry.mrr += contribution;
      entry.active += 1;
      by.set(key, entry);
    }
    return {
      mrr: round2(mrr),
      active,
      trial,
      paused,
      total: rows.length,
      byProduct: [...by.values()]
        .map((e) => ({ ...e, mrr: round2(e.mrr) }))
        .sort((a, b) => b.mrr - a.mrr),
    };
  }

  create(body: SubscriptionBody): Subscription {
    const name = str(body.name);
    if (!name) throw new BadRequestException('Name is required');
    const interval =
      body.interval === undefined ? 'monthly' : str(body.interval);
    if (!(SUBSCRIPTION_INTERVALS as readonly string[]).includes(interval)) {
      throw new BadRequestException(
        `Unknown interval "${interval}". Valid: ${SUBSCRIPTION_INTERVALS.join(', ')}`,
      );
    }
    const status = body.status === undefined ? 'active' : str(body.status);
    if (!(SUBSCRIPTION_STATUSES as readonly string[]).includes(status)) {
      throw new BadRequestException(
        `Unknown status "${status}". Valid: ${SUBSCRIPTION_STATUSES.join(', ')}`,
      );
    }
    const amount = body.amount === undefined ? 0 : num(body.amount);
    const companyId = refId(body.company_id);
    const contactId = refId(body.contact_id);
    const productId = refId(body.product_id);
    this.requireRef('companies', companyId, 'company_id');
    this.requireRef('contacts', contactId, 'contact_id');
    this.requireProduct(productId);
    const id = randomUUID();
    const now = new Date().toISOString();
    this.database.sqlite
      .prepare(
        'INSERT INTO subscriptions (id, company_id, contact_id, product_id, name, amount, currency, "interval", start_date, end_date, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        id,
        companyId,
        contactId,
        productId,
        name,
        amount,
        body.currency === undefined ? 'EUR' : str(body.currency),
        interval,
        str(body.start_date),
        str(body.end_date),
        status,
        str(body.notes),
        now,
        now,
      );
    return this.require(id);
  }

  update(id: string, body: SubscriptionBody): Subscription {
    const fields: string[] = [];
    const params: unknown[] = [];
    for (const key of SUB_FIELDS) {
      if (body[key] === undefined) continue;
      switch (key) {
        case 'company_id': {
          const companyId = this.requireRef(
            'companies',
            refId(body.company_id),
            'company_id',
          );
          fields.push('company_id = ?');
          params.push(companyId);
          break;
        }
        case 'contact_id': {
          const contactId = this.requireRef(
            'contacts',
            refId(body.contact_id),
            'contact_id',
          );
          fields.push('contact_id = ?');
          params.push(contactId);
          break;
        }
        case 'product_id': {
          const productId = this.requireProduct(refId(body.product_id));
          fields.push('product_id = ?');
          params.push(productId);
          break;
        }
        case 'name': {
          const name = str(body.name);
          if (!name) throw new BadRequestException('Name cannot be empty');
          fields.push('name = ?');
          params.push(name);
          break;
        }
        case 'amount':
          fields.push('amount = ?');
          params.push(num(body.amount));
          break;
        case 'currency':
          fields.push('currency = ?');
          params.push(str(body.currency));
          break;
        case 'interval': {
          const interval = str(body.interval);
          if (
            !(SUBSCRIPTION_INTERVALS as readonly string[]).includes(interval)
          ) {
            throw new BadRequestException(
              `Unknown interval "${interval}". Valid: ${SUBSCRIPTION_INTERVALS.join(', ')}`,
            );
          }
          fields.push('"interval" = ?');
          params.push(interval);
          break;
        }
        case 'start_date':
          fields.push('start_date = ?');
          params.push(str(body.start_date));
          break;
        case 'end_date':
          fields.push('end_date = ?');
          params.push(str(body.end_date));
          break;
        case 'status': {
          const status = str(body.status);
          if (!(SUBSCRIPTION_STATUSES as readonly string[]).includes(status)) {
            throw new BadRequestException(
              `Unknown status "${status}". Valid: ${SUBSCRIPTION_STATUSES.join(', ')}`,
            );
          }
          fields.push('status = ?');
          params.push(status);
          break;
        }
        case 'notes':
          fields.push('notes = ?');
          params.push(str(body.notes));
          break;
      }
    }
    if (fields.length === 0) {
      throw new BadRequestException('No fields to update');
    }
    this.require(id);
    fields.push('updated_at = ?');
    params.push(new Date().toISOString(), id);
    this.database.sqlite
      .prepare(`UPDATE subscriptions SET ${fields.join(', ')} WHERE id = ?`)
      .run(...params);
    return this.require(id);
  }

  remove(id: string): { ok: boolean } {
    const res = this.database.sqlite
      .prepare('DELETE FROM subscriptions WHERE id = ?')
      .run(id);
    if ((res.changes ?? 0) === 0) throw new NotFoundException('not_found');
    return { ok: true };
  }

  /** 400 when a product ref points at a non-existent product. */
  private requireProduct(key: string | null): string | null {
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

  /** 400 when a company/contact ref points at a non-existent row. */
  private requireRef(
    table: 'companies' | 'contacts',
    id: string | null,
    field: string,
  ): string | null {
    if (id === null) return null;
    const row = this.database.sqlite
      .prepare(`SELECT id FROM ${table} WHERE id = ?`)
      .get(id) as { id: string } | undefined;
    if (!row) {
      throw new BadRequestException(`Unknown ${field} "${id}".`);
    }
    return id;
  }

  private require(id: string): Subscription {
    const row = this.database.sqlite
      .prepare(`SELECT ${EXTRAS} FROM ${JOINS} WHERE s.id = ?`)
      .get(id) as Subscription | undefined;
    if (!row) throw new NotFoundException('not_found');
    return row;
  }
}
