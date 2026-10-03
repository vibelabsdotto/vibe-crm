"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { Company, Product, Subscription, SubscriptionInterval, SubscriptionStatus } from "@/lib/types";

const STATUS_ITEMS: { value: SubscriptionStatus; label: string }[] = [
  { value: "active", label: "Aktiv" },
  { value: "trial", label: "Testphase" },
  { value: "paused", label: "Pausiert" },
  { value: "cancelled", label: "Gekündigt" },
  { value: "expired", label: "Abgelaufen" },
];
const INTERVAL_ITEMS: { value: SubscriptionInterval; label: string }[] = [
  { value: "monthly", label: "Monatlich" },
  { value: "quarterly", label: "Vierteljährlich" },
  { value: "yearly", label: "Jährlich" },
  { value: "one_time", label: "Einmalig" },
];

function amount(value: number, currency: string): string {
  return `${new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ${currency || "EUR"}`;
}

function statusLabel(value: SubscriptionStatus): string {
  return STATUS_ITEMS.find((item) => item.value === value)?.label ?? value;
}

function intervalLabel(value: SubscriptionInterval): string {
  return INTERVAL_ITEMS.find((item) => item.value === value)?.label ?? value;
}

type FormState = {
  name: string;
  company_id: string;
  product_id: string;
  amount: string;
  currency: string;
  interval: SubscriptionInterval;
  status: SubscriptionStatus;
  start_date: string;
  end_date: string;
  notes: string;
};

function emptyForm(): FormState {
  return {
    name: "", company_id: "", product_id: "", amount: "", currency: "EUR",
    interval: "monthly", status: "active", start_date: "", end_date: "", notes: "",
  };
}

function formFromSub(subscription: Subscription): FormState {
  return {
    name: subscription.name,
    company_id: subscription.company_id ?? "",
    product_id: subscription.product_id ?? "",
    amount: String(subscription.amount ?? 0),
    currency: subscription.currency || "EUR",
    interval: subscription.interval,
    status: subscription.status,
    start_date: subscription.start_date ?? "",
    end_date: subscription.end_date ?? "",
    notes: subscription.notes ?? "",
  };
}

