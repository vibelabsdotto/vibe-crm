import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { apiFetch, ApiError } from "@/lib/api";
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
  let error: string | null = null;

  try {
    const jar = await cookies();
    const cookie = jar.toString();
    const [boardData, stagesData, productsData] = await Promise.all([
      apiFetch<unknown>("/v1/deals/board", { cookie }),
      apiFetch<unknown>("/v1/stages", { cookie }),
      apiFetch<unknown>("/v1/products", { cookie }),
    ]);
    deals = asList<Deal>(boardData, "deals");
    stages = asList<Stage>(stagesData, "stages");
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
        <h1 className="text-2xl font-semibold tracking-tight">Deals</h1>
        <p className="text-sm text-muted-foreground">Deals nach Stage, mit Firma, Kontakt, Produkt und Wert auf einen Blick.</p>
      </header>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Deals konnten nicht geladen werden</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <DealsBoard
          deals={deals}
          stages={stages}
          products={products}
          initialStage={typeof params.stage === "string" ? params.stage : ""}
          initialProduct={typeof params.product === "string" ? params.product : ""}
        />
      )}
    </div>
  );
}
