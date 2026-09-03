"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ApiError } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { CustomFieldDef } from "@/lib/types";

type Entity = "contact" | "company" | "deal";

const ENTITIES: { key: Entity; label: string }[] = [
  { key: "contact", label: "Kontakte" },
  { key: "company", label: "Firmen" },
  { key: "deal", label: "Deals" },
];

const FIELD_TYPES = [
  "string",
  "text",
  "integer",
  "decimal",
  "boolean",
  "date",
  "datetime",
  "enumeration",
  "json",
] as const;

export function PropertiesManager({ defs }: { defs: CustomFieldDef[] }) {
  const api = useApi();
  const router = useRouter();
  const [entity, setEntity] = useState<Entity>("contact");
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState<string>("string");
  const [required, setRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const visible = useMemo(
    () => defs.filter((d) => d.entity_type === entity).sort((a, b) => a.position - b.position),
    [defs, entity],
  );

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[a-z][a-z0-9_]*$/.test(key.trim())) {
      setError("Key muss ^[a-z][a-z0-9_]*$ entsprechen (klein, Unterstriche).");
      return;
    }
    if (!label.trim()) {
      setError("Label ist Pflicht.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api("/v1/custom-fields", {
        method: "POST",
        body: {
          entity_type: entity,
          key: key.trim(),
          label: label.trim(),
          field_type: fieldType,
          options: required ? { required: true } : {},
        },
      });
      setKey("");
      setLabel("");
      setRequired(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? `Erstellen fehlgeschlagen: ${err.code}` : "Erstellen fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  async function remove(def: CustomFieldDef) {
    if (!window.confirm(`Feld „${def.label}“ (${def.key}) wirklich löschen? Die Spalte wird gedroppt.`)) return;
    setError(null);
    try {
      await api(`/v1/custom-fields/${encodeURIComponent(def.id)}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? `Löschen fehlgeschlagen: ${err.code}` : "Löschen fehlgeschlagen");
    }
  }

  return (
    <div className="stack">
      <div className="hint-box">
        Custom Fields sind echte Spalten auf der Entity-Tabelle (Contract §2/§4). Jede Def legt eine
        Spalte an, Löschen droppt sie.
      </div>

      <div className="row" role="tablist" aria-label="Entity wählen">
        {ENTITIES.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={entity === t.key}
            className={`btn ${entity === t.key ? "btn-accent" : ""}`}
            onClick={() => setEntity(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <form onSubmit={create} className="card stack">
        <h2 style={{ margin: 0, fontSize: 16 }}>Neues Feld für {ENTITIES.find((t) => t.key === entity)?.label}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="field" style={{ margin: 0 }}>
            <span className="field-label">Key *</span>
            <input
              className="input mono"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="z. B. branche_detail"
              pattern="[a-z][a-z0-9_]*"
              required
            />
          </label>
          <label className="field" style={{ margin: 0 }}>
            <span className="field-label">Label *</span>
            <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} required />
          </label>
          <label className="field" style={{ margin: 0 }}>
            <span className="field-label">Typ</span>
            <select className="select" value={fieldType} onChange={(e) => setFieldType(e.target.value)}>
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="row small" style={{ gap: 8, alignSelf: "end", minHeight: "2.75rem" }}>
            <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
            Pflichtfeld (required)
          </label>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div>
          <button type="submit" className="btn btn-accent" disabled={busy}>
            {busy ? "Erstellt…" : "Feld erstellen"}
          </button>
        </div>
      </form>

      {visible.length === 0 ? (
        <p className="muted small">Keine Custom Fields für diese Entity.</p>
      ) : (
        <div className="card hidden overflow-x-auto p-0 md:block" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Key</th>
                <th scope="col">Label</th>
                <th scope="col" className="hidden sm:table-cell">
                  Typ
                </th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {visible.map((d) => (
                <tr key={d.id}>
                  <td className="mono small">{d.key}</td>
                  <td>{d.label}</td>
                  <td className="hidden sm:table-cell muted small">{d.field_type}</td>
                  <td className="actions">
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(d)}>
                      Löschen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:hidden">
        {visible.map((d) => (
          <div key={d.id} className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong className="mono small">{d.key}</strong>
              <span className="badge">{d.field_type}</span>
            </div>
            <p className="small muted" style={{ margin: "4px 0" }}>{d.label}</p>
            <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(d)}>
              Löschen
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
