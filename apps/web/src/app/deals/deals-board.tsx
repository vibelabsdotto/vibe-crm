"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition, type RefObject } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldError, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { Company, Contact, Deal, Product, Stage } from "@/lib/types";

function eur(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function contactName(deal: Deal): string {
  if (deal.contact_name) return deal.contact_name;
  return [deal.contact_first_name, deal.contact_last_name]
    .filter((name): name is string => typeof name === "string" && name.length > 0)
    .join(" ");
}

type SelectOption = { value: string; label: string };

function DealSelectField({
  id, label, items, value, onValueChange, disabled = false,
}: {
  id: string;
  label: string;
  items: SelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <Field data-disabled={disabled} className="min-w-0">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select items={items} value={value} onValueChange={(next) => onValueChange(next ?? "")} disabled={disabled}>
        <SelectTrigger id={id} className="w-full min-w-0">
          <SelectValue className="min-w-0" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

function DealDialog({
  contacts, companies, products, stages, onClose, finalFocus,
}: {
  contacts: Contact[];
  companies: Company[];
  products: Product[];
  stages: Stage[];
  onClose: () => void;
  finalFocus: RefObject<HTMLButtonElement | null>;
}) {
  const api = useApi();
  const router = useRouter();
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [stage, setStage] = useState(stages[0]?.key ?? "");
  const [contactId, setContactId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [productId, setProductId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    if (!name.trim()) {
      setNameError("Gib einen Namen für den Deal ein.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setNameError(null);
    try {
      await api("/v1/deals", {
        method: "POST",
        body: {
          name: name.trim(),
          value: value === "" ? 0 : Number(value),
          stage: stage || undefined,
          contact_id: contactId || null,
          company_id: companyId || null,
          product_id: productId || null,
          notes: notes.trim(),
        },
      });
      toast.add({ title: "Deal angelegt", type: "success" });
      router.refresh();
      onClose();
    } catch (cause) {
      setError(cause instanceof ApiError ? `Speichern fehlgeschlagen: ${cause.code}` : "Speichern fehlgeschlagen.");
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open, details) => {
      if (!open) {
        if (inFlight.current) details.cancel();
        else onClose();
      }
    }} disablePointerDismissal={busy}>
      <DialogContent showCloseButton={false} finalFocus={finalFocus} className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Deal anlegen</DialogTitle>
          <DialogDescription>Lege Wert, Pipeline-Stage und die zugehörigen Kontakte fest.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex min-w-0 flex-col gap-6" aria-busy={busy}>
          <FieldSet disabled={busy}>
            <FieldGroup>
              <Field data-disabled={busy} data-invalid={!!nameError}>
                <FieldLabel htmlFor="deal-name">Name *</FieldLabel>
                <Input id="deal-name" value={name} onChange={(event) => { setName(event.target.value); setNameError(null); }} required aria-invalid={!!nameError} aria-describedby={nameError ? "deal-name-error" : undefined} />
                {nameError && <FieldError id="deal-name-error">{nameError}</FieldError>}
              </Field>
              <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field data-disabled={busy}>
                  <FieldLabel htmlFor="deal-value">Wert in EUR</FieldLabel>
                  <Input id="deal-value" type="number" min="0" step="0.01" value={value} onChange={(event) => setValue(event.target.value)} />
                </Field>
                <DealSelectField id="deal-stage" label="Stage" value={stage} onValueChange={setStage} items={stages.map((item) => ({ value: item.key, label: item.label }))} disabled={busy || stages.length === 0} />
              </FieldGroup>
              <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <DealSelectField id="deal-company" label="Firma" value={companyId} onValueChange={setCompanyId} items={[{ value: "", label: "Keine Firma" }, ...companies.map((item) => ({ value: item.id, label: item.name }))]} disabled={busy} />
                <DealSelectField id="deal-product" label="Produkt" value={productId} onValueChange={setProductId} items={[{ value: "", label: "Kein Produkt" }, ...products.map((item) => ({ value: item.key, label: item.name }))]} disabled={busy} />
              </FieldGroup>
              <DealSelectField id="deal-contact" label="Kontakt" value={contactId} onValueChange={setContactId} items={[{ value: "", label: "Kein Kontakt" }, ...contacts.map((item) => ({ value: item.id, label: `${item.first_name} ${item.last_name}`.trim() }))]} disabled={busy} />
              <Field data-disabled={busy}>
                <FieldLabel htmlFor="deal-notes">Notizen</FieldLabel>
                <Textarea id="deal-notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
              </Field>
            </FieldGroup>
          </FieldSet>
          {error && <Alert variant="destructive"><AlertTitle>Deal nicht gespeichert</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={busy} />}>Abbrechen</DialogClose>
            <Button type="submit" disabled={busy}>{busy ? "Speichert…" : "Speichern"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DealsBoard({
  deals, stages, contacts, companies, products, initialStage, initialProduct,
}: {
  deals: Deal[];
  stages: Stage[];
  contacts: Contact[];
  companies: Company[];
  products: Product[];
  initialStage: string;
  initialProduct: string;
}) {
  const api = useApi();
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteDeal, setDeleteDeal] = useState<Deal | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [filterPending, startFilterTransition] = useTransition();
  const mutationPending = useRef(false);
  const createButton = useRef<HTMLButtonElement | null>(null);
  const deleteOpener = useRef<HTMLButtonElement | null>(null);
  const cancelButton = useRef<HTMLButtonElement | null>(null);

  const ordered = useMemo(() => [...stages].sort((a, b) => a.position - b.position), [stages]);
  const stageItems = ordered.map((item) => ({ value: item.key, label: item.label }));
  const filteredDeals = useMemo(
    () => deals.filter((deal) => (!initialProduct || deal.product_id === initialProduct) && (!initialStage || deal.stage === initialStage)),
    [deals, initialProduct, initialStage],
  );
  const visibleStages = initialStage ? ordered.filter((stage) => stage.key === initialStage) : ordered;

  function pushFilters(nextStage: string, nextProduct: string) {
    const query = new URLSearchParams();
    if (nextStage) query.set("stage", nextStage);
    if (nextProduct) query.set("product", nextProduct);
    const search = query.toString();
    startFilterTransition(() => router.push(`/deals${search ? `?${search}` : ""}`, { scroll: false }));
  }

  async function move(deal: Deal, nextStage: string) {
    if (mutationPending.current || !nextStage || nextStage === deal.stage) return;
    mutationPending.current = true;
    setMovingId(deal.id);
    setError(null);
    try {
      await api(`/v1/deals/${encodeURIComponent(deal.id)}`, { method: "PUT", body: { stage: nextStage } });
      toast.add({ title: "Deal verschoben", type: "success" });
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? `Verschieben fehlgeschlagen: ${cause.code}` : "Verschieben fehlgeschlagen.");
    } finally {
      mutationPending.current = false;
      setMovingId(null);
    }
  }

  async function remove() {
    if (!deleteDeal || mutationPending.current) return;
    mutationPending.current = true;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api(`/v1/deals/${encodeURIComponent(deleteDeal.id)}`, { method: "DELETE" });
      toast.add({ title: "Deal gelöscht", type: "success" });
      deleteOpener.current = null;
      setDeleteDeal(null);
      router.refresh();
    } catch (cause) {
      setDeleteError(cause instanceof ApiError ? `Löschen fehlgeschlagen: ${cause.code}` : "Löschen fehlgeschlagen.");
    } finally {
      mutationPending.current = false;
      setDeleting(false);
    }
  }

  const totalValue = filteredDeals.reduce((sum, deal) => sum + (deal.value ?? 0), 0);
  const rowBusy = movingId !== null || deleting || filterPending;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
        <FieldGroup className="grid w-full max-w-full grid-cols-1 gap-3 sm:w-[28rem] sm:shrink-0 sm:grid-cols-2">
          <DealSelectField id="deal-stage-filter" label="Stage filtern" value={initialStage} onValueChange={(value) => pushFilters(value, initialProduct)} items={[{ value: "", label: "Alle Stages" }, ...stageItems]} disabled={rowBusy} />
          <DealSelectField id="deal-product-filter" label="Produkt filtern" value={initialProduct} onValueChange={(value) => pushFilters(initialStage, value)} items={[{ value: "", label: "Alle Produkte" }, ...products.map((item) => ({ value: item.key, label: item.name }))]} disabled={rowBusy} />
        </FieldGroup>
        <p className="text-sm text-muted-foreground" role="status">{filterPending ? "Filter wird geladen…" : `${filteredDeals.length} Deals · ${eur(totalValue)}`}</p>
        <Button ref={createButton} type="button" onClick={() => setCreateOpen(true)} className="sm:ml-auto" disabled={rowBusy}>
          <PlusIcon data-icon="inline-start" />Deal anlegen
        </Button>
      </div>

      {error && <Alert variant="destructive"><AlertTitle>Deal nicht verschoben</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}

      {ordered.length === 0 ? (
        <Empty className="border">
          <EmptyHeader><EmptyTitle>Keine Stages vorhanden</EmptyTitle><EmptyDescription>Lege in den Einstellungen zuerst die Stages deiner Pipeline an.</EmptyDescription></EmptyHeader>
        </Empty>
      ) : visibleStages.length === 0 ? (
        <Empty className="border">
          <EmptyHeader><EmptyTitle>Stage nicht gefunden</EmptyTitle><EmptyDescription>Die gewählte Stage ist nicht mehr verfügbar. Wähle eine andere Stage im Filter.</EmptyDescription></EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="grid min-w-0 grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Deal-Pipeline" aria-busy={filterPending}>
            {visibleStages.map((stage) => {
              const column = filteredDeals.filter((deal) => deal.stage === stage.key);
              const columnValue = column.reduce((sum, deal) => sum + (deal.value ?? 0), 0);
              return (
                <Card key={stage.key} className="min-w-0" role="region" aria-labelledby={`stage-${stage.key}`}>
                  <CardHeader>
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                      <CardTitle className="min-w-0 break-words"><h2 id={`stage-${stage.key}`}>{stage.label}</h2></CardTitle>
                      <Badge variant="secondary">{column.length} Deals</Badge>
                    </div>
                    <CardDescription>{eur(columnValue)}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex min-w-0 flex-col gap-3">
                    {column.length === 0 ? (
                      <Empty className="p-4">
                        <EmptyHeader><EmptyTitle>Keine Deals</EmptyTitle><EmptyDescription>In dieser Stage gibt es noch keine Deals für die aktuelle Auswahl.</EmptyDescription></EmptyHeader>
                      </Empty>
                    ) : column.map((deal) => (
                      <Card key={deal.id} size="sm" className="min-w-0" aria-busy={movingId === deal.id}>
                        <CardHeader>
                          <CardTitle className="break-words"><h3>{deal.name}</h3></CardTitle>
                          {(contactName(deal) || deal.company_name || deal.product_name) && <CardDescription className="break-words">{[contactName(deal), deal.company_name, deal.product_name].filter(Boolean).join(" · ")}</CardDescription>}
                        </CardHeader>
                        <CardContent><p className="font-medium tabular-nums">{eur(deal.value ?? 0)}</p></CardContent>
                        <CardFooter className="flex min-w-0 items-end gap-2">
                          <FieldGroup className="min-w-0 flex-1">
                            <DealSelectField id={`deal-stage-${deal.id}`} label={movingId === deal.id ? "Verschiebt…" : `Stage für ${deal.name}`} value={deal.stage} onValueChange={(value) => { void move(deal, value); }} items={stageItems} disabled={rowBusy} />
                          </FieldGroup>
                          <Button type="button" variant="destructive" size="icon" disabled={rowBusy} aria-label={`Deal ${deal.name} löschen`} onClick={(event) => { deleteOpener.current = event.currentTarget; setDeleteError(null); setDeleteDeal(deal); }}><Trash2Icon /></Button>
                        </CardFooter>
                      </Card>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="hidden min-w-0 md:flex">
            <CardHeader><CardTitle><h2>Deal-Übersicht</h2></CardTitle><CardDescription>Alle Deals der aktuellen Filterauswahl.</CardDescription></CardHeader>
            <CardContent>
              {filteredDeals.length === 0 ? (
                <Empty><EmptyHeader><EmptyTitle>Keine Deals gefunden</EmptyTitle><EmptyDescription>Passe die Filter an oder lege einen Deal an.</EmptyDescription></EmptyHeader></Empty>
              ) : (
                <Table aria-label="Deals der aktuellen Auswahl">
                  <TableHeader><TableRow>
                    <TableHead scope="col">Name</TableHead><TableHead scope="col">Stage</TableHead>
                    <TableHead scope="col" className="hidden lg:table-cell">Kontakt / Firma</TableHead>
                    <TableHead scope="col" className="hidden lg:table-cell">Produkt</TableHead>
                    <TableHead scope="col" className="text-right">Wert</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>{filteredDeals.map((deal) => <TableRow key={deal.id}>
                    <TableCell><span className="font-medium">{deal.name}</span></TableCell>
                    <TableCell><Badge variant="outline">{ordered.find((item) => item.key === deal.stage)?.label ?? deal.stage}</Badge></TableCell>
                    <TableCell className="hidden lg:table-cell">{[contactName(deal), deal.company_name].filter(Boolean).join(" · ") || "Nicht zugeordnet"}</TableCell>
                    <TableCell className="hidden lg:table-cell">{deal.product_name || "Nicht zugeordnet"}</TableCell>
                    <TableCell className="text-right tabular-nums">{eur(deal.value ?? 0)}</TableCell>
                  </TableRow>)}</TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {createOpen && <DealDialog contacts={contacts} companies={companies} products={products} stages={ordered} onClose={() => setCreateOpen(false)} finalFocus={createButton} />}

      <Dialog open={deleteDeal !== null} onOpenChange={(open, details) => {
        if (!open) {
          if (mutationPending.current) details.cancel();
          else setDeleteDeal(null);
        }
      }} disablePointerDismissal={deleting}>
        <DialogContent showCloseButton={false} initialFocus={cancelButton} finalFocus={() => deleteOpener.current?.isConnected ? deleteOpener.current : createButton.current}>
          <DialogHeader><DialogTitle>Deal löschen?</DialogTitle><DialogDescription className="break-words">Der Deal „{deleteDeal?.name}“ wird dauerhaft gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.</DialogDescription></DialogHeader>
          {deleteError && <Alert variant="destructive"><AlertTitle>Deal nicht gelöscht</AlertTitle><AlertDescription>{deleteError}</AlertDescription></Alert>}
          <DialogFooter>
            <DialogClose render={<Button ref={cancelButton} type="button" variant="outline" disabled={deleting} />}>Abbrechen</DialogClose>
            <Button type="button" variant="destructive" disabled={deleting} onClick={() => { void remove(); }}>{deleting ? "Löscht…" : "Deal löschen"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
