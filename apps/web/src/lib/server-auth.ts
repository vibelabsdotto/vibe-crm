import { cookies } from "next/headers";
import { serverApiFetch } from "./api";

export type ServerUser = {
  id: string;
  email: string;
  name?: string;
};

type GetSessionResponse = {
  user?: Partial<ServerUser> | null;
} | null;

/**
 * Better-Auth-Session serverseitig prüfen (Contract §5):
 * GET /api/auth/get-session mit durchgereichtem Cookie, cache: 'no-store'.
 * Liefert den User oder null (nicht eingeloggt / Session ungültig / API down).
 */
export async function getSession(): Promise<{ user: ServerUser } | null> {
  const jar = await cookies();
  try {
    const data = await serverApiFetch<GetSessionResponse>("/api/auth/get-session", jar.toString());
    const user = data?.user;
    if (!user || !user.id || !user.email) return null;
    return { user: { id: user.id, email: user.email, name: user.name } };
  } catch {
    // API nicht erreichbar → wie "nicht eingeloggt" behandeln;
    // die aufrufende Seite zeigt ihren eigenen Fehler-/Login-Pfad.
    return null;
  }
}
