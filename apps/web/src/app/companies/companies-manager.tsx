"use client";

import { Building2, Loader2, Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useTransition, type ComponentProps } from "react";
import { ImportDialog } from "@/components/import-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { Company } from "@/lib/types";

type CompanyFormState = {
  name: string;
  domain: string;
  industry: string;
  phone: string;
  email: string;
  notes: string;
};

type DialogFinalFocus = ComponentProps<typeof DialogContent>["finalFocus"];

function emptyForm(): CompanyFormState {
  return { name: "", domain: "", industry: "", phone: "", email: "", notes: "" };
}

function CompanyDialog({ company, onClose, finalFocus }: { company: Company | null; onClose: () => void; finalFocus: DialogFinalFocus }) {
  const api = useApi();
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [form, setForm] = useState<CompanyFormState>(() =>
    company
      ? {
          name: company.name,
          domain: company.domain,
          industry: company.industry,
          phone: company.phone,
          email: company.email,
          notes: company.notes,
        }
      : emptyForm(),
  );
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);

  function set<K extends keyof CompanyFormState>(key: K, value: CompanyFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    if (key === "name") setNameError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    if (!form.name.trim()) {
      setNameError("Bitte gib einen Firmennamen ein.");
      return;
    }
    pending.current = true;
    setBusy(true);
    setError(null);
    setNameError(null);
    try {
      const body = {
        name: form.name.trim(),
        domain: form.domain.trim(),
        industry: form.industry.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        notes: form.notes.trim(),
      };
      if (company) await api(`/v1/companies/${encodeURIComponent(company.id)}`, { method: "PUT", body });
      else await api("/v1/companies", { method: "POST", body });
      toast.add({ title: company ? "Firma gespeichert" : "Firma angelegt", type: "success" });
      router.refresh();
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? `Speichern fehlgeschlagen: ${err.code}` : "Speichern fehlgeschlagen. Bitte versuche es erneut.");
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} disablePointerDismissal={busy} onOpenChange={(nextOpen, details) => {
      if (pending.current) { details.cancel(); return; }
      setOpen(nextOpen);
    }} onOpenChangeComplete={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent showCloseButton={false} finalFocus={finalFocus} className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <DialogTitle>{company ? "Firma bearbeiten" : "Firma anlegen"}</DialogTitle>
          <DialogDescription>Pflege Firmen- und Kontaktdaten. Der Firmenname ist ein Pflichtfeld.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} aria-busy={busy} className="flex min-h-0 flex-1 flex-col gap-4">
          <FieldGroup className="grid min-h-0 grid-cols-1 gap-4 overflow-y-auto p-1 sm:grid-cols-2">
            <Field data-disabled={busy} data-invalid={Boolean(nameError)}>
              <FieldLabel htmlFor="company-name">Name *</FieldLabel>
              <Input id="company-name" name="name" autoComplete="organization" value={form.name} onChange={(event) => set("name", event.target.value)} required disabled={busy} aria-invalid={Boolean(nameError)} aria-describedby={nameError ? "company-name-error" : undefined} />
              {nameError && <FieldError id="company-name-error">{nameError}</FieldError>}
            </Field>
            <Field data-disabled={busy}>
              <FieldLabel htmlFor="company-domain">Domain</FieldLabel>
              <Input id="company-domain" name="domain" placeholder="example.com" value={form.domain} onChange={(event) => set("domain", event.target.value)} disabled={busy} />
            </Field>
            <Field data-disabled={busy}>
              <FieldLabel htmlFor="company-industry">Branche</FieldLabel>
              <Input id="company-industry" name="industry" value={form.industry} onChange={(event) => set("industry", event.target.value)} disabled={busy} />
            </Field>
            <Field data-disabled={busy}>
              <FieldLabel htmlFor="company-phone">Telefon</FieldLabel>
              <Input id="company-phone" name="phone" type="tel" autoComplete="tel" value={form.phone} onChange={(event) => set("phone", event.target.value)} disabled={busy} />
            </Field>
            <Field data-disabled={busy}>
              <FieldLabel htmlFor="company-email">E-Mail</FieldLabel>
              <Input id="company-email" name="email" type="email" autoComplete="email" value={form.email} onChange={(event) => set("email", event.target.value)} disabled={busy} />
            </Field>
            <Field data-disabled={busy} className="sm:col-span-2">
              <FieldLabel htmlFor="company-notes">Notizen</FieldLabel>
              <Textarea id="company-notes" name="notes" rows={4} value={form.notes} onChange={(event) => set("notes", event.target.value)} disabled={busy} />
            </Field>
            {error && <Alert variant="destructive" className="sm:col-span-2"><AlertTitle>Firma nicht gespeichert</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
          </FieldGroup>
          <DialogFooter className="shrink-0">
            <DialogClose render={<Button type="button" variant="outline" disabled={busy} />}>Abbrechen</DialogClose>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" />}
              {busy ? "Speichert…" : "Speichern"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

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
  const [dialog, setDialog] = useState<{ open: boolean; company: Company | null }>({ open: false, company: null });
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
          <Button ref={createButton} type="button" className="min-h-11 md:min-h-8" onClick={(event) => { opener.current = event.currentTarget; setDialog({ open: true, company: null }); }}><Plus data-icon="inline-start" aria-hidden="true" /> Firma anlegen</Button>
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
          <EmptyContent><Button type="button" onClick={(event) => { opener.current = event.currentTarget; setDialog({ open: true, company: null }); }}><Plus data-icon="inline-start" aria-hidden="true" /> Firma anlegen</Button></EmptyContent>
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
                    <TableRow key={company.id}>
                      <TableCell className="max-w-64 whitespace-normal pl-4">
                        <p className="break-words font-medium">{company.name}</p>
                        {company.email && <p className="mt-1 break-words text-xs text-muted-foreground">{company.email}</p>}
                      </TableCell>
                      <TableCell className="hidden max-w-48 whitespace-normal break-words lg:table-cell">{company.domain || "Nicht hinterlegt"}</TableCell>
                      <TableCell className="max-w-48 whitespace-normal break-words">{company.industry || "Nicht hinterlegt"}</TableCell>
                      <TableCell className="hidden lg:table-cell"><Badge variant="secondary">{company.contact_count ?? "Unbekannt"}</Badge></TableCell>
                      <TableCell className="pr-4">
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={(event) => { opener.current = event.currentTarget; setDialog({ open: true, company }); }} aria-label={`${company.name} bearbeiten`}>Bearbeiten</Button>
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
              <Card key={company.id} size="sm" className="min-w-0">
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <CardTitle className="min-w-0 break-words">{company.name}</CardTitle>
                    {company.contact_count != null && <Badge variant="secondary">{company.contact_count} Kontakte</Badge>}
                  </div>
                  <CardDescription className="break-words">{company.industry || "Keine Branche hinterlegt"}</CardDescription>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-[4rem_minmax(0,1fr)] gap-x-3 gap-y-2">
                    <dt className="text-muted-foreground">Domain</dt><dd className="break-words">{company.domain || "Nicht hinterlegt"}</dd>
                    <dt className="text-muted-foreground">E-Mail</dt><dd className="break-words">{company.email || "Nicht hinterlegt"}</dd>
                  </dl>
                </CardContent>
                <CardFooter className="flex-wrap gap-2">
                  <Button type="button" variant="outline" className="min-h-11" onClick={(event) => { opener.current = event.currentTarget; setDialog({ open: true, company }); }} aria-label={`${company.name} bearbeiten`}>Bearbeiten</Button>
                  <Button type="button" variant="destructive" className="min-h-11" onClick={(event) => { opener.current = event.currentTarget; setDeleteCompany(company); }} aria-label={`${company.name} löschen`}>Löschen</Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </>
      )}

      {dialog.open && <CompanyDialog company={dialog.company} finalFocus={finalFocus} onClose={() => setDialog({ open: false, company: null })} />}
      {deleteCompany && <DeleteCompanyDialog company={deleteCompany} finalFocus={finalFocus} onClose={() => setDeleteCompany(null)} />}
    </section>
  );
}
