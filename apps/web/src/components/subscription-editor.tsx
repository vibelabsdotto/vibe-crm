"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useEntityDrawer } from "@/components/entity-drawer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api";
import { fetchAllCrm } from "@/lib/crm-lists";
import type { EntityDefaults, EntityEditorProps } from "@/lib/entity-drawer-types";
import { asList, type Company, type Contact, type Deal, type Product, type Subscription, type SubscriptionInterval, type SubscriptionStatus } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const STATUS_ITEMS: { value: SubscriptionStatus; label: string }[] = [
  { value: "active", label: "Aktiv" },
  { value: "trial", label: "Testphase" },
  { value: "paused", label: "Pausiert" },
  { value: "cancelled", label: "Gekündigt / beendet" },
  { value: "expired", label: "Abgelaufen" },
];
const INTERVAL_ITEMS: { value: SubscriptionInterval; label: string }[] = [
  { value: "monthly", label: "Wiederkehrend · monatlich" },
  { value: "quarterly", label: "Wiederkehrend · vierteljährlich" },
  { value: "yearly", label: "Wiederkehrend · jährlich" },
  { value: "one_time", label: "Einmalzahlung · kein MRR" },
];
type FormState = {
  name: string;
  company_id: string;
  contact_id: string;
  product_id: string;
  deal_id: string;
  amount: string;
  currency: string;
  interval: SubscriptionInterval;
  status: SubscriptionStatus;
  start_date: string;
  end_date: string;
  notes: string;
};
type SaveBody = Omit<FormState, "company_id" | "contact_id" | "product_id" | "deal_id" | "amount"> & {
  company_id: string | null;
  contact_id: string | null;
  product_id: string | null;
  deal_id: string | null;
  amount: number;
};
type Relations = { companies: Company[]; contacts: Contact[]; products: Product[]; deals: Deal[] };
type SaveAttempt = { body: SaveBody; response: Subscription | null };
const SAVE_KEYS = ["name", "company_id", "contact_id", "product_id", "deal_id", "amount", "currency", "interval", "status", "start_date", "end_date", "notes"] as const;

function initialForm(record: Subscription | null, defaults: EntityDefaults): FormState {
  return {
    name: record?.name ?? defaults.name ?? "",
    company_id: record?.company_id ?? (record ? "" : defaults.company_id ?? ""),
    contact_id: record?.contact_id ?? (record ? "" : defaults.contact_id ?? ""),
    product_id: record?.product_id ?? (record ? "" : defaults.product_id ?? ""),
    deal_id: record?.deal_id ?? (record ? "" : defaults.deal_id ?? ""),
    amount: String(record?.amount ?? defaults.amount ?? 0),
    currency: record?.currency ?? "EUR",
    interval: record?.interval ?? "monthly",
    status: record?.status ?? "active",
    start_date: record?.start_date ?? "",
    end_date: record?.end_date ?? "",
    notes: record?.notes ?? "",
  };
}

function money(value: number, currency: string): string {
  return `${new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ${currency}`;
}

function timestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function matchesBody(record: Subscription, body: SaveBody): boolean {
  return SAVE_KEYS.every((key) => (record[key] ?? null) === body[key]);
}

function matchesResponse(record: Subscription, response: Subscription): boolean {
  return ["id", "created_at", "updated_at", ...SAVE_KEYS].every((key) => (record[key] ?? null) === (response[key] ?? null));
}

function relationItems(items: { value: string; label: string }[], value: string, emptyLabel: string) {
  const result = [{ value: "", label: emptyLabel }, ...items];
  if (value && !result.some((item) => item.value === value)) {
    result.push({ value, label: `Gespeicherte Zuordnung · ${value}` });
  }
  return result;
}

