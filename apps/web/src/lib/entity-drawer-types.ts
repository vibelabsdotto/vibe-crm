import type { Company, Contact, Deal, Subscription } from "@/lib/types";

export type EntityType = "company" | "contact" | "deal" | "subscription";
export type EntityRecord = Company | Contact | Deal | Subscription;
export type EntityDefaults = {
  company_id?: string;
  contact_id?: string;
  product_id?: string;
  deal_id?: string;
  name?: string;
  amount?: number;
};

export type EntityEditorProps<T extends EntityRecord> = {
  record: T | null;
  defaults: EntityDefaults;
  onDirtyChange: (dirty: boolean) => void;
  onBusyChange: (busy: boolean) => void;
  onSaved: (record: T) => void;
  onCancel: () => void;
};
