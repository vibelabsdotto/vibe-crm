import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { apiFetch, ApiError } from "@/lib/api";
import { getSession } from "@/lib/server-auth";
import { asList, type Product } from "@/lib/types";
import { ProductsManager } from "./products-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Produkte" };

export default async function ProductsPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in?redirect=%2Fsettings%2Fproducts");

  let products: Product[] = [];
  let error: string | null = null;

  try {
    const jar = await cookies();
    const data = await apiFetch<unknown>("/v1/products", {
      cookie: jar.toString(),
    });
    products = asList<Product>(data, "products");
  } catch (e) {
    error =
      e instanceof ApiError
        ? `API-Fehler ${e.status}: ${e.code}`
        : "API nicht erreichbar. Läuft apps/api auf Port 3100?";
  }

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">Einstellungen</p>
        <h1 className="text-2xl font-semibold tracking-tight">Produkte</h1>
        <p className="text-sm text-muted-foreground">Verwalte den Produktkatalog für deine Deals und Abos.</p>
      </header>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Produkte konnten nicht geladen werden</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <ProductsManager initialProducts={products} />
      )}
    </div>
  );
}
