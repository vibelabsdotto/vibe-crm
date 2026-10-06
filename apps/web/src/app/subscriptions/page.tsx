import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch, ApiError } from "@/lib/api";
import { fetchAllCrm } from "@/lib/crm-lists";
import { getSession } from "@/lib/server-auth";
import type { Subscription, SubscriptionSummary } from "@/lib/types";
import { SubscriptionsTable } from "./subscriptions-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Abos und Einmalzahlungen" };

function money(value: number, currency: string): string {
  return `${new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ${currency}`;
}

export default async function SubscriptionsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/sign-in?redirect=%2Fsubscriptions");
  const params = await searchParams;
  const statusQuery = params.status ? `?status=${encodeURIComponent(params.status)}` : "";
  let subscriptions: Subscription[] = [];
  let summary: SubscriptionSummary | null = null;
  let error: string | null = null;
  try {
    const cookie = (await cookies()).toString();
    const fetcher = <T,>(path: string) => apiFetch<T>(path, { cookie });
    [subscriptions, summary] = await Promise.all([
      fetchAllCrm<Subscription>(`/v1/subscriptions${statusQuery}`, "subscriptions", fetcher),
      fetcher<SubscriptionSummary>("/v1/subscriptions/summary"),
    ]);
  } catch (cause) {
    error = cause instanceof ApiError ? `API-Fehler ${cause.status}: ${cause.code}` : "Die Daten konnten nicht vollständig geladen werden. Bitte lade die Seite erneut.";
  }

  return <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-6">
    <header className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-tight">Abos und Einmalzahlungen</h1>
      <p className="text-sm text-muted-foreground">Wiederkehrende Verträge und einmalige Beträge getrennt verwalten. MRR je Währung, ohne Umrechnung.</p>
    </header>
    {error || !summary ? <Alert variant="destructive"><AlertTitle>Verträge konnten nicht geladen werden</AlertTitle><AlertDescription>{error ?? "Keine Daten."}</AlertDescription></Alert> : <div className="flex min-w-0 flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5" aria-label="Kennzahlen aller Verträge und Einmalzahlungen">
        <Card className="min-w-0 sm:col-span-2 xl:col-span-1">
          <CardHeader><CardTitle>MRR je Währung</CardTitle><CardDescription>Aktiv und Testphase. Einmalzahlungen zählen mit 0.</CardDescription></CardHeader>
          <CardContent>
            {Array.isArray(summary.byCurrency) ? summary.byCurrency.length > 0 ? <ul className="flex flex-col gap-2" aria-label="Monatlich wiederkehrender Umsatz je Währung">{summary.byCurrency.map((entry) => <li key={entry.currency} className="break-words text-xl font-semibold tabular-nums">{money(entry.mrr, entry.currency)}</li>)}</ul> : <p className="text-sm text-muted-foreground">Kein MRR vorhanden.</p> : <div className="flex flex-col gap-2"><p className="break-words text-xl font-semibold tabular-nums">{money(summary.mrr, "EUR")}</p><p className="text-sm text-muted-foreground">Nur EUR-MRR. Die Währungsaufteilung ist nicht verfügbar.</p></div>}
          </CardContent>
        </Card>
        <Card className="min-w-0"><CardHeader><CardTitle>Aktiv</CardTitle><CardDescription>Alle Arten</CardDescription></CardHeader><CardContent><p className="text-2xl font-semibold tabular-nums">{summary.active}</p></CardContent></Card>
        <Card className="min-w-0"><CardHeader><CardTitle>Testphase</CardTitle><CardDescription>Alle Arten</CardDescription></CardHeader><CardContent><p className="text-2xl font-semibold tabular-nums">{summary.trial}</p></CardContent></Card>
        <Card className="min-w-0"><CardHeader><CardTitle>Pausiert</CardTitle><CardDescription>Alle Arten</CardDescription></CardHeader><CardContent><p className="text-2xl font-semibold tabular-nums">{summary.paused}</p></CardContent></Card>
        <Card className="min-w-0"><CardHeader><CardTitle>Gesamt</CardTitle><CardDescription>Verträge und Einmalzahlungen</CardDescription></CardHeader><CardContent><p className="text-2xl font-semibold tabular-nums">{summary.total}</p></CardContent></Card>
      </div>
      <p className="text-sm text-muted-foreground">Die Kennzahlen zeigen den gesamten Bestand. Die Filter darunter betreffen nur die Übersicht. Beträge verschiedener Währungen werden nicht addiert.</p>
      <SubscriptionsTable subscriptions={subscriptions} initialStatus={params.status ?? ""} />
    </div>}
  </div>;
}
