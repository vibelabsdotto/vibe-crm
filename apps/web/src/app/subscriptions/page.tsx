import { cookies } from "next/headers";
import { redirect } from "next/navigation";
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
    <div className="page" style={{ maxWidth: 1280 }}>
      <div className="page-head">
        <h1>Abos</h1>
      </div>
      {error || !summary ? (
        <div className="error-box">
          <strong>Fehler beim Laden</strong>
          <p>{error ?? "Keine Daten."}</p>
        </div>
      ) : (
        <div className="stack">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <div className="stat-card">
              <div className="stat-value">{eur(summary.mrr)}</div>
              <div className="stat-label">MRR</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{summary.active}</div>
              <div className="stat-label">Aktiv</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{summary.trial}</div>
              <div className="stat-label">Trial</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{summary.paused}</div>
              <div className="stat-label">Pausiert</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{summary.total}</div>
              <div className="stat-label">Gesamt</div>
            </div>
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
