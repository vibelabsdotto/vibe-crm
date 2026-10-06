"use client";

import { Loader2, Plus, Users } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useTransition, type ComponentProps, type MouseEvent } from "react";
import { useEntityDrawer } from "@/components/entity-drawer";
import { ImportDialog } from "@/components/import-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { Company, Contact, ContactStatus } from "@/lib/types";

const STATUS_LABELS: Record<ContactStatus, string> = {
  lead: "Lead",
  active: "Aktiv",
  inactive: "Inaktiv",
  churned: "Abgewandert",
};
const STATUS_ITEMS = (Object.keys(STATUS_LABELS) as ContactStatus[]).map((value) => ({ value, label: STATUS_LABELS[value] }));
const FILTER_STATUS_ITEMS = [{ value: "", label: "Alle Status" }, ...STATUS_ITEMS];

const entityButtonClassName = "h-auto max-w-full justify-start whitespace-normal p-0 text-left";

type DialogFinalFocus = ComponentProps<typeof DialogContent>["finalFocus"];

function DeleteContactDialog({ contact, onClose, finalFocus }: { contact: Contact; onClose: () => void; finalFocus: DialogFinalFocus }) {
  const api = useApi();
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const cancelButton = useRef<HTMLButtonElement>(null);

  async function remove() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await api(`/v1/contacts/${encodeURIComponent(contact.id)}`, { method: "DELETE" });
      toast.add({ title: "Kontakt gelöscht", type: "success" });
      router.refresh();
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? `Löschen fehlgeschlagen: ${err.code}` : "Löschen fehlgeschlagen. Bitte versuche es erneut.");
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} disablePointerDismissal={busy} onOpenChange={(nextOpen, details) => {
      if (pending.current) { details.cancel(); return; }
      setOpen(nextOpen);
    }} onOpenChangeComplete={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent showCloseButton={false} initialFocus={cancelButton} finalFocus={finalFocus} className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Kontakt löschen?</DialogTitle>
          <DialogDescription className="break-words">Der Kontakt {contact.first_name} {contact.last_name} wird gelöscht. Zugehörige Deals bleiben erhalten. Diese Aktion kann nicht rückgängig gemacht werden.</DialogDescription>
        </DialogHeader>
        {error && <Alert variant="destructive"><AlertTitle>Kontakt nicht gelöscht</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        <DialogFooter>
          <DialogClose render={<Button ref={cancelButton} type="button" variant="outline" disabled={busy} />}>Abbrechen</DialogClose>
          <Button type="button" variant="destructive" disabled={busy} onClick={() => void remove()}>
            {busy && <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" />}
            {busy ? "Löscht…" : "Kontakt löschen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ContactsManager({ contacts, total }: { contacts: Contact[]; companies: Company[]; total: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openEntity, createEntity } = useEntityDrawer();
  const [deleteContact, setDeleteContact] = useState<Contact | null>(null);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [filtering, startTransition] = useTransition();
  const createButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  function finalFocus() {
    const target = opener.current;
    return target?.isConnected && target.getClientRects().length > 0 ? target : createButton.current;
  }

  function openContactRow(event: MouseEvent<HTMLElement>, id: string) {
    const target = event.target;
    const row = event.currentTarget;
    if (event.defaultPrevented || !(target instanceof Element) || !row.contains(target)) return;
    const control = target.closest("button, a, input, select, textarea, [role='button'], [role='link'], [role='menuitem'], [role='checkbox'], [role='switch'], [role='combobox'], [contenteditable='true']");
    if (control && row.contains(control)) return;
    openEntity("contact", id, row.querySelector<HTMLButtonElement>("[data-entity-opener]") ?? createButton.current ?? undefined);
  }

  function openCompany(contact: Contact, element: HTMLElement) {
    if (contact.company_id) openEntity("company", contact.company_id, element);
  }

  function applyFilters() {
    const query = new URLSearchParams();
    if (search.trim()) query.set("search", search.trim());
    if (status) query.set("status", status);
    startTransition(() => router.push(`/contacts${query.toString() ? `?${query.toString()}` : ""}`));
  }

  return (
    <section className="flex min-w-0 flex-col gap-5" aria-label="Kontaktverwaltung" aria-busy={filtering}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
        <form className="min-w-0 flex-1" onSubmit={(event) => { event.preventDefault(); applyFilters(); }}>
          <FieldGroup className="grid w-full grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
            <Field>
              <FieldLabel htmlFor="contacts-search">Kontakte suchen</FieldLabel>
              <Input id="contacts-search" type="search" placeholder="Name, E-Mail oder Firma" value={search} onChange={(event) => setSearch(event.target.value)} className="min-h-11 md:min-h-8" />
            </Field>
            <Field>
              <FieldLabel htmlFor="contacts-status-filter">Status</FieldLabel>
              <Select items={FILTER_STATUS_ITEMS} value={status} onValueChange={(value) => setStatus(value ?? "")}>
                <SelectTrigger id="contacts-status-filter" className="min-h-11 w-full min-w-0 md:min-h-8"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>{FILTER_STATUS_ITEMS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            </Field>
            <Button type="submit" variant="outline" disabled={filtering} className="min-h-11 md:min-h-8">
              {filtering && <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" />}
              {filtering ? "Lädt…" : "Filtern"}
            </Button>
          </FieldGroup>
        </form>
        <div className="flex flex-wrap items-center gap-2">
          <ImportDialog entity="contacts" />
          <Button ref={createButton} data-entity-drawer-focus-fallback type="button" className="min-h-11 md:min-h-8" onClick={(event) => createEntity("contact", undefined, event.currentTarget)}>
            <Plus data-icon="inline-start" aria-hidden="true" /> Kontakt anlegen
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">{contacts.length} von {total} Kontakten</p>

      {contacts.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><Users aria-hidden="true" /></EmptyMedia>
            <EmptyTitle>Keine Kontakte gefunden</EmptyTitle>
            <EmptyDescription>Passe die Filter an oder lege einen Kontakt an.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent><Button type="button" onClick={(event) => createEntity("contact", undefined, event.currentTarget)}><Plus data-icon="inline-start" aria-hidden="true" /> Kontakt anlegen</Button></EmptyContent>
        </Empty>
      ) : (
        <>
          <Card className="hidden min-w-0 md:flex">
            <CardHeader><CardTitle>Kontaktliste</CardTitle><CardDescription>Kontaktdaten, Firmenzuordnung und Status im Überblick.</CardDescription></CardHeader>
            <CardContent className="px-0">
              <Table aria-label="Kontakte">
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col" className="pl-4">Name</TableHead>
                    <TableHead scope="col" className="hidden lg:table-cell">E-Mail</TableHead>
                    <TableHead scope="col">Firma</TableHead>
                    <TableHead scope="col">Status</TableHead>
                    <TableHead scope="col" className="pr-4 text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.map((contact) => (
                    <TableRow key={contact.id} className="cursor-pointer" onClick={(event) => openContactRow(event, contact.id)}>
                      <TableCell className="max-w-64 whitespace-normal pl-4">
                        <Button data-entity-opener type="button" variant="link" className={entityButtonClassName} onClick={(event) => openEntity("contact", contact.id, event.currentTarget)}>{contact.first_name} {contact.last_name}</Button>
                        {contact.title && <p className="mt-1 break-words text-xs text-muted-foreground">{contact.title}</p>}
                      </TableCell>
                      <TableCell className="hidden max-w-64 whitespace-normal break-words lg:table-cell">{contact.email || "Nicht hinterlegt"}</TableCell>
                      <TableCell className="max-w-48 whitespace-normal break-words">
                        {contact.company_id ? <Button type="button" variant="link" className={entityButtonClassName} onClick={(event) => openCompany(contact, event.currentTarget)}>{contact.company_name || "Firma öffnen"}</Button> : contact.company_name || "Keine Firma"}
                      </TableCell>
                      <TableCell><Badge variant="secondary">{STATUS_LABELS[contact.status] ?? contact.status}</Badge></TableCell>
                      <TableCell className="pr-4">
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={(event) => openEntity("contact", contact.id, event.currentTarget)} aria-label={`${contact.first_name} ${contact.last_name} bearbeiten`}>Bearbeiten</Button>
                          <Button type="button" variant="destructive" size="sm" onClick={(event) => { opener.current = event.currentTarget; setDeleteContact(contact); }} aria-label={`${contact.first_name} ${contact.last_name} löschen`}>Löschen</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid min-w-0 grid-cols-1 gap-3 md:hidden">
            {contacts.map((contact) => (
              <Card key={contact.id} size="sm" className="min-w-0 cursor-pointer" onClick={(event) => openContactRow(event, contact.id)}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <CardTitle className="min-w-0 break-words"><Button data-entity-opener type="button" variant="link" className={entityButtonClassName} onClick={(event) => openEntity("contact", contact.id, event.currentTarget)}>{contact.first_name} {contact.last_name}</Button></CardTitle>
                    <Badge variant="secondary">{STATUS_LABELS[contact.status] ?? contact.status}</Badge>
                  </div>
                  {contact.title && <CardDescription className="break-words">{contact.title}</CardDescription>}
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-[4rem_minmax(0,1fr)] gap-x-3 gap-y-2">
                    <dt className="text-muted-foreground">Firma</dt><dd className="break-words">{contact.company_id ? <Button type="button" variant="link" className={entityButtonClassName} onClick={(event) => openCompany(contact, event.currentTarget)}>{contact.company_name || "Firma öffnen"}</Button> : contact.company_name || "Keine Firma"}</dd>
                    <dt className="text-muted-foreground">E-Mail</dt><dd className="break-words">{contact.email || "Nicht hinterlegt"}</dd>
                  </dl>
                </CardContent>
                <CardFooter className="flex-wrap gap-2">
                  <Button type="button" variant="outline" className="min-h-11" onClick={(event) => openEntity("contact", contact.id, event.currentTarget)} aria-label={`${contact.first_name} ${contact.last_name} bearbeiten`}>Bearbeiten</Button>
                  <Button type="button" variant="destructive" className="min-h-11" onClick={(event) => { opener.current = event.currentTarget; setDeleteContact(contact); }} aria-label={`${contact.first_name} ${contact.last_name} löschen`}>Löschen</Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </>
      )}

      {deleteContact && <DeleteContactDialog contact={deleteContact} finalFocus={finalFocus} onClose={() => setDeleteContact(null)} />}
    </section>
  );
}
