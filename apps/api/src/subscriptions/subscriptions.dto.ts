export interface Subscription {
  id: string;
  company_id: string | null;
  contact_id: string | null;
  product_id: string | null;
  name: string;
  amount: number;
  currency: string;
  interval: string;
  start_date: string;
  end_date: string;
  status: string;
  notes: string;
  company_name?: string | null;
  product_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionBody {
  company_id?: unknown;
  contact_id?: unknown;
  product_id?: unknown;
  name?: unknown;
  amount?: unknown;
  currency?: unknown;
  interval?: unknown;
  start_date?: unknown;
  end_date?: unknown;
  status?: unknown;
  notes?: unknown;
  [key: string]: unknown;
}

export interface SubscriptionListQuery {
  page?: string;
  limit?: string;
  sort?: string;
  order?: string;
  search?: string;
  filters?: string;
  status?: string;
  company_id?: string;
  product?: string;
}

export interface SubscriptionSummary {
  mrr: number;
  active: number;
  trial: number;
  paused: number;
  total: number;
  byProduct: Array<{
    product: string;
    productName: string;
    mrr: number;
    active: number;
  }>;
}
