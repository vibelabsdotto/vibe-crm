export interface Deal {
  id: string;
  name: string;
  contact_id: string | null;
  company_id: string | null;
  product_id: string | null;
  value: number;
  stage: string;
  close_date: string;
  notes: string;
  contact_first_name?: string | null;
  contact_last_name?: string | null;
  company_name?: string | null;
  company_domain?: string | null;
  product_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DealBody {
  name?: unknown;
  contact_id?: unknown;
  company_id?: unknown;
  product_id?: unknown;
  value?: unknown;
  stage?: unknown;
  close_date?: unknown;
  notes?: unknown;
  custom?: unknown;
  [key: string]: unknown;
}

export interface DealListQuery {
  page?: string;
  limit?: string;
  sort?: string;
  order?: string;
  search?: string;
  filters?: string;
  stage?: string;
  product?: string;
}
