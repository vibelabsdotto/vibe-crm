"use client";

import { Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import * as XLSX from "xlsx";
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
  const fileRef = useRef<HTMLInputElement>(null);
  const api = useApi();
  const router = useRouter();

  const known = entity === "contacts" ? KNOWN_CONTACT : KNOWN_COMPANY;
  const aliases = entity === "contacts" ? CONTACT_ALIASES : COMPANY_ALIASES;
  const requiredKey = entity === "contacts" ? "first_name" : "name";

  async function onFile(file: File) {
    setError(null);
    setResult(null);
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseWorkbook(buf, known, aliases);
      if (parsed.rows.length === 0) {
        setError("Keine Datenzeilen gefunden (erste Zeile = Header erwartet).");
        setRows([]);
        return;
      }
      setFileName(file.name);
      setRows(parsed.rows);
    } catch {
      setError("Datei konnte nicht gelesen werden (.xlsx oder .csv erwartet).");
      setRows([]);
    }
  }

  async function submit() {
    if (rows.length === 0) return;
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
    setOpen(false);
    setRows([]);
    setFileName("");
    setError(null);
    setResult(null);
  }

  const validCount = rows.filter((r) => String(r[requiredKey] ?? "").trim() !== "").length;

  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        <Upload size={16} /> {buttonLabel}
      </button>
      {open && (
        <div className="dialog-overlay" onClick={close}>
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Import" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2>{entity === "contacts" ? "Kontakte importieren" : "Firmen importieren"}</h2>
              <button type="button" className="btn btn-sm" onClick={close} aria-label="Schließen">
                <X size={16} />
              </button>
            </div>

            <div className="stack">
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="input"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFile(f);
                }}
                aria-label="Import-Datei (.xlsx oder .csv)"
              />
              {entity === "contacts" && (
                <label className="row small" style={{ gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={inferCompany}
                    onChange={(e) => setInferCompany(e.target.checked)}
                  />
                  Firma aus E-Mail-Domain ableiten (inferCompanyFromEmail)
                </label>
              )}
              {fileName && (
                <p className="small muted">
                  {fileName}: {rows.length} Zeilen, davon {validCount} mit{" "}
                  <code className="mono">{requiredKey}</code>.
                </p>
              )}
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              {result && (
                <div className="hint-box">
                  Importiert: {result.imported ?? 0} · Übersprungen: {result.skipped ?? 0}
                  {result.companiesCreated != null && <> · Firmen angelegt: {result.companiesCreated}</>}
                  {result.duplicates != null && <> · Duplikate: {result.duplicates}</>}
                </div>
              )}
            </div>

            <div className="dialog-actions">
              <button type="button" className="btn" onClick={close}>
                {result ? "Schließen" : "Abbrechen"}
              </button>
              {!result && (
                <button
                  type="button"
                  className="btn btn-accent"
                  onClick={submit}
                  disabled={busy || rows.length === 0}
                >
                  {busy ? "Importiert…" : `${validCount} importieren`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
