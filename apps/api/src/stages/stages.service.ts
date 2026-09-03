import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface Stage {
  key: string;
  label: string;
  color: string;
  position: number;
  is_won: number;
  is_lost: number;
  created_at: string;
  updated_at: string;
}

export interface CreateStageInput {
  label?: unknown;
  key?: unknown;
  color?: unknown;
  position?: unknown;
  is_won?: unknown;
  is_lost?: unknown;
}

export interface UpdateStageInput {
  label?: unknown;
  color?: unknown;
  position?: unknown;
  is_won?: unknown;
  is_lost?: unknown;
  key?: unknown;
}

export const STAGE_COLORS = [
  'sky',
  'emerald',
  'amber',
  'rose',
  'violet',
  'fuchsia',
  'teal',
  'orange',
  'slate',
] as const;

const STAGE_KEY_RE = /^[a-z][a-z0-9_]*$/;

/** Default sales pipeline — seeded only when the table is empty. */
const DEFAULT_STAGES: Array<[string, string, string, number, number, number]> =
  [
    ['prospect', 'Prospect', 'slate', 0, 0, 0],
    ['qualified', 'Qualified', 'sky', 1, 0, 0],
    ['proposal', 'Proposal', 'violet', 2, 0, 0],
    ['negotiation', 'Negotiation', 'amber', 3, 0, 0],
    ['won', 'Won', 'emerald', 4, 1, 0],
    ['lost', 'Lost', 'rose', 5, 0, 1],
  ];

@Injectable()
export class StagesService {
  constructor(private readonly database: DatabaseService) {}

