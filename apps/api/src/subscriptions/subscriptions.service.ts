import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  assertDealLink,
  effectiveCompany,
  linkedDeal,
  requireReference,
} from '../common/entity-relations';
import {
  nullableReference,
  nonnegativeAmount,
  validCurrency,
  validDate,
  validDateRange,
} from '../common/entity-validation';
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
  'deal_id',
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

type SubscriptionValues = Pick<Subscription, (typeof SUB_FIELDS)[number]>;

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
    const dealId = str(query.deal_id);
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
    if (dealId) {
      where.push('s.deal_id = ?');
      params.push(dealId);
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
        'SELECT status, "interval" as subscription_interval, amount, currency, product_id FROM subscriptions',
      )
      .all() as Array<{
      status: string;
      subscription_interval: string;
      amount: number;
      currency: string;
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
    const currencies = new Map<
      string,
      { currency: string; mrr: number; active: number }
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
      const currency = currencies.get(row.currency) ?? {
        currency: row.currency,
        mrr: 0,
        active: 0,
      };
      currency.mrr += contribution;
      currency.active += 1;
      currencies.set(row.currency, currency);
      // Preserve the legacy EUR totals without combining currencies.
      if (row.currency !== 'EUR') continue;
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
      byCurrency: [...currencies.values()]
        .map((entry) => ({ ...entry, mrr: round2(entry.mrr) }))
        .sort((a, b) => a.currency.localeCompare(b.currency)),
      byProduct: [...by.values()]
        .map((e) => ({ ...e, mrr: round2(e.mrr) }))
        .sort((a, b) => b.mrr - a.mrr),
    };
  }

  create(body: SubscriptionBody): Subscription {
    return this.database.sqlite
      .transaction(() => {
        const dealId = nullableReference(body.deal_id, 'deal_id');
        const replay = dealId
          ? (this.database.sqlite
              .prepare('SELECT id FROM subscriptions WHERE deal_id = ?')
              .get(dealId) as { id: string } | undefined)
          : undefined;
        if (replay) {
          const existing = this.require(replay.id);
          const candidate = this.writeValues(body, existing);
          if (
            SUB_FIELDS.some((field) => candidate[field] !== existing[field])
          ) {
            throw new ConflictException(
              'Für diesen Deal existiert bereits ein Vertrag mit anderen Angaben. Bitte den bestehenden Vertrag bearbeiten.',
            );
          }
          return existing;
        }
        const values = this.writeValues(body);
        this.validateRelations(values);
        const id = randomUUID();
        const now = new Date().toISOString();
        this.database.sqlite
          .prepare(
            `INSERT INTO subscriptions (id, ${SUB_FIELDS.map(qid).join(', ')}, created_at, updated_at) VALUES (${Array(
              SUB_FIELDS.length + 3,
            )
              .fill('?')
              .join(', ')})`,
          )
          .run(id, ...SUB_FIELDS.map((field) => values[field]), now, now);
        return this.require(id);
      })
      .immediate();
  }

  update(id: string, body: SubscriptionBody): Subscription {
    return this.database.sqlite
      .transaction(() => {
        const existing = this.require(id);
        if (!SUB_FIELDS.some((field) => body[field] !== undefined)) {
          throw new BadRequestException(
            'Keine Felder zum Aktualisieren angegeben.',
          );
        }
        const values = this.writeValues(body, existing);
        this.validateRelations(values);
        const occupied = values.deal_id
          ? this.database.sqlite
              .prepare(
                'SELECT id FROM subscriptions WHERE deal_id = ? AND id != ?',
              )
              .get(values.deal_id, id)
          : undefined;
        if (occupied)
          throw new ConflictException(
            'Für diesen Deal existiert bereits ein anderer Vertrag.',
          );
        this.database.sqlite
          .prepare(
            `UPDATE subscriptions SET ${SUB_FIELDS.map((field) => `${qid(field)} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
          )
          .run(
            ...SUB_FIELDS.map((field) => values[field]),
            new Date().toISOString(),
            id,
          );
        return this.require(id);
      })
      .immediate();
  }

  get(id: string): Subscription {
    return this.require(id);
  }

  private writeValues(
    body: SubscriptionBody,
    existing?: Subscription,
  ): SubscriptionValues {
    const unknown = Object.keys(body).filter(
      (field) => !(SUB_FIELDS as readonly string[]).includes(field),
    );
    if (unknown.length)
      throw new BadRequestException(`Unbekannte Felder: ${unknown.join(', ')}`);
    const dealId =
      body.deal_id === undefined
        ? (existing?.deal_id ?? null)
        : nullableReference(body.deal_id, 'deal_id');
    // Only initial explicit linkage supplies defaults. Contracts remain independent afterward.
    const deal = !existing ? linkedDeal(this.database.sqlite, dealId) : null;
    const values: SubscriptionValues = {
      deal_id: dealId,
      company_id:
        body.company_id === undefined
          ? (existing?.company_id ?? deal?.company_id ?? null)
          : nullableReference(body.company_id, 'company_id'),
      contact_id:
        body.contact_id === undefined
          ? (existing?.contact_id ?? deal?.contact_id ?? null)
          : nullableReference(body.contact_id, 'contact_id'),
      product_id:
        body.product_id === undefined
          ? (existing?.product_id ?? deal?.product_id ?? null)
          : nullableReference(body.product_id, 'product_id'),
      name: body.name === undefined ? (existing?.name ?? '') : str(body.name),
      amount:
        body.amount === undefined
          ? (existing?.amount ?? 0)
          : nonnegativeAmount(body.amount, 'amount'),
      currency:
        body.currency === undefined
          ? (existing?.currency ?? 'EUR')
          : validCurrency(body.currency),
      interval:
        body.interval === undefined
          ? (existing?.interval ?? 'monthly')
          : str(body.interval),
      start_date:
        body.start_date === undefined
          ? (existing?.start_date ?? '')
          : validDate(body.start_date, 'start_date'),
      end_date:
        body.end_date === undefined
          ? (existing?.end_date ?? '')
          : validDate(body.end_date, 'end_date'),
      status:
        body.status === undefined
          ? (existing?.status ?? 'active')
          : str(body.status),
      notes:
        body.notes === undefined ? (existing?.notes ?? '') : str(body.notes),
    };
    if (!values.name)
      throw new BadRequestException('Ein Vertragsname ist erforderlich.');
    if (
      !(SUBSCRIPTION_INTERVALS as readonly string[]).includes(values.interval)
    ) {
      throw new BadRequestException(
        `Ungültiges Intervall. Erlaubt: ${SUBSCRIPTION_INTERVALS.join(', ')}`,
      );
    }
    if (!(SUBSCRIPTION_STATUSES as readonly string[]).includes(values.status)) {
      throw new BadRequestException(
        `Ungültiger Status. Erlaubt: ${SUBSCRIPTION_STATUSES.join(', ')}`,
      );
    }
    return values;
  }

  private validateRelations(values: SubscriptionValues): void {
    validDateRange(values.start_date, values.end_date);
    effectiveCompany(this.database.sqlite, values);
    requireReference(this.database.sqlite, 'products', values.product_id);
    const deal = linkedDeal(this.database.sqlite, values.deal_id);
    if (deal) assertDealLink(this.database.sqlite, values, deal);
  }

  remove(id: string): { ok: boolean } {
    const res = this.database.sqlite
      .prepare('DELETE FROM subscriptions WHERE id = ?')
      .run(id);
    if ((res.changes ?? 0) === 0) throw new NotFoundException('not_found');
    return { ok: true };
  }

  private require(id: string): Subscription {
    const row = this.database.sqlite
      .prepare(`SELECT ${EXTRAS} FROM ${JOINS} WHERE s.id = ?`)
      .get(id) as Subscription | undefined;
    if (!row) throw new NotFoundException('not_found');
    return row;
  }
}
