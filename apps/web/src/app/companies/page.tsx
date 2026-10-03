import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { apiFetch, ApiError } from "@/lib/api";
import { getSession } from "@/lib/server-auth";
import { asList, type Company } from "@/lib/types";
import { CompaniesManager } from "./companies-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Firmen" };

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; industry?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in?redirect=%2Fcompanies");

  const params = await searchParams;
  const q = new URLSearchParams({ limit: "100" });
  if (params.search) q.set("search", params.search);
  if (params.industry) q.set("industry", params.industry);

  let companies: Company[] = [];
  let total = 0;
  let error: string | null = null;

  try {
    const jar = await cookies();
    const data = await apiFetch<{ companies: Company[]; total: number }>(
      `/v1/companies?${q.toString()}`,
      { cookie: jar.toString() },
    );
    companies = asList<Company>(data, "companies");
    total = typeof data.total === "number" ? data.total : companies.length;
  } catch (e) {
    error =
      e instanceof ApiError
        ? `API-Fehler ${e.status}: ${e.code}`
        : "API nicht erreichbar. Läuft apps/api auf Port 3100?";
  }

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-6 p-4 md:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Firmen</h1>
        <p className="text-sm text-muted-foreground">Firmen, Branchen und Kontaktdaten an einem Ort verwalten.</p>
      </header>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Firmen konnten nicht geladen werden</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <CompaniesManager key={q.toString()} companies={companies} total={total} />
      )}
    </div>
  );
}
