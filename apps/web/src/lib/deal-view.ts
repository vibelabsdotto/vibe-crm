import type { CustomFieldDef, Deal, Stage } from "@/lib/types";

export type DealFieldVisibility = { mode: "lost" } | { mode: "stages"; stages: string[] };
export type DealViewField = {
  key: string;
  label: string;
  field_type: CustomFieldDef["field_type"];
  source: "standard" | "custom";
  options?: Record<string, unknown>;
};
export type DealView = {
  fields: DealViewField[];
  columns: string[];
  default_columns: string[];
  visibility: Record<string, DealFieldVisibility>;
  warnings: string[];
};

/** Presentation only. Visibility never grants access or clears stored values. */
export function isDealFieldVisible(key: string, stage: Stage | undefined, visibility: DealView["visibility"]): boolean {
  if (!Object.hasOwn(visibility, key)) return true;
  const rule = visibility[key];
  if (!rule) return true;
  if (rule.mode === "lost") return stage?.is_lost === 1;
  return stage !== undefined && rule.stages.includes(stage.key);
}

export function dealViewValue(deal: Deal, field: DealViewField): unknown {
  if (field.source === "standard" && field.key === "contact_name") {
    return deal.contact_name || [deal.contact_first_name, deal.contact_last_name].filter(Boolean).join(" ");
  }
  return deal[field.key];
}

/** Calendar dates are rendered in UTC, never as a shifted local instant. */
export function formatDealViewValue(value: unknown, field: DealViewField): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field.field_type === "boolean") return value === true || value === 1 || value === "1" ? "Ja" : "Nein";
  if (field.field_type === "date" && typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00Z`);
    if (!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value) {
      return new Intl.DateTimeFormat("de-DE", { timeZone: "UTC" }).format(date);
    }
  }
  if (field.field_type === "datetime" && typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(date);
  }
  if ((field.field_type === "integer" || field.field_type === "decimal") && (typeof value === "number" || typeof value === "string")) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return field.source === "standard" && field.key === "value"
        ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(numeric)
        : new Intl.NumberFormat("de-DE", { maximumFractionDigits: 10 }).format(numeric);
    }
  }
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
