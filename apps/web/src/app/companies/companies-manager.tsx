"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ImportDialog } from "@/components/import-dialog";
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

function emptyForm(): CompanyFormState {
  return { name: "", domain: "", industry: "", phone: "", email: "", notes: "" };
}

function CompanyDialog({ company, onClose }: { company: Company | null; onClose: () => void }) {
  const api = useApi();
  const router = useRouter();
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
  const [busy, setBusy] = useState(false);

  function set<K extends keyof CompanyFormState>(key: K, value: CompanyFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Name ist Pflicht.");
      return;
    }
    setBusy(true);
    setError(null);
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
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? `Speichern fehlgeschlagen: ${err.code}` : "Speichern fehlgeschlagen");
      setBusy(false);
    }
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2>{company ? "Firma bearbeiten" : "Firma anlegen"}</h2>
        <form onSubmit={submit}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="field" style={{ margin: 0 }}>
              <span className="field-label">Name *</span>
              <input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} required autoFocus />
            </label>
            <label className="field" style={{ margin: 0 }}>
              <span className="field-label">Domain</span>
              <input className="input" value={form.domain} onChange={(e) => set("domain", e.target.value)} placeholder="example.com" />
            </label>
            <label className="field" style={{ margin: 0 }}>
              <span className="field-label">Branche</span>
              <input className="input" value={form.industry} onChange={(e) => set("industry", e.target.value)} />
            </label>
            <label className="field" style={{ margin: 0 }}>
              <span className="field-label">Telefon</span>
              <input className="input" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </label>
            <label className="field" style={{ margin: 0 }}>
              <span className="field-label">E-Mail</span>
              <input className="input" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </label>
          </div>
          <label className="field" style={{ marginTop: 12 }}>
            <span className="field-label">Notizen</span>
            <textarea className="textarea" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={onClose}>
              Abbrechen
            </button>
            <button type="submit" className="btn btn-accent" disabled={busy}>
              {busy ? "Speichert…" : "Speichern"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function CompaniesManager({ companies, total }: { companies: Company[]; total: number }) {
  const api = useApi();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [dialog, setDialog] = useState<{ open: boolean; company: Company | null }>({ open: false, company: null });
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [industry, setIndustry] = useState(searchParams.get("industry") ?? "");

  function applyFilters() {
    const q = new URLSearchParams();
    if (search.trim()) q.set("search", search.trim());
    if (industry.trim()) q.set("industry", industry.trim());
    router.push(`/companies${q.toString() ? `?${q.toString()}` : ""}`);
  }

  async function remove(c: Company) {
    if (!window.confirm(`Firma „${c.name}“ wirklich löschen? Kontakte bleiben erhalten (company_id=NULL).`)) return;
    setError(null);
    try {
      await api(`/v1/companies/${encodeURIComponent(c.id)}`, { method: "DELETE" });
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? `Löschen fehlgeschlagen: ${e.code}` : "Löschen fehlgeschlagen");
    }
  }

  return (
    <div className="stack">
      <div className="row">
        <form
          className="row"
          style={{ flex: 1 }}
          onSubmit={(e) => {
            e.preventDefault();
            applyFilters();
          }}
        >
          <input
            className="input"
            style={{ maxWidth: 260 }}
            placeholder="Suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Firmen suchen"
          />
          <input
            className="input"
            style={{ maxWidth: 180 }}
            placeholder="Branche…"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            aria-label="Branche filtern"
          />
          <button type="submit" className="btn">
            Filtern
          </button>
        </form>
        <ImportDialog entity="companies" />
        <button type="button" className="btn btn-accent" onClick={() => setDialog({ open: true, company: null })}>
          + Firma
        </button>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <p className="small muted">
        {companies.length} von {total} Firmen
      </p>

      {companies.length === 0 ? (
        <div className="card">
          <p className="muted">Keine Firmen gefunden.</p>
        </div>
      ) : (
        <>
          <div className="card hidden overflow-x-auto p-0 md:block" style={{ padding: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col" className="hidden lg:table-cell">
                    Domain
                  </th>
                  <th scope="col" className="hidden sm:table-cell">
                    Branche
                  </th>
                  <th scope="col" className="hidden lg:table-cell">
                    Kontakte
                  </th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.name}</strong>
                      {c.email && <div className="small muted">{c.email}</div>}
                    </td>
                    <td className="hidden lg:table-cell muted small mono">{c.domain || "—"}</td>
                    <td className="hidden sm:table-cell muted">{c.industry || "—"}</td>
                    <td className="hidden lg:table-cell muted">{c.contact_count ?? "—"}</td>
                    <td className="actions">
                      <button type="button" className="btn btn-sm" onClick={() => setDialog({ open: true, company: c })}>
                        Bearbeiten
                      </button>
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(c)}>
                        Löschen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 gap-3 md:hidden">
            {companies.map((c) => (
              <div key={c.id} className="card">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>{c.name}</strong>
                  {c.contact_count != null && <span className="badge">{c.contact_count} Kontakte</span>}
                </div>
                <p className="small muted" style={{ margin: "4px 0" }}>
                  {[c.industry, c.domain].filter(Boolean).join(" · ") || "—"}
                </p>
                <div className="row" style={{ marginTop: 8 }}>
                  <button type="button" className="btn btn-sm" onClick={() => setDialog({ open: true, company: c })}>
                    Bearbeiten
                  </button>
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(c)}>
                    Löschen
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {dialog.open && <CompanyDialog company={dialog.company} onClose={() => setDialog({ open: false, company: null })} />}
    </div>
  );
}
