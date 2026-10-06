import { BadRequestException, Injectable } from '@nestjs/common';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { DatabaseService } from '../database/database.service';
import {
  DEFAULT_DEAL_COLUMNS,
  STANDARD_DEAL_VIEW_FIELDS,
  type DealFieldVisibility,
  type DealView,
  type DealViewField,
} from './deal-view.dto';

interface StoredView {
  columns: string;
  visibility: string;
}

function badRequest(message: string): BadRequestException {
  return new BadRequestException({ error: message });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

/** The same shape check applies to new rules and persisted configuration. */
function visibilityRule(body: unknown): DealFieldVisibility {
  if (isRecord(body) && Object.hasOwn(body, 'mode')) {
    const keys = Object.keys(body);
    if (body.mode === 'lost' && keys.length === 1) {
      return { mode: 'lost' };
    }
    if (
      body.mode === 'stages' &&
      keys.length === 2 &&
      Object.hasOwn(body, 'stages') &&
      Array.isArray(body.stages) &&
      body.stages.length > 0 &&
      body.stages.every((key): key is string => typeof key === 'string') &&
      new Set(body.stages).size === body.stages.length
    ) {
      return { mode: 'stages', stages: [...body.stages] };
    }
  }
  throw badRequest(
    'Erlaubt sind nur { mode: "lost" } oder { mode: "stages", stages: [...] } mit mindestens einem eindeutigen Stufen-Key.',
  );
}

@Injectable()
export class DealViewService {
  constructor(
    private readonly database: DatabaseService,
    private readonly customFields: CustomFieldsService,
  ) {}

  get(): DealView {
    // One read snapshot, including registry and stages. No seeding or cleanup.
    return this.database.sqlite.transaction(() => this.read())();
  }

  setColumns(body: unknown): DealView {
    return this.database.sqlite
      .transaction(() => {
        if (
          !isRecord(body) ||
          Object.keys(body).length !== 1 ||
          !Object.hasOwn(body, 'columns') ||
          !Array.isArray(body.columns) ||
          body.columns.length === 0 ||
          !body.columns.every((key): key is string => typeof key === 'string')
        ) {
          throw badRequest(
            'Die Ansicht erwartet ausschließlich { columns: [...] } mit mindestens einem Feld-Key.',
          );
        }
        const columns = body.columns;
        if (new Set(columns).size !== columns.length) {
          throw badRequest('Spalten dürfen nicht doppelt vorkommen.');
        }
        if (!columns.includes('name')) {
          throw badRequest('Die Spalte "name" muss enthalten sein.');
        }
        const known = new Set(this.fields().map((field) => field.key));
        const unknown = columns.filter((key) => !known.has(key));
        if (unknown.length > 0) {
          throw badRequest(`Unbekannte Feld-Keys: ${unknown.join(', ')}.`);
        }
        this.writeColumns(columns);
        return this.read();
      })
      .immediate();
  }

  resetColumns(): DealView {
    return this.database.sqlite
      .transaction(() => {
        this.writeColumns(DEFAULT_DEAL_COLUMNS);
        return this.read();
      })
      .immediate();
  }

  setVisibility(key: string, body: unknown): DealView {
    return this.database.sqlite
      .transaction(() => {
        this.requireCustomField(key);
        const rule = visibilityRule(body);
        if (rule.mode === 'stages') {
          const known = this.stageKeys();
          const unknown = rule.stages.filter((stage) => !known.has(stage));
          if (unknown.length > 0) {
            throw badRequest(
              `Unbekannte Pipeline-Stufen: ${unknown.join(', ')}. Erlaubt: ${[...known].join(', ')}.`,
            );
          }
        }
        const visibility = this.storedVisibility();
        visibility[key] = rule;
        this.writeVisibility(visibility);
        return this.read();
      })
      .immediate();
  }

  removeVisibility(key: string): DealView {
    return this.database.sqlite
      .transaction(() => {
        this.requireCustomField(key);
        const visibility = this.storedVisibility();
        delete visibility[key];
        this.writeVisibility(visibility);
        return this.read();
      })
      .immediate();
  }

  private stored(): StoredView | undefined {
    return this.database.sqlite
      .prepare('SELECT columns, visibility FROM deal_list_view WHERE id = 1')
      .get() as StoredView | undefined;
  }

  private fields(): DealViewField[] {
    return [
      ...STANDARD_DEAL_VIEW_FIELDS.map((field) => ({ ...field })),
      ...this.customFields.listDefs('deal').map((def): DealViewField => ({
        key: def.key,
        label: def.label,
        field_type: def.field_type,
        source: 'custom',
        options: def.options,
      })),
    ];
  }

  private stageKeys(): Set<string> {
    // StagesService.list() seeds an empty table, which is forbidden on this GET.
    const rows = this.database.sqlite
      .prepare('SELECT key FROM stages ORDER BY position, key')
      .all() as Array<{ key: string }>;
    return new Set(rows.map((stage) => stage.key));
  }

  private read(): DealView {
    const fields = this.fields();
    const known = new Set(fields.map((field) => field.key));
    const custom = new Set(
      fields
        .filter((field) => field.source === 'custom')
        .map((field) => field.key),
    );
    const stages = this.stageKeys();
    const warnings: string[] = [];
    const standards = new Set(
      STANDARD_DEAL_VIEW_FIELDS.map((field) => field.key),
    );
    for (const key of custom) {
      if (standards.has(key)) {
        warnings.push(
          `Das benutzerdefinierte Feld "${key}" kollidiert mit einem Standardfeld. Beide Definitionen bleiben erhalten.`,
        );
      }
    }
    const stored = this.stored();
    const rawColumns = stored
      ? parseJson(stored.columns)
      : [...DEFAULT_DEAL_COLUMNS];
    const columns: string[] = [];
    if (!Array.isArray(rawColumns)) {
      warnings.push(
        'Die gespeicherte Spaltenauswahl ist ungültig. Die Standardspalten werden angezeigt.',
      );
      columns.push(...DEFAULT_DEAL_COLUMNS);
    } else {
      for (const key of rawColumns as unknown[]) {
        if (typeof key !== 'string' || !known.has(key)) {
          warnings.push(`Unbekannte Spalte "${String(key)}" wird ignoriert.`);
        } else if (columns.includes(key)) {
          warnings.push(`Doppelte Spalte "${key}" wird ignoriert.`);
        } else {
          columns.push(key);
        }
      }
      if (!columns.includes('name')) {
        columns.unshift('name');
        warnings.push(
          'Die fehlende Spalte "name" wird zur Identifikation der Deals angezeigt.',
        );
      }
    }
    const visibility: Record<string, DealFieldVisibility> = {};
    const rawVisibility = stored ? parseJson(stored.visibility) : {};
    if (!isRecord(rawVisibility)) {
      warnings.push(
        'Die gespeicherten Sichtbarkeitsregeln sind ungültig und werden ignoriert.',
      );
    } else {
      for (const [key, raw] of Object.entries(rawVisibility)) {
        if (!custom.has(key)) {
          warnings.push(
            `Sichtbarkeitsregel für das nicht mehr registrierte Deal-Feld "${key}" wird ignoriert.`,
          );
          continue;
        }
        let rule: DealFieldVisibility;
        try {
          rule = visibilityRule(raw);
        } catch {
          warnings.push(
            `Ungültige Sichtbarkeitsregel für "${key}" wird ignoriert.`,
          );
          continue;
        }
        if (rule.mode === 'stages') {
          const validStages = rule.stages.filter((stage) => stages.has(stage));
          if (validStages.length !== rule.stages.length) {
            warnings.push(
              `Nicht mehr vorhandene Pipeline-Stufen in der Sichtbarkeitsregel für "${key}" werden ignoriert.`,
            );
          }
          if (validStages.length === 0) {
            warnings.push(
              `Die Sichtbarkeitsregel für "${key}" hat keine gültige Pipeline-Stufe mehr und wird ignoriert. Das Feld bleibt sichtbar.`,
            );
            continue;
          }
          rule = { mode: 'stages', stages: validStages };
        }
        visibility[key] = rule;
      }
    }
    return {
      fields,
      columns,
      default_columns: [...DEFAULT_DEAL_COLUMNS],
      visibility,
      warnings,
    };
  }

  private requireCustomField(key: string): void {
    if (!this.customFields.listDefs('deal').some((def) => def.key === key)) {
      throw badRequest(
        `Sichtbarkeitsregeln sind nur für registrierte benutzerdefinierte Deal-Felder erlaubt: "${key}".`,
      );
    }
  }

  private storedVisibility(): Record<string, unknown> {
    const raw = parseJson(this.stored()?.visibility ?? '{}');
    return isRecord(raw) ? raw : {};
  }

  private writeColumns(columns: readonly string[]): void {
    this.database.sqlite
      .prepare(
        'INSERT INTO deal_list_view (id, columns, visibility) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET columns = excluded.columns',
      )
      .run(JSON.stringify(columns), '{}');
  }

  private writeVisibility(visibility: Record<string, unknown>): void {
    this.database.sqlite
      .prepare(
        'INSERT INTO deal_list_view (id, columns, visibility) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET visibility = excluded.visibility',
      )
      .run(JSON.stringify(DEFAULT_DEAL_COLUMNS), JSON.stringify(visibility));
  }
}
