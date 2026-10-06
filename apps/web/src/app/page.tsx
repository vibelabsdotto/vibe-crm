import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, ApiError } from "@/lib/api";
import { getSession } from "@/lib/server-auth";
import { asList, type Deal, type Stage, type Stats, type SubscriptionSummary } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

function eur(value: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in?redirect=%2F");

  let stats: Stats | null = null;
  let stages: Stage[] = [];
  let deals: Deal[] = [];
  let summary: SubscriptionSummary | null = null;
  let error: string | null = null;

  try {
    const jar = await cookies();
    const cookie = jar.toString();
    const [statsData, stagesData, boardData] = await Promise.all([
      apiFetch<Stats>("/v1/stats", { cookie }),
      apiFetch<unknown>("/v1/stages", { cookie }),
      apiFetch<unknown>("/v1/deals/board", { cookie }),
    ]);
    stats = statsData;
    stages = asList<Stage>(stagesData, "stages").sort((a, b) => a.position - b.position);
    deals = asList<Deal>(boardData, "deals");
    try {
      summary = await apiFetch<SubscriptionSummary>("/v1/subscriptions/summary", { cookie });
    } catch {
      summary = null;
    }
  } catch (e) {
    error = e instanceof ApiError ? `API-Fehler ${e.status}: ${e.code}` : "API nicht erreichbar. Läuft apps/api auf Port 3100?";
  }

  const closedKeys = new Set(stages.filter((s) => s.is_won === 1 || s.is_lost === 1).map((s) => s.key));
  const openDeals = deals.filter((d) => !closedKeys.has(d.stage));
  const byStage = new Map(stages.map((s) => [s.key, { stage: s, deals: [] as Deal[], value: 0 }]));
  for (const d of deals) {
    const bucket = byStage.get(d.stage);
    if (bucket) {
      bucket.deals.push(d);
      bucket.value += d.value ?? 0;
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Kontakte, Pipeline und Abos im Überblick.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/contacts" className={buttonVariants({ variant: "outline" })}>Kontakt anlegen</Link>
          <Link href="/deals" className={buttonVariants()}>Deal anlegen</Link>
        </div>
      </header>

      {error || !stats ? (
        <Alert variant="destructive">
          <AlertTitle>Fehler beim Laden</AlertTitle>
          <AlertDescription>{error ?? "Keine Daten."}</AlertDescription>
        </Alert>
      ) : (
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-label="Kennzahlen" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              { label: "Kontakte", value: stats.contacts },
              { label: "Firmen", value: stats.companies },
              { label: "Offene Deals", value: openDeals.length },
              { label: "Deal-Volumen", value: eur(stats.dealValue) },
            ].map(({ label, value }) => (
              <Card key={label}>
                <CardHeader><CardDescription>{label}</CardDescription></CardHeader>
                <CardContent><p className="break-words text-2xl font-semibold tracking-tight tabular-nums">{value}</p></CardContent>
              </Card>
            ))}
            <Link href="/subscriptions" prefetch={false} className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <Card className="h-full">
                <CardHeader><CardDescription>MRR nach Währung</CardDescription></CardHeader>
                <CardContent>
                  {summary ? (
                    <div className="flex flex-col gap-1">
                      {(summary.byCurrency?.length ? summary.byCurrency : [{ currency: "EUR", mrr: summary.mrr }]).map((item) => (
                        <p key={item.currency} className="break-words text-2xl font-semibold tracking-tight tabular-nums">
                          {new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(item.mrr)} {item.currency}
                        </p>
                      ))}
                    </div>
                  ) : <p className="text-2xl font-semibold">—</p>}
                </CardContent>
              </Card>
            </Link>
          </section>

          <Card>
            <CardHeader>
              <CardTitle><h2>Pipeline</h2></CardTitle>
              <CardDescription>Deals und Volumen nach Stage.</CardDescription>
              <CardAction><Link href="/deals" className={buttonVariants({ variant: "outline", size: "sm" })}>Zur Pipeline</Link></CardAction>
            </CardHeader>
            <CardContent>
              {stages.length === 0 ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>Keine Stages vorhanden</EmptyTitle>
                    <EmptyDescription>Die Pipeline hat noch keine Stages.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Stage</TableHead>
                      <TableHead scope="col" className="hidden sm:table-cell">Deals</TableHead>
                      <TableHead scope="col" className="text-right">Volumen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stages.map((s) => {
                      const bucket = byStage.get(s.key);
                      return (
                        <TableRow key={s.key}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Link href="/deals" prefetch={false} className="rounded-sm font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">{s.label}</Link>
                              <Badge variant="secondary">{bucket?.deals.length ?? 0}</Badge>
                            </div>
                          </TableCell>
                          <TableCell className="hidden tabular-nums sm:table-cell">{bucket?.deals.length ?? 0}</TableCell>
                          <TableCell className="text-right tabular-nums">{eur(bucket?.value ?? 0)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
