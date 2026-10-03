import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
    <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">Einstellungen</p>
        <h1 className="text-2xl font-semibold tracking-tight">Custom Fields</h1>
        <p className="text-sm text-muted-foreground">Ergänze eigene Felder für Kontakte, Firmen und Deals.</p>
      </header>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Felder konnten nicht geladen werden</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <PropertiesManager defs={defs} />
      )}
    </div>
  );
}
