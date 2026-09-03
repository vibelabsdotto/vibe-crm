import { cookies } from "next/headers";
import { redirect } from "next/navigation";
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
    <div className="page">
      <div className="page-head">
        <h1>API-Tokens</h1>
      </div>
      {error ? (
        <div className="error-box">
          <strong>Fehler beim Laden</strong>
          <p>{error}</p>
        </div>
      ) : (
        <TokensManager initialTokens={tokens} />
      )}
    </div>
  );
}
