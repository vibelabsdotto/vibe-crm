import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';

export interface Activity {
  id: string;
  entity_type: string;
  entity_id: string;
  type: string;
  body: string;
  meta: unknown;
  created_at: string;
}

export interface ActivityBody {
  entity_type?: unknown;
  entity_id?: unknown;
  type?: unknown;
  body?: unknown;
  meta?: unknown;
  [key: string]: unknown;
}

export const ENTITY_TYPES = ['contact', 'company', 'deal'] as const;
export const ACTIVITY_TYPES = [
  'note',
  'email',
  'meeting',
  'stage_change',
] as const;

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function toMeta(v: unknown): string {
  if (v === undefined || v === null) return '{}';
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (trimmed === '') return '{}';
    try {
      JSON.parse(trimmed);
    } catch {
      throw new BadRequestException('meta must be valid JSON');
    }
    return trimmed;
  }
  return JSON.stringify(v);
}

function fromRow(row: Record<string, unknown>): Activity {
  const raw = row['meta'];
  let meta: unknown = raw;
  if (typeof raw === 'string') {
    try {
      meta = JSON.parse(raw);
    } catch {
      meta = raw;
    }
  }
  return { ...(row as object), meta } as Activity;
}

@Injectable()
export class ActivitiesService {
  constructor(private readonly database: DatabaseService) {}

  list(entityType: unknown, entityId: unknown): { activities: Activity[] } {
    const et = str(entityType);
    if (!et || !(ENTITY_TYPES as readonly string[]).includes(et)) {
      throw new BadRequestException(
        `entity_type must be one of: ${ENTITY_TYPES.join(', ')}`,
      );
    }
    const eid = str(entityId);
    if (!eid) throw new BadRequestException('entity_id is required');
    const rows = this.database.sqlite
      .prepare(
        'SELECT id, entity_type, entity_id, type, body, meta, created_at FROM activities WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC, id DESC',
      )
      .all(et, eid) as Record<string, unknown>[];
    return { activities: rows.map(fromRow) };
  }

  create(body: ActivityBody): Activity {
    const entityType = str(body.entity_type);
    if (
      !entityType ||
      !(ENTITY_TYPES as readonly string[]).includes(entityType)
    ) {
      throw new BadRequestException(
        `entity_type must be one of: ${ENTITY_TYPES.join(', ')}`,
      );
    }
    const entityId = str(body.entity_id);
    if (!entityId) throw new BadRequestException('entity_id is required');
    const type = body.type === undefined ? 'note' : str(body.type);
    if (!(ACTIVITY_TYPES as readonly string[]).includes(type)) {
      throw new BadRequestException(
        `type must be one of: ${ACTIVITY_TYPES.join(', ')}`,
      );
    }
    const text = typeof body.body === 'string' ? body.body : '';
    const meta = toMeta(body.meta);
    const id = randomUUID();
    const now = new Date().toISOString();
    this.database.sqlite
      .prepare(
        'INSERT INTO activities (id, entity_type, entity_id, type, body, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(id, entityType, entityId, type, text, meta, now);
    const row = this.database.sqlite
      .prepare(
        'SELECT id, entity_type, entity_id, type, body, meta, created_at FROM activities WHERE id = ?',
      )
      .get(id) as Record<string, unknown>;
    return fromRow(row);
  }
}
