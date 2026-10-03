"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/lib/api";
import { useApi } from "@/lib/use-api";

export type ImportResult = {
  imported?: number;
  skipped?: number;
  companiesCreated?: number;
  duplicates?: number;
};

const CONTACT_ALIASES: Record<string, string> = {
  firstname: "first_name",
  first: "first_name",
  vorname: "first_name",
  lastname: "last_name",
  last: "last_name",
  nachname: "last_name",
  name: "first_name",
  companyname: "company",
  company_name: "company",
  firma: "company",
  unternehmen: "company",
  companydomain: "company_domain",
  titled: "title",
  position: "title",
  stage: "status",
};

const COMPANY_ALIASES: Record<string, string> = {
  firma: "name",
  unternehmen: "name",
  firmenname: "name",
  branche: "industry",
  telefon: "phone",
  notizen: "notes",
  web: "domain",
  website: "domain",
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s\-]+/g, "_");
}

function mapRow(
  raw: Record<string, unknown>,
  known: Set<string>,
  aliases: Record<string, string>,
): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  const custom: Record<string, unknown> = {};
  for (const [rawKey, value] of Object.entries(raw)) {
    if (value === "" || value === null || value === undefined) continue;
    let key = normalizeHeader(rawKey);
    if (aliases[key]) key = aliases[key];
    if (known.has(key)) flat[key] = value;
    else custom[normalizeHeader(rawKey)] = value;
  }
  if (Object.keys(custom).length > 0) flat.custom = { ...(flat.custom as object | undefined), ...custom };
  return flat;
}

function parseWorkbook(
  buf: ArrayBuffer,
  known: Set<string>,
  aliases: Record<string, string>,
): { rows: Record<string, unknown>[]; headers: string[] } {
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { rows: [], headers: [] };
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  if (matrix.length < 2) return { rows: [], headers: [] };
  const headers = (matrix[0] as unknown[]).map((h) => String(h ?? ""));
  const rows = matrix.slice(1).map((line) => {
    const raw: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      if (h.trim() !== "") raw[h] = (line as unknown[])[i] ?? "";
    });
    return mapRow(raw, known, aliases);
  });
  return { rows, headers };
}

const KNOWN_CONTACT = new Set([
  "first_name",
  "last_name",
  "email",
  "phone",
  "title",
  "status",
  "company_id",
  "company",
  "company_domain",
  "company_industry",
  "company_phone",
]);

const KNOWN_COMPANY = new Set(["name", "domain", "industry", "phone", "email", "notes"]);

/**
 * Import-Dialog (Contract §4/§5): xlsx/CSV clientseitig parsen → POST auf die Import-Endpoints.
 */
export function ImportDialog({
  entity,
  buttonLabel = "Import",
}: {
  entity: "contacts" | "companies";
  buttonLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [fileName, setFileName] = useState("");
  const [inferCompany, setInferCompany] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const selectionVersion = useRef(0);
  const id = useId();
  const api = useApi();
  const router = useRouter();

  const known = entity === "contacts" ? KNOWN_CONTACT : KNOWN_COMPANY;
  const aliases = entity === "contacts" ? CONTACT_ALIASES : COMPANY_ALIASES;
  const requiredKey = entity === "contacts" ? "first_name" : "name";

  async function onFile(file: File | null) {
    const version = ++selectionVersion.current;
    setError(null);
    setResult(null);
    setRows([]);
    setFileName("");
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      setError("Bitte eine .xlsx-, .xls- oder .csv-Datei auswählen.");
      return;
    }
    setReading(true);
    try {
      const buf = await file.arrayBuffer();
      if (selectionVersion.current !== version) return;
      const parsed = parseWorkbook(buf, known, aliases);
      if (parsed.rows.length === 0) {
        setError("Keine Datenzeilen gefunden. Die erste Zeile muss Spaltennamen enthalten.");
        return;
      }
      setFileName(file.name);
      setRows(parsed.rows);
    } catch {
      if (selectionVersion.current === version) setError("Datei konnte nicht gelesen werden. Erwartet wird .xlsx, .xls oder .csv.");
    } finally {
      if (selectionVersion.current === version) setReading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || reading || result || rows.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const body =
        entity === "contacts"
          ? { contacts: rows, inferCompanyFromEmail: inferCompany }
          : { companies: rows };
      const res = await api<ImportResult>(`/v1/${entity}/import`, { method: "POST", body });
      setResult(res);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? `Import fehlgeschlagen: ${e.code}` : "Import fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  function close() {
    if (busy || reading) return;
    selectionVersion.current += 1;
    setOpen(false);
    setRows([]);
    setFileName("");
    setError(null);
    setResult(null);
  }

  const validCount = rows.filter((r) => String(r[requiredKey] ?? "").trim() !== "").length;

  return (
    <Dialog open={open} onOpenChange={(nextOpen, details) => {
      if (busy || reading) {
        details.cancel();
        return;
      }
      if (nextOpen) setOpen(true);
      else close();
    }} disablePointerDismissal={busy || reading}>
      <DialogTrigger render={<Button variant="outline" type="button" />}>
        <Upload data-icon="inline-start" />{buttonLabel}
      </DialogTrigger>
      <DialogContent showCloseButton={!busy && !reading} className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{entity === "contacts" ? "Kontakte importieren" : "Firmen importieren"}</DialogTitle>
          <DialogDescription>Eine Excel- oder CSV-Datei auswählen. Die erste Zeile enthält die Spaltennamen, danach folgen die Datensätze.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex min-w-0 flex-col gap-4" aria-busy={busy || reading}>
          <FieldGroup>
            <Field data-disabled={busy || reading || !!result}>
              <FieldLabel htmlFor={`${id}-file`}>Import-Datei</FieldLabel>
              <Input id={`${id}-file`} type="file" accept=".xlsx,.xls,.csv" disabled={busy || reading || !!result} onChange={(e) => void onFile(e.target.files?.[0] ?? null)} aria-describedby={`${id}-file-description`} />
              <FieldDescription id={`${id}-file-description`}>Unterstützt werden .xlsx, .xls und .csv. Zusätzliche Spalten werden als Custom Fields übernommen.</FieldDescription>
            </Field>
            {entity === "contacts" && (
              <Field orientation="horizontal" data-disabled={busy || !!result}>
                <Checkbox id={`${id}-infer-company`} checked={inferCompany} onCheckedChange={setInferCompany} disabled={busy || !!result} />
                <FieldLabel htmlFor={`${id}-infer-company`}>Firma aus E-Mail-Domain ableiten</FieldLabel>
              </Field>
            )}
            {reading && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner />Datei wird gelesen…</p>}
            {fileName && <p className="break-words text-sm text-muted-foreground">{fileName}: {rows.length} Zeilen, davon {validCount} mit <code className="font-mono">{requiredKey}</code>.</p>}
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            {result && (
              <Alert role="status">
                <AlertTitle>Import abgeschlossen</AlertTitle>
                <AlertDescription>
                  Importiert: {result.imported ?? 0} · Übersprungen: {result.skipped ?? 0}
                  {result.companiesCreated != null && <> · Firmen angelegt: {result.companiesCreated}</>}
                  {result.duplicates != null && <> · Duplikate: {result.duplicates}</>}
                </AlertDescription>
              </Alert>
            )}
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={busy || reading}>{result ? "Schließen" : "Abbrechen"}</Button>
            {!result && <Button type="submit" disabled={busy || reading || rows.length === 0}>
              {busy && <Spinner data-icon="inline-start" />}
              {busy ? "Importiert…" : `${validCount} importieren`}
            </Button>}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
