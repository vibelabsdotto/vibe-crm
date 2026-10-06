import { BadRequestException, ConflictException } from '@nestjs/common';
import type Database from 'better-sqlite3';

export interface EntityRelations {
  company_id: string | null;
  contact_id: string | null;
  product_id: string | null;
}

export function requireReference(
  sqlite: Database.Database,
  table: 'companies' | 'contacts' | 'products' | 'deals',
  id: string | null,
): string | null {
  if (id === null) return null;
  const key = table === 'products' ? 'key' : 'id';
  if (!sqlite.prepare(`SELECT ${key} FROM ${table} WHERE ${key} = ?`).get(id)) {
    throw new BadRequestException(
      `Die Referenz auf ${table} "${id}" existiert nicht.`,
    );
  }
  return id;
}

/** Null direct company means inheritance, not an unrelated company. */
export function effectiveCompany(
  sqlite: Database.Database,
  relations: Pick<EntityRelations, 'company_id' | 'contact_id'>,
): string | null {
  requireReference(sqlite, 'companies', relations.company_id);
  requireReference(sqlite, 'contacts', relations.contact_id);
  const contact = relations.contact_id
    ? (sqlite
        .prepare('SELECT company_id FROM contacts WHERE id = ?')
        .get(relations.contact_id) as { company_id: string | null } | undefined)
    : undefined;
  if (
    relations.company_id &&
    contact?.company_id &&
    relations.company_id !== contact.company_id
  ) {
    throw new BadRequestException(
      'Der Kontakt gehört zu einer anderen Firma. Bitte den Kontakt ändern oder entfernen.',
    );
  }
  return relations.company_id ?? contact?.company_id ?? null;
}

export function linkedDeal(
  sqlite: Database.Database,
  id: string | null,
): EntityRelations | null {
  if (id === null) return null;
  requireReference(sqlite, 'deals', id);
  const row = sqlite
    .prepare(
      'SELECT company_id, contact_id, product_id FROM deals WHERE id = ?',
    )
    .get(id) as EntityRelations;
  return { ...row, company_id: effectiveCompany(sqlite, row) };
}

export function assertDealLink(
  sqlite: Database.Database,
  subscription: EntityRelations,
  deal: EntityRelations,
): void {
  const company = effectiveCompany(sqlite, subscription);
  if (
    (company && deal.company_id && company !== deal.company_id) ||
    (subscription.contact_id &&
      deal.contact_id &&
      subscription.contact_id !== deal.contact_id) ||
    (subscription.product_id &&
      deal.product_id &&
      subscription.product_id !== deal.product_id)
  ) {
    throw new BadRequestException(
      'Firma, Kontakt und Produkt des Vertrags müssen zum verknüpften Deal passen.',
    );
  }
}

export function assertLinkedSubscriptions(
  sqlite: Database.Database,
  dealId: string,
  deal: EntityRelations,
): void {
  const subscriptions = sqlite
    .prepare(
      'SELECT company_id, contact_id, product_id FROM subscriptions WHERE deal_id = ?',
    )
    .all(dealId) as EntityRelations[];
  const effectiveDeal = { ...deal, company_id: effectiveCompany(sqlite, deal) };
  for (const subscription of subscriptions) {
    try {
      assertDealLink(sqlite, subscription, effectiveDeal);
    } catch (error) {
      if (!(error instanceof BadRequestException)) throw error;
      throw new ConflictException(
        'Die Änderung widerspricht einem verknüpften Vertrag. Bitte den Vertrag zuerst ändern oder die Deal-Verknüpfung entfernen.',
      );
    }
  }
}

/** Called inside the contact writer's transaction after its company changes. */
export function assertContactRelations(
  sqlite: Database.Database,
  contactId: string,
): void {
  const deals = sqlite
    .prepare(
      'SELECT id, company_id, contact_id, product_id FROM deals WHERE contact_id = ?',
    )
    .all(contactId) as Array<EntityRelations & { id: string }>;
  for (const deal of deals) {
    effectiveCompany(sqlite, deal);
    assertLinkedSubscriptions(sqlite, deal.id, deal);
  }
  const subscriptions = sqlite
    .prepare(
      'SELECT company_id, contact_id, product_id, deal_id FROM subscriptions WHERE contact_id = ?',
    )
    .all(contactId) as Array<EntityRelations & { deal_id: string | null }>;
  for (const subscription of subscriptions) {
    effectiveCompany(sqlite, subscription);
    const deal = linkedDeal(sqlite, subscription.deal_id);
    if (deal) assertDealLink(sqlite, subscription, deal);
  }
}
