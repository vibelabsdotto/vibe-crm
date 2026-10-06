"use client";

import { Calendar, Mail, MessageSquare, MoveRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import type { Activity } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const ACTIVITY_LABELS = { note: "Notiz", email: "E-Mail", meeting: "Meeting", stage_change: "Stage-Wechsel" };
const ACTIVITY_ICONS = { note: MessageSquare, email: Mail, meeting: Calendar, stage_change: MoveRight };

export function entityDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Nicht angegeben" : date.toLocaleString("de-DE");
}

export function EntityTimestamps({ createdAt, updatedAt }: { createdAt: string; updatedAt: string }) {
  return <dl className="grid min-w-0 grid-cols-1 gap-2 text-sm text-muted-foreground sm:grid-cols-2">
    <div><dt>Erstellt</dt><dd><time dateTime={createdAt}>{entityDate(createdAt)}</time></dd></div>
    <div><dt>Zuletzt geändert</dt><dd><time dateTime={updatedAt}>{entityDate(updatedAt)}</time></dd></div>
  </dl>;
}

export function EntityTimeline({ entityType, entityId, revision }: { entityType: "company" | "contact" | "deal"; entityId: string; revision: number }) {
  const api = useApi();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ owner: object | null; activities: Activity[]; error: string | null }>({ owner: null, activities: [], error: null });
  const [identity, setIdentity] = useState(() => ({ entityType, entityId, revision, attempt }));
  if (identity.entityType !== entityType || identity.entityId !== entityId || identity.revision !== revision || identity.attempt !== attempt) {
    setIdentity({ entityType, entityId, revision, attempt });
  }
  useEffect(() => {
    let active = true;
    api<{ activities: Activity[] }>(`/v1/activities?entity_type=${identity.entityType}&entity_id=${encodeURIComponent(identity.entityId)}`).then((response) => {
      if (!Array.isArray(response.activities)) throw new Error("Ungültige Timeline-Antwort.");
      const ids = new Set<string>();
      for (const activity of response.activities) {
        if (!activity || !activity.id || ids.has(activity.id) || activity.entity_type !== identity.entityType || activity.entity_id !== identity.entityId) throw new Error("Die Aktivitäten gehören nicht eindeutig zum geöffneten Datensatz.");
        ids.add(activity.id);
      }
      if (active) setState({ owner: identity, activities: response.activities, error: null });
    }).catch(() => {
      if (active) setState({ owner: identity, activities: [], error: "Die Aktivitäten konnten nicht geladen werden." });
    });
    return () => { active = false; };
  }, [api, identity]);
  const loaded = state.owner === identity;
  return <section aria-label="Aktivitäten" className="flex min-w-0 flex-col gap-3">
    <h3 className="font-medium">Aktivitäten</h3>
    {!loaded ? <div role="status" aria-label="Aktivitäten werden geladen"><Skeleton className="h-20 w-full" /></div> : state.error ? (
      <Alert variant="destructive"><AlertDescription className="flex flex-col gap-2"><p>{state.error}</p><Button type="button" variant="outline" className="w-fit" onClick={() => setAttempt((value) => value + 1)}>Erneut laden</Button></AlertDescription></Alert>
    ) : state.activities.length === 0 ? (
      <Empty className="border"><EmptyHeader><EmptyTitle>Noch keine Aktivitäten</EmptyTitle><EmptyDescription>Notizen und Stage-Wechsel erscheinen hier.</EmptyDescription></EmptyHeader></Empty>
    ) : <ol className="flex min-w-0 flex-col gap-4">
      {state.activities.map((activity) => {
        const Icon = ACTIVITY_ICONS[activity.type] ?? MessageSquare;
        return <li key={activity.id} className="flex min-w-0 flex-col gap-2 border-l pl-4">
          <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary"><Icon data-icon="inline-start" />{ACTIVITY_LABELS[activity.type] ?? activity.type}</Badge><time className="text-xs text-muted-foreground" dateTime={activity.created_at}>{entityDate(activity.created_at)}</time></div>
          <p className="break-words whitespace-pre-wrap">{activity.body || "Kein Text"}</p>
        </li>;
      })}
    </ol>}
  </section>;
}
