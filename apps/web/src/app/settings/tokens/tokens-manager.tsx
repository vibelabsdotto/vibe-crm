"use client";

import { useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { ApiError } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { ApiTokenMeta, CreatedApiToken } from "@/lib/types";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE");
}

export function TokensManager({ initialTokens }: { initialTokens: ApiTokenMeta[] }) {
  const [tokens, setTokens] = useState(initialTokens);
  const [name, setName] = useState("");
  const [created, setCreated] = useState<CreatedApiToken | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const api = useApi();

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<CreatedApiToken>("/v1/tokens", {
        method: "POST",
        body: { name: name.trim() },
      });
      setCreated(res);
      setName("");
      const data = await api<{ tokens: ApiTokenMeta[] }>("/v1/tokens");
      setTokens(data.tokens);
    } catch (err) {
      setError(err instanceof ApiError ? `Erstellen fehlgeschlagen: ${err.code}` : "Erstellen fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string, tokenName: string) {
    if (!window.confirm(`Token „${tokenName}“ wirklich revoken? CLIs mit diesem Token verlieren sofort den Zugriff.`))
      return;
    setError(null);
    try {
      await api(`/v1/tokens/${encodeURIComponent(id)}`, { method: "DELETE" });
      setTokens((ts) => ts.filter((t) => t.id !== id));
      if (created?.id === id) setCreated(null);
    } catch (err) {
      setError(err instanceof ApiError ? `Revoke fehlgeschlagen: ${err.code}` : "Revoke fehlgeschlagen");
    }
  }

  const sorted = [...tokens].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <div className="stack">
      <div className="hint-box">
        Mit einem Token meldest du die CLI an: <code>vibe-crm auth login --token vc_…</code>
      </div>

      <form onSubmit={create} className="row">
        <label htmlFor="token-name" className="small muted" style={{ minWidth: 90 }}>
          Token-Name
        </label>
        <input
          id="token-name"
          className="input"
          style={{ flex: 1, minWidth: 200 }}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="z. B. MacBook CLI"
          maxLength={100}
          required
        />
        <button type="submit" className="btn btn-accent" disabled={busy}>
          {busy ? "Erstellen…" : "Token erstellen"}
        </button>
      </form>

      {created && (
        <div className="card" style={{ borderColor: "var(--teal)" }}>
          <strong>Token erstellt — wird nur einmal angezeigt!</strong>
          <p className="muted small" style={{ margin: "4px 0 0" }}>
            Jetzt kopieren und sicher aufbewahren. Nach dem Schließen ist der volle Token nicht
            mehr abrufbar.
          </p>
          <div className="token-reveal">
            <code>{created.token}</code>
            <CopyButton text={created.token} label="Kopieren" />
          </div>
          <p className="small mono muted">vibe-crm auth login --token {created.token}</p>
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="muted">Noch keine Tokens erstellt.</p>
      ) : (
        <div className="card overflow-x-auto" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col" className="hidden sm:table-cell">
                  Prefix
                </th>
                <th scope="col" className="hidden md:table-cell">
                  Erstellt
                </th>
                <th scope="col" className="hidden md:table-cell">
                  Zuletzt genutzt
                </th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td className="hidden sm:table-cell mono small muted">{t.prefix}…</td>
                  <td className="hidden md:table-cell muted small">
                    <time dateTime={t.createdAt}>{formatDate(t.createdAt)}</time>
                  </td>
                  <td className="hidden md:table-cell muted small">
                    {t.lastUsedAt ? <time dateTime={t.lastUsedAt}>{formatDate(t.lastUsedAt)}</time> : "—"}
                  </td>
                  <td className="actions">
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => revoke(t.id, t.name)}
                      aria-label={`Token ${t.name} revoken`}
                    >
                      Revoken
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
