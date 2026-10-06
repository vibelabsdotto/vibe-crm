"use client";

import { Building2Icon, InfoIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { apiFetch, ApiError } from "@/lib/api";
import { fetchAllCrm } from "@/lib/crm-lists";
import type { Company } from "@/lib/types";

const FIELDS = ["name", "domain", "industry", "phone", "email", "notes"] as const;
type CompanyForm = Pick<Company, (typeof FIELDS)[number]>;
type WorkspaceCompany = { company_id: string | null; company: Company | null };
type Snapshot = { workspace: WorkspaceCompany; companies: Company[] };
type WriteAttempt =
  | { kind: "mapping"; id: string | null }
  | { kind: "company"; id: string; expected: CompanyForm };

function companyFromResponse(value: unknown): Company {
  if (!value || typeof value !== "object") throw new Error("Ungültige Firmenantwort.");
  const company = value as Company;
  if (typeof company.id !== "string" || !company.id ||
    FIELDS.some((field) => typeof company[field] !== "string") ||
    typeof company.updated_at !== "string") {
    throw new Error("Ungültige Firmenantwort.");
  }
  return company;
}

function workspaceFromResponse(value: unknown): WorkspaceCompany {
  if (!value || typeof value !== "object") throw new Error("Ungültige Zuordnungsantwort.");
  const result = value as WorkspaceCompany;
  if (result.company_id === null && result.company === null) return result;
  if (typeof result.company_id !== "string" || !result.company_id) {
    throw new Error("Ungültige Zuordnungsantwort.");
  }
  const company = companyFromResponse(result.company);
  if (company.id !== result.company_id) throw new Error("Die Firmen-ID stimmt nicht mit der Zuordnung überein.");
  return { company_id: result.company_id, company };
}

function formFromCompany(company: Company): CompanyForm {
  return {
    name: company.name, domain: company.domain, industry: company.industry,
    phone: company.phone, email: company.email, notes: company.notes,
  };
}

function sameFields(left: CompanyForm, right: CompanyForm): boolean {
  return FIELDS.every((field) => left[field] === right[field]);
}

async function readWorkspace(): Promise<WorkspaceCompany> {
  return workspaceFromResponse(await apiFetch<unknown>("/v1/workspace/company"));
}

async function readCompany(id: string): Promise<Company> {
  const response = await apiFetch<{ company: unknown }>(`/v1/companies/${encodeURIComponent(id)}`);
  const company = companyFromResponse(response.company);
  if (company.id !== id) throw new Error("Die geladene Firmen-ID stimmt nicht überein.");
  return company;
}

async function readSnapshot(): Promise<Snapshot> {
  const [workspace, records] = await Promise.all([
    readWorkspace(), fetchAllCrm<Company>("/v1/companies?sort=id&order=asc", "companies"),
  ]);
  const companies = records.map(companyFromResponse);
  if (new Set(companies.map((company) => company.id)).size !== companies.length) {
    throw new Error("Die Firmenliste ist nicht vollständig eindeutig. Bitte neu laden.");
  }
  // A selected record can be newer than the list snapshot. Keep its exact ID visible.
  if (workspace.company) {
    const selected = workspace.company;
    const index = companies.findIndex((company) => company.id === selected.id);
    if (index === -1) companies.push(selected);
    else companies[index] = selected;
  }
  return { workspace, companies: companies.sort((a, b) => a.name.localeCompare(b.name, "de") || a.id.localeCompare(b.id)) };
}

async function verifyWrite(attempt: WriteAttempt): Promise<WorkspaceCompany> {
  const [workspace, company] = await Promise.all([
    readWorkspace(), attempt.id === null ? Promise.resolve(null) : readCompany(attempt.id),
  ]);
  if (workspace.company_id !== attempt.id) {
    throw new Error("Die gespeicherte Zuordnung weicht von der Auswahl ab. Bitte den aktuellen Stand neu laden.");
  }
  if (attempt.kind === "company" && (!company || !sameFields(company, attempt.expected))) {
    throw new Error("Die gespeicherten Stammdaten weichen von den gesendeten Werten ab. Bitte den aktuellen Stand prüfen.");
  }
  return { company_id: workspace.company_id, company };
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) return "Deine Sitzung oder Berechtigung ist nicht mehr gültig. Bitte erneut anmelden.";
    if (error.status === 404) return "Die Firma ist nicht mehr verfügbar. Bitte den aktuellen Stand neu laden.";
    if (error.status === 400 || error.status === 422) return "Die Angaben wurden nicht akzeptiert. Bitte die Eingaben prüfen.";
    return "Die API-Anfrage ist fehlgeschlagen. Bitte den gespeicherten Stand prüfen.";
  }
  return error instanceof Error && !(error instanceof TypeError)
    ? error.message : "Die API ist nicht erreichbar. Bitte erneut versuchen.";
}

