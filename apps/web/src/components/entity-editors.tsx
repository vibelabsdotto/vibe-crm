"use client";

import { ExternalLink, FilePlus2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { CompanyRelations } from "@/components/company-relations";
import { useEntityDrawer } from "@/components/entity-drawer";
import { EntityTimeline, EntityTimestamps } from "@/components/entity-timeline";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api";
import { fetchAllCrm } from "@/lib/crm-lists";
import { isDealFieldVisible, type DealView } from "@/lib/deal-view";
import type { EntityDefaults, EntityEditorProps, EntityRecord } from "@/lib/entity-drawer-types";
import type { Company, Contact, CustomFieldDef, Deal, Product, Stage, Subscription } from "@/lib/types";
import { useApi } from "@/lib/use-api";

type EditableType = "company" | "contact" | "deal";
type EditableRecord = Company | Contact | Deal;
type Values = Record<string, string>;
type Options = { required?: boolean; enum?: unknown[]; min?: number; max?: number };
type Resources = { defs: CustomFieldDef[]; companies: Company[]; contacts: Contact[]; products: Product[]; stages: Stage[]; dealView: DealView | null };
const PATHS = { company: "/v1/companies", contact: "/v1/contacts", deal: "/v1/deals" };
const LABELS = { company: "Firma", contact: "Kontakt", deal: "Deal" };
const STATUS_ITEMS = [{ value: "lead", label: "Lead" }, { value: "active", label: "Aktiv" }, { value: "inactive", label: "Inaktiv" }, { value: "churned", label: "Abgewandert" }];

function fieldOptions(def: CustomFieldDef): Options {
  const value: unknown = def.options;
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Options : {};
    } catch { return {}; }
  }
  return value && typeof value === "object" ? value as Options : {};
}

function list<T>(response: unknown, key: string): T[] {
  if (!response || typeof response !== "object" || !Array.isArray((response as Record<string, unknown>)[key])) throw new Error("Ungültige Listen-Antwort.");
  return (response as Record<string, T[]>)[key];
}

function dealViewFrom(response: unknown): DealView {
  if (!response || typeof response !== "object") throw new Error("Ungültige Deal-Konfiguration.");
  const view = response as DealView;
  if (
    !Array.isArray(view.fields) || !Array.isArray(view.columns) || !Array.isArray(view.default_columns) ||
    !Array.isArray(view.warnings) || view.warnings.some((warning) => typeof warning !== "string") ||
    !view.visibility || typeof view.visibility !== "object" || Array.isArray(view.visibility)
  ) throw new Error("Ungültige Deal-Konfiguration.");
  for (const rule of Object.values(view.visibility)) {
    if (!rule || typeof rule !== "object" || (rule.mode !== "lost" && (rule.mode !== "stages" || !Array.isArray(rule.stages) || rule.stages.some((stage) => typeof stage !== "string")))) throw new Error("Ungültige Deal-Sichtbarkeitsregel.");
  }
  return view;
}

function recordFrom<T extends EntityRecord>(response: unknown, key: EditableType): T {
  const record = response && typeof response === "object" ? (response as Record<string, unknown>)[key] : null;
  if (!record || typeof record !== "object" || typeof (record as T).id !== "string" || !(record as T).id) throw new Error("Der gespeicherte Datensatz fehlt in der Antwort.");
  return record as T;
}

