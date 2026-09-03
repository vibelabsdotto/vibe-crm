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
import type { Contact, ContactBody, ContactListQuery } from './contacts.dto';

export type { Contact, ContactBody, ContactListQuery };

const CONTACT_FIELDS = [
  'first_name',
  'last_name',
  'email',
  'phone',
  'title',
  'status',
] as const;

const CONTACT_STATUSES = ['lead', 'active', 'inactive', 'churned'] as const;

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function companyId(v: unknown): string | null {
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

function assertStatus(v: unknown): string {
  const s = str(v);
  if (!CONTACT_STATUSES.includes(s as (typeof CONTACT_STATUSES)[number])) {
    throw new BadRequestException(
      `Invalid status "${s}". Valid: ${CONTACT_STATUSES.join(', ')}`,
    );
  }
  return s;
}

@Injectable()
export class ContactsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly customFields: CustomFieldsService,
  ) {}

  list(query: ContactListQuery): {
    contacts: Contact[];
    total: number;
    page: number;
    limit: number;
  } {
    const { page, limit, offset, order, search } = parseList(query);
    const status = (query.status ?? '').trim();
    const companyIdFilter = (query.company_id ?? '').trim();
    const cols = tableColumns(this.database.sqlite, 'contacts');
    let sortCol = query.sort ?? 'id';
    if (!cols.has(sortCol)) sortCol = 'id';

    const where: string[] = [];
    const params: unknown[] = [];
    if (search) {
      where.push(
        '(ct.first_name LIKE ? OR ct.last_name LIKE ? OR ct.email LIKE ? OR ct.title LIKE ? OR co.name LIKE ?)',
      );
      params.push(
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
      );
    }
    if (status) {
      where.push('ct.status = ?');
      params.push(status);
    }
    if (companyIdFilter) {
      where.push('ct.company_id = ?');
      params.push(companyIdFilter);
    }
    const flt = buildFilters(cols, query.filters, 'ct.');
    where.push(...flt.clauses);
    params.push(...flt.params);
    const whereSQL = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';

    const countRow = this.database.sqlite
      .prepare(
        `SELECT COUNT(*) as total FROM contacts ct LEFT JOIN companies co ON ct.company_id = co.id${whereSQL}`,
      )
      .get(...params) as { total: number };
    const rows = this.database.sqlite
      .prepare(
        `SELECT ct.*, co.name as company_name, co.domain as company_domain
         FROM contacts ct LEFT JOIN companies co ON ct.company_id = co.id
         ${whereSQL} ORDER BY ct.${qid(sortCol)} ${order}, ct.id LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as Contact[];
    return { contacts: rows, total: countRow?.total ?? 0, page, limit };
  }

  get(id: string): Contact {
    const row = this.database.sqlite
      .prepare(
        `SELECT ct.*, co.name as company_name, co.domain as company_domain
         FROM contacts ct LEFT JOIN companies co ON ct.company_id = co.id
         WHERE ct.id = ?`,
      )
      .get(id) as Contact | undefined;
    if (!row) throw new NotFoundException('not_found');
    return row;
  }

  create(body: ContactBody): Contact {
    const { values, unknown } = this.customFields.resolveWrite('contact', body);
    const unknownErr = this.customFields.unknownFieldsError('contact', unknown);
    if (unknownErr) throw new UnprocessableEntityException(unknownErr);
    const missing = this.customFields.missingRequired(
      'contact',
      values,
      'create',
    );
    if (missing.length > 0) {
      throw new BadRequestException(
        `Missing required field(s): ${missing.join(', ')}`,
      );
    }
    const firstName = str(body.first_name);
    if (!firstName) throw new BadRequestException('First name is required');
    const status =
      body.status === undefined ? 'lead' : assertStatus(body.status);
    const id = randomUUID();
    const now = new Date().toISOString();
    this.database.sqlite
      .prepare(
        'INSERT INTO contacts (id, first_name, last_name, email, phone, company_id, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        id,
        firstName,
        str(body.last_name),
        str(body.email),
        str(body.phone),
        companyId(body.company_id),
        str(body.title),
        status,
        now,
        now,
      );
    this.customFields.applyValues('contact', id, values);
    return this.get(id);
  }

  update(id: string, body: ContactBody): Contact {
    const { values, unknown } = this.customFields.resolveWrite('contact', body);
    const unknownErr = this.customFields.unknownFieldsError('contact', unknown);
    if (unknownErr) throw new UnprocessableEntityException(unknownErr);
    const missing = this.customFields.missingRequired(
      'contact',
      values,
      'update',
    );
    if (missing.length > 0) {
      throw new BadRequestException(
        `Missing required field(s): ${missing.join(', ')}`,
      );
    }
    const fields: string[] = [];
    const params: unknown[] = [];
    for (const key of CONTACT_FIELDS) {
      if (body[key] !== undefined) {
        if (key === 'status') {
          fields.push('status = ?');
          params.push(assertStatus(body[key]));
        } else {
          fields.push(`${key} = ?`);
          params.push(str(body[key]));
        }
      }
    }
    if (body.company_id !== undefined) {
      fields.push('company_id = ?');
      params.push(companyId(body.company_id));
    }
    const hasCustom = Object.keys(values).length > 0;
    if (fields.length === 0 && !hasCustom) {
      throw new BadRequestException('No fields to update');
    }
    this.get(id);
    if (fields.length > 0) {
      if (body.first_name !== undefined && str(body.first_name) === '') {
        throw new BadRequestException('First name cannot be empty');
      }
      fields.push('updated_at = ?');
      params.push(new Date().toISOString(), id);
      this.database.sqlite
        .prepare(`UPDATE contacts SET ${fields.join(', ')} WHERE id = ?`)
        .run(...params);
    }
    this.customFields.applyValues('contact', id, values);
    return this.get(id);
  }

  remove(id: string): { ok: boolean } {
    const res = this.database.sqlite
      .prepare('DELETE FROM contacts WHERE id = ?')
      .run(id);
    if ((res.changes ?? 0) === 0) throw new NotFoundException('not_found');
    return { ok: true };
  }
}