export function CompanySettings() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState<CompanyForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"load" | "mapping" | "company" | "verify" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invalidName, setInvalidName] = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  const [unverified, setUnverified] = useState<WriteAttempt | null>(null);
  const pending = useRef(false);
  const mounted = useRef(false);
  const mappingButton = useRef<HTMLButtonElement>(null);
  const cancelMapping = useRef<HTMLButtonElement>(null);

  const savedCompany = snapshot?.workspace.company ?? null;
  const mappingDirty = snapshot !== null && selectedId !== (snapshot.workspace.company_id ?? "");
  const formDirty = savedCompany !== null && form !== null && !sameFields(savedCompany, form);
  const dirty = mappingDirty || formDirty;
  const locked = busy !== null || unverified !== null;

  function applyWorkspace(workspace: WorkspaceCompany) {
    setSnapshot((current) => {
      if (!current) return current;
      const company = workspace.company;
      const companies = company
        ? [...current.companies.filter((item) => item.id !== company.id), company]
          .sort((a, b) => a.name.localeCompare(b.name, "de") || a.id.localeCompare(b.id))
        : current.companies;
      return { workspace, companies };
    });
    setSelectedId(workspace.company_id ?? "");
    setForm(workspace.company ? formFromCompany(workspace.company) : null);
    setInvalidName(false);
    setUnverified(null);
    setError(null);
    setConfirmation(false);
  }

  useEffect(() => {
    mounted.current = true;
    let active = true;
    readSnapshot().then((result) => {
      if (!active) return;
      setSnapshot(result);
      setSelectedId(result.workspace.company_id ?? "");
      setForm(result.workspace.company ? formFromCompany(result.workspace.company) : null);
    }).catch((cause: unknown) => {
      if (active) setError(errorMessage(cause));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; mounted.current = false; };
  }, []);

  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (dirty || pending.current || unverified) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    function mayLeave(): boolean {
      if (pending.current) {
        setError("Die Anfrage läuft noch. Bitte die Bestätigung abwarten, bevor du die Seite verlässt.");
        return false;
      }
      return !(dirty || unverified) || window.confirm(unverified
        ? "Das Speichern ist noch nicht bestätigt. Seite trotzdem verlassen?"
        : "Nicht gespeicherte Änderungen verwerfen und die Seite verlassen?");
    }
    function click(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;
      const target = new URL(anchor.href, window.location.href);
      if (target.origin === window.location.origin && target.pathname === window.location.pathname && target.search === window.location.search) return;
      if (!mayLeave()) { event.preventDefault(); event.stopPropagation(); }
    }
    // Protect same-document Back/Forward where the browser supports cancellable navigation.
    function traverse(event: Event) {
      const navigationEvent = event as Event & { navigationType: string; destination: { url: string; sameDocument: boolean } };
      if (navigationEvent.navigationType !== "traverse" || !navigationEvent.destination.sameDocument || !event.cancelable) return;
      const target = new URL(navigationEvent.destination.url);
      if (target.pathname === window.location.pathname && target.search === window.location.search) return;
      if (!mayLeave()) event.preventDefault();
    }
    const navigation = (window as Window & { navigation?: EventTarget }).navigation;
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", click, true);
    navigation?.addEventListener("navigate", traverse);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", click, true);
      navigation?.removeEventListener("navigate", traverse);
    };
  }, [dirty, unverified]);

  async function reload() {
    if (pending.current || ((dirty || unverified) && !window.confirm("Aktuellen gespeicherten Stand laden? Lokale Änderungen werden verworfen."))) return;
    pending.current = true;
    setBusy("load");
    setError(null);
    try {
      const result = await readSnapshot();
      if (!mounted.current) return;
      setSnapshot(result);
      setSelectedId(result.workspace.company_id ?? "");
      setForm(result.workspace.company ? formFromCompany(result.workspace.company) : null);
      setUnverified(null);
      setInvalidName(false);
      setConfirmation(false);
      setError(null);
    } catch (cause) {
      if (mounted.current) setError(errorMessage(cause));
    } finally {
      pending.current = false;
      if (mounted.current) { setLoading(false); setBusy(null); }
    }
  }

  async function saveMapping() {
    if (!snapshot || pending.current || unverified || formDirty || !mappingDirty) return;
    const attempt: WriteAttempt = { kind: "mapping", id: selectedId || null };
    pending.current = true;
    setBusy("mapping");
    setError(null);
    let sent = false;
    let rejected = false;
    try {
      const current = await readWorkspace();
      if (current.company_id !== snapshot.workspace.company_id) {
        throw new Error("Die Zuordnung wurde zwischenzeitlich geändert. Bitte neu laden und die Firma erneut auswählen.");
      }
      if (attempt.id !== null) await readCompany(attempt.id);
      if (!mounted.current) return;
      sent = true;
      let result: unknown;
      try {
        result = await apiFetch<unknown>("/v1/workspace/company", { method: "PUT", body: { company_id: attempt.id } });
      } catch (cause) {
        rejected = cause instanceof ApiError && cause.status >= 400 && cause.status < 500;
        throw cause;
      }
      if (workspaceFromResponse(result).company_id !== attempt.id) throw new Error("Die Schreibantwort bestätigt nicht die gewählte Firmen-ID.");
      const verified = await verifyWrite(attempt);
      if (!mounted.current) return;
      applyWorkspace(verified);
      toast.add({ title: attempt.id === null ? "Zuordnung entfernt" : "Eigenes Unternehmen zugeordnet", type: "success" });
    } catch (cause) {
      if (mounted.current) {
        setError(errorMessage(cause));
        if (sent && !rejected) { setUnverified(attempt); setConfirmation(false); }
      }
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(null);
    }
  }

  async function saveCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!savedCompany || !form || pending.current || unverified || mappingDirty || !formDirty) return;
    if (!form.name.trim()) { setInvalidName(true); return; }
    const body: Partial<CompanyForm> = {};
    const expected = formFromCompany(savedCompany);
    for (const field of FIELDS) {
      if (form[field] !== savedCompany[field]) {
        body[field] = form[field];
        // CompaniesService trims written fields; untouched fields stay exactly as stored.
        expected[field] = form[field].trim();
      }
    }
    const attempt: WriteAttempt = { kind: "company", id: savedCompany.id, expected };
    pending.current = true;
    setBusy("company");
    setError(null);
    setInvalidName(false);
    let sent = false;
    let rejected = false;
    try {
      const [workspace, current] = await Promise.all([readWorkspace(), readCompany(savedCompany.id)]);
      if (workspace.company_id !== savedCompany.id) throw new Error("Die Zuordnung wurde zwischenzeitlich geändert. Bitte neu laden.");
      if (current.updated_at !== savedCompany.updated_at || !sameFields(current, savedCompany)) {
        throw new Error("Die Firma wurde zwischenzeitlich geändert. Deine Eingaben bleiben erhalten. Bitte den aktuellen Stand neu laden, bevor du speicherst.");
      }
      if (!mounted.current) return;
      sent = true;
      let response: { company: unknown };
      try {
        response = await apiFetch<{ company: unknown }>(`/v1/companies/${encodeURIComponent(attempt.id)}`, { method: "PUT", body });
      } catch (cause) {
        rejected = cause instanceof ApiError && cause.status >= 400 && cause.status < 500;
        throw cause;
      }
      const result = companyFromResponse(response.company);
      if (result.id !== attempt.id || !sameFields(result, attempt.expected)) throw new Error("Die Schreibantwort bestätigt nicht die gesendeten Stammdaten.");
      const verified = await verifyWrite(attempt);
      if (!mounted.current) return;
      applyWorkspace(verified);
      toast.add({ title: "Stammdaten gespeichert", type: "success" });
    } catch (cause) {
      if (mounted.current) {
        setError(errorMessage(cause));
        if (sent && !rejected) setUnverified(attempt);
      }
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(null);
    }
  }

  async function verifyPending() {
    if (!unverified || pending.current) return;
    const attempt = unverified;
    pending.current = true;
    setBusy("verify");
    setError(null);
    try {
      const verified = await verifyWrite(attempt);
      if (!mounted.current) return;
      applyWorkspace(verified);
      toast.add({ title: attempt.kind === "company" ? "Stammdaten bestätigt" : "Zuordnung bestätigt", type: "success" });
    } catch (cause) {
      if (mounted.current) setError(errorMessage(cause));
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(null);
    }
  }

  function setField(field: keyof CompanyForm, value: string) {
    setForm((current) => current ? { ...current, [field]: value } : current);
    if (field === "name") setInvalidName(false);
  }

  const selectedCompany = snapshot?.companies.find((company) => company.id === selectedId) ?? null;
  const items = [
    { value: "", label: "Kein eigenes Unternehmen zugeordnet" },
    ...(snapshot?.companies ?? []).map((company) => ({ value: company.id, label: `${company.name}${company.domain ? ` · ${company.domain}` : ""} · ${company.id}` })),
  ];

  if (loading) return (
    <div className="flex flex-col gap-4" role="status" aria-label="Unternehmen und Firmenliste werden geladen">
      <Skeleton className="h-40 w-full" /><Skeleton className="h-80 w-full" />
      <span className="sr-only">Unternehmen und vollständige Firmenliste werden geladen.</span>
    </div>
  );

  return (
    <div className="flex min-w-0 flex-col gap-6" aria-busy={busy !== null}>
      <Alert role="note">
        <InfoIcon aria-hidden="true" />
        <AlertTitle>Ein vorhandener Firmendatensatz</AlertTitle>
        <AlertDescription>
          Hier entsteht keine neue Firma. Stammdaten werden am selben Datensatz gespeichert.
          Kontakte, Deals und Abos bleiben unverändert mit ihrer Firmen-ID verknüpft.
        </AlertDescription>
      </Alert>
      {error && <Alert variant="destructive"><AlertTitle>{snapshot ? "Änderung nicht bestätigt" : "Unternehmen konnte nicht geladen werden"}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      {unverified && (
        <Alert>
          <AlertTitle>Gespeicherten Stand prüfen</AlertTitle>
          <AlertDescription>
            Das Schreibergebnis ist noch nicht bestätigt. Weitere Änderungen sind gesperrt.
            Die Prüfung liest nur die Zuordnung und die genaue Firmen-ID zurück.
            <Button type="button" variant="outline" className="mt-2 w-fit" disabled={busy !== null} onClick={verifyPending}>
              {busy === "verify" && <Spinner data-icon="inline-start" />}Gespeicherten Stand prüfen
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" role="status">
          {busy ? "Anfrage läuft…" : dirty ? "Nicht gespeicherte Änderungen" : snapshot ? "Gespeicherter Stand" : "Daten nicht geladen"}
        </p>
        <Button type="button" variant="outline" disabled={busy !== null} onClick={reload}>
          {busy === "load" ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}
          Neu laden
        </Button>
      </div>
      {snapshot && (
        <>
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle><h2>Eigenes Unternehmen</h2></CardTitle>
              <CardDescription>
                Wähle ausdrücklich eine vorhandene Firma. Gleichnamige Firmen werden anhand ihrer ID unterschieden.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field data-disabled={locked || formDirty}>
                  <FieldLabel htmlFor="own-company-selection">Bestehende Firma</FieldLabel>
                  <Select
                    items={items} value={selectedId} disabled={locked || formDirty}
                    onValueChange={(value) => { if (value !== null) { setSelectedId(value); setError(null); } }}
                  >
                    <SelectTrigger id="own-company-selection" className="w-full min-w-0" aria-describedby="own-company-selection-hint">
                      <SelectValue className="min-w-0 truncate" />
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectGroup>
                        {items.map((item) => <SelectItem key={item.value} value={item.value}><span className="min-w-0 whitespace-normal break-all">{item.label}</span></SelectItem>)}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldDescription id="own-company-selection-hint">
                    {formDirty ? "Speichere oder verwirf zuerst die Änderungen an den Stammdaten." : `${snapshot.companies.length} vorhandene Firmen geladen. Die Auswahl wird erst nach Bestätigung gespeichert.`}
                  </FieldDescription>
                </Field>
                <p className="break-all text-sm text-muted-foreground">
                  Gespeicherte Zuordnung: {savedCompany ? `${savedCompany.name} · ${savedCompany.id}` : "Keine"}
                </p>
              </FieldGroup>
            </CardContent>
            <CardFooter className="flex-wrap gap-2">
              <Button ref={mappingButton} type="button" disabled={locked || formDirty || !mappingDirty} onClick={() => { setError(null); setConfirmation(true); }}>
                Zuordnung speichern
              </Button>
              {mappingDirty && <Button type="button" variant="outline" disabled={locked} onClick={() => { setSelectedId(snapshot.workspace.company_id ?? ""); setError(null); }}>Auswahl verwerfen</Button>}
            </CardFooter>
          </Card>
          {savedCompany && form ? (
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle><h2>Stammdaten</h2></CardTitle>
                <CardDescription className="break-all">{savedCompany.name} · Firmen-ID {savedCompany.id}</CardDescription>
              </CardHeader>
              <form onSubmit={saveCompany} noValidate className="flex min-w-0 flex-col gap-6">
                <CardContent>
                  <FieldGroup>
                    <Field data-disabled={locked || mappingDirty} data-invalid={invalidName}>
                      <FieldLabel htmlFor="own-company-name">Name</FieldLabel>
                      <Input id="own-company-name" value={form.name} disabled={locked || mappingDirty} required aria-invalid={invalidName} aria-describedby={invalidName ? "own-company-name-error" : undefined} onChange={(event) => setField("name", event.target.value)} />
                      {invalidName && <FieldError id="own-company-name-error">Bitte einen Namen eingeben.</FieldError>}
                    </Field>
                    <FieldGroup className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                      {([
                        ["domain", "Domain", "text"], ["industry", "Branche", "text"],
                        ["phone", "Telefon", "tel"], ["email", "E-Mail", "text"],
                      ] as const).map(([field, label, type]) => (
                        <Field key={field} data-disabled={locked || mappingDirty}>
                          <FieldLabel htmlFor={`own-company-${field}`}>{label}</FieldLabel>
                          <Input id={`own-company-${field}`} type={type} inputMode={field === "email" ? "email" : undefined} value={form[field]} disabled={locked || mappingDirty} onChange={(event) => setField(field, event.target.value)} />
                        </Field>
                      ))}
                    </FieldGroup>
                    <Field data-disabled={locked || mappingDirty}>
                      <FieldLabel htmlFor="own-company-notes">Notizen</FieldLabel>
                      <Textarea id="own-company-notes" rows={4} value={form.notes} disabled={locked || mappingDirty} onChange={(event) => setField("notes", event.target.value)} />
                    </Field>
                    {mappingDirty && <FieldDescription>Bestätige oder verwirf zuerst die neue Firmenzuordnung. Diese Stammdaten gehören weiterhin zur gespeicherten Firma.</FieldDescription>}
                  </FieldGroup>
                </CardContent>
                <CardFooter className="flex-wrap gap-2">
                  <Button type="submit" disabled={locked || mappingDirty || !formDirty}>
                    {busy === "company" && <Spinner data-icon="inline-start" />}
                    {busy === "company" ? "Speichert…" : "Stammdaten speichern"}
                  </Button>
                  {formDirty && <Button type="button" variant="outline" disabled={locked} onClick={() => {
                    if (window.confirm("Nicht gespeicherte Stammdaten verwerfen?")) { setForm(formFromCompany(savedCompany)); setInvalidName(false); setError(null); }
                  }}>Änderungen verwerfen</Button>}
                </CardFooter>
              </form>
            </Card>
          ) : (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon"><Building2Icon /></EmptyMedia>
                <EmptyTitle>Keine Stammdaten zugeordnet</EmptyTitle>
                <EmptyDescription>Wähle oben eine bestehende Firma und bestätige die Zuordnung. Es wird keine Firma automatisch anhand ihres Namens ausgewählt.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </>
      )}
      <AlertDialog open={confirmation} onOpenChange={(open, details) => {
        if (!open && pending.current) details.cancel();
        else setConfirmation(open);
      }}>
        <AlertDialogContent initialFocus={cancelMapping} finalFocus={mappingButton} className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Eigenes Unternehmen ändern?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedCompany ? `Die vorhandene Firma "${selectedCompany.name}" wird als eigenes Unternehmen zugeordnet.` : "Die Zuordnung zum eigenen Unternehmen wird entfernt. Die Firma selbst bleibt bestehen."}
              {" "}Kontakte, Deals und Abos werden nicht umgehängt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <dl className="flex min-w-0 flex-col gap-2 text-sm">
            <div><dt className="text-muted-foreground">Bisher</dt><dd className="break-all">{savedCompany ? `${savedCompany.name} · ${savedCompany.id}` : "Keine Zuordnung"}</dd></div>
            <div><dt className="text-muted-foreground">Neu</dt><dd className="break-all">{selectedCompany ? `${selectedCompany.name} · ${selectedCompany.id}` : "Keine Zuordnung"}</dd></div>
          </dl>
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <AlertDialogFooter>
            <AlertDialogCancel ref={cancelMapping} disabled={busy !== null}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction type="button" disabled={busy !== null} onClick={saveMapping}>
              {busy === "mapping" && <Spinner data-icon="inline-start" />}
              {busy === "mapping" ? "Speichert…" : "Zuordnung bestätigen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
