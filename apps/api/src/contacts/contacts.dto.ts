export interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  company_id: string | null;
  title: string;
  status: string;
  company_name?: string | null;
  company_domain?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactBody {
  first_name?: unknown;
  last_name?: unknown;
  email?: unknown;
  phone?: unknown;
  company_id?: unknown;
  title?: unknown;
  status?: unknown;
  custom?: unknown;
  [key: string]: unknown;
}

export interface ContactListQuery {
  page?: string;
  limit?: string;
  sort?: string;
  order?: string;
  search?: string;
  filters?: string;
  status?: string;
  company_id?: string;
}
