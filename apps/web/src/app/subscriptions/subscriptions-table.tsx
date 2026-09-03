"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type {
  Company,
  Product,
  Subscription,
  SubscriptionInterval,
  SubscriptionStatus,
} from "@/lib/types";

const STATUSES: SubscriptionStatus[] = ["active", "trial", "paused", "cancelled", "expired"];
const INTERVALS: SubscriptionInterval[] = ["monthly", "quarterly", "yearly", "one_time"];

function eur(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value);
}

type FormState = {
  name: string;
  company_id: string;
  product_id: string;
  amount: string;
  currency: string;
  interval: SubscriptionInterval;
  status: SubscriptionStatus;
  start_date: string;
  end_date: string;
  notes: string;
};

function emptyForm(): FormState {
  return {
    name: "",
    company_id: "",
    product_id: "",
    amount: "",
    currency: "EUR",
    interval: "monthly",
    status: "active",
    start_date: "",
    end_date: "",
    notes: "",
  };
}

function formFromSub(s: Subscription): FormState {
  return {
    name: s.name,
    company_id: s.company_id ?? "",
    product_id: s.product_id ?? "",
    amount: String(s.amount ?? 0),
    currency: s.currency || "EUR",
    interval: s.interval,
    status: s.status,
    start_date: s.start_date ?? "",
    end_date: s.end_date ?? "",
    notes: s.notes ?? "",
  };
}

