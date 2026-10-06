"use client";

import { Building2, Loader2, Plus } from "lucide-react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { Company } from "@/lib/types";

const entityButtonClassName = "h-auto max-w-full justify-start whitespace-normal p-0 text-left";

type DialogFinalFocus = ComponentProps<typeof DialogContent>["finalFocus"];

function DeleteCompanyDialog({ company, onClose, finalFocus }: { company: Company; onClose: () => void; finalFocus: DialogFinalFocus }) {
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
      await api(`/v1/companies/${encodeURIComponent(company.id)}`, { method: "DELETE" });
      toast.add({ title: "Firma gelöscht", type: "success" });
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
          <DialogTitle>Firma löschen?</DialogTitle>
          <DialogDescription className="break-words">Die Firma {company.name} wird gelöscht. Kontakte bleiben erhalten und werden keiner Firma mehr zugeordnet. Diese Aktion kann nicht rückgängig gemacht werden.</DialogDescription>
        </DialogHeader>
        {error && <Alert variant="destructive"><AlertTitle>Firma nicht gelöscht</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        <DialogFooter>
          <DialogClose render={<Button ref={cancelButton} type="button" variant="outline" disabled={busy} />}>Abbrechen</DialogClose>
          <Button type="button" variant="destructive" disabled={busy} onClick={() => void remove()}>
            {busy && <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" />}
            {busy ? "Löscht…" : "Firma löschen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CompaniesManager({ companies, total }: { companies: Company[]; total: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openEntity, createEntity } = useEntityDrawer();
  const [deleteCompany, setDeleteCompany] = useState<Company | null>(null);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [industry, setIndustry] = useState(searchParams.get("industry") ?? "");
  const [filtering, startTransition] = useTransition();
  const createButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  function finalFocus() {
    const target = opener.current;
    return target?.isConnected && target.getClientRects().length > 0 ? target : createButton.current;
  }

  function openCompanyRow(event: MouseEvent<HTMLElement>, id: string) {
    const target = event.target;
    const row = event.currentTarget;
    if (event.defaultPrevented || !(target instanceof Element) || !row.contains(target)) return;
    const control = target.closest("button, a, input, select, textarea, [role='button'], [role='link'], [role='menuitem'], [role='checkbox'], [role='switch'], [role='combobox'], [contenteditable='true']");
    if (control && row.contains(control)) return;
    openEntity("company", id, row.querySelector<HTMLButtonElement>("[data-entity-opener]") ?? createButton.current ?? undefined);
  }

  function applyFilters() {
    const query = new URLSearchParams();
    if (search.trim()) query.set("search", search.trim());
    if (industry.trim()) query.set("industry", industry.trim());
    startTransition(() => router.push(`/companies${query.toString() ? `?${query.toString()}` : ""}`));
  }

  return (
    <section className="flex min-w-0 flex-col gap-5" aria-label="Firmenverwaltung" aria-busy={filtering}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
        <form className="min-w-0 flex-1" onSubmit={(event) => { event.preventDefault(); applyFilters(); }}>
          <FieldGroup className="grid w-full grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto]">
            <Field>
              <FieldLabel htmlFor="companies-search">Firmen suchen</FieldLabel>
              <Input id="companies-search" type="search" placeholder="Name, Domain oder E-Mail" value={search} onChange={(event) => setSearch(event.target.value)} className="min-h-11 md:min-h-8" />
            </Field>
            <Field>
              <FieldLabel htmlFor="companies-industry-filter">Branche</FieldLabel>
              <Input id="companies-industry-filter" placeholder="Alle Branchen" value={industry} onChange={(event) => setIndustry(event.target.value)} className="min-h-11 md:min-h-8" />
            </Field>
            <Button type="submit" variant="outline" disabled={filtering} className="min-h-11 md:min-h-8">
              {filtering && <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" />}
              {filtering ? "Lädt…" : "Filtern"}
            </Button>
          </FieldGroup>
        </form>
        <div className="flex flex-wrap items-center gap-2">
          <ImportDialog entity="companies" />
          <Button ref={createButton} data-entity-drawer-focus-fallback type="button" className="min-h-11 md:min-h-8" onClick={(event) => createEntity("company", undefined, event.currentTarget)}><Plus data-icon="inline-start" aria-hidden="true" /> Firma anlegen</Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">{companies.length} von {total} Firmen</p>

      {companies.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><Building2 aria-hidden="true" /></EmptyMedia>
            <EmptyTitle>Keine Firmen gefunden</EmptyTitle>
            <EmptyDescription>Passe die Filter an oder lege eine Firma an.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent><Button type="button" onClick={(event) => createEntity("company", undefined, event.currentTarget)}><Plus data-icon="inline-start" aria-hidden="true" /> Firma anlegen</Button></EmptyContent>
        </Empty>
      ) : (
        <>
          <Card className="hidden min-w-0 md:flex">
            <CardHeader><CardTitle>Firmenliste</CardTitle><CardDescription>Firmen- und Kontaktdaten im Überblick.</CardDescription></CardHeader>
            <CardContent className="px-0">
              <Table aria-label="Firmen">
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col" className="pl-4">Name</TableHead>
                    <TableHead scope="col" className="hidden lg:table-cell">Domain</TableHead>
                    <TableHead scope="col">Branche</TableHead>
                    <TableHead scope="col" className="hidden lg:table-cell">Kontakte</TableHead>
                    <TableHead scope="col" className="pr-4 text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {companies.map((company) => (
                    <TableRow key={company.id} className="cursor-pointer" onClick={(event) => openCompanyRow(event, company.id)}>
                      <TableCell className="max-w-64 whitespace-normal pl-4">
                        <div className="flex flex-col items-start gap-1">
                          <Button data-entity-opener type="button" variant="link" className={entityButtonClassName} onClick={(event) => openEntity("company", company.id, event.currentTarget)}>{company.name}</Button>
                          {company.is_own_company === true && <Badge variant="outline" className="max-w-full whitespace-normal">Eigenes Unternehmen</Badge>}
                        </div>
                        {company.email && <p className="mt-1 break-words text-xs text-muted-foreground">{company.email}</p>}
                      </TableCell>
                      <TableCell className="hidden max-w-48 whitespace-normal break-words lg:table-cell">{company.domain || "Nicht hinterlegt"}</TableCell>
                      <TableCell className="max-w-48 whitespace-normal break-words">{company.industry || "Nicht hinterlegt"}</TableCell>
                      <TableCell className="hidden lg:table-cell"><Badge variant="secondary">{company.contact_count ?? "Unbekannt"}</Badge></TableCell>
                      <TableCell className="pr-4">
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={(event) => openEntity("company", company.id, event.currentTarget)} aria-label={`${company.name} bearbeiten`}>Bearbeiten</Button>
                          <Button type="button" variant="destructive" size="sm" onClick={(event) => { opener.current = event.currentTarget; setDeleteCompany(company); }} aria-label={`${company.name} löschen`}>Löschen</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid min-w-0 grid-cols-1 gap-3 md:hidden">
            {companies.map((company) => (
              <Card key={company.id} size="sm" className="min-w-0 cursor-pointer" onClick={(event) => openCompanyRow(event, company.id)}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <CardTitle className="min-w-0 break-words"><Button data-entity-opener type="button" variant="link" className={entityButtonClassName} onClick={(event) => openEntity("company", company.id, event.currentTarget)}>{company.name}</Button></CardTitle>
                    {company.contact_count != null && <Badge variant="secondary">{company.contact_count} Kontakte</Badge>}
                  </div>
                  {company.is_own_company === true && <Badge variant="outline" className="max-w-full whitespace-normal">Eigenes Unternehmen</Badge>}
                  <CardDescription className="break-words">{company.industry || "Keine Branche hinterlegt"}</CardDescription>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-[4rem_minmax(0,1fr)] gap-x-3 gap-y-2">
                    <dt className="text-muted-foreground">Domain</dt><dd className="break-words">{company.domain || "Nicht hinterlegt"}</dd>
                    <dt className="text-muted-foreground">E-Mail</dt><dd className="break-words">{company.email || "Nicht hinterlegt"}</dd>
                  </dl>
                </CardContent>
                <CardFooter className="flex-wrap gap-2">
                  <Button type="button" variant="outline" className="min-h-11" onClick={(event) => openEntity("company", company.id, event.currentTarget)} aria-label={`${company.name} bearbeiten`}>Bearbeiten</Button>
                  <Button type="button" variant="destructive" className="min-h-11" onClick={(event) => { opener.current = event.currentTarget; setDeleteCompany(company); }} aria-label={`${company.name} löschen`}>Löschen</Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </>
      )}

      {deleteCompany && <DeleteCompanyDialog company={deleteCompany} finalFocus={finalFocus} onClose={() => setDeleteCompany(null)} />}
    </section>
  );
}
