import { apiUrl } from "./env";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string) {
    super(`${status}: ${code}`);
    this.status = status;
    this.code = code;
  }
}

type ApiFetchOptions = {
  method?: string;
  token?: string | null;
  cookie?: string | null; // Server-seitig: Session-Cookie durchreichen
  body?: unknown;
};

/** Low-Level-Client gegen apps/api (Contract §4). Wirft ApiError bei !ok. */
export async function apiFetch<T>(path: string, opts: ApiFetchOptions = {}): Promise<T> {
  const { method = "GET", token, cookie, body } = opts;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${apiUrl()}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
    credentials: "include",
  });

  if (!res.ok) {
    let code = res.statusText || "error";
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) code = data.error;
    } catch {
      // kein JSON-Body — Statuscode reicht
    }
    throw new ApiError(res.status, code);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Server-seitiger API-Request mit durchgereichtem Session-Cookie
 * (Contract §5: Session-Cookie wird an API-Requests weitergegeben).
 */
export async function serverApiFetch<T>(
  path: string,
  cookie: string | null | undefined,
  opts: Pick<ApiFetchOptions, "method" | "body"> = {},
): Promise<T> {
  return apiFetch<T>(path, { ...opts, cookie: cookie ?? null });
}
