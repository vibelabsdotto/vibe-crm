import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { apiFetch, ApiError } from "@/lib/api";
import { getSession } from "@/lib/server-auth";
import type { ApiTokenMeta } from "@/lib/types";
import { TokensManager } from "./tokens-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "API-Tokens" };

export default async function TokensPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in?redirect=%2Fsettings%2Ftokens");

  let tokens: ApiTokenMeta[] = [];
  let error: string | null = null;

  try {
    const jar = await cookies();
    const data = await apiFetch<{ tokens: ApiTokenMeta[] }>("/v1/tokens", {
      cookie: jar.toString(),
    });
    tokens = data.tokens;
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
        <h1 className="text-2xl font-semibold tracking-tight">API-Tokens</h1>
        <p className="text-sm text-muted-foreground">Verwalte den Zugriff für die CLI und deine Integrationen.</p>
      </header>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Tokens konnten nicht geladen werden</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <TokensManager initialTokens={tokens} />
      )}
    </div>
  );
}