function customText(def: CustomFieldDef, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (def.field_type === "boolean") return value === true || value === 1 ? "1" : "0";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function initialValues(type: EditableType, record: EditableRecord | null, defaults: EntityDefaults, resources: Resources): Values {
  const values: Values = {};
  const keys = type === "company" ? ["name", "domain", "industry", "phone", "email", "notes"] : type === "contact" ? ["first_name", "last_name", "email", "phone", "title", "company_id", "status"] : ["name", "company_id", "contact_id", "product_id", "value", "stage", "close_date", "notes"];
  for (const key of keys) values[key] = record?.[key] === null || record?.[key] === undefined ? "" : String(record[key]);
  if (!record) {
    if (type !== "contact") values.name = defaults.name ?? "";
    if (type !== "company") values.company_id = defaults.company_id ?? "";
    if (type === "contact") values.status = "lead";
    if (type === "deal") {
      values.contact_id = defaults.contact_id ?? "";
      values.product_id = defaults.product_id ?? "";
      values.value = "0";
      values.stage = resources.stages[0]?.key ?? "";
    }
  }
  if (type === "deal" && !values.company_id && values.contact_id) {
    values.company_id = resources.contacts.find((contact) => contact.id === values.contact_id)?.company_id ?? "";
  }
  return values;
}

function saveError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) return "Der Datensatz wurde gelöscht. Deine Eingaben bleiben erhalten.";
    if (error.status === 401) return "Die Sitzung ist abgelaufen. Deine Eingaben bleiben erhalten. Bitte melde dich erneut an.";
    if (error.status === 400 || error.status === 422) return "Die API hat die Eingaben abgelehnt. Prüfe Pflichtfelder, Custom Fields und Zuordnungen.";
    if (error.status === 409) return "Die API hat das Speichern wegen eines Konflikts abgelehnt. Deine Eingaben bleiben erhalten.";
  }
  return "Speichern konnte nicht bestätigt werden. Deine Eingaben bleiben erhalten.";
}

function useResources(type: EditableType) {
  const api = useApi();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ attempt: number; data: Resources | null; error: string | null }>({ attempt: -1, data: null, error: null });
  useEffect(() => {
    let active = true;
    const requests = [
      api<unknown>(`/v1/custom-fields?entity=${type}`),
      type !== "company" ? fetchAllCrm<Company>("/v1/companies?sort=name&order=asc", "companies", api) : Promise.resolve([] as Company[]),
      type === "deal" ? fetchAllCrm<Contact>("/v1/contacts?sort=first_name&order=asc", "contacts", api) : Promise.resolve([] as Contact[]),
      type === "deal" ? api<unknown>("/v1/products") : Promise.resolve({ products: [] }),
      type === "deal" ? api<unknown>("/v1/stages") : Promise.resolve({ stages: [] }),
      type === "deal" ? api<unknown>("/v1/deals/view").then(dealViewFrom) : Promise.resolve(null),
    ] as const;
    Promise.all(requests).then(([definitions, companies, contacts, products, stages, dealView]) => {
      const data: Resources = { defs: list<CustomFieldDef>(definitions, "defs"), companies, contacts, products: list<Product>(products, "products"), stages: list<Stage>(stages, "stages").sort((a, b) => a.position - b.position), dealView };
      if (active) setState({ attempt, data, error: null });
    }).catch(() => {
      if (active) setState({ attempt, data: null, error: type === "deal" ? "Custom Fields, Deal-Sichtbarkeit und Zuordnungen konnten nicht vollständig geladen werden. Speichern ist deshalb gesperrt." : "Custom Fields und Zuordnungen konnten nicht vollständig geladen werden. Speichern ist deshalb gesperrt." });
    });
    return () => { active = false; };
  }, [api, type, attempt]);
  return { data: state.attempt === attempt ? state.data : null, error: state.attempt === attempt ? state.error : null, retry: () => setAttempt((value) => value + 1) };
}

function EntityEditor<T extends EditableRecord>({ type, ...props }: EntityEditorProps<T> & { type: EditableType }) {
  const resources = useResources(type);
  if (resources.error) return <Alert variant="destructive"><AlertTitle>Formular nicht verfügbar</AlertTitle><AlertDescription className="flex flex-col gap-3"><p>{resources.error}</p><Button type="button" variant="outline" className="w-fit" onClick={resources.retry}>Erneut laden</Button></AlertDescription></Alert>;
  if (!resources.data) return <div role="status" aria-label="Formular wird geladen" className="flex flex-col gap-4"><Skeleton className="h-8 w-full" /><Skeleton className="h-24 w-full" /><Skeleton className="h-32 w-full" /></div>;
  return <EntityForm type={type} resources={resources.data} {...props} />;
}

