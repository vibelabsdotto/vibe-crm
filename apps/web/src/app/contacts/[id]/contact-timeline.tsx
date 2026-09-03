"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { Activity, ActivityType } from "@/lib/types";

const TYPES: ActivityType[] = ["note", "email", "meeting", "stage_change"];

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE");
}

export function ContactTimeline({
  entityId,
  initialActivities,
}: {
  entityId: string;
  initialActivities: Activity[];
}) {
  const api = useApi();
  const router = useRouter();
  const [activities, setActivities] = useState(initialActivities);
  const [type, setType] = useState<ActivityType>("note");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api<Activity>("/v1/activities", {
        method: "POST",
        body: { entity_type: "contact", entity_id: entityId, type, body: body.trim() },
      });
      setActivities((list) => [created, ...list]);
      setBody("");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? `Speichern fehlgeschlagen: ${err.code}` : "Speichern fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <form onSubmit={submit} className="card stack">
        <h2 style={{ margin: 0, fontSize: 16 }}>Neuer Eintrag</h2>
        <div className="row">
          <select
            className="select"
            style={{ maxWidth: 180 }}
            value={type}
            onChange={(e) => setType(e.target.value as ActivityType)}
            aria-label="Aktivitätstyp"
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <textarea
          className="textarea"
          style={{ minHeight: 90 }}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Notiz, E-Mail-Protokoll, Meeting…"
          aria-label="Aktivitätstext"
        />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div>
          <button type="submit" className="btn btn-accent" disabled={busy || !body.trim()}>
            {busy ? "Speichert…" : "Hinzufügen"}
          </button>
        </div>
      </form>

      {activities.length === 0 ? (
        <p className="muted small">Noch keine Einträge.</p>
      ) : (
        <ul className="timeline">
          {activities.map((a) => (
            <li key={a.id} className="timeline-item">
              <div className="timeline-meta">
                <span className="badge">{a.type}</span>
                <time className="small muted" dateTime={a.created_at}>
                  {formatDate(a.created_at)}
                </time>
              </div>
              <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{a.body || "—"}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
