"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { asList } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import type { Product } from "@/lib/types";

const TYPES = ["product", "service", "other"];

type FormState = {
  key: string;
  name: string;
  type: string;
  status: string;
  notes: string;
};

function emptyForm(): FormState {
  return { key: "", name: "", type: "product", status: "", notes: "" };
}

function formFromProduct(p: Product): FormState {
  return { key: p.key, name: p.name, type: p.type, status: p.status, notes: p.notes };
}

function ProductDialog({
  initial,
  editKey,
  onClose,
  onSaved,
}: {
  initial: FormState;
  editKey: string | null;
  onClose: () => void;
  onSaved: (products: Product[]) => void;
}) {
  const api = useApi();
  const [form, setForm] = useState<FormState>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function refresh() {
    const data = await api<unknown>("/v1/products");
    onSaved(asList<Product>(data, "products"));
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
      if (editKey) {
        await api(`/v1/products/${encodeURIComponent(editKey)}`, {
          method: "PUT",
          body: {
            name: form.name.trim(),
            type: form.type,
            status: form.status,
            notes: form.notes.trim(),
          },
        });
      } else {
        const body: Record<string, string> = {
          name: form.name.trim(),
          type: form.type,
          status: form.status,
          notes: form.notes.trim(),
        };
        if (form.key.trim()) body.key = form.key.trim();
        await api("/v1/products", { method: "POST", body });
      }
      await refresh();
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === "conflict") {
        setError("Schlüssel bereits vergeben — anderen Key wählen.");
      } else {
        setError(err instanceof ApiError ? `Speichern fehlgeschlagen: ${err.code}` : "Speichern fehlgeschlagen");
      }
      setBusy(false);
    }
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2>{editKey ? "Produkt bearbeiten" : "Produkt anlegen"}</h2>
        <form onSubmit={submit}>
          <label className="field">
            <span className="field-label">Name *</span>
            <input
              className="input"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              required
              autoFocus
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="field" style={{ margin: 0 }}>
              <span className="field-label">Key (Slug){editKey ? "" : ", leer = aus Name"}</span>
              <input
                className="input"
                value={form.key}
                onChange={(e) => set("key", e.target.value)}
                disabled={editKey !== null}
                placeholder="z. B. daze"
              />
            </label>
            <label className="field" style={{ margin: 0 }}>
              <span className="field-label">Typ</span>
              <select className="select" value={form.type} onChange={(e) => set("type", e.target.value)}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span className="field-label">Status</span>
            <input
              className="input"
              value={form.status}
              onChange={(e) => set("status", e.target.value)}
              placeholder="frei, z. B. aktiv"
            />
          </label>
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

export function ProductsManager({ initialProducts }: { initialProducts: Product[] }) {
  const api = useApi();
  const [products, setProducts] = useState(initialProducts);
  const [dialog, setDialog] = useState<{ initial: FormState; editKey: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(p: Product) {
    if (!window.confirm(`Produkt „${p.name}“ wirklich löschen?`)) return;
    setError(null);
    try {
      await api(`/v1/products/${encodeURIComponent(p.key)}`, { method: "DELETE" });
      setProducts((ps) => ps.filter((x) => x.key !== p.key));
    } catch (err) {
      if (err instanceof ApiError && err.code === "conflict") {
        setError(
          `„${p.name}“ wird noch von Deals oder Abos referenziert — erst umhängen, dann löschen.`,
        );
      } else {
        setError(err instanceof ApiError ? `Löschen fehlgeschlagen: ${err.code}` : "Löschen fehlgeschlagen");
      }
    }
  }

  const sorted = [...products].sort((a, b) => a.name.localeCompare(b.name, "de"));

  return (
    <div className="stack">
      <div className="hint-box">
        Produkte hängen optional an Deals und Abos. Löschen geht nur, wenn nichts mehr darauf verweist.
      </div>

      <div className="row">
        <span className="small muted">{products.length} Produkte</span>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className="btn btn-accent"
          onClick={() => setDialog({ initial: emptyForm(), editKey: null })}
        >
          + Produkt
        </button>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {sorted.length === 0 ? (
        <p className="muted">Noch keine Produkte vorhanden.</p>
      ) : (
        <div className="card overflow-x-auto" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col" className="hidden sm:table-cell">
                  Key
                </th>
                <th scope="col" className="hidden md:table-cell">
                  Typ
                </th>
                <th scope="col" className="hidden md:table-cell">
                  Status
                </th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <tr key={p.key}>
                  <td>
                    <strong>{p.name}</strong>
                  </td>
                  <td className="hidden sm:table-cell mono small muted">{p.key}</td>
                  <td className="hidden md:table-cell muted small">{p.type || "—"}</td>
                  <td className="hidden md:table-cell muted small">{p.status || "—"}</td>
                  <td>
                    <div className="row">
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => setDialog({ initial: formFromProduct(p), editKey: p.key })}
                      >
                        Bearbeiten
                      </button>
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(p)}>
                        ×
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dialog && (
        <ProductDialog
          initial={dialog.initial}
          editKey={dialog.editKey}
          onClose={() => setDialog(null)}
          onSaved={setProducts}
        />
      )}
    </div>
  );
}
