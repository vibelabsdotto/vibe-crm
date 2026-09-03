import { cookies } from "next/headers";
import { redirect } from "next/navigation";
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
    <div className="page">
      <div className="page-head">
        <h1>Produkte</h1>
      </div>
      {error ? (
        <div className="error-box">
          <strong>Fehler beim Laden</strong>
          <p>{error}</p>
        </div>
      ) : (
        <ProductsManager initialProducts={products} />
      )}
    </div>
  );
}
