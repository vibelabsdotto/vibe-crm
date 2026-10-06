import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  assertLinkedSubscriptions,
  effectiveCompany,
  requireReference,
} from '../common/entity-relations';
import {
  nullableReference,
  nonnegativeAmount,
  validDate,
} from '../common/entity-validation';
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
  COALESCE(d.company_id, ct.company_id) as effective_company_id,
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
    const company = (query.company_id ?? '').trim();
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
    if (company) {
      where.push('COALESCE(d.company_id, ct.company_id) = ?');
      params.push(company);
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

  get(id: string): Deal {
    return this.require(id);
  }

  create(body: DealBody): Deal {
    return this.database.sqlite
      .transaction(() => {
        // company_id/product_id are new base columns (contract v2) — the
        // custom-field registry only knows contact|company|deal built-ins, so
        // keep them out of resolveWrite to avoid false 422s.
        const customBody = { ...body };
        delete customBody.company_id;
        delete customBody.product_id;
        const { values, unknown } = this.customFields.resolveWrite(
          'deal',
          customBody,
        );
        const unknownErr = this.customFields.unknownFieldsError(
          'deal',
          unknown,
        );
        if (unknownErr) throw new UnprocessableEntityException(unknownErr);
        const missing = this.customFields.missingRequired(
          'deal',
          values,
          'create',
        );
        if (missing.length > 0) {
          throw new BadRequestException(
            `Erforderliche Felder fehlen: ${missing.join(', ')}`,
          );
        }
        const name = str(body.name);
        if (!name)
          throw new BadRequestException('Ein Deal-Name ist erforderlich.');
        const stage = this.resolveStage(body.stage, true);
        const value =
          body.value === undefined ? 0 : nonnegativeAmount(body.value, 'value');
        const companyId = nullableReference(body.company_id, 'company_id');
        const contactId = nullableReference(body.contact_id, 'contact_id');
        effectiveCompany(this.database.sqlite, {
          company_id: companyId,
          contact_id: contactId,
        });
        const productId = requireReference(
          this.database.sqlite,
          'products',
          nullableReference(body.product_id, 'product_id'),
        );
        const closeDate =
          body.close_date === undefined
            ? ''
            : validDate(body.close_date, 'close_date');
        const id = randomUUID();
        const now = new Date().toISOString();
        this.database.sqlite
          .prepare(
            'INSERT INTO deals (id, name, contact_id, company_id, product_id, value, stage, close_date, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .run(
            id,
            name,
            contactId,
            companyId,
            productId,
            value,
            stage,
            closeDate,
            str(body.notes),
            now,
            now,
          );
        this.customFields.applyValues('deal', id, values);
        return this.require(id);
      })
      .immediate();
  }

  update(id: string, body: DealBody): Deal {
    return this.database.sqlite
      .transaction(() => {
        const existing = this.require(id);
        const relations = {
          company_id:
            body.company_id === undefined
              ? existing.company_id
              : nullableReference(body.company_id, 'company_id'),
          contact_id:
            body.contact_id === undefined
              ? existing.contact_id
              : nullableReference(body.contact_id, 'contact_id'),
          product_id:
            body.product_id === undefined
              ? existing.product_id
              : nullableReference(body.product_id, 'product_id'),
        };
        effectiveCompany(this.database.sqlite, relations);
        requireReference(
          this.database.sqlite,
          'products',
          relations.product_id,
        );
        if (
          body.company_id !== undefined ||
          body.contact_id !== undefined ||
          body.product_id !== undefined
        ) {
          assertLinkedSubscriptions(this.database.sqlite, id, relations);
        }
        const customBody = { ...body };
        delete customBody.company_id;
        delete customBody.product_id;
        const { values, unknown } = this.customFields.resolveWrite(
          'deal',
          customBody,
        );
        const unknownErr = this.customFields.unknownFieldsError(
          'deal',
          unknown,
        );
        if (unknownErr) throw new UnprocessableEntityException(unknownErr);
        const missing = this.customFields.missingRequired(
          'deal',
          values,
          'update',
        );
        if (missing.length > 0) {
          throw new BadRequestException(
            `Erforderliche Felder fehlen: ${missing.join(', ')}`,
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
              params.push(relations.contact_id);
              break;
            case 'company_id':
              fields.push('company_id = ?');
              params.push(relations.company_id);
              break;
            case 'product_id':
              fields.push('product_id = ?');
              params.push(relations.product_id);
              break;
            case 'value':
              fields.push('value = ?');
              params.push(nonnegativeAmount(body.value, 'value'));
              break;
            case 'stage':
              nextStage = this.resolveStage(body.stage, false);
              fields.push('stage = ?');
              params.push(nextStage);
              break;
            case 'close_date':
              fields.push('close_date = ?');
              params.push(validDate(body.close_date, 'close_date'));
              break;
            case 'notes':
              fields.push('notes = ?');
              params.push(str(body.notes));
              break;
          }
        }
        const hasCustom = Object.keys(values).length > 0;
        if (fields.length === 0 && !hasCustom) {
          throw new BadRequestException(
            'Keine Felder zum Aktualisieren angegeben.',
          );
        }
        if (fields.length > 0) {
          if (body.name !== undefined && str(body.name) === '') {
            throw new BadRequestException(
              'Der Deal-Name darf nicht leer sein.',
            );
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
      })
      .immediate();
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
      throw new BadRequestException('Die Pipeline-Stufe darf nicht leer sein.');
    }
    if (!this.stages.find(s)) {
      throw new BadRequestException(
        `Unbekannte Pipeline-Stufe "${s}". Erlaubt: ${this.stages
          .list()
          .map((stage) => stage.key)
          .join(', ')}`,
      );
    }
    return s;
  }

  private writeStageChangeActivity(id: string, from: string, to: string): void {
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
