"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ImportDialog } from "@/components/import-dialog";
import { ApiError } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { Company, Contact, ContactStatus } from "@/lib/types";

const STATUSES: ContactStatus[] = ["lead", "active", "inactive", "churned"];

type ContactFormState = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  title: string;
  status: ContactStatus;
  company_id: string;
};

function emptyForm(): ContactFormState {
  return { first_name: "", last_name: "", email: "", phone: "", title: "", status: "lead", company_id: "" };
}

function ContactDialog({
  contact,
  companies,
  onClose,
}: {
  contact: Contact | null;
  companies: Company[];
  onClose: () => void;
}) {
  const api = useApi();
  const router = useRouter();
  const [form, setForm] = useState<ContactFormState>(() =>
    contact
      ? {
          first_name: contact.first_name,
          last_name: contact.last_name,
          email: contact.email,
          phone: contact.phone,
          title: contact.title,
          status: contact.status,
          company_id: contact.company_id ?? "",
        }
      : emptyForm(),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof ContactFormState>(key: K, value: ContactFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.first_name.trim()) {
      setError("Vorname ist Pflicht.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        title: form.title.trim(),
        status: form.status,
        company_id: form.company_id || null,
      };
      if (contact) await api(`/v1/contacts/${encodeURIComponent(contact.id)}`, { method: "PUT", body });
      else await api("/v1/contacts", { method: "POST", body });
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
        <h2>{contact ? "Kontakt bearbeiten" : "Kontakt anlegen"}</h2>
        <form onSubmit={submit}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="field" style={{ margin: 0 }}>
              <span className="field-label">Vorname *</span>
              <input className="input" value={form.first_name} onChange={(e) => set("first_name", e.target.value)} required autoFocus />
            </label>
            <label className="field" style={{ margin: 0 }}>
              <span className="field-label">Nachname</span>
              <input className="input" value={form.last_name} onChange={(e) => set("last_name", e.target.value)} />
            </label>
            <label className="field" style={{ margin: 0 }}>
              <span className="field-label">E-Mail</span>
              <input className="input" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </label>
            <label className="field" style={{ margin: 0 }}>
              <span className="field-label">Telefon</span>
              <input className="input" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </label>
            <label className="field" style={{ margin: 0 }}>
              <span className="field-label">Titel</span>
              <input className="input" value={form.title} onChange={(e) => set("title", e.target.value)} />
            </label>
            <label className="field" style={{ margin: 0 }}>
              <span className="field-label">Status</span>
              <select className="select" value={form.status} onChange={(e) => set("status", e.target.value as ContactStatus)}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field" style={{ marginTop: 12 }}>
            <span className="field-label">Firma</span>
            <select className="select" value={form.company_id} onChange={(e) => set("company_id", e.target.value)}>
              <option value="">— keine —</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
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

export function ContactsManager({
  contacts,
  companies,
  total,
}: {
  contacts: Contact[];
  companies: Company[];
  total: number;
}) {
  const api = useApi();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [dialog, setDialog] = useState<{ open: boolean; contact: Contact | null }>({ open: false, contact: null });
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [status, setStatus] = useState(searchParams.get("status") ?? "");

  function applyFilters() {
    const q = new URLSearchParams();
    if (search.trim()) q.set("search", search.trim());
    if (status) q.set("status", status);
    router.push(`/contacts${q.toString() ? `?${q.toString()}` : ""}`);
  }

  async function remove(c: Contact) {
    if (!window.confirm(`Kontakt „${c.first_name} ${c.last_name}“ wirklich löschen? Deals bleiben erhalten.`)) return;
    setError(null);
    try {
      await api(`/v1/contacts/${encodeURIComponent(c.id)}`, { method: "DELETE" });
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
            style={{ maxWidth: 280 }}
            placeholder="Suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Kontakte suchen"
          />
          <select className="select" style={{ maxWidth: 160 }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filtern">
            <option value="">Alle Status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button type="submit" className="btn">
            Filtern
          </button>
        </form>
        <ImportDialog entity="contacts" />
        <button type="button" className="btn btn-accent" onClick={() => setDialog({ open: true, contact: null })}>
          + Kontakt
        </button>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <p className="small muted">
        {contacts.length} von {total} Kontakten
      </p>

      {contacts.length === 0 ? (
        <div className="card">
          <p className="muted">Keine Kontakte gefunden.</p>
        </div>
      ) : (
        <>
          {/* Tabelle (Desktop) */}
          <div className="card hidden overflow-x-auto p-0 md:block" style={{ padding: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col" className="hidden lg:table-cell">
                    E-Mail
                  </th>
                  <th scope="col" className="hidden sm:table-cell">
                    Firma
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/contacts/${encodeURIComponent(c.id)}`} prefetch={false}>
                        {c.first_name} {c.last_name}
                      </Link>
                      {c.title && <div className="small muted">{c.title}</div>}
                    </td>
                    <td className="hidden lg:table-cell muted small">{c.email || "—"}</td>
                    <td className="hidden sm:table-cell muted">{String(c.company_name ?? "") || "—"}</td>
                    <td>
                      <span className="badge">{c.status}</span>
                    </td>
                    <td className="actions">
                      <button type="button" className="btn btn-sm" onClick={() => setDialog({ open: true, contact: c })}>
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

          {/* Card-Fallback (mobil) */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {contacts.map((c) => (
              <div key={c.id} className="card">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <Link href={`/contacts/${encodeURIComponent(c.id)}`} prefetch={false}>
                    <strong>
                      {c.first_name} {c.last_name}
                    </strong>
                  </Link>
                  <span className="badge">{c.status}</span>
                </div>
                {c.title && <p className="small muted" style={{ margin: "4px 0" }}>{c.title}</p>}
                <p className="small muted" style={{ margin: "4px 0" }}>
                  {[String(c.company_name ?? ""), c.email].filter(Boolean).join(" · ") || "—"}
                </p>
                <div className="row" style={{ marginTop: 8 }}>
                  <button type="button" className="btn btn-sm" onClick={() => setDialog({ open: true, contact: c })}>
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

      {dialog.open && (
        <ContactDialog contact={dialog.contact} companies={companies} onClose={() => setDialog({ open: false, contact: null })} />
      )}
    </div>
  );
}
