import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { getSession } from "@/lib/server-auth";
import { asList, type Company, type Contact } from "@/lib/types";
import { ContactsManager } from "./contacts-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kontakte" };

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in?redirect=%2Fcontacts");

  const params = await searchParams;
  const q = new URLSearchParams({ limit: "100" });
  if (params.search) q.set("search", params.search);
  if (params.status) q.set("status", params.status);

  let contacts: Contact[] = [];
  let companies: Company[] = [];
  let total = 0;
  let error: string | null = null;

  try {
    const jar = await cookies();
    const cookie = jar.toString();
    const [contactsData, companiesData] = await Promise.all([
      apiFetch<{ contacts: Contact[]; total: number }>(`/v1/contacts?${q.toString()}`, { cookie }),
      apiFetch<unknown>("/v1/companies?limit=100", { cookie }),
    ]);
    contacts = asList<Contact>(contactsData, "contacts");
    total = typeof contactsData.total === "number" ? contactsData.total : contacts.length;
    companies = asList<Company>(companiesData, "companies");
  } catch (e) {
    error =
      e instanceof ApiError
        ? `API-Fehler ${e.status}: ${e.code}`
        : "API nicht erreichbar. Läuft apps/api auf Port 3100?";
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Kontakte</h1>
      </div>
      {error ? (
        <div className="error-box">
          <strong>Fehler beim Laden</strong>
          <p>{error}</p>
        </div>
      ) : (
        <ContactsManager contacts={contacts} companies={companies} total={total} />
      )}
    </div>
  );
}
