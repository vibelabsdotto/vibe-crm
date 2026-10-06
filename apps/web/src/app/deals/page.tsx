import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { apiFetch, ApiError } from "@/lib/api";
import type { DealView } from "@/lib/deal-view";
import { getSession } from "@/lib/server-auth";
import { asList, type Deal, type Product, type Stage } from "@/lib/types";
import { DealsBoard } from "./deals-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Deals" };

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string | string[]; product?: string | string[] }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in?redirect=%2Fdeals");

  const params = await searchParams;

  let deals: Deal[] = [];
  let stages: Stage[] = [];
  let products: Product[] = [];
  let view: DealView | null = null;
  let error: string | null = null;

  try {
    const jar = await cookies();
    const cookie = jar.toString();
    const [boardData, stagesData, productsData, viewData] = await Promise.all([
      apiFetch<unknown>("/v1/deals/board", { cookie }),
      apiFetch<unknown>("/v1/stages", { cookie }),
      apiFetch<unknown>("/v1/products", { cookie }),
      apiFetch<DealView>("/v1/deals/view", { cookie }),
    ]);
    if (!viewData || !Array.isArray(viewData.fields) || !Array.isArray(viewData.columns) || !Array.isArray(viewData.default_columns) || !Array.isArray(viewData.warnings) || !viewData.visibility || !viewData.columns.includes("name")) {
      throw new Error("Die gemeinsame Deal-Ansicht wurde nicht vollständig geliefert.");
    }
    deals = asList<Deal>(boardData, "deals");
    stages = asList<Stage>(stagesData, "stages");
    products = asList<Product>(productsData, "products");
    view = viewData;
  } catch (e) {
    error =
      e instanceof ApiError
        ? `API-Fehler ${e.status}: ${e.code}`
        : "Deals oder die gemeinsame Ansicht konnten nicht vollständig geladen werden. Bitte lade die Seite erneut.";
  }

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Deals</h1>
        <p className="text-sm text-muted-foreground">Deals nach Stage. Spalten und Feldregeln gelten für den gemeinsamen Workspace.</p>
      </header>
      {error || !view ? (
        <Alert variant="destructive">
          <AlertTitle>Deals konnten nicht geladen werden</AlertTitle>
          <AlertDescription>{error ?? "Die gemeinsame Deal-Ansicht ist nicht verfügbar."}</AlertDescription>
        </Alert>
      ) : (
        <DealsBoard
          deals={deals}
          stages={stages}
          products={products}
          initialView={view}
          initialStage={typeof params.stage === "string" ? params.stage : ""}
          initialProduct={typeof params.product === "string" ? params.product : ""}
        />
      )}
    </div>
  );
}