function SubscriptionDialog({
  companies,
  products,
  initial,
  editId,
  onClose,
}: {
  companies: Company[];
  products: Product[];
  initial: FormState;
  editId: string | null;
  onClose: () => void;
}) {
  const api = useApi();
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
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
    const body = {
      name: form.name.trim(),
      company_id: form.company_id || null,
      product_id: form.product_id || null,
      amount: form.amount === "" ? 0 : Number(form.amount),
      currency: form.currency.trim() || "EUR",
      interval: form.interval,
      status: form.status,
      start_date: form.start_date,
      end_date: form.end_date,
      notes: form.notes.trim(),
    };
    try {
      if (editId) {
        await api(`/v1/subscriptions/${encodeURIComponent(editId)}`, { method: "PUT", body });
      } else {
        await api("/v1/subscriptions", { method: "POST", body });
      }
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
        <h2>{editId ? "Abo bearbeiten" : "Abo anlegen"}</h2>
        <form onSubmit={submit}>
          <label className="field">
            <span className="field-label">Name *</span>
            <input
              className="input"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              required
              autoFocus
              placeholder="z. B. DAZE Monatspauschale"
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="field" style={{ margin: 0 }}>
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
            <label className="field" style={{ margin: 0 }}>
              <span className="field-label">Produkt</span>
              <select className="select" value={form.product_id} onChange={(e) => set("product_id", e.target.value)}>
                <option value="">— keines —</option>
                {products.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" style={{ marginTop: 12 }}>
            <label className="field" style={{ margin: 0 }}>
              <span className="field-label">Betrag</span>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) => set("amount", e.target.value)}
              />
            </label>
            <label className="field" style={{ margin: 0 }}>
              <span className="field-label">Währung</span>
              <input className="input" value={form.currency} onChange={(e) => set("currency", e.target.value)} maxLength={8} />
            </label>
            <label className="field" style={{ margin: 0 }}>
              <span className="field-label">Intervall</span>
              <select
                className="select"
                value={form.interval}
                onChange={(e) => set("interval", e.target.value as SubscriptionInterval)}
              >
                {INTERVALS.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" style={{ marginTop: 12 }}>
            <label className="field" style={{ margin: 0 }}>
              <span className="field-label">Status</span>
              <select
                className="select"
                value={form.status}
                onChange={(e) => set("status", e.target.value as SubscriptionStatus)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="field" style={{ margin: 0 }}>
              <span className="field-label">Start</span>
              <input
                className="input"
                type="date"
                value={form.start_date}
                onChange={(e) => set("start_date", e.target.value)}
              />
            </label>
            <label className="field" style={{ margin: 0 }}>
              <span className="field-label">Ende (leer = unbefristet)</span>
              <input
                className="input"
                type="date"
                value={form.end_date}
                onChange={(e) => set("end_date", e.target.value)}
              />
            </label>
          </div>
          <label className="field">
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

export function SubscriptionsTable({
  subscriptions,
  companies,
  products,
  initialStatus,
}: {
  subscriptions: Subscription[];
  companies: Company[];
  products: Product[];
  initialStatus: string;
}) {
  const api = useApi();
  const router = useRouter();
  const [dialog, setDialog] = useState<{ initial: FormState; editId: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function applyStatusFilter(value: string) {
    router.push(`/subscriptions${value ? `?status=${encodeURIComponent(value)}` : ""}`);
  }

  async function cancel(sub: Subscription) {
    if (!window.confirm(`Abo „${sub.name}“ kündigen (Status → cancelled)?`)) return;
    setError(null);
    try {
      await api(`/v1/subscriptions/${encodeURIComponent(sub.id)}`, {
        method: "PUT",
        body: { status: "cancelled" },
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? `Kündigen fehlgeschlagen: ${e.code}` : "Kündigen fehlgeschlagen");
    }
  }

  async function remove(sub: Subscription) {
    if (!window.confirm(`Abo „${sub.name}“ wirklich löschen?`)) return;
    setError(null);
    try {
      await api(`/v1/subscriptions/${encodeURIComponent(sub.id)}`, { method: "DELETE" });
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? `Löschen fehlgeschlagen: ${e.code}` : "Löschen fehlgeschlagen");
    }
  }

  return (
    <div className="stack">
      <div className="row">
        <select
          className="select"
          style={{ maxWidth: 220 }}
          value={initialStatus}
          onChange={(e) => applyStatusFilter(e.target.value)}
          aria-label="Status filtern"
        >
          <option value="">Alle Status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span className="small muted">{subscriptions.length} Abos</span>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className="btn btn-accent"
          onClick={() => setDialog({ initial: emptyForm(), editId: null })}
        >
          + Abo
        </button>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {subscriptions.length === 0 ? (
        <div className="card">
          <p className="muted">Keine Abos vorhanden.</p>
        </div>
      ) : (
        <>
          {/* Card-Grid-Fallback auf Mobile (Contract §5) */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {subscriptions.map((s) => (
              <article key={s.id} className="card">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>{s.name}</strong>
                  <span className="badge">{s.status}</span>
                </div>
                <p className="small muted" style={{ margin: "4px 0" }}>
                  {[String(s.company_name ?? ""), String(s.product_name ?? "")]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </p>
                <p style={{ margin: "4px 0" }}>
                  {eur(s.amount ?? 0)} {s.currency} · {s.interval}
                </p>
                <div className="row" style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setDialog({ initial: formFromSub(s), editId: s.id })}
                  >
                    Bearbeiten
                  </button>
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(s)}>
                    Löschen
                  </button>
                </div>
              </article>
            ))}
          </div>

          <div className="card hidden overflow-x-auto p-0 md:block" style={{ padding: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col" className="hidden lg:table-cell">
                    Firma
                  </th>
                  <th scope="col" className="hidden lg:table-cell">
                    Produkt
                  </th>
                  <th scope="col">Betrag</th>
                  <th scope="col" className="hidden sm:table-cell">
                    Intervall
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.name}</strong>
                    </td>
                    <td className="hidden lg:table-cell muted small">{String(s.company_name ?? "") || "—"}</td>
                    <td className="hidden lg:table-cell muted small">{String(s.product_name ?? "") || "—"}</td>
                    <td>
                      {eur(s.amount ?? 0)} {s.currency}
                    </td>
                    <td className="hidden sm:table-cell muted small">{s.interval}</td>
                    <td>
                      <span className="badge">{s.status}</span>
                    </td>
                    <td>
                      <div className="row">
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => setDialog({ initial: formFromSub(s), editId: s.id })}
                        >
                          Bearbeiten
                        </button>
                        {(s.status === "active" || s.status === "trial" || s.status === "paused") && (
                          <button type="button" className="btn btn-sm" onClick={() => cancel(s)}>
                            Kündigen
                          </button>
                        )}
                        <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(s)}>
                          ×
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {dialog && (
        <SubscriptionDialog
          companies={companies}
          products={products}
          initial={dialog.initial}
          editId={dialog.editId}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