function SubscriptionSelectField<Value extends string>({
  id, label, items, value, onValueChange, disabled = false,
}: {
  id: string;
  label: string;
  items: { value: Value; label: string }[];
  value: Value;
  onValueChange: (value: Value) => void;
  disabled?: boolean;
}) {
  return (
    <Field data-disabled={disabled} className="min-w-0">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select items={items} value={value} onValueChange={(next) => { if (next !== null) onValueChange(next); }} disabled={disabled}>
        <SelectTrigger id={id} className="w-full min-w-0"><SelectValue className="min-w-0" /></SelectTrigger>
        <SelectContent><SelectGroup>
          {items.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
        </SelectGroup></SelectContent>
      </Select>
    </Field>
  );
}

function SubscriptionDialog({
  companies, products, initial, editId, onClose, finalFocus,
}: {
  companies: Company[];
  products: Product[];
  initial: FormState;
  editId: string | null;
  onClose: () => void;
  finalFocus: () => HTMLElement | null;
}) {
  const api = useApi();
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initial);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  function set<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    if (!form.name.trim()) {
      setNameError("Gib einen Namen für das Abo ein.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setNameError(null);
    const body = {
      name: form.name.trim(),
      company_id: form.company_id || null,
      product_id: form.product_id || null,
      amount: form.amount === "" ? 0 : Number(form.amount),
      currency: form.currency.trim() || "EUR",
      interval: form.interval,
      status: form.status,
      start_date: form.start_date,
      end_date: form.end_date,
      notes: form.notes.trim(),
    };
    try {
      if (editId) {
        await api(`/v1/subscriptions/${encodeURIComponent(editId)}`, { method: "PUT", body });
      } else {
        await api("/v1/subscriptions", { method: "POST", body });
      }
      toast.add({ title: editId ? "Abo gespeichert" : "Abo angelegt", type: "success" });
      router.refresh();
      onClose();
    } catch (cause) {
      setError(cause instanceof ApiError ? `Speichern fehlgeschlagen: ${cause.code}` : "Speichern fehlgeschlagen.");
      inFlight.current = false;
      setBusy(false);
    }
  }

  const companyItems = [{ value: "", label: "Keine Firma" }, ...companies.map((item) => ({ value: item.id, label: item.name }))];
  const productItems = [{ value: "", label: "Kein Produkt" }, ...products.map((item) => ({ value: item.key, label: item.name }))];
  if (form.company_id && !companyItems.some((item) => item.value === form.company_id)) companyItems.push({ value: form.company_id, label: "Zugeordnete Firma" });
  if (form.product_id && !productItems.some((item) => item.value === form.product_id)) productItems.push({ value: form.product_id, label: "Zugeordnetes Produkt" });

  return (
    <Dialog open onOpenChange={(open, details) => {
      if (!open) {
        if (inFlight.current) details.cancel();
        else onClose();
      }
    }} disablePointerDismissal={busy}>
      <DialogContent showCloseButton={false} finalFocus={finalFocus} className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editId ? "Abo bearbeiten" : "Abo anlegen"}</DialogTitle>
          <DialogDescription>Verwalte Zuordnung, Betrag, Laufzeit und Status des Abos.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex min-w-0 flex-col gap-6" aria-busy={busy}>
          <FieldSet disabled={busy}>
            <FieldGroup>
              <Field data-disabled={busy} data-invalid={!!nameError}>
                <FieldLabel htmlFor="subscription-name">Name *</FieldLabel>
                <Input id="subscription-name" value={form.name} onChange={(event) => { set("name", event.target.value); setNameError(null); }} required placeholder="z. B. Monatspauschale" aria-invalid={!!nameError} aria-describedby={nameError ? "subscription-name-error" : undefined} />
                {nameError && <FieldError id="subscription-name-error">{nameError}</FieldError>}
              </Field>
              <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <SubscriptionSelectField id="subscription-company" label="Firma" value={form.company_id} onValueChange={(value) => set("company_id", value)} items={companyItems} disabled={busy} />
                <SubscriptionSelectField id="subscription-product" label="Produkt" value={form.product_id} onValueChange={(value) => set("product_id", value)} items={productItems} disabled={busy} />
              </FieldGroup>
              <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field data-disabled={busy}>
                  <FieldLabel htmlFor="subscription-amount">Betrag</FieldLabel>
                  <Input id="subscription-amount" type="number" min="0" step="0.01" value={form.amount} onChange={(event) => set("amount", event.target.value)} />
                </Field>
                <Field data-disabled={busy}>
                  <FieldLabel htmlFor="subscription-currency">Währung</FieldLabel>
                  <Input id="subscription-currency" value={form.currency} onChange={(event) => set("currency", event.target.value)} maxLength={8} />
                </Field>
                <SubscriptionSelectField id="subscription-interval" label="Intervall" value={form.interval} onValueChange={(value) => set("interval", value)} items={INTERVAL_ITEMS} disabled={busy} />
              </FieldGroup>
              <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <SubscriptionSelectField id="subscription-status" label="Status" value={form.status} onValueChange={(value) => set("status", value)} items={STATUS_ITEMS} disabled={busy} />
                <Field data-disabled={busy}>
                  <FieldLabel htmlFor="subscription-start">Start</FieldLabel>
                  <Input id="subscription-start" type="date" value={form.start_date} onChange={(event) => set("start_date", event.target.value)} />
                </Field>
                <Field data-disabled={busy}>
                  <FieldLabel htmlFor="subscription-end">Ende</FieldLabel>
                  <Input id="subscription-end" type="date" value={form.end_date} onChange={(event) => set("end_date", event.target.value)} aria-describedby="subscription-end-hint" />
                  <FieldDescription id="subscription-end-hint">Leer lassen für ein unbefristetes Abo.</FieldDescription>
                </Field>
              </FieldGroup>
              <Field data-disabled={busy}>
                <FieldLabel htmlFor="subscription-notes">Notizen</FieldLabel>
                <Textarea id="subscription-notes" value={form.notes} onChange={(event) => set("notes", event.target.value)} rows={3} />
              </Field>
            </FieldGroup>
          </FieldSet>
          {error && <Alert variant="destructive"><AlertTitle>Abo nicht gespeichert</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={busy} />}>Abbrechen</DialogClose>
            <Button type="submit" disabled={busy}>{busy ? "Speichert…" : "Speichern"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type SubscriptionAction = "cancel" | "remove";

function SubscriptionActions({ subscription, disabled, onEdit, onAction }: {
  subscription: Subscription;
  disabled: boolean;
  onEdit: (subscription: Subscription, opener: HTMLButtonElement) => void;
  onAction: (subscription: Subscription, action: SubscriptionAction, opener: HTMLButtonElement) => void;
}) {
  const canCancel = subscription.status === "active" || subscription.status === "trial" || subscription.status === "paused";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" disabled={disabled} aria-label={`Abo ${subscription.name} bearbeiten`} onClick={(event) => onEdit(subscription, event.currentTarget)}>Bearbeiten</Button>
      {canCancel && <Button type="button" variant="outline" size="sm" disabled={disabled} aria-label={`Abo ${subscription.name} kündigen`} onClick={(event) => onAction(subscription, "cancel", event.currentTarget)}>Kündigen</Button>}
      <Button type="button" variant="destructive" size="icon-sm" disabled={disabled} aria-label={`Abo ${subscription.name} löschen`} onClick={(event) => onAction(subscription, "remove", event.currentTarget)}><Trash2Icon /></Button>
    </div>
  );
}

export function SubscriptionsTable({ subscriptions, companies, products, initialStatus }: {
  subscriptions: Subscription[];
  companies: Company[];
  products: Product[];
  initialStatus: string;
}) {
  const api = useApi();
  const router = useRouter();
  const [dialog, setDialog] = useState<{ initial: FormState; editId: string | null } | null>(null);
  const [confirmation, setConfirmation] = useState<{ subscription: Subscription; action: SubscriptionAction } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filterPending, startFilterTransition] = useTransition();
  const inFlight = useRef(false);
  const createButton = useRef<HTMLButtonElement | null>(null);
  const formOpener = useRef<HTMLButtonElement | null>(null);
  const actionOpener = useRef<HTMLButtonElement | null>(null);
  const cancelButton = useRef<HTMLButtonElement | null>(null);

  function applyStatusFilter(value: string) {
    startFilterTransition(() => router.push(`/subscriptions${value ? `?status=${encodeURIComponent(value)}` : ""}`, { scroll: false }));
  }

  function edit(subscription: Subscription, opener: HTMLButtonElement) {
    formOpener.current = opener;
    setDialog({ initial: formFromSub(subscription), editId: subscription.id });
  }

  function confirm(subscription: Subscription, action: SubscriptionAction, opener: HTMLButtonElement) {
    actionOpener.current = opener;
    setError(null);
    setConfirmation({ subscription, action });
  }

  async function executeAction() {
    if (!confirmation || inFlight.current) return;
    const { subscription, action } = confirmation;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      if (action === "cancel") {
        await api(`/v1/subscriptions/${encodeURIComponent(subscription.id)}`, {
          method: "PUT",
          body: { status: "cancelled" },
        });
      } else {
        await api(`/v1/subscriptions/${encodeURIComponent(subscription.id)}`, { method: "DELETE" });
      }
      toast.add({ title: action === "cancel" ? "Abo gekündigt" : "Abo gelöscht", type: "success" });
      // Both actions can remove the row or its opener from the current filter.
      actionOpener.current = null;
      setConfirmation(null);
      router.refresh();
    } catch (cause) {
      const label = action === "cancel" ? "Kündigen" : "Löschen";
      setError(cause instanceof ApiError ? `${label} fehlgeschlagen: ${cause.code}` : `${label} fehlgeschlagen.`);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const rowBusy = busy || filterPending;
  const isRemoval = confirmation?.action === "remove";

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
        <FieldGroup className="w-full max-w-full sm:w-56 sm:shrink-0">
          <SubscriptionSelectField id="subscription-status-filter" label="Status filtern" value={initialStatus} onValueChange={applyStatusFilter} items={[{ value: "", label: "Alle Status" }, ...STATUS_ITEMS]} disabled={rowBusy} />
        </FieldGroup>
        <p className="text-sm text-muted-foreground" role="status">{filterPending ? "Filter wird geladen…" : `${subscriptions.length} Abos in der Auswahl`}</p>
        <Button ref={createButton} type="button" disabled={rowBusy} className="sm:ml-auto" onClick={(event) => { formOpener.current = event.currentTarget; setDialog({ initial: emptyForm(), editId: null }); }}><PlusIcon data-icon="inline-start" />Abo anlegen</Button>
      </div>

      {subscriptions.length === 0 ? (
        <Empty className="border"><EmptyHeader>
          <EmptyTitle>{initialStatus ? "Keine Abos für diesen Status" : "Keine Abos vorhanden"}</EmptyTitle>
          <EmptyDescription>{initialStatus ? "Wähle einen anderen Status oder lege ein neues Abo an." : "Lege ein Abo an, um wiederkehrende Beträge und Laufzeiten zu verwalten."}</EmptyDescription>
        </EmptyHeader></Empty>
      ) : (
        <>
          <div className="grid min-w-0 grid-cols-1 gap-4 md:hidden" aria-busy={filterPending}>
            {subscriptions.map((subscription) => <Card key={subscription.id} className="min-w-0">
              <CardHeader>
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                  <CardTitle className="min-w-0 break-words"><h2>{subscription.name}</h2></CardTitle>
                  <Badge variant={subscription.status === "active" ? "secondary" : "outline"}>{statusLabel(subscription.status)}</Badge>
                </div>
                <CardDescription className="break-words">{[subscription.company_name, subscription.product_name].filter(Boolean).join(" · ") || "Keine Firma oder kein Produkt zugeordnet"}</CardDescription>
              </CardHeader>
              <CardContent><p className="font-medium tabular-nums">{amount(subscription.amount ?? 0, subscription.currency)}</p><p className="text-sm text-muted-foreground">{intervalLabel(subscription.interval)}</p></CardContent>
              <CardFooter><SubscriptionActions subscription={subscription} disabled={rowBusy} onEdit={edit} onAction={confirm} /></CardFooter>
            </Card>)}
          </div>

          <Card className="hidden min-w-0 md:flex">
            <CardHeader><CardTitle><h2>Abo-Übersicht</h2></CardTitle><CardDescription>Beträge, Intervalle und Status der aktuellen Auswahl.</CardDescription></CardHeader>
            <CardContent>
              <Table aria-label="Abos der aktuellen Auswahl" aria-busy={filterPending}>
                <TableHeader><TableRow>
                  <TableHead scope="col">Name</TableHead>
                  <TableHead scope="col" className="hidden lg:table-cell">Firma</TableHead>
                  <TableHead scope="col" className="hidden xl:table-cell">Produkt</TableHead>
                  <TableHead scope="col" className="text-right">Betrag</TableHead>
                  <TableHead scope="col" className="hidden xl:table-cell">Intervall</TableHead>
                  <TableHead scope="col">Status</TableHead>
                  <TableHead scope="col">Aktionen</TableHead>
                </TableRow></TableHeader>
                <TableBody>{subscriptions.map((subscription) => <TableRow key={subscription.id}>
                  <TableCell><span className="font-medium">{subscription.name}</span></TableCell>
                  <TableCell className="hidden lg:table-cell">{subscription.company_name || "Nicht zugeordnet"}</TableCell>
                  <TableCell className="hidden xl:table-cell">{subscription.product_name || "Nicht zugeordnet"}</TableCell>
                  <TableCell className="text-right tabular-nums">{amount(subscription.amount ?? 0, subscription.currency)}</TableCell>
                  <TableCell className="hidden xl:table-cell">{intervalLabel(subscription.interval)}</TableCell>
                  <TableCell><Badge variant={subscription.status === "active" ? "secondary" : "outline"}>{statusLabel(subscription.status)}</Badge></TableCell>
                  <TableCell><SubscriptionActions subscription={subscription} disabled={rowBusy} onEdit={edit} onAction={confirm} /></TableCell>
                </TableRow>)}</TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {dialog && <SubscriptionDialog companies={companies} products={products} initial={dialog.initial} editId={dialog.editId} onClose={() => setDialog(null)} finalFocus={() => formOpener.current?.isConnected ? formOpener.current : createButton.current} />}

      <Dialog open={confirmation !== null} onOpenChange={(open, details) => {
        if (!open) {
          if (inFlight.current) details.cancel();
          else setConfirmation(null);
        }
      }} disablePointerDismissal={busy}>
        <DialogContent showCloseButton={false} initialFocus={cancelButton} finalFocus={() => actionOpener.current?.isConnected ? actionOpener.current : createButton.current}>
          <DialogHeader>
            <DialogTitle>{isRemoval ? "Abo löschen?" : "Abo kündigen?"}</DialogTitle>
            <DialogDescription className="break-words">{isRemoval ? `Das Abo „${confirmation?.subscription.name}“ wird dauerhaft gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.` : `Das Abo „${confirmation?.subscription.name}“ erhält den Status „Gekündigt“. Der Datensatz bleibt erhalten.`}</DialogDescription>
          </DialogHeader>
          {error && <Alert variant="destructive"><AlertTitle>{isRemoval ? "Abo nicht gelöscht" : "Abo nicht gekündigt"}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
          <DialogFooter>
            <DialogClose render={<Button ref={cancelButton} type="button" variant="outline" disabled={busy} />}>Abbrechen</DialogClose>
            <Button type="button" variant={isRemoval ? "destructive" : "default"} disabled={busy} onClick={() => { void executeAction(); }}>{busy ? (isRemoval ? "Löscht…" : "Kündigt…") : (isRemoval ? "Abo löschen" : "Abo kündigen")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