function EditorSelect<Value extends string>({ id, label, items, value, onChange, disabled, description }: {
  id: string;
  label: string;
  items: { value: Value; label: string }[];
  value: Value;
  onChange: (value: Value) => void;
  disabled: boolean;
  description?: string;
}) {
  return (
    <Field data-disabled={disabled} className="min-w-0">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select items={items} value={value} onValueChange={(next) => { if (next !== null) onChange(next); }} disabled={disabled}>
        <SelectTrigger id={id} className="w-full min-w-0" aria-describedby={description ? `${id}-hint` : undefined}><SelectValue className="min-w-0 truncate" /></SelectTrigger>
        <SelectContent alignItemWithTrigger={false}><SelectGroup>
          {items.map((item) => <SelectItem key={item.value} value={item.value}><span className="min-w-0 whitespace-normal break-words">{item.label}</span></SelectItem>)}
        </SelectGroup></SelectContent>
      </Select>
      {description && <FieldDescription id={`${id}-hint`}>{description}</FieldDescription>}
    </Field>
  );
}

export function SubscriptionEditor({ record, defaults, onDirtyChange, onBusyChange, onSaved, onCancel }: EntityEditorProps<Subscription>) {
  const api = useApi();
  const drawer = useEntityDrawer();
  const id = useId();
  const [initial] = useState(() => initialForm(record, defaults));
  const [form, setForm] = useState(initial);
  const [relations, setRelations] = useState<Relations | null>(null);
  const [relationError, setRelationError] = useState<string | null>(null);
  const [relationRevision, setRelationRevision] = useState(0);
  const [loadingRelations, setLoadingRelations] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [attempt, setAttempt] = useState<SaveAttempt | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial) || attempt !== null;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => {
    let current = true;
    Promise.all([
      fetchAllCrm<Company>("/v1/companies", "companies", api),
      fetchAllCrm<Contact>("/v1/contacts", "contacts", api),
      api<unknown>("/v1/products"),
      fetchAllCrm<Deal>("/v1/deals", "deals", api),
    ]).then(([companies, contacts, products, deals]) => {
      if (!current) return;
      setRelations({ companies, contacts, products: asList<Product>(products, "products"), deals });
      setRelationError(null);
    }).catch(() => {
      if (current) setRelationError("Zuordnungen konnten nicht vollständig geladen werden. Deine Eingaben bleiben erhalten.");
    }).finally(() => {
      if (current) setLoadingRelations(false);
    });
    return () => { current = false; };
  }, [api, relationRevision]);

  function change<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    if (inFlight.current || attempt) return;
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || loadingRelations || !relations) return;
    const errors: Partial<Record<keyof FormState, string>> = {};
    const numericAmount = Number(form.amount);
    if (!form.name.trim()) errors.name = "Gib einen Namen ein.";
    if (form.amount.trim() === "" || !Number.isFinite(numericAmount) || numericAmount < 0) errors.amount = "Gib einen endlichen Betrag ab 0 ein.";
    if (!/^[A-Z]{3}$/.test(form.currency.trim().toUpperCase())) errors.currency = "Gib einen dreistelligen Währungscode ein, z. B. EUR.";
    if (form.start_date && form.end_date && form.end_date < form.start_date) errors.end_date = "Das Ende darf nicht vor dem Start liegen.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const body: SaveBody = attempt?.body ?? {
      name: form.name.trim(),
      company_id: form.company_id || null,
      contact_id: form.contact_id || null,
      product_id: form.product_id || null,
      deal_id: form.deal_id || null,
      amount: numericAmount,
      currency: form.currency.trim().toUpperCase(),
      interval: form.interval,
      status: form.status,
      start_date: form.start_date,
      end_date: form.end_date,
      notes: form.notes.trim(),
    };
    inFlight.current = true;
    setBusy(true);
    onBusyChange(true);
    setError(null);
    let written = attempt?.response ?? null;
    try {
      // A successful write with an unconfirmed GET is only read again, never posted twice.
      if (!written && attempt && record) {
        const result = await api<{ subscription: Subscription }>(`/v1/subscriptions/${encodeURIComponent(record.id)}`);
        written = result?.subscription;
        if (written?.id !== record.id || !matchesBody(written, body)) throw new Error("Der gespeicherte Stand stimmt nicht mit deinen Eingaben überein. Es wurde kein weiterer Schreibauftrag gesendet.");
      }
      if (!written) {
        const result = await api<{ subscription: Subscription }>(record ? `/v1/subscriptions/${encodeURIComponent(record.id)}` : "/v1/subscriptions", { method: record ? "PUT" : "POST", body });
        const response = result?.subscription;
        if (!response?.id || (record && response.id !== record.id)) {
          written = null;
          throw new Error("Die Speicherantwort enthält keinen bestätigbaren Datensatz.");
        }
        written = response;
        if (mounted.current) setAttempt({ body, response: written });
      }
      const readback = await api<{ subscription: Subscription }>(`/v1/subscriptions/${encodeURIComponent(written.id)}`);
      const confirmed = readback?.subscription;
      if (!confirmed?.id || !confirmed.created_at || !confirmed.updated_at || !matchesResponse(confirmed, written)) throw new Error("Der Datensatz konnte nicht unverändert bestätigt werden. Bitte prüfe den gespeicherten Stand erneut.");
      const existingDealRecord = !record && body.deal_id !== null && confirmed.deal_id === body.deal_id && !matchesBody(confirmed, body);
      if (!existingDealRecord && !matchesBody(confirmed, body)) throw new Error("Die gespeicherten Felder stimmen nicht mit deinen Eingaben überein.");
      if (!mounted.current) return;
      onDirtyChange(false);
      toast.add({ title: existingDealRecord ? "Vorhandener Vertrag des Deals geöffnet" : record ? "Vertrag gespeichert" : "Vertrag angelegt", description: existingDealRecord ? "Für diesen Deal besteht bereits ein Datensatz. Er wurde nicht überschrieben oder doppelt angelegt." : undefined, type: "success" });
      onSaved(confirmed);
    } catch (cause) {
      if (!mounted.current) return;
      const rejected = !written && cause instanceof ApiError && [400, 401, 403, 404, 409, 413, 422, 429].includes(cause.status);
      if (!rejected) setAttempt({ body, response: written });
      setError(cause instanceof ApiError ? `Speichern oder Bestätigen fehlgeschlagen: ${cause.code}. Deine Eingaben bleiben erhalten.` : cause instanceof Error && written ? cause.message : "Die Speicherantwort ist unklar. Es wird kein neuer Datensatz ohne Bestätigung angelegt. Deine Eingaben bleiben erhalten.");
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        setBusy(false);
        onBusyChange(false);
      }
    }
  }

  const frozen = busy || attempt !== null;
  const relationDisabled = frozen || loadingRelations || !relations;
  const companyItems = relationItems((relations?.companies ?? []).map((item) => ({ value: item.id, label: item.name })), form.company_id, "Keine Firma");
  const contactItems = relationItems((relations?.contacts ?? []).map((item) => ({ value: item.id, label: [item.first_name, item.last_name].filter(Boolean).join(" ") + (item.company_name ? ` · ${item.company_name}` : "") })), form.contact_id, "Kein Kontakt");
  const productItems = relationItems((relations?.products ?? []).map((item) => ({ value: item.key, label: item.name })), form.product_id, "Kein Produkt");
  const dealItems = relationItems((relations?.deals ?? []).map((item) => ({ value: item.id, label: item.name + (item.company_name ? ` · ${item.company_name}` : "") })), form.deal_id, "Kein Deal");
  const oneTime = form.interval === "one_time";
  const contributesMrr = form.status === "active" || form.status === "trial";
  const numericAmount = Number(form.amount);
  const mrr = !oneTime && contributesMrr && Number.isFinite(numericAmount) && numericAmount >= 0 ? numericAmount / (form.interval === "quarterly" ? 3 : form.interval === "yearly" ? 12 : 1) : 0;
  const canCheck = attempt !== null && (attempt.response !== null || record !== null || attempt.body.deal_id !== null);

  return (
    <form onSubmit={submit} className="flex min-w-0 flex-col gap-6" aria-busy={busy}>
      <div className="flex flex-col gap-2">
        <Badge variant="secondary" className="w-fit">{oneTime ? "Einmalzahlung" : "Wiederkehrender Vertrag"}</Badge>
        <p className="text-sm text-muted-foreground">{oneTime ? "Einmaliger Betrag, kein Abo. Einmalzahlungen tragen immer 0 zum MRR bei." : "Betrag je Abrechnungsintervall. Nur aktive Verträge und Testphasen zählen zum MRR."}</p>
        <p className="text-sm text-muted-foreground">Jeder Datensatz ist eigenständig. Eine Firma kann mehrere wiederkehrende Verträge und Einmalzahlungen haben.</p>
      </div>
      {loadingRelations && <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Spinner />Zuordnungen werden vollständig geladen…</p>}
      {relationError && <Alert variant="destructive"><AlertTitle>Zuordnungen nicht geladen</AlertTitle><AlertDescription>{relationError}<Button type="button" variant="outline" disabled={busy || loadingRelations} onClick={() => { setLoadingRelations(true); setRelationRevision((current) => current + 1); }}>Erneut laden</Button></AlertDescription></Alert>}
      <FieldSet disabled={frozen}>
        <FieldLegend>Vertragsdaten</FieldLegend>
        <FieldGroup>
          <Field data-invalid={!!fieldErrors.name} data-disabled={frozen}>
            <FieldLabel htmlFor={`${id}-name`}>Name *</FieldLabel>
            <Input id={`${id}-name`} value={form.name} onChange={(event) => change("name", event.target.value)} required aria-invalid={!!fieldErrors.name} aria-describedby={fieldErrors.name ? `${id}-name-error` : undefined} placeholder="z. B. Monatspauschale oder Einrichtung" />
            {fieldErrors.name && <FieldError id={`${id}-name-error`}>{fieldErrors.name}</FieldError>}
          </Field>
          <FieldGroup className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
            <EditorSelect id={`${id}-company`} label="Firma" items={companyItems} value={form.company_id} onChange={(value) => change("company_id", value)} disabled={relationDisabled} />
            <EditorSelect id={`${id}-contact`} label="Kontakt" items={contactItems} value={form.contact_id} onChange={(value) => change("contact_id", value)} disabled={relationDisabled} />
            <EditorSelect id={`${id}-product`} label="Produkt" items={productItems} value={form.product_id} onChange={(value) => change("product_id", value)} disabled={relationDisabled} />
            <EditorSelect id={`${id}-deal`} label="Ursprünglicher Deal" items={dealItems} value={form.deal_id} onChange={(value) => change("deal_id", value)} disabled={relationDisabled} description="Optional. Pro Deal kann ein Vertrag verknüpft werden. Der Deal erzeugt nichts automatisch." />
          </FieldGroup>
          <div className="flex flex-wrap gap-2" aria-label="Verknüpfte Datensätze öffnen">
            {form.company_id && <Button type="button" variant="outline" size="sm" disabled={frozen} onClick={(event) => drawer.openEntity("company", form.company_id, event.currentTarget)}>Firma öffnen</Button>}
            {form.contact_id && <Button type="button" variant="outline" size="sm" disabled={frozen} onClick={(event) => drawer.openEntity("contact", form.contact_id, event.currentTarget)}>Kontakt öffnen</Button>}
            {form.deal_id && <Button type="button" variant="outline" size="sm" disabled={frozen} onClick={(event) => drawer.openEntity("deal", form.deal_id, event.currentTarget)}>Deal öffnen</Button>}
          </div>
          <EditorSelect id={`${id}-interval`} label="Art und Abrechnungsintervall" items={INTERVAL_ITEMS} value={form.interval} onChange={(value) => change("interval", value)} disabled={frozen} />
          <FieldGroup className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
            <Field data-invalid={!!fieldErrors.amount} data-disabled={frozen}>
              <FieldLabel htmlFor={`${id}-amount`}>{oneTime ? "Einmalbetrag" : "Betrag je Intervall"}</FieldLabel>
              <Input id={`${id}-amount`} type="number" min="0" step="any" required value={form.amount} onChange={(event) => change("amount", event.target.value)} aria-invalid={!!fieldErrors.amount} aria-describedby={fieldErrors.amount ? `${id}-amount-error` : undefined} />
              {fieldErrors.amount && <FieldError id={`${id}-amount-error`}>{fieldErrors.amount}</FieldError>}
            </Field>
            <Field data-invalid={!!fieldErrors.currency} data-disabled={frozen}>
              <FieldLabel htmlFor={`${id}-currency`}>Währung *</FieldLabel>
              <Input id={`${id}-currency`} required maxLength={3} value={form.currency} onChange={(event) => change("currency", event.target.value)} aria-invalid={!!fieldErrors.currency} aria-describedby={fieldErrors.currency ? `${id}-currency-error` : `${id}-currency-hint`} />
              <FieldDescription id={`${id}-currency-hint`}>Dreistelliger Code, z. B. EUR oder USD. Keine Währungsumrechnung.</FieldDescription>
              {fieldErrors.currency && <FieldError id={`${id}-currency-error`}>{fieldErrors.currency}</FieldError>}
            </Field>
          </FieldGroup>
          <p className="text-sm" role="status">MRR-Vorschau: <strong className="tabular-nums">{money(mrr, form.currency.trim().toUpperCase())}</strong>{oneTime ? " · immer 0 bei Einmalzahlungen" : !contributesMrr ? " · dieser Status zählt nicht zum MRR" : " pro Monat"}</p>
          <FieldGroup className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
            <EditorSelect id={`${id}-status`} label="Status" items={STATUS_ITEMS} value={form.status} onChange={(value) => change("status", value)} disabled={frozen} />
            <Field data-disabled={frozen}>
              <FieldLabel htmlFor={`${id}-start`}>Startdatum</FieldLabel>
              <Input id={`${id}-start`} type="date" value={form.start_date} onChange={(event) => change("start_date", event.target.value)} />
            </Field>
            <Field data-disabled={frozen} data-invalid={!!fieldErrors.end_date}>
              <FieldLabel htmlFor={`${id}-end`}>Enddatum</FieldLabel>
              <Input id={`${id}-end`} type="date" value={form.end_date} onChange={(event) => change("end_date", event.target.value)} aria-invalid={!!fieldErrors.end_date} aria-describedby={fieldErrors.end_date ? `${id}-end-error` : `${id}-end-hint`} />
              <FieldDescription id={`${id}-end-hint`}>Optional. Leer bedeutet keine festgelegte Laufzeit.</FieldDescription>
              {fieldErrors.end_date && <FieldError id={`${id}-end-error`}>{fieldErrors.end_date}</FieldError>}
            </Field>
          </FieldGroup>
          <Field data-disabled={frozen}>
            <FieldLabel htmlFor={`${id}-notes`}>Notizen</FieldLabel>
            <Textarea id={`${id}-notes`} value={form.notes} onChange={(event) => change("notes", event.target.value)} rows={4} />
          </Field>
        </FieldGroup>
      </FieldSet>
      {record && <FieldSet><FieldLegend>Gespeicherter Datensatz</FieldLegend><dl className="grid min-w-0 grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div className="min-w-0 sm:col-span-2"><dt className="text-muted-foreground">ID</dt><dd className="break-all font-mono">{record.id}</dd></div>
        <div><dt className="text-muted-foreground">Erstellt</dt><dd><time dateTime={record.created_at} title={record.created_at}>{timestamp(record.created_at)}</time></dd></div>
        <div><dt className="text-muted-foreground">Zuletzt geändert</dt><dd><time dateTime={record.updated_at} title={record.updated_at}>{timestamp(record.updated_at)}</time></dd></div>
      </dl></FieldSet>}
      {error && <Alert variant="destructive"><AlertTitle>Speicherung nicht bestätigt</AlertTitle><AlertDescription>{error}{attempt && <p>Die Eingaben sind gesperrt, bis dieser Auftrag bestätigt ist. {canCheck ? "Erneut prüfen sendet keinen zweiten ungebundenen Anlegeauftrag." : "Prüfe den Bestand vor einem neuen Anlegeauftrag. Ein automatischer Wiederholungsversuch ist nicht möglich."}</p>}</AlertDescription></Alert>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Abbrechen</Button>
        <Button type="submit" disabled={busy || loadingRelations || !relations || (attempt !== null && !canCheck)}>{busy && <Spinner data-icon="inline-start" />}{busy ? "Speichert und prüft…" : attempt ? "Speicherung erneut prüfen" : "Speichern"}</Button>
      </div>
    </form>
  );
}
