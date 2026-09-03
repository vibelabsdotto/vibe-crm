"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
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

function DealDialog({
  contacts,
  companies,
  products,
  stages,
  onClose,
}: {
  contacts: Contact[];
  companies: Company[];
  products: Product[];
  stages: Stage[];
  onClose: () => void;
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
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name ist Pflicht.");
      return;
    }
    setBusy(true);
    setError(null);
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
        <h2>Deal anlegen</h2>
        <form onSubmit={submit}>
          <label className="field">
            <span className="field-label">Name *</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="field" style={{ margin: 0 }}>
              <span className="field-label">Wert (€)</span>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </label>
            <label className="field" style={{ margin: 0 }}>
              <span className="field-label">Stage</span>
              <select className="select" value={stage} onChange={(e) => setStage(e.target.value)}>
                {stages.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" style={{ marginTop: 12 }}>
            <label className="field" style={{ margin: 0 }}>
              <span className="field-label">Firma</span>
              <select className="select" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                <option value="">— keine —</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field" style={{ margin: 0 }}>
              <span className="field-label">Produkt</span>
              <select className="select" value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">— keines —</option>
                {products.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field" style={{ marginTop: 12 }}>
            <span className="field-label">Kontakt</span>
            <select className="select" value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">— keiner —</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.first_name} {c.last_name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Notizen</span>
            <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
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

export function DealsBoard({
  deals,
  stages,
  contacts,
  companies,
  products,
  initialStage,
  initialProduct,
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
  const [error, setError] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState(initialStage);
  const [productFilter, setProductFilter] = useState(initialProduct);

  const ordered = useMemo(() => [...stages].sort((a, b) => a.position - b.position), [stages]);

  const filteredDeals = useMemo(
    () => (productFilter ? deals.filter((d) => d.product_id === productFilter) : deals),
    [deals, productFilter],
  );

  const visibleStages = useMemo(
    () => (stageFilter ? ordered.filter((s) => s.key === stageFilter) : ordered),
    [ordered, stageFilter],
  );

  function pushFilters(nextStage: string, nextProduct: string) {
    const q = new URLSearchParams();
    if (nextStage) q.set("stage", nextStage);
    if (nextProduct) q.set("product", nextProduct);
    const qs = q.toString();
    router.push(`/deals${qs ? `?${qs}` : ""}`);
  }

  function applyStageFilter(value: string) {
    setStageFilter(value);
    pushFilters(value, productFilter);
  }

  function applyProductFilter(value: string) {
    setProductFilter(value);
    pushFilters(stageFilter, value);
  }

  async function move(deal: Deal, nextStage: string) {
    if (nextStage === deal.stage) return;
    setMovingId(deal.id);
    setError(null);
    try {
      await api(`/v1/deals/${encodeURIComponent(deal.id)}`, { method: "PUT", body: { stage: nextStage } });
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? `Verschieben fehlgeschlagen: ${e.code}` : "Verschieben fehlgeschlagen");
    } finally {
      setMovingId(null);
    }
  }

  async function remove(deal: Deal) {
    if (!window.confirm(`Deal „${deal.name}“ wirklich löschen?`)) return;
    setError(null);
    try {
      await api(`/v1/deals/${encodeURIComponent(deal.id)}`, { method: "DELETE" });
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? `Löschen fehlgeschlagen: ${e.code}` : "Löschen fehlgeschlagen");
    }
  }

  const totalValue = filteredDeals.reduce((sum, d) => sum + (d.value ?? 0), 0);

  return (
    <div className="stack">
      <div className="row">
        <select
          className="select"
          style={{ maxWidth: 220 }}
          value={stageFilter}
          onChange={(e) => applyStageFilter(e.target.value)}
          aria-label="Stage filtern"
        >
          <option value="">Alle Stages</option>
          {ordered.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          className="select"
          style={{ maxWidth: 220 }}
          value={productFilter}
          onChange={(e) => applyProductFilter(e.target.value)}
          aria-label="Produkt filtern"
        >
          <option value="">Alle Produkte</option>
          {products.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name}
            </option>
          ))}
        </select>
        <span className="small muted">
          {filteredDeals.length} Deals · {eur(totalValue)}
        </span>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn btn-accent" onClick={() => setCreateOpen(true)}>
          + Deal
        </button>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {ordered.length === 0 ? (
        <div className="card">
          <p className="muted">Keine Stages vorhanden.</p>
        </div>
      ) : (
        <>
          {/* Board: Spalten stapeln auf Mobile (Contract §5) */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleStages.map((s) => {
              const column = filteredDeals.filter((d) => d.stage === s.key);
              const columnValue = column.reduce((sum, d) => sum + (d.value ?? 0), 0);
              return (
                <section key={s.key} className="card" aria-label={s.label}>
                  <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
                    <strong>{s.label}</strong>
                    <span className="badge">
                      {column.length} · {eur(columnValue)}
                    </span>
                  </div>
                  <div className="stack">
                    {column.length === 0 && <p className="small muted">— leer —</p>}
                    {column.map((d) => (
                      <article key={d.id} className="timeline-item">
                        <div className="row" style={{ justifyContent: "space-between" }}>
                          <strong>{d.name}</strong>
                          <span className="small">{eur(d.value ?? 0)}</span>
                        </div>
                        {(d.contact_name || d.company_name || d.product_name) && (
                          <p className="small muted" style={{ margin: "4px 0" }}>
                            {[
                              String(d.contact_name ?? ""),
                              String(d.company_name ?? ""),
                              String(d.product_name ?? ""),
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                        <div className="row" style={{ marginTop: 8 }}>
                          <select
                            className="select"
                            style={{ minHeight: "2.75rem", flex: 1 }}
                            value={d.stage}
                            disabled={movingId === d.id}
                            onChange={(e) => move(d, e.target.value)}
                            aria-label={`Stage für ${d.name}`}
                          >
                            {ordered.map((opt) => (
                              <option key={opt.key} value={opt.key}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                          <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(d)} aria-label={`Deal ${d.name} löschen`}>
                            ×
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>

          {/* Tabelle */}
          <div className="card hidden overflow-x-auto p-0 md:block" style={{ padding: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Stage</th>
                  <th scope="col" className="hidden lg:table-cell">
                    Kontakt
                  </th>
                  <th scope="col" className="hidden lg:table-cell">
                    Produkt
                  </th>
                  <th scope="col">Wert</th>
                </tr>
              </thead>
              <tbody>
                {filteredDeals.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <strong>{d.name}</strong>
                    </td>
                    <td>
                      <span className="badge">{ordered.find((s) => s.key === d.stage)?.label ?? d.stage}</span>
                    </td>
                    <td className="hidden lg:table-cell muted small">
                      {[String(d.contact_name ?? ""), String(d.company_name ?? "")].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="hidden lg:table-cell muted small">{String(d.product_name ?? "") || "—"}</td>
                    <td>{eur(d.value ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {createOpen && (
        <DealDialog
          contacts={contacts}
          companies={companies}
          products={products}
          stages={ordered}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </div>
  );
}
