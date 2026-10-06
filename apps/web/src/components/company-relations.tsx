"use client";

import { PlusIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { useEntityDrawer } from "@/components/entity-drawer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { fetchAllCrm } from "@/lib/crm-lists";
import type { Contact, ContactStatus, Deal, Stage, Subscription, SubscriptionInterval, SubscriptionStatus } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const CONTACT_STATUSES: Record<ContactStatus, string> = {
  lead: "Lead", active: "Aktiv", inactive: "Inaktiv", churned: "Abgewandert",
};
const SUBSCRIPTION_STATUSES: Record<SubscriptionStatus, string> = {
  active: "Aktiv", trial: "Testphase", paused: "Pausiert", cancelled: "Gekündigt", expired: "Abgelaufen",
};
const INTERVALS: Record<SubscriptionInterval, string> = {
  monthly: "Monatlich", quarterly: "Vierteljährlich", yearly: "Jährlich", one_time: "Einmalig",
};

type ListResult<T> = { records: T[]; error: string | null };
type RequestScope = { companyId: string; revision: number; attempt: number };
type RelationsState = {
  scope: RequestScope;
  contacts: ListResult<Contact>;
  deals: ListResult<Deal>;
  subscriptions: ListResult<Subscription>;
  stages: ListResult<Stage>;
};

function failureMessage(cause: unknown): string {
  if (cause instanceof ApiError && cause.status === 401) return "Die Sitzung ist abgelaufen. Bitte erneut anmelden.";
  if (cause instanceof ApiError && cause.status === 403) return "Keine Berechtigung zum Laden dieser Daten.";
  return "Die Daten konnten nicht vollständig und eindeutig geladen werden. Bitte erneut versuchen.";
}

function listResult<T>(result: PromiseSettledResult<T[]>): ListResult<T> {
  return result.status === "fulfilled"
    ? { records: result.value, error: null }
    : { records: [], error: failureMessage(result.reason) };
}

function exactCompanyRecords<T extends { id: string; company_id: string | null; effective_company_id?: string | null }>(records: T[], companyId: string): T[] {
  const ids = new Set<string>();
  for (const record of records) {
    // Never turn an ignored server filter or a repeated page into a company relationship.
    if (!record || typeof record.id !== "string" || !record.id || (record.effective_company_id ?? record.company_id) !== companyId || ids.has(record.id)) {
      throw new Error("Ungültige Firmenzuordnung oder unvollständige Liste.");
    }
    ids.add(record.id);
  }
  return records;
}

function contactName(contact: Contact): string {
  return [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Kontakt ohne Namen";
}

function amountLabel(value: number, currency: string): string {
  return `${new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ${currency || "ohne Währung"}`;
}

function dateLabel(value: string): string {
  if (!value) return "Nicht hinterlegt";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("de-DE", { timeZone: "UTC" }).format(date);
}

function LoadError({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <Alert variant="destructive" className="min-w-0">
      <AlertTitle className="break-words">{title}</AlertTitle>
      <AlertDescription className="flex min-w-0 flex-col items-start gap-2">
        <p className="break-words">{message}</p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry} className="h-auto min-h-11 max-w-full whitespace-normal sm:min-h-7">
          <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />Erneut laden
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function RelationSection({
  title, description, count, loading, error, createLabel, onCreate, onRetry, emptyTitle, emptyDescription, children,
}: {
  title: string;
  description: string;
  count: number | null;
  loading: boolean;
  error: string | null;
  createLabel: string;
  onCreate: (opener: HTMLButtonElement) => void;
  onRetry: () => void;
  emptyTitle: string;
  emptyDescription: string;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} aria-busy={loading} className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 id={titleId} className="min-w-0 break-words text-sm font-semibold">{title}</h3>
          {count !== null && <Badge variant="secondary" aria-label={`${count} Einträge`}>{count}</Badge>}
        </div>
        <Button type="button" variant="outline" size="sm" aria-haspopup="dialog" onClick={(event) => onCreate(event.currentTarget)} className="h-auto min-h-11 max-w-full whitespace-normal sm:min-h-7">
          <PlusIcon data-icon="inline-start" aria-hidden="true" />{createLabel}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
      {loading ? (
        <div className="flex min-w-0 flex-col gap-2">
          <p role="status" className="text-sm text-muted-foreground">{title} werden geladen…</p>
          <div aria-hidden="true" className="flex flex-col gap-2">
            <Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-3/4" />
          </div>
        </div>
      ) : error ? (
        <LoadError title={`${title} nicht geladen`} message={error} onRetry={onRetry} />
      ) : count === 0 ? (
        <Empty className="p-3">
          <EmptyHeader><EmptyTitle>{emptyTitle}</EmptyTitle><EmptyDescription>{emptyDescription}</EmptyDescription></EmptyHeader>
        </Empty>
      ) : children}
    </section>
  );
}

/** All saved relations for this exact company, independent of page-level filters. */
export function CompanyRelations({ companyId, revision }: { companyId: string; revision: number }) {
  const api = useApi();
  const { openEntity, createEntity } = useEntityDrawer();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<RelationsState | null>(null);
  // Object identity also invalidates the first A request during A → B → A.
  const scope = useMemo(() => ({ companyId, revision, attempt }), [companyId, revision, attempt]);
  const data = state?.scope === scope ? state : null;
  const contactsById = useMemo(() => new Map(data?.contacts.records.map((contact) => [contact.id, contact]) ?? []), [data?.contacts.records]);
  const stagesByKey = useMemo(() => new Map(data?.stages.records.map((stage) => [stage.key, stage.label]) ?? []), [data?.stages.records]);

  useEffect(() => {
    let active = true;
    const fetchCurrent = async <T,>(path: string): Promise<T> => {
      if (!active) throw new Error("Veraltete Anfrage.");
      const response = await api<T>(path);
      if (!active) throw new Error("Veraltete Anfrage.");
      return response;
    };
    const query = new URLSearchParams({ company_id: scope.companyId, sort: "created_at", order: "asc" });
    const companyList = <T extends { id: string; company_id: string | null }>(path: string, key: string) => {
      if (!scope.companyId) return Promise.reject<T[]>(new Error("Firmen-ID fehlt."));
      return fetchAllCrm<T>(`${path}?${query}`, key, fetchCurrent).then((records) => exactCompanyRecords(records, scope.companyId));
    };
    const stages = fetchCurrent<Stage[] | { stages: Stage[] }>("/v1/stages").then((response) => {
      const records = Array.isArray(response) ? response : response?.stages;
      if (!Array.isArray(records) || records.some((stage) => !stage || typeof stage.key !== "string" || typeof stage.label !== "string")) {
        throw new Error("Ungültige Stage-Liste.");
      }
      return records;
    });
    Promise.allSettled([
      companyList<Contact>("/v1/contacts", "contacts"),
      companyList<Deal>("/v1/deals", "deals"),
      companyList<Subscription>("/v1/subscriptions", "subscriptions"),
      stages,
    ]).then(([contacts, deals, subscriptions, stageResult]) => {
      if (!active) return;
      setState({ scope, contacts: listResult(contacts), deals: listResult(deals), subscriptions: listResult(subscriptions), stages: listResult(stageResult) });
    });
    return () => { active = false; };
  }, [api, scope]);

  function retry() { setAttempt((value) => value + 1); }

  function linkedContact(record: Deal | Subscription): string {
    if (!record.contact_id) return "Kein Ansprechpartner zugeordnet";
    const contact = contactsById.get(record.contact_id);
    if (contact) return contactName(contact);
    // These extras come from the API's contact_id join, never a name lookup.
    const joinedName = [record.contact_first_name, record.contact_last_name]
      .filter((part): part is string => typeof part === "string" && part.length > 0).join(" ");
    return joinedName || `Kontakt-ID: ${record.contact_id}`;
  }

  return (
    <div className="flex min-w-0 flex-col gap-5" aria-label="Firmenbeziehungen">
      <RelationSection
        title="Ansprechpartner"
        description="Jeder gespeicherte Kontakt bleibt ein eigener Eintrag. Persönliche E-Mail-Adressen sind optional; gemeinsame Namen werden nicht automatisch aufgeteilt."
        count={data && !data.contacts.error ? data.contacts.records.length : null}
        loading={!data} error={data?.contacts.error ?? null} onRetry={retry}
        createLabel="Kontakt anlegen" onCreate={(opener) => createEntity("contact", { company_id: companyId }, opener)}
        emptyTitle="Noch keine Ansprechpartner"
        emptyDescription="Lege einzelne Personen mit ihren jeweiligen Kontaktdaten für diese Firma an."
      >
        <ul className="flex min-w-0 flex-col gap-3" aria-label="Ansprechpartner dieser Firma">
          {data?.contacts.records.map((contact, index) => (
            <li key={contact.id} className="flex min-w-0 flex-col gap-1">
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                <Button type="button" variant="link" aria-haspopup="dialog" aria-label={`Ansprechpartner ${contactName(contact)} öffnen`} onClick={(event) => openEntity("contact", contact.id, event.currentTarget)} className="h-auto min-h-11 min-w-0 max-w-full justify-start whitespace-normal px-0 text-left sm:min-h-8">
                  <span className="min-w-0 [overflow-wrap:anywhere]">{contactName(contact)}</span>
                </Button>
                <Badge variant="outline">{CONTACT_STATUSES[contact.status] ?? contact.status}</Badge>
              </div>
              {contact.title && <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{contact.title}</p>}
              <p className="text-sm [overflow-wrap:anywhere]"><span className="text-muted-foreground">E-Mail: </span>{contact.email || "Keine persönliche E-Mail hinterlegt"}</p>
              <p className="text-sm [overflow-wrap:anywhere]"><span className="text-muted-foreground">Telefon: </span>{contact.phone || "Nicht hinterlegt"}</p>
              {index < data.contacts.records.length - 1 && <Separator className="mt-2" />}
            </li>
          ))}
        </ul>
      </RelationSection>

      <Separator />

      <RelationSection
        title="Einmalgeschäfte / Deals"
        description="Eigenständige Verkaufschancen mit eigenem Wert, Produkt, Abschlussdatum und Pipeline-Stage. Deal-Werte sind kein MRR."
        count={data && !data.deals.error ? data.deals.records.length : null}
        loading={!data} error={data?.deals.error ?? null} onRetry={retry}
        createLabel="Deal anlegen" onCreate={(opener) => createEntity("deal", { company_id: companyId }, opener)}
        emptyTitle="Noch keine Deals" emptyDescription="Lege für jedes Geschäft einen eigenen Deal an."
      >
        {data?.stages.error && <LoadError title="Stage-Bezeichnungen nicht geladen" message="Die gespeicherten Stage-Keys werden angezeigt. Lade erneut, um die aktuellen Bezeichnungen zu sehen." onRetry={retry} />}
        <ul className="flex min-w-0 flex-col gap-3" aria-label="Deals dieser Firma">
          {data?.deals.records.map((deal, index) => (
            <li key={deal.id} className="flex min-w-0 flex-col gap-1">
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                <Button type="button" variant="link" aria-haspopup="dialog" aria-label={`Deal ${deal.name} öffnen`} onClick={(event) => openEntity("deal", deal.id, event.currentTarget)} className="h-auto min-h-11 min-w-0 max-w-full justify-start whitespace-normal px-0 text-left sm:min-h-8">
                  <span className="min-w-0 [overflow-wrap:anywhere]">{deal.name}</span>
                </Button>
                <Badge variant="outline" className="h-auto min-h-5 max-w-full whitespace-normal [overflow-wrap:anywhere]">{stagesByKey.get(deal.stage) ?? deal.stage}</Badge>
              </div>
              <p className="text-sm tabular-nums [overflow-wrap:anywhere]">{amountLabel(deal.value, "EUR")}</p>
              <p className="text-sm [overflow-wrap:anywhere]"><span className="text-muted-foreground">Produkt: </span>{deal.product_id ? deal.product_name || deal.product_id : "Nicht zugeordnet"}</p>
              <p className="text-sm [overflow-wrap:anywhere]"><span className="text-muted-foreground">Ansprechpartner: </span>{linkedContact(deal)}</p>
              <p className="text-sm [overflow-wrap:anywhere]"><span className="text-muted-foreground">Abschluss: </span>{dateLabel(deal.close_date)}</p>
              {index < data.deals.records.length - 1 && <Separator className="mt-2" />}
            </li>
          ))}
        </ul>
      </RelationSection>

      <Separator />

      <RelationSection
        title="Abos und Verträge"
        description="Wiederkehrende Abos und einmalige Verträge bleiben getrennte Datensätze. Einmalige Verträge zählen nicht zum MRR."
        count={data && !data.subscriptions.error ? data.subscriptions.records.length : null}
        loading={!data} error={data?.subscriptions.error ?? null} onRetry={retry}
        createLabel="Abo / Vertrag anlegen" onCreate={(opener) => createEntity("subscription", { company_id: companyId }, opener)}
        emptyTitle="Noch keine Abos oder Verträge" emptyDescription="Lege einen wiederkehrenden oder einmaligen Vertrag für diese Firma an."
      >
        <ul className="flex min-w-0 flex-col gap-3" aria-label="Abos und Verträge dieser Firma">
          {data?.subscriptions.records.map((subscription, index) => (
            <li key={subscription.id} className="flex min-w-0 flex-col gap-1">
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                <Button type="button" variant="link" aria-haspopup="dialog" aria-label={`Vertrag ${subscription.name} öffnen`} onClick={(event) => openEntity("subscription", subscription.id, event.currentTarget)} className="h-auto min-h-11 min-w-0 max-w-full justify-start whitespace-normal px-0 text-left sm:min-h-8">
                  <span className="min-w-0 [overflow-wrap:anywhere]">{subscription.name}</span>
                </Button>
                <Badge variant="outline">{SUBSCRIPTION_STATUSES[subscription.status] ?? subscription.status}</Badge>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Badge variant="secondary">{subscription.interval === "one_time" ? "Einmaliger Vertrag" : "Wiederkehrendes Abo"}</Badge>
                <p className="text-sm tabular-nums [overflow-wrap:anywhere]">{amountLabel(subscription.amount, subscription.currency)} · {INTERVALS[subscription.interval] ?? subscription.interval}</p>
              </div>
              <p className="text-sm [overflow-wrap:anywhere]"><span className="text-muted-foreground">Produkt: </span>{subscription.product_id ? subscription.product_name || subscription.product_id : "Nicht zugeordnet"}</p>
              <p className="text-sm [overflow-wrap:anywhere]"><span className="text-muted-foreground">Ansprechpartner: </span>{linkedContact(subscription)}</p>
              <p className="text-sm [overflow-wrap:anywhere]"><span className="text-muted-foreground">Beginn: </span>{dateLabel(subscription.start_date)} · <span className="text-muted-foreground">Ende: </span>{subscription.end_date ? dateLabel(subscription.end_date) : "Unbefristet"}</p>
              {index < data.subscriptions.records.length - 1 && <Separator className="mt-2" />}
            </li>
          ))}
        </ul>
      </RelationSection>
    </div>
  );
}
