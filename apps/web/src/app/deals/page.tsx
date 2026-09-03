import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { getSession } from "@/lib/server-auth";
import { asList, type Company, type Contact, type Deal, type Product, type Stage } from "@/lib/types";
import { DealsBoard } from "./deals-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Deals" };

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; product?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in?redirect=%2Fdeals");

  const params = await searchParams;

  let deals: Deal[] = [];
  let stages: Stage[] = [];
  let contacts: Contact[] = [];
  let companies: Company[] = [];
  let products: Product[] = [];
  let error: string | null = null;

  try {
    const jar = await cookies();
    const cookie = jar.toString();
    const [boardData, stagesData, contactsData, companiesData, productsData] = await Promise.all([
      apiFetch<unknown>("/v1/deals/board", { cookie }),
      apiFetch<unknown>("/v1/stages", { cookie }),
      apiFetch<unknown>("/v1/contacts?limit=100", { cookie }),
      apiFetch<unknown>("/v1/companies?limit=100", { cookie }),
      apiFetch<unknown>("/v1/products", { cookie }),
    ]);
    deals = asList<Deal>(boardData, "deals");
    stages = asList<Stage>(stagesData, "stages");
    contacts = asList<Contact>(contactsData, "contacts");
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
        <h1>Deals</h1>
      </div>
      {error ? (
        <div className="error-box">
          <strong>Fehler beim Laden</strong>
          <p>{error}</p>
        </div>
      ) : (
        <DealsBoard
          deals={deals}
          stages={stages}
          contacts={contacts}
          companies={companies}
          products={products}
          initialStage={params.stage ?? ""}
          initialProduct={params.product ?? ""}
        />
      )}
    </div>
  );
}
