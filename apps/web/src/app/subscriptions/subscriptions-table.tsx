"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type MouseEvent } from "react";
import { useEntityDrawer } from "@/components/entity-drawer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { Subscription, SubscriptionInterval, SubscriptionStatus } from "@/lib/types";

const STATUS_ITEMS: { value: SubscriptionStatus; label: string }[] = [
  { value: "active", label: "Aktiv" },
  { value: "trial", label: "Testphase" },
  { value: "paused", label: "Pausiert" },
  { value: "cancelled", label: "Gekündigt / beendet" },
  { value: "expired", label: "Abgelaufen" },
];
const INTERVAL_LABELS: Record<SubscriptionInterval, string> = {
  monthly: "monatlich", quarterly: "vierteljährlich", yearly: "jährlich", one_time: "einmalig",
};
const TYPE_ITEMS = [
  { value: "", label: "Alle Arten" },
  { value: "recurring", label: "Wiederkehrende Verträge" },
  { value: "one_time", label: "Einmalzahlungen" },
];

function amount(value: number, currency: string): string {
  return `${new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ${currency}`;
}

function mrr(subscription: Subscription): number {
  if (subscription.interval === "one_time" || (subscription.status !== "active" && subscription.status !== "trial")) return 0;
  return subscription.amount / (subscription.interval === "quarterly" ? 3 : subscription.interval === "yearly" ? 12 : 1);
}

function statusLabel(subscription: Subscription): string {
  if (subscription.interval === "one_time" && subscription.status === "cancelled") return "Beendet";
  return STATUS_ITEMS.find((item) => item.value === subscription.status)?.label ?? subscription.status;
}

