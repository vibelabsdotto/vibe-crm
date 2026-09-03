import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { getSession } from "@/lib/server-auth";
import { asList, type Deal, type Stage, type Stats } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

function eur(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in?redirect=%2F");

  let stats: Stats | null = null;
  let stages: Stage[] = [];
  let deals: Deal[] = [];
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
  } catch (e) {
    error =
      e instanceof ApiError
        ? `API-Fehler ${e.status}: ${e.code}`
        : "API nicht erreichbar. Läuft apps/api auf Port 3100?";
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
    <div className="page">
      <div className="page-head">
        <h1>Dashboard</h1>
        <div className="row">
          <Link href="/contacts" className="btn">
            Kontakt anlegen
          </Link>
          <Link href="/deals" className="btn btn-accent">
            Deal anlegen
          </Link>
        </div>
      </div>

      {error || !stats ? (
        <div className="error-box">
          <strong>Fehler beim Laden</strong>
          <p>{error ?? "Keine Daten."}</p>
        </div>
      ) : (
        <div className="stack">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="stat-card">
              <div className="stat-value">{stats.contacts}</div>
              <div className="stat-label">Kontakte</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.companies}</div>
              <div className="stat-label">Firmen</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{openDeals.length}</div>
              <div className="stat-label">Offene Deals</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{eur(stats.dealValue)}</div>
              <div className="stat-label">Deal-Volumen</div>
            </div>
          </div>

          <div className="card">
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Pipeline</h2>
              <Link href="/deals" className="btn btn-sm">
                Zum Board
              </Link>
            </div>
            {stages.length === 0 ? (
              <p className="muted small">Keine Stages vorhanden.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Stage</th>
                      <th scope="col" className="hidden sm:table-cell">
                        Deals
                      </th>
                      <th scope="col">Volumen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stages.map((s) => {
                      const bucket = byStage.get(s.key);
                      return (
                        <tr key={s.key}>
                          <td>
                            <Link href="/deals" prefetch={false}>
                              {s.label}
                            </Link>{" "}
                            <span className="badge-dim badge">{bucket?.deals.length ?? 0}</span>
                          </td>
                          <td className="hidden sm:table-cell muted">{bucket?.deals.length ?? 0}</td>
                          <td>{eur(bucket?.value ?? 0)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
