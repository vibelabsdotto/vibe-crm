export interface Product {
  key: string;
  name: string;
  type: string;
  status: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface ProductBody {
  key?: unknown;
  name?: unknown;
  type?: unknown;
  status?: unknown;
  notes?: unknown;
  [key: string]: unknown;
}

export interface ProductListQuery {
  search?: string;
}
