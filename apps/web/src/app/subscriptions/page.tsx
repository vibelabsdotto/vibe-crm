import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch, ApiError } from "@/lib/api";
import { getSession } from "@/lib/server-auth";
import {
  asList,
  type Company,
  type Product,
  type Subscription,
  type SubscriptionSummary,
} from "@/lib/types";
import { SubscriptionsTable } from "./subscriptions-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Abos" };

function eur(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value);
}

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in?redirect=%2Fsubscriptions");

  const params = await searchParams;
  const statusQ = params.status ? `?status=${encodeURIComponent(params.status)}&limit=100` : "?limit=100";

  let subscriptions: Subscription[] = [];
  let summary: SubscriptionSummary | null = null;
  let companies: Company[] = [];
  let products: Product[] = [];
  let error: string | null = null;

  try {
    const jar = await cookies();
    const cookie = jar.toString();
    const [subsData, summaryData, companiesData, productsData] = await Promise.all([
      apiFetch<unknown>(`/v1/subscriptions${statusQ}`, { cookie }),
      apiFetch<SubscriptionSummary>("/v1/subscriptions/summary", { cookie }),
      apiFetch<unknown>("/v1/companies?limit=100", { cookie }),
      apiFetch<unknown>("/v1/products", { cookie }),
    ]);
    subscriptions = asList<Subscription>(subsData, "subscriptions");
    summary = summaryData;
    companies = asList<Company>(companiesData, "companies");
    products = asList<Product>(productsData, "products");
  } catch (e) {
    error =
      e instanceof ApiError
        ? `API-Fehler ${e.status}: ${e.code}`
        : "API nicht erreichbar. Läuft apps/api auf Port 3100?";
  }

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Abos</h1>
        <p className="text-sm text-muted-foreground">Verwalte wiederkehrende Beträge, Laufzeiten und den Status deiner Abos.</p>
      </header>
      {error || !summary ? (
        <Alert variant="destructive">
          <AlertTitle>Abos konnten nicht geladen werden</AlertTitle>
          <AlertDescription>{error ?? "Keine Daten."}</AlertDescription>
        </Alert>
      ) : (
        <div className="flex min-w-0 flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5" aria-label="Abo-Kennzahlen">
            <Card className="min-w-0">
              <CardHeader><CardTitle>MRR</CardTitle></CardHeader>
              <CardContent><p className="break-words text-2xl font-semibold tabular-nums">{eur(summary.mrr)}</p></CardContent>
            </Card>
            <Card className="min-w-0">
              <CardHeader><CardTitle>Aktiv</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-semibold tabular-nums">{summary.active}</p></CardContent>
            </Card>
            <Card className="min-w-0">
              <CardHeader><CardTitle>Testphase</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-semibold tabular-nums">{summary.trial}</p></CardContent>
            </Card>
            <Card className="min-w-0">
              <CardHeader><CardTitle>Pausiert</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-semibold tabular-nums">{summary.paused}</p></CardContent>
            </Card>
            <Card className="min-w-0">
              <CardHeader><CardTitle>Gesamt</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-semibold tabular-nums">{summary.total}</p></CardContent>
            </Card>
          </div>

          <SubscriptionsTable
            subscriptions={subscriptions}
            companies={companies}
            products={products}
            initialStatus={params.status ?? ""}
          />
        </div>
      )}
    </div>
  );
}