function FilterField({ id, label, items, value, onValueChange, disabled }: {
  id: string; label: string; items: { value: string; label: string }[];
  value: string; onValueChange: (value: string) => void; disabled: boolean;
}) {
  return <Field data-disabled={disabled} className="min-w-0">
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Select items={items} value={value} onValueChange={(next) => { if (next !== null) onValueChange(next); }} disabled={disabled}>
      <SelectTrigger id={id} className="w-full min-w-0"><SelectValue className="min-w-0 truncate" /></SelectTrigger>
      <SelectContent alignItemWithTrigger={false}><SelectGroup>{items.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
    </Select>
  </Field>;
}

type SubscriptionAction = "cancel" | "remove";
function SubscriptionActions({ subscription, disabled, onEdit, onAction }: {
  subscription: Subscription; disabled: boolean;
  onEdit: (subscription: Subscription, opener: HTMLButtonElement) => void;
  onAction: (subscription: Subscription, action: SubscriptionAction, opener: HTMLButtonElement) => void;
}) {
  const canCancel = subscription.status === "active" || subscription.status === "trial" || subscription.status === "paused";
  return <div className="flex flex-wrap items-center gap-2">
    <Button type="button" variant="outline" size="sm" disabled={disabled} aria-label={`${subscription.name} bearbeiten`} onClick={(event) => onEdit(subscription, event.currentTarget)}>Bearbeiten</Button>
    {canCancel && <Button type="button" variant="outline" size="sm" disabled={disabled} aria-label={`${subscription.name} ${subscription.interval === "one_time" ? "beenden" : "kündigen"}`} onClick={(event) => onAction(subscription, "cancel", event.currentTarget)}>{subscription.interval === "one_time" ? "Beenden" : "Kündigen"}</Button>}
    <Button type="button" variant="destructive" size="icon-sm" disabled={disabled} aria-label={`${subscription.name} löschen`} onClick={(event) => onAction(subscription, "remove", event.currentTarget)}><Trash2Icon /></Button>
  </div>;
}

export function SubscriptionsTable({ subscriptions, initialStatus }: { subscriptions: Subscription[]; initialStatus: string }) {
  const api = useApi();
  const router = useRouter();
  const { openEntity, createEntity } = useEntityDrawer();
  const [typeFilter, setTypeFilter] = useState("");
  const [confirmation, setConfirmation] = useState<{ subscription: Subscription; action: SubscriptionAction } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verificationOnly, setVerificationOnly] = useState(false);
  const [filterPending, startFilterTransition] = useTransition();
  const inFlight = useRef(false);
  const createButton = useRef<HTMLButtonElement | null>(null);
  const actionOpener = useRef<HTMLButtonElement | null>(null);
  const cancelButton = useRef<HTMLButtonElement | null>(null);

  function edit(subscription: Subscription, opener: HTMLButtonElement) {
    openEntity("subscription", subscription.id, opener);
  }

  function openRow(event: MouseEvent<HTMLElement>, subscription: Subscription) {
    if (busy || filterPending || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const target = event.target;
    if (!(target instanceof Element) || !event.currentTarget.contains(target)) return;
    const control = target.closest('button, a, input, select, textarea, [role="button"], [role="combobox"], [role="checkbox"], [role="menuitem"]');
    if (control && control !== event.currentTarget && event.currentTarget.contains(control)) return;
    const opener = event.currentTarget.querySelector<HTMLButtonElement>("button[data-subscription-opener]");
    if (opener) edit(subscription, opener);
  }

  function confirm(subscription: Subscription, action: SubscriptionAction, opener: HTMLButtonElement) {
    actionOpener.current = opener;
    setError(null);
    setVerificationOnly(false);
    setConfirmation({ subscription, action });
  }

  async function executeAction() {
    if (!confirmation || inFlight.current) return;
    const { subscription, action } = confirmation;
    const path = `/v1/subscriptions/${encodeURIComponent(subscription.id)}`;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    let checking = verificationOnly;
    try {
      if (!verificationOnly) {
        if (action === "cancel") {
          const response = await api<{ subscription: Subscription }>(path, { method: "PUT", body: { status: "cancelled" } });
          checking = true;
          if (response?.subscription?.id !== subscription.id || response.subscription.status !== "cancelled") throw new Error("Speicherantwort nicht bestätigt.");
        } else {
          const response = await api<{ ok: boolean }>(path, { method: "DELETE" });
          checking = true;
          if (response?.ok !== true) throw new Error("Löschantwort nicht bestätigt.");
        }
      }
      if (action === "cancel") {
        const readback = await api<{ subscription: Subscription }>(path);
        if (readback?.subscription?.id !== subscription.id || readback.subscription.status !== "cancelled") throw new Error("Der beendete Status konnte nicht bestätigt werden.");
      } else {
        let absent = false;
        try { await api(path); } catch (cause) {
          if (cause instanceof ApiError && cause.status === 404) absent = true;
          else throw cause;
        }
        if (!absent) throw new Error("Der Datensatz ist weiterhin vorhanden.");
      }
      toast.add({ title: action === "remove" ? "Datensatz gelöscht" : subscription.interval === "one_time" ? "Einmalzahlung beendet" : "Vertrag gekündigt", type: "success" });
      actionOpener.current = null;
      setConfirmation(null);
      setVerificationOnly(false);
      router.refresh();
    } catch (cause) {
      const rejected = !checking && cause instanceof ApiError && [400, 401, 403, 404, 409, 413, 422, 429].includes(cause.status);
      setVerificationOnly(!rejected);
      setError(rejected ? "Die Aktion wurde abgelehnt. Der Datensatz bleibt erhalten." : "Das Ergebnis ist noch nicht bestätigt. Prüfe den Status erneut, ohne die Aktion ein zweites Mal zu senden.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const visible = subscriptions.filter((subscription) => typeFilter === "one_time" ? subscription.interval === "one_time" : typeFilter === "recurring" ? subscription.interval !== "one_time" : true);
  const rowBusy = busy || filterPending;
  const isRemoval = confirmation?.action === "remove";
  const oneTimeAction = confirmation?.subscription.interval === "one_time";

  return <div className="flex min-w-0 flex-col gap-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
      <FieldGroup className="w-full max-w-full sm:w-48 sm:shrink-0"><FilterField id="subscription-status-filter" label="Status filtern" value={initialStatus} onValueChange={(value) => startFilterTransition(() => router.push(`/subscriptions${value ? `?status=${encodeURIComponent(value)}` : ""}`, { scroll: false }))} items={[{ value: "", label: "Alle Status" }, ...STATUS_ITEMS]} disabled={rowBusy} /></FieldGroup>
      <FieldGroup className="w-full max-w-full sm:w-60 sm:shrink-0"><FilterField id="subscription-type-filter" label="Art filtern" value={typeFilter} onValueChange={setTypeFilter} items={TYPE_ITEMS} disabled={rowBusy} /></FieldGroup>
      <p className="text-sm text-muted-foreground" role="status">{filterPending ? "Filter wird geladen…" : `${visible.length} von ${subscriptions.length} Datensätzen in der Statusauswahl`}</p>
      <Button ref={createButton} data-entity-drawer-focus-fallback type="button" disabled={rowBusy} className="h-auto min-h-8 whitespace-normal sm:ml-auto" onClick={(event) => createEntity("subscription", {}, event.currentTarget)}><PlusIcon data-icon="inline-start" />Vertrag / Einmalzahlung anlegen</Button>
    </div>
    <p className="text-sm text-muted-foreground">Wiederkehrende Verträge zählen je nach Status zum MRR. Einmalzahlungen tragen immer 0 bei. Mehrere Datensätze derselben Firma bleiben getrennt.</p>
    {visible.length === 0 ? <Empty className="border"><EmptyHeader>
      <EmptyTitle>{initialStatus || typeFilter ? "Keine Datensätze für diese Auswahl" : "Keine Verträge oder Einmalzahlungen vorhanden"}</EmptyTitle>
      <EmptyDescription>{initialStatus || typeFilter ? "Wähle einen anderen Status oder eine andere Art." : "Lege einen wiederkehrenden Vertrag oder eine Einmalzahlung an."}</EmptyDescription>
    </EmptyHeader></Empty> : <>
      <div className="grid min-w-0 grid-cols-1 gap-4 md:hidden" aria-busy={filterPending}>
        {visible.map((subscription) => <Card key={subscription.id} className="min-w-0" onClick={(event) => openRow(event, subscription)}>
          <CardHeader>
            <CardTitle className="min-w-0"><h2><Button data-subscription-opener type="button" variant="link" disabled={rowBusy} className="h-auto max-w-full justify-start p-0 text-left whitespace-normal break-words" onClick={(event) => edit(subscription, event.currentTarget)}>{subscription.name}</Button></h2></CardTitle>
            <div className="flex flex-wrap gap-2"><Badge variant="secondary">{subscription.interval === "one_time" ? "Einmalzahlung" : "Wiederkehrend"}</Badge><Badge variant="outline">{statusLabel(subscription)}</Badge></div>
            <CardDescription className="break-words">{[subscription.company_name, subscription.product_name].filter(Boolean).join(" · ") || "Keine Firma oder kein Produkt zugeordnet"}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2"><p className="font-medium tabular-nums">{amount(subscription.amount, subscription.currency)} · {INTERVAL_LABELS[subscription.interval]}</p><p className="text-sm text-muted-foreground">MRR: <span className="tabular-nums">{amount(mrr(subscription), subscription.currency)}</span>{subscription.interval === "one_time" ? " · immer 0" : " / Monat"}</p></CardContent>
          <CardFooter><SubscriptionActions subscription={subscription} disabled={rowBusy} onEdit={edit} onAction={confirm} /></CardFooter>
        </Card>)}
      </div>
      <Card className="hidden min-w-0 md:flex">
        <CardHeader><CardTitle><h2>Verträge und Einmalzahlungen</h2></CardTitle><CardDescription>Beträge je Intervall und MRR je Datensatz, ohne Währungsumrechnung.</CardDescription></CardHeader>
        <CardContent><Table aria-label="Verträge und Einmalzahlungen der aktuellen Auswahl" aria-busy={filterPending}>
          <TableHeader><TableRow>
            <TableHead scope="col">Name / Art</TableHead><TableHead scope="col" className="hidden lg:table-cell">Firma</TableHead><TableHead scope="col" className="hidden xl:table-cell">Produkt</TableHead>
            <TableHead scope="col" className="text-right">Betrag / Intervall</TableHead><TableHead scope="col" className="hidden lg:table-cell text-right">MRR</TableHead><TableHead scope="col">Status</TableHead><TableHead scope="col">Aktionen</TableHead>
          </TableRow></TableHeader>
          <TableBody>{visible.map((subscription) => <TableRow key={subscription.id} onClick={(event) => openRow(event, subscription)}>
            <TableCell className="max-w-64"><div className="flex min-w-0 flex-col items-start gap-1"><Button data-subscription-opener type="button" variant="link" disabled={rowBusy} className="h-auto max-w-full justify-start p-0 text-left whitespace-normal break-words" onClick={(event) => edit(subscription, event.currentTarget)}>{subscription.name}</Button><Badge variant="outline">{subscription.interval === "one_time" ? "Einmalzahlung" : "Wiederkehrend"}</Badge></div></TableCell>
            <TableCell className="hidden lg:table-cell max-w-56 whitespace-normal break-words">{subscription.company_name || "Nicht zugeordnet"}</TableCell><TableCell className="hidden xl:table-cell max-w-48 whitespace-normal break-words">{subscription.product_name || "Nicht zugeordnet"}</TableCell>
            <TableCell className="text-right"><p className="tabular-nums">{amount(subscription.amount, subscription.currency)}</p><p className="text-xs text-muted-foreground">{INTERVAL_LABELS[subscription.interval]}</p></TableCell>
            <TableCell className="hidden lg:table-cell text-right tabular-nums">{amount(mrr(subscription), subscription.currency)}</TableCell>
            <TableCell><Badge variant={subscription.status === "active" ? "secondary" : "outline"}>{statusLabel(subscription)}</Badge></TableCell><TableCell><SubscriptionActions subscription={subscription} disabled={rowBusy} onEdit={edit} onAction={confirm} /></TableCell>
          </TableRow>)}</TableBody>
        </Table></CardContent>
      </Card>
    </>}
    <Dialog open={confirmation !== null} onOpenChange={(open, details) => { if (!open) { if (inFlight.current) details.cancel(); else setConfirmation(null); } }} disablePointerDismissal={busy}>
      <DialogContent showCloseButton={false} initialFocus={cancelButton} finalFocus={() => actionOpener.current?.isConnected ? actionOpener.current : createButton.current}>
        <DialogHeader><DialogTitle>{isRemoval ? "Datensatz löschen?" : oneTimeAction ? "Einmalzahlung beenden?" : "Vertrag kündigen?"}</DialogTitle><DialogDescription className="break-words">{isRemoval ? `Der Datensatz "${confirmation?.subscription.name}" wird dauerhaft gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.` : `Der Datensatz "${confirmation?.subscription.name}" erhält den Status "${oneTimeAction ? "Beendet" : "Gekündigt"}". Der Datensatz bleibt erhalten.`}</DialogDescription></DialogHeader>
        {error && <Alert variant="destructive"><AlertTitle>Aktion nicht bestätigt</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        <DialogFooter><DialogClose render={<Button ref={cancelButton} type="button" variant="outline" disabled={busy} />}>Abbrechen</DialogClose><Button type="button" variant={isRemoval && !verificationOnly ? "destructive" : "default"} disabled={busy} onClick={() => { void executeAction(); }}>{busy ? "Wird geprüft…" : verificationOnly ? "Status erneut prüfen" : isRemoval ? "Dauerhaft löschen" : oneTimeAction ? "Einmalzahlung beenden" : "Vertrag kündigen"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
