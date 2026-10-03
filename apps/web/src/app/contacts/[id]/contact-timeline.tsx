"use client";

import { Calendar, Mail, MessageSquare, MoveRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { Activity, ActivityType } from "@/lib/types";

const TYPE_ITEMS: { value: ActivityType; label: string }[] = [
  { value: "note", label: "Notiz" },
  { value: "email", label: "E-Mail" },
  { value: "meeting", label: "Meeting" },
  { value: "stage_change", label: "Stage-Wechsel" },
];
const TYPE_LABELS = Object.fromEntries(TYPE_ITEMS.map((item) => [item.value, item.label]));
const TYPE_ICONS = { note: MessageSquare, email: Mail, meeting: Calendar, stage_change: MoveRight };

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE");
}

export function ContactTimeline({ entityId, initialActivities }: { entityId: string; initialActivities: Activity[] }) {
  const api = useApi();
  const router = useRouter();
  const id = useId();
  const pending = useRef(false);
  const [activities, setActivities] = useState(initialActivities);
  const [type, setType] = useState<ActivityType>("note");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending.current || !body.trim()) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await api<Activity | { activity: Activity }>("/v1/activities", {
        method: "POST",
        body: { entity_type: "contact", entity_id: entityId, type, body: body.trim() },
      });
      const created = "activity" in response ? response.activity : response;
      if (!created || typeof created.id !== "string") throw new Error("Aktivität fehlt in der API-Antwort.");
      setActivities((list) => [created, ...list]);
      setBody("");
      toast.add({ type: "success", title: "Timeline-Eintrag gespeichert" });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? `Speichern fehlgeschlagen: ${err.code}` : "Speichern fehlgeschlagen");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle><h3>Neuer Eintrag</h3></CardTitle>
          <CardDescription>Eine Notiz, E-Mail, ein Meeting oder einen Stage-Wechsel dokumentieren.</CardDescription>
        </CardHeader>
        <form onSubmit={submit} aria-busy={busy} className="flex min-w-0 flex-col gap-4">
          <CardContent>
            <FieldGroup>
              <Field data-disabled={busy} className="sm:max-w-48">
                <FieldLabel htmlFor={`${id}-type`}>Aktivitätstyp</FieldLabel>
                <Select items={TYPE_ITEMS} value={type} disabled={busy} onValueChange={(value) => { if (value !== null) setType(value); }}>
                  <SelectTrigger id={`${id}-type`} className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectGroup>{TYPE_ITEMS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
                </Select>
              </Field>
              <Field data-disabled={busy}>
                <FieldLabel htmlFor={`${id}-body`}>Aktivitätstext</FieldLabel>
                <Textarea id={`${id}-body`} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Notiz, E-Mail-Protokoll, Meeting…" className="min-h-24" disabled={busy} required />
              </Field>
              {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            </FieldGroup>
          </CardContent>
          <CardFooter className="justify-end">
            <Button type="submit" disabled={busy || !body.trim()}>
              {busy && <Spinner data-icon="inline-start" />}
              {busy ? "Speichert…" : "Hinzufügen"}
            </Button>
          </CardFooter>
        </form>
      </Card>
      {activities.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><MessageSquare /></EmptyMedia>
            <EmptyTitle>Noch keine Einträge</EmptyTitle>
            <EmptyDescription>Der erste Eintrag erscheint nach dem Speichern in der Timeline.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="flex min-w-0 flex-col gap-3" aria-label="Aktivitäten">
          {activities.map((activity) => {
            const Icon = TYPE_ICONS[activity.type] ?? MessageSquare;
            return (
              <li key={activity.id}>
                <Card size="sm">
                  <CardHeader>
                    <CardTitle><Badge variant="secondary"><Icon data-icon="inline-start" />{TYPE_LABELS[activity.type] ?? activity.type}</Badge></CardTitle>
                    <CardDescription><time dateTime={activity.created_at}>{formatDate(activity.created_at)}</time></CardDescription>
                  </CardHeader>
                  <CardContent><p className="break-words whitespace-pre-wrap">{activity.body || "—"}</p></CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