  /**
   * Seed the default pipeline only when the table is empty, so re-deploys
   * never resurrect a stage the user renamed or deleted.
   */
  ensureSeeded(): void {
    const row = this.database.sqlite
      .prepare('SELECT COUNT(*) as count FROM stages')
      .get() as { count: number };
    if ((row?.count ?? 0) !== 0) return;
    const now = new Date().toISOString();
    const insert = this.database.sqlite.prepare(
      'INSERT OR IGNORE INTO stages (key, label, color, position, is_won, is_lost, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    );
    for (const [key, label, color, position, isWon, isLost] of DEFAULT_STAGES) {
      insert.run(key, label, color, position, isWon, isLost, now, now);
    }
  }

  list(): Stage[] {
    this.ensureSeeded();
    return this.database.sqlite
      .prepare('SELECT * FROM stages ORDER BY position, key')
      .all() as Stage[];
  }

  /** Look up one stage (seeding the defaults first if the table is empty). */
  find(key: string): Stage | undefined {
    this.ensureSeeded();
    return this.database.sqlite
      .prepare('SELECT * FROM stages WHERE key = ?')
      .get(key) as Stage | undefined;
  }

  validKeys(): string[] {
    return this.list().map((s) => s.key);
  }

  /** 400 body for an unknown stage key on a deal write. */
  unknownStageError(key: string): string {
    return `Unknown stage "${key}". Valid stages: ${this.validKeys().join(', ')}. Create it first via POST /v1/stages.`;
  }

  create(input: CreateStageInput): Stage {
    const label = typeof input.label === 'string' ? input.label.trim() : '';
    if (!label) throw new BadRequestException('Label is required');
    const rawKey = typeof input.key === 'string' ? input.key : '';
    const key = (
      rawKey ||
      label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
    ).trim();
    if (!STAGE_KEY_RE.test(key)) {
      throw new BadRequestException(
        `Invalid stage key "${key}" — use lowercase letters, digits, and underscores (must start with a letter).`,
      );
    }
    const isWon = input.is_won === true;
    const isLost = input.is_lost === true;
    if (isWon && isLost) {
      throw new BadRequestException('A stage cannot be both won and lost');
    }
    if (this.find(key)) {
      throw new ConflictException(`Stage "${key}" already exists`);
    }
    const rawColor = typeof input.color === 'string' ? input.color.trim() : '';
    const color = (STAGE_COLORS as readonly string[]).includes(rawColor)
      ? rawColor
      : 'slate';
    let position: number;
    if (
      typeof input.position === 'number' &&
      Number.isInteger(input.position)
    ) {
      position = input.position;
    } else {
      const max = this.database.sqlite
        .prepare('SELECT COALESCE(MAX(position), -1) as m FROM stages')
        .get() as { m: number };
      position = (max?.m ?? -1) + 1;
    }
    const now = new Date().toISOString();
    this.database.sqlite
      .prepare(
        'INSERT INTO stages (key, label, color, position, is_won, is_lost, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        key,
        label,
        color,
        position,
        isWon ? 1 : 0,
        isLost ? 1 : 0,
        now,
        now,
      );
    const inserted = this.find(key);
    if (!inserted) throw new BadRequestException('Failed to create stage');
    return inserted;
  }

  update(key: string, input: UpdateStageInput): Stage {
    const existing = this.find(key);
    if (!existing) throw new NotFoundException('not_found');
    if (input.key !== undefined) {
      throw new BadRequestException('Stage key is immutable');
    }
    const isWon =
      input.is_won === undefined
        ? existing.is_won === 1
        : input.is_won === true;
    const isLost =
      input.is_lost === undefined
        ? existing.is_lost === 1
        : input.is_lost === true;
    if (isWon && isLost) {
      throw new BadRequestException('A stage cannot be both won and lost');
    }
    const fields: string[] = [];
    const params: unknown[] = [];
    if (input.label !== undefined) {
      const label = typeof input.label === 'string' ? input.label.trim() : '';
      if (!label) throw new BadRequestException('Label cannot be empty');
      fields.push('label = ?');
      params.push(label);
    }
    if (input.color !== undefined) {
      const color = typeof input.color === 'string' ? input.color.trim() : '';
      if (!(STAGE_COLORS as readonly string[]).includes(color)) {
        throw new BadRequestException(
          `Unknown color "${typeof input.color === 'string' ? input.color : ''}". Valid: ${STAGE_COLORS.join(', ')}`,
        );
      }
      fields.push('color = ?');
      params.push(color);
    }
    if (input.position !== undefined) {
      if (
        typeof input.position !== 'number' ||
        !Number.isInteger(input.position)
      ) {
        throw new BadRequestException('position must be an integer');
      }
      fields.push('position = ?');
      params.push(input.position);
    }
    if (input.is_won !== undefined) {
      fields.push('is_won = ?');
      params.push(input.is_won === true ? 1 : 0);
    }
    if (input.is_lost !== undefined) {
      fields.push('is_lost = ?');
      params.push(input.is_lost === true ? 1 : 0);
    }
    if (fields.length === 0)
      throw new BadRequestException('No fields to update');
    fields.push('updated_at = ?');
    params.push(new Date().toISOString(), key);
    this.database.sqlite
      .prepare(`UPDATE stages SET ${fields.join(', ')} WHERE key = ?`)
      .run(...params);
    const updated = this.find(key);
    if (!updated) throw new NotFoundException('not_found');
    return updated;
  }

  remove(
    key: string,
    reassignTo?: string,
  ): { ok: boolean; reassigned: number } {
    const existing = this.find(key);
    if (!existing) throw new NotFoundException('not_found');
    const total = this.database.sqlite
      .prepare('SELECT COUNT(*) as count FROM stages')
      .get() as { count: number };
    if ((total?.count ?? 0) <= 1) {
      throw new BadRequestException('Cannot delete the last stage');
    }
    const inStage = this.database.sqlite
      .prepare('SELECT COUNT(*) as count FROM deals WHERE stage = ?')
      .get(key) as { count: number };
    let reassigned = 0;
    if ((inStage?.count ?? 0) > 0) {
      const target = (reassignTo ?? '').trim();
      if (!target) {
        throw new ConflictException(
          `Stage has ${inStage.count} deal(s). Pass ?reassign_to=<stage key> to move them first.`,
        );
      }
      if (target === key) {
        throw new BadRequestException('reassign_to must be a different stage');
      }
      if (!this.find(target)) {
        throw new BadRequestException(this.unknownStageError(target));
      }
      const res = this.database.sqlite
        .prepare('UPDATE deals SET stage = ?, updated_at = ? WHERE stage = ?')
        .run(target, new Date().toISOString(), key);
      reassigned = Number(res.changes ?? 0);
    }
    this.database.sqlite.prepare('DELETE FROM stages WHERE key = ?').run(key);
    return { ok: true, reassigned };
  }
}
