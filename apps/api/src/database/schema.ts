import {
  index,
  integer,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';
import { account, session, user, verification } from './auth-schema';

// Contract §2: CRM tables. Ids are UUID v4 generated in the app layer.
// Timestamps are ISO-8601 strings written by the app.

export const companies = sqliteTable('companies', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  domain: text('domain').notNull().default(''),
  industry: text('industry').notNull().default(''),
  phone: text('phone').notNull().default(''),
  email: text('email').notNull().default(''),
  notes: text('notes').notNull().default(''),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const contacts = sqliteTable(
  'contacts',
  {
    id: text('id').primaryKey(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull().default(''),
    email: text('email').notNull().default(''),
    phone: text('phone').notNull().default(''),
    companyId: text('company_id').references(() => companies.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull().default(''),
    status: text('status').notNull().default('lead'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_contacts_company').on(table.companyId),
    index('idx_contacts_status').on(table.status),
  ],
);

export const deals = sqliteTable(
  'deals',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    contactId: text('contact_id').references(() => contacts.id, {
      onDelete: 'set null',
    }),
    value: real('value').notNull().default(0),
    stage: text('stage').notNull().default('prospect'),
    closeDate: text('close_date').notNull().default(''),
    notes: text('notes').notNull().default(''),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_deals_contact').on(table.contactId),
    index('idx_deals_stage').on(table.stage),
  ],
);

// Pipeline stages — data, not code. `key` is immutable and stored on
// deals.stage; label/color/position/is_won/is_lost are editable. Seeded at
// runtime (StagesService) only when the table is empty.
export const stages = sqliteTable('stages', {
  key: text('key').primaryKey(),
  label: text('label').notNull(),
  color: text('color').notNull().default('slate'),
  position: integer('position').notNull(),
  isWon: integer('is_won').notNull().default(0),
  isLost: integer('is_lost').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const activities = sqliteTable(
  'activities',
  {
    id: text('id').primaryKey(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    type: text('type').notNull().default('note'),
    body: text('body').notNull().default(''),
    meta: text('meta').notNull().default('{}'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_activities_entity').on(table.entityType, table.entityId),
  ],
);

// Registry for user-defined fields. Each def maps to a REAL column on the
// entity's table (added via ALTER TABLE at definition time); this table is
// only the registry.
export const customFieldDefs = sqliteTable(
  'custom_field_defs',
  {
    id: text('id').primaryKey(),
    entityType: text('entity_type').notNull(),
    key: text('key').notNull(),
    label: text('label').notNull(),
    fieldType: text('field_type').notNull().default('string'),
    customField: text('custom_field').notNull().default(''),
    options: text('options').notNull().default('{}'),
    position: integer('position').notNull().default(0),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_custom_field_defs_entity').on(table.entityType, table.position),
  ],
);

// Personal access tokens for CLI/agents. Single-workspace (contract §1): no
// owner_id — every authenticated identity has full CRUD on all data.
export const apiTokens = sqliteTable('api_tokens', {
  id: text('id').primaryKey(),
  ownerEmail: text('owner_email').notNull(),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  prefix: text('prefix').notNull(),
  createdAt: text('created_at').notNull(),
  lastUsedAt: text('last_used_at'),
});

// Better Auth core tables (user/session/account/verification).
export * from './auth-schema';

export const schema = {
  companies,
  contacts,
  deals,
  stages,
  activities,
  customFieldDefs,
  apiTokens,
} as const;

/** Full schema incl. Better Auth tables — used for the drizzle instance. */
export const databaseSchema = {
  ...schema,
  user,
  session,
  account,
  verification,
};

export type CompanyRow = typeof companies.$inferSelect;
export type ContactRow = typeof contacts.$inferSelect;
export type DealRow = typeof deals.$inferSelect;
export type StageRow = typeof stages.$inferSelect;
export type ActivityRow = typeof activities.$inferSelect;
export type CustomFieldDefRow = typeof customFieldDefs.$inferSelect;
export type ApiTokenRow = typeof apiTokens.$inferSelect;