export function CompanyEditor(props: EntityEditorProps<Company>) { return <EntityEditor type="company" {...props} />; }
export function ContactEditor(props: EntityEditorProps<Contact>) { return <EntityEditor type="contact" {...props} />; }
export function DealEditor(props: EntityEditorProps<Deal>) { return <EntityEditor type="deal" {...props} />; }

function EntityForm<T extends EditableRecord>({ type, resources, record, defaults, onDirtyChange, onBusyChange, onSaved, onCancel }: EntityEditorProps<T> & { type: EditableType; resources: Resources }) {
  const api = useApi();
  const drawer = useEntityDrawer();
  const id = useId();
  const [initial] = useState(() => initialValues(type, record, defaults, resources));
  const [initialCustom] = useState<Values>(() => Object.fromEntries(resources.defs.map((def) => [def.key, customText(def, record?.[def.key])])));
  const [values, setValues] = useState(initial);
  const [custom, setCustom] = useState(initialCustom);
  const [errors, setErrors] = useState<Values>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState<"verify" | "unknown" | null>(null);
  const pending = useRef(false);
  const verification = useRef<{ id: string; body: Record<string, unknown>; custom: Record<string, unknown> } | null>(null);
  const isDirty = JSON.stringify(values) !== JSON.stringify(initial) || JSON.stringify(custom) !== JSON.stringify(initialCustom);
  const locked = busy || unconfirmed !== null;
  const contacts = resources.contacts.filter((contact) => !values.company_id || contact.company_id === values.company_id);
  const selectedContact = resources.contacts.find((contact) => contact.id === values.contact_id);
  const selectedStage = resources.stages.find((stage) => stage.key === values.stage);
  const visibleDefs = type === "deal" ? resources.defs.filter((def) => resources.dealView && isDealFieldVisible(def.key, selectedStage, resources.dealView.visibility)) : resources.defs;
  const hiddenCustomChanges = resources.defs.filter((def) => !visibleDefs.includes(def) && custom[def.key] !== initialCustom[def.key]);
  const viewWarnings = resources.dealView?.warnings ?? [];

  function change(key: string, value: string) {
    if (locked) return;
    const next = { ...values, [key]: value };
    if (type === "deal" && key === "company_id" && next.contact_id) {
      const contact = resources.contacts.find((item) => item.id === next.contact_id);
      if (!contact || contact.company_id !== (value || null)) next.contact_id = "";
    }
    if (type === "deal" && key === "contact_id" && value && !next.company_id) next.company_id = resources.contacts.find((item) => item.id === value)?.company_id ?? "";
    setValues(next);
    setErrors((current) => ({ ...current, [key]: "", contact_id: "" }));
    onDirtyChange(JSON.stringify(next) !== JSON.stringify(initial) || JSON.stringify(custom) !== JSON.stringify(initialCustom));
  }

  function changeCustom(key: string, value: string) {
    if (locked) return;
    const next = { ...custom, [key]: value };
    setCustom(next);
    setErrors((current) => ({ ...current, [`custom:${key}`]: "" }));
    onDirtyChange(JSON.stringify(values) !== JSON.stringify(initial) || JSON.stringify(next) !== JSON.stringify(initialCustom));
  }

  function validate(): { body: Record<string, unknown>; customPayload: Record<string, unknown> } | null {
    if (type === "deal" && !resources.dealView) {
      setError("Die Deal-Sichtbarkeit ist nicht geladen. Speichern ist deshalb gesperrt.");
      return null;
    }
    const invalid: Values = {};
    const body: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) body[key] = key.endsWith("_id") ? value || null : value.trim();
    const required = type === "contact" ? "first_name" : "name";
    if (!values[required].trim()) invalid[required] = type === "contact" ? "Bitte gib einen Vornamen ein." : "Bitte gib einen Namen ein.";
    if (type !== "company" && values.company_id && !resources.companies.some((company) => company.id === values.company_id)) invalid.company_id = "Wähle eine verfügbare Firma.";
    if (type === "deal") {
      if (!values.value.trim() || !Number.isFinite(Number(values.value))) invalid.value = "Bitte gib einen gültigen Betrag ein.";
      body.value = Number(values.value);
      if (!resources.stages.some((stage) => stage.key === values.stage)) invalid.stage = "Wähle eine verfügbare Stage.";
      if (values.product_id && !resources.products.some((product) => product.key === values.product_id)) invalid.product_id = "Wähle ein verfügbares Produkt.";
      if (values.contact_id && (!selectedContact || selectedContact.company_id !== (values.company_id || null))) invalid.contact_id = "Der Kontakt muss zur gewählten Firma gehören.";
    }
    const customPayload: Record<string, unknown> = {};
    // Visibility only filters this write; all stored and draft values stay in state.
    for (const def of visibleDefs) {
      const value = custom[def.key] ?? "";
      if (record && value === initialCustom[def.key]) continue;
      const options = fieldOptions(def);
      let parsed: unknown = value === "" ? null : value;
      const errorKey = `custom:${def.key}`;
      if (options.required && value.trim() === "") invalid[errorKey] = "Dieses Feld ist erforderlich.";
      if (value !== "") {
        if (def.field_type === "integer" || def.field_type === "decimal") {
          parsed = Number(value);
          if (!Number.isFinite(parsed) || (def.field_type === "integer" && !Number.isSafeInteger(parsed))) invalid[errorKey] = "Bitte gib eine gültige Zahl ein.";
          else if ((typeof options.min === "number" && Number(parsed) < options.min) || (typeof options.max === "number" && Number(parsed) > options.max)) invalid[errorKey] = "Die Zahl liegt außerhalb des erlaubten Bereichs.";
        }
        if (def.field_type === "boolean") parsed = value === "1" ? 1 : 0;
        if (def.field_type === "json") {
          try { JSON.parse(value); } catch { invalid[errorKey] = "Bitte gib gültiges JSON ein."; }
        }
        if (def.field_type === "enumeration" && options.enum?.length && !options.enum.map(String).includes(value)) invalid[errorKey] = "Wähle einen erlaubten Wert.";
      }
      customPayload[def.key] = parsed;
    }
    setErrors(invalid);
    if (Object.keys(invalid).length) return null;
    body.custom = customPayload;
    return { body, customPayload };
  }

  function begin() {
    pending.current = true;
    setBusy(true);
    onBusyChange(true);
    setError(null);
  }
  function finish() {
    pending.current = false;
    setBusy(false);
    onBusyChange(false);
  }

  async function readBack(target: { id: string; body: Record<string, unknown>; custom: Record<string, unknown> }) {
    const saved = recordFrom<T>(await api<unknown>(`${PATHS[type]}/${encodeURIComponent(target.id)}`), type);
    if (saved.id !== target.id) throw new Error("Falscher Datensatz im Rücklesen.");
    if (typeof saved.created_at !== "string" || !saved.created_at || typeof saved.updated_at !== "string" || !saved.updated_at) throw new Error("Die Zeitstempel fehlen im Rücklesen.");
    for (const [key, expected] of Object.entries(target.body)) {
      if (key !== "custom" && saved[key] !== expected) throw new Error("Die gespeicherten Werte stimmen nicht mit den Eingaben überein.");
    }
    for (const [key, expected] of Object.entries(target.custom)) {
      if ((saved[key] ?? null) !== expected) throw new Error("Die gespeicherten Custom Fields stimmen nicht mit den Eingaben überein.");
    }
    verification.current = null;
    setUnconfirmed(null);
    onDirtyChange(false);
    toast.add({ type: "success", title: `${LABELS[type]} ${record ? "gespeichert" : "angelegt"}` });
    onSaved(saved);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current || unconfirmed) return;
    const payload = validate();
    if (!payload) return;
    begin();
    verification.current = record ? { id: record.id, body: payload.body, custom: payload.customPayload } : null;
    let wrote = false;
    try {
      const response = await api<unknown>(record ? `${PATHS[type]}/${encodeURIComponent(record.id)}` : PATHS[type], { method: record ? "PUT" : "POST", body: payload.body });
      wrote = true;
      const saved = recordFrom<T>(response, type);
      if (record && saved.id !== record.id) throw new Error("Die Schreibantwort gehört zu einem anderen Datensatz.");
      verification.current = { id: saved.id, body: payload.body, custom: payload.customPayload };
      await readBack(verification.current);
    } catch (failure) {
      const rejected = !wrote && failure instanceof ApiError && failure.status >= 400 && failure.status < 500 && failure.status !== 408;
      if (rejected) {
        verification.current = null;
        setError(saveError(failure));
      } else {
        setUnconfirmed(verification.current ? "verify" : "unknown");
        onDirtyChange(true);
        setError(verification.current ? "Der Schreibvorgang ist noch nicht bestätigt. Prüfe denselben Datensatz erneut, ohne einen weiteren Schreibvorgang zu senden." : "Die Antwort der Neuanlage ist unklar. Es wird kein zweiter Datensatz angelegt. Prüfe die Liste, bevor du die erhaltenen Eingaben erneut verwendest.");
      }
    } finally { finish(); }
  }

  async function retryVerification() {
    if (pending.current || !verification.current) return;
    begin();
    try { await readBack(verification.current); }
    catch { setError("Das Speichern ist weiterhin nicht bestätigt. Deine Eingaben bleiben erhalten. Es wurde kein weiterer Schreibvorgang gesendet."); }
    finally { finish(); }
  }

  async function createContract(element: HTMLElement) {
    if (pending.current || locked || isDirty || !record || type !== "deal") return;
    const deal = record as Deal;
    begin();
    try {
      const subscriptions = await fetchAllCrm<Subscription>(`/v1/subscriptions?deal_id=${encodeURIComponent(deal.id)}`, "subscriptions", api);
      if (subscriptions.some((item) => item.deal_id !== deal.id)) throw new Error("Der Vertragsfilter wurde nicht angewendet.");
      if (subscriptions.length > 1) throw new Error("Mehrere Verträge sind mit diesem Deal verknüpft.");
      finish();
      if (subscriptions[0]) drawer.openEntity("subscription", subscriptions[0].id, element);
      else drawer.createEntity("subscription", { deal_id: deal.id, company_id: deal.company_id ?? resources.contacts.find((contact) => contact.id === deal.contact_id)?.company_id ?? undefined, contact_id: deal.contact_id ?? undefined, product_id: deal.product_id ?? undefined, name: deal.name, amount: deal.value }, element);
    } catch {
      setError("Die bestehenden Verträge konnten nicht eindeutig geprüft werden. Es wurde kein neuer Vertrag angelegt. Bitte versuche es erneut.");
      finish();
    }
  }

  function textField(key: string, label: string, inputType = "text", required = false, multiline = false) {
    const fieldId = `${id}-${key}`;
    const common = { id: fieldId, name: key, value: values[key] ?? "", disabled: locked, required, "aria-invalid": Boolean(errors[key]), "aria-describedby": errors[key] ? `${fieldId}-error` : undefined, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => change(key, event.target.value) };
    return <Field key={key} data-disabled={locked} data-invalid={Boolean(errors[key])} className={multiline ? "sm:col-span-2" : undefined}>
      <FieldLabel htmlFor={fieldId}>{label}{required ? " *" : ""}</FieldLabel>
      {multiline ? <Textarea {...common} rows={4} /> : <Input {...common} type={inputType} step={inputType === "number" ? "any" : undefined} />}
      {errors[key] && <FieldError id={`${fieldId}-error`}>{errors[key]}</FieldError>}
    </Field>;
  }

  function relationField(key: string, label: string, items: { value: string; label: string }[], relationType?: "company" | "contact", emptyLabel = "Keine Zuordnung") {
    const fieldId = `${id}-${key}`;
    const selected = values[key] ?? "";
    const missing = selected && !items.some((item) => item.value === selected);
    const previousName = key === "company_id" ? record?.company_name : key === "contact_id" ? [record?.contact_first_name, record?.contact_last_name].filter(Boolean).join(" ") : "";
    return <Field data-disabled={locked} data-invalid={Boolean(errors[key])}>
      <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
      <NativeSelect id={fieldId} className="w-full" value={selected} disabled={locked} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `${fieldId}-error` : undefined} onChange={(event) => change(key, event.target.value)}>
        <NativeSelectOption value="">{emptyLabel}</NativeSelectOption>
        {missing && <NativeSelectOption value={selected}>{typeof previousName === "string" && previousName ? previousName : selected} · nicht verfügbar</NativeSelectOption>}
        {items.map((item) => <NativeSelectOption key={item.value} value={item.value}>{item.label}</NativeSelectOption>)}
      </NativeSelect>
      {errors[key] && <FieldError id={`${fieldId}-error`}>{errors[key]}</FieldError>}
      {selected && relationType && <Button type="button" size="sm" variant="outline" className="w-fit" disabled={busy || unconfirmed !== null} onClick={(event) => drawer.openEntity(relationType, selected, event.currentTarget)}><ExternalLink data-icon="inline-start" />{label} öffnen</Button>}
    </Field>;
  }

  return <div className="flex min-w-0 flex-col gap-6">
    {record && <EntityTimestamps createdAt={record.created_at} updatedAt={record.updated_at} />}
    <form onSubmit={submit} aria-busy={busy} className="flex min-w-0 flex-col gap-5">
      {viewWarnings.length > 0 && <Alert><AlertTitle>Hinweise zur Deal-Sichtbarkeit</AlertTitle><AlertDescription><ul className="flex list-disc flex-col gap-1 pl-4">{viewWarnings.map((warning, index) => <li key={`${index}:${warning}`}>{warning}</li>)}</ul></AlertDescription></Alert>}
      <FieldGroup className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        {type === "company" && <>{textField("name", "Name", "text", true)}{textField("domain", "Domain")}{textField("industry", "Branche")}{textField("phone", "Telefon", "tel")}{textField("email", "E-Mail", "email")}{textField("notes", "Notizen", "text", false, true)}</>}
        {type === "contact" && <>{textField("first_name", "Vorname", "text", true)}{textField("last_name", "Nachname")}{textField("email", "E-Mail", "email")}{textField("phone", "Telefon", "tel")}{textField("title", "Position")}{relationField("status", "Status", STATUS_ITEMS, undefined, "Status wählen")}{relationField("company_id", "Firma", resources.companies.map((company) => ({ value: company.id, label: company.name })), "company")}</>}
        {type === "deal" && <>
          {textField("name", "Name", "text", true)}{textField("value", "Wert in EUR", "number")}
          {relationField("stage", "Stage", resources.stages.map((stage) => ({ value: stage.key, label: stage.label })), undefined, "Stage wählen")}
          {textField("close_date", "Abschlussdatum", "date")}
          {relationField("company_id", "Firma", resources.companies.map((company) => ({ value: company.id, label: company.name })), "company")}
          {relationField("contact_id", "Kontakt", contacts.map((contact) => ({ value: contact.id, label: `${contact.first_name} ${contact.last_name}`.trim() + (contact.email ? ` · ${contact.email}` : "") })), "contact")}
          {relationField("product_id", "Produkt", resources.products.map((product) => ({ value: product.key, label: product.name })))}
          {textField("notes", "Notizen", "text", false, true)}
        </>}
      </FieldGroup>
      {visibleDefs.length > 0 && <FieldSet disabled={locked}>
        <FieldLegend>Custom Fields</FieldLegend>
        <FieldGroup className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
          {visibleDefs.map((def) => {
            const options = fieldOptions(def);
            const fieldId = `${id}-custom-${def.key}`;
            const value = custom[def.key] ?? "";
            const invalid = errors[`custom:${def.key}`];
            const common = { id: fieldId, value, disabled: locked, required: !record && Boolean(options.required), "aria-invalid": Boolean(invalid), "aria-describedby": invalid ? `${fieldId}-error` : undefined, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => changeCustom(def.key, event.target.value) };
            const choices = options.enum?.map(String) ?? [];
            return <Field key={def.id} data-disabled={locked} data-invalid={Boolean(invalid)} className={def.field_type === "text" || def.field_type === "json" ? "sm:col-span-2" : undefined}>
              <FieldLabel htmlFor={fieldId}>{def.label}{options.required ? " *" : ""}</FieldLabel>
              {def.field_type === "boolean" ? <NativeSelect {...common} className="w-full"><NativeSelectOption value="">Nicht angegeben</NativeSelectOption><NativeSelectOption value="1">Ja</NativeSelectOption><NativeSelectOption value="0">Nein</NativeSelectOption></NativeSelect> : def.field_type === "enumeration" && choices.length ? <NativeSelect {...common} className="w-full"><NativeSelectOption value="">Nicht angegeben</NativeSelectOption>{value && !choices.includes(value) && <NativeSelectOption value={value}>{value} · nicht mehr verfügbar</NativeSelectOption>}{choices.map((option) => <NativeSelectOption key={option} value={option}>{option}</NativeSelectOption>)}</NativeSelect> : def.field_type === "text" || def.field_type === "json" ? <Textarea {...common} rows={3} /> : <Input {...common} type={def.field_type === "integer" || def.field_type === "decimal" ? "number" : def.field_type === "date" ? "date" : "text"} step={def.field_type === "integer" ? "1" : "any"} min={options.min} max={options.max} placeholder={def.field_type === "datetime" ? "ISO-8601, z. B. 2026-10-06T09:00:00Z" : undefined} />}
              <FieldDescription>{def.key}{def.field_type === "json" ? " · JSON" : ""}</FieldDescription>
              {invalid && <FieldError id={`${fieldId}-error`}>{invalid}</FieldError>}
            </Field>;
          })}
        </FieldGroup>
      </FieldSet>}
      {hiddenCustomChanges.length > 0 && <Alert><AlertTitle>Ausgeblendete Änderungen</AlertTitle><AlertDescription>Deine Eingaben für {hiddenCustomChanges.map((def) => def.label).join(", ")} bleiben beim Stage-Wechsel erhalten. Beim Speichern werden diese ausgeblendeten Eingaben nicht übernommen und danach durch den gespeicherten Stand ersetzt. Wähle zuvor eine passende Stage, wenn du sie speichern möchtest.</AlertDescription></Alert>}
      {error && <Alert variant="destructive"><AlertTitle>{unconfirmed ? "Speichern noch nicht bestätigt" : "Aktion nicht abgeschlossen"}</AlertTitle><AlertDescription className="flex flex-col gap-3"><p>{error}</p>{unconfirmed === "verify" && <Button type="button" variant="outline" disabled={busy} className="w-fit" onClick={() => void retryVerification()}>{busy && <Spinner data-icon="inline-start" />}Speichern prüfen</Button>}</AlertDescription></Alert>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Schließen</Button>
        <Button type="submit" disabled={locked || (Boolean(record) && !isDirty)}>{busy && <Spinner data-icon="inline-start" />}{busy ? "Bitte warten…" : record ? "Speichern" : "Anlegen"}</Button>
      </div>
    </form>
    {record && type === "deal" && <section className="flex flex-col gap-3" aria-label="Vertrag aus Deal">
      <Separator />
      <h3 className="font-medium">Vertrag</h3>
      <p className="text-sm text-muted-foreground">Ein gewonnener Deal legt keinen Vertrag automatisch an. Diese Aktion öffnet einen vorhandenen Vertrag oder einen vorausgefüllten Entwurf.</p>
      {isDirty && <p className="text-sm text-muted-foreground">Speichere zuerst deine Deal-Änderungen.</p>}
      <Button type="button" variant="outline" className="w-fit max-w-full" disabled={locked || isDirty} onClick={(event) => void createContract(event.currentTarget)}><FilePlus2 data-icon="inline-start" />Vertrag anlegen</Button>
    </section>}
    {record && type === "company" && <><Separator /><CompanyRelations companyId={record.id} revision={drawer.revision} /></>}
    {record && <><Separator /><EntityTimeline entityType={type} entityId={record.id} revision={drawer.revision} /></>}
  </div>;
}
