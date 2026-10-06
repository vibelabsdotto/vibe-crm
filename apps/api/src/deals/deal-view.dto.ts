import type { AttributeType } from '../custom-fields/custom-fields.service';

export interface DealViewField {
  key: string;
  label: string;
  field_type: AttributeType;
  source: 'standard' | 'custom';
  options?: Record<string, unknown>;
}

export type DealFieldVisibility =
  { mode: 'lost' } | { mode: 'stages'; stages: string[] };

export interface DealView {
  fields: DealViewField[];
  columns: string[];
  default_columns: string[];
  visibility: Record<string, DealFieldVisibility>;
  warnings: string[];
}

export const DEFAULT_DEAL_COLUMNS: readonly string[] = [
  'name',
  'company_name',
  'contact_name',
  'product_name',
  'value',
  'close_date',
];

export const STANDARD_DEAL_VIEW_FIELDS: readonly DealViewField[] = [
  { key: 'name', label: 'Name', field_type: 'string', source: 'standard' },
  {
    key: 'company_name',
    label: 'Firma',
    field_type: 'string',
    source: 'standard',
  },
  {
    key: 'contact_name',
    label: 'Kontakt',
    field_type: 'string',
    source: 'standard',
  },
  {
    key: 'product_name',
    label: 'Produkt',
    field_type: 'string',
    source: 'standard',
  },
  { key: 'value', label: 'Wert', field_type: 'decimal', source: 'standard' },
  {
    key: 'close_date',
    label: 'Abschlussdatum',
    field_type: 'date',
    source: 'standard',
  },
  { key: 'notes', label: 'Notizen', field_type: 'text', source: 'standard' },
  {
    key: 'stage',
    label: 'Phase',
    field_type: 'enumeration',
    source: 'standard',
  },
  {
    key: 'created_at',
    label: 'Erstellt am',
    field_type: 'datetime',
    source: 'standard',
  },
  {
    key: 'updated_at',
    label: 'Aktualisiert am',
    field_type: 'datetime',
    source: 'standard',
  },
  { key: 'id', label: 'ID', field_type: 'string', source: 'standard' },
];
