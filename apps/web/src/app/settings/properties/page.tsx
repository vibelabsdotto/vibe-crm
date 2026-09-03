import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { getSession } from "@/lib/server-auth";
import { asList, type CustomFieldDef } from "@/lib/types";
import { PropertiesManager } from "./properties-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Custom Fields" };

export default async function PropertiesPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in?redirect=%2Fsettings%2Fproperties");

  let defs: CustomFieldDef[] = [];
  let error: string | null = null;

  try {
    const jar = await cookies();
    const [contacts, companies, deals] = await Promise.all([
      apiFetch<unknown>("/v1/custom-fields?entity=contact", { cookie: jar.toString() }),
      apiFetch<unknown>("/v1/custom-fields?entity=company", { cookie: jar.toString() }),
      apiFetch<unknown>("/v1/custom-fields?entity=deal", { cookie: jar.toString() }),
    ]);
    defs = [
      ...asList<CustomFieldDef>(contacts, "defs"),
      ...asList<CustomFieldDef>(companies, "defs"),
      ...asList<CustomFieldDef>(deals, "defs"),
    ];
  } catch (e) {
    error =
      e instanceof ApiError
        ? `API-Fehler ${e.status}: ${e.code}`
        : "API nicht erreichbar. Läuft apps/api auf Port 3100?";
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Custom Fields</h1>
      </div>
      {error ? (
        <div className="error-box">
          <strong>Fehler beim Laden</strong>
          <p>{error}</p>
        </div>
      ) : (
        <PropertiesManager defs={defs} />
      )}
    </div>
  );
}
