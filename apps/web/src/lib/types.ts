// JSON-Shapes nach docs/CONTRACT.md §4. Custom Fields landen als flache Extra-Keys.

export type Company = {
  id: string;
  name: string;
  domain: string;
  industry: string;
  phone: string;
  email: string;
  notes: string;
  created_at: string;
  updated_at: string;
  contact_count?: number;
  [key: string]: unknown;
};

export type ContactStatus = "lead" | "active" | "inactive" | "churned";

export type Contact = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  title: string;
  company_id: string | null;
  status: ContactStatus;
  created_at: string;
  updated_at: string;
  company_name?: string;
  company_domain?: string;
  [key: string]: unknown;
};

export type Deal = {
  id: string;
  name: string;
  contact_id: string | null;
  company_id: string | null;
  product_id: string | null;
  value: number;
  stage: string;
  close_date: string;
  notes: string;
  created_at: string;
  updated_at: string;
  contact_name?: string;
  company_name?: string;
  product_name?: string;
  [key: string]: unknown;
};

export type StageColor =
  | "sky"
  | "emerald"
  | "amber"
  | "rose"
  | "violet"
  | "fuchsia"
  | "teal"
  | "orange"
  | "slate";

export type Stage = {
  key: string;
  label: string;
  color: string;
  position: number;
  is_won: number;
  is_lost: number;
  created_at: string;
  updated_at: string;
};

export type ActivityType = "note" | "email" | "meeting" | "stage_change";

export type Activity = {
  id: string;
  entity_type: "contact" | "company" | "deal";
  entity_id: string;
  type: ActivityType;
  body: string;
  meta: string;
  created_at: string;
};

export type CustomFieldDef = {
  id: string;
  entity_type: "contact" | "company" | "deal";
  key: string;
  label: string;
  field_type:
    | "string"
    | "text"
    | "integer"
    | "decimal"
    | "boolean"
    | "date"
    | "datetime"
    | "enumeration"
    | "json";
  options: string;
  position: number;
  created_at: string;
  updated_at: string;
};

export type ApiTokenMeta = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export type CreatedApiToken = {
  id: string;
  token: string;
  prefix: string;
};

export type Stats = {
  contacts: number;
  companies: number;
  deals: number;
  dealValue: number;
};

export type Product = {
  key: string;
  name: string;
  type: string;
  status: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type SubscriptionStatus = "active" | "trial" | "paused" | "cancelled" | "expired";
export type SubscriptionInterval = "monthly" | "quarterly" | "yearly" | "one_time";

export type Subscription = {
  id: string;
  company_id: string | null;
  contact_id: string | null;
  product_id: string | null;
  name: string;
  amount: number;
  currency: string;
  interval: SubscriptionInterval;
  start_date: string;
  end_date: string;
  status: SubscriptionStatus;
  notes: string;
  created_at: string;
  updated_at: string;
  company_name?: string;
  product_name?: string;
  [key: string]: unknown;
};

export type SubscriptionSummary = {
  mrr: number;
  active: number;
  trial: number;
  paused: number;
  total: number;
  byProduct: { product: string; productName: string; mrr: number; active: number }[];
};

/** Listen-Antworten defensiv auspacken (Envelope oder Array). */
export function asList<T>(data: unknown, key: string): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object" && Array.isArray((data as Record<string, unknown>)[key])) {
    return (data as Record<string, unknown>)[key] as T[];
  }
  return [];
}
