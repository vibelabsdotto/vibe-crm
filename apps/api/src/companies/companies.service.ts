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
  type ListQuery,
} from '../common/list-query';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { DatabaseService } from '../database/database.service';

export interface Company {
  id: string;
  name: string;
  domain: string;
  industry: string;
  phone: string;
  email: string;
  notes: string;
  contact_count?: number;
  created_at: string;
  updated_at: string;
}

export interface CompanyBody {
  name?: unknown;
  domain?: unknown;
  industry?: unknown;
  phone?: unknown;
  email?: unknown;
  notes?: unknown;
  custom?: unknown;
  [key: string]: unknown;
}

const COMPANY_FIELDS = [
  'name',
  'domain',
  'industry',
  'phone',
  'email',
  'notes',
] as const;

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

@Injectable()
export class CompaniesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly customFields: CustomFieldsService,
  ) {}

  list(query: ListQuery & { industry?: string }): {
    companies: Company[];
    total: number;
    page: number;
    limit: number;
  } {
    const { page, limit, offset, order, search } = parseList(query);
    const industry = (query.industry ?? '').trim();
    const cols = tableColumns(this.database.sqlite, 'companies');
    let sortCol = query.sort ?? 'id';
    if (!cols.has(sortCol)) sortCol = 'id';

    const where: string[] = [];
    const params: unknown[] = [];
    if (search) {
      where.push('(name LIKE ? OR domain LIKE ? OR email LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (industry) {
      where.push('industry = ?');
      params.push(industry);
    }
    const flt = buildFilters(cols, query.filters);
    where.push(...flt.clauses);
    params.push(...flt.params);
    const whereSQL = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';

    const countRow = this.database.sqlite
      .prepare(`SELECT COUNT(*) as total FROM companies${whereSQL}`)
      .get(...params) as { total: number };
    const rows = this.database.sqlite
      .prepare(
        `SELECT c.*, (SELECT COUNT(*) FROM contacts WHERE company_id = c.id) as contact_count
         FROM companies c${whereSQL} ORDER BY c.${qid(sortCol)} ${order}, c.id LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as Company[];
    return { companies: rows, total: countRow?.total ?? 0, page, limit };
  }

  create(body: CompanyBody): Company {
    const { values, unknown } = this.customFields.resolveWrite('company', body);
    const unknownErr = this.customFields.unknownFieldsError('company', unknown);
    if (unknownErr) throw new UnprocessableEntityException(unknownErr);
    const missing = this.customFields.missingRequired(
      'company',
      values,
      'create',
    );
    if (missing.length > 0) {
      throw new BadRequestException(
        `Missing required field(s): ${missing.join(', ')}`,
      );
    }
    const name = str(body.name);
    if (!name) throw new BadRequestException('Name is required');
    const id = randomUUID();
    const now = new Date().toISOString();
    this.database.sqlite
      .prepare(
        'INSERT INTO companies (id, name, domain, industry, phone, email, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        id,
        name,
        str(body.domain),
        str(body.industry),
        str(body.phone),
        str(body.email),
        str(body.notes),
        now,
        now,
      );
    this.customFields.applyValues('company', id, values);
    return this.require(id);
  }

  update(id: string, body: CompanyBody): Company {
    const { values, unknown } = this.customFields.resolveWrite('company', body);
    const unknownErr = this.customFields.unknownFieldsError('company', unknown);
    if (unknownErr) throw new UnprocessableEntityException(unknownErr);
    const missing = this.customFields.missingRequired(
      'company',
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
    for (const key of COMPANY_FIELDS) {
      if (body[key] !== undefined) {
        fields.push(`${key} = ?`);
        params.push(str(body[key]));
      }
    }
    const hasCustom = Object.keys(values).length > 0;
    if (fields.length === 0 && !hasCustom) {
      throw new BadRequestException('No fields to update');
    }
    this.require(id);
    if (fields.length > 0) {
      if (body.name !== undefined && str(body.name) === '') {
        throw new BadRequestException('Name cannot be empty');
      }
      fields.push('updated_at = ?');
      params.push(new Date().toISOString(), id);
      this.database.sqlite
        .prepare(`UPDATE companies SET ${fields.join(', ')} WHERE id = ?`)
        .run(...params);
    }
    this.customFields.applyValues('company', id, values);
    return this.require(id);
  }

  remove(id: string): { ok: boolean } {
    const res = this.database.sqlite
      .prepare('DELETE FROM companies WHERE id = ?')
      .run(id);
    if ((res.changes ?? 0) === 0) throw new NotFoundException('not_found');
    return { ok: true };
  }

  private require(id: string): Company {
    const row = this.database.sqlite
      .prepare('SELECT * FROM companies WHERE id = ?')
      .get(id) as Company | undefined;
    if (!row) throw new NotFoundException('not_found');
    return row;
  }
}
