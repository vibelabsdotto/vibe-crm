/**
 * Minimal HTTP client for the Vibe CRM API (NestJS, prefix /v1).
 * Zero dependencies — global fetch + AbortSignal.timeout (Node >= 22).
 */
import { getApiKey, resolveInstance } from "./config.mjs";

export class UsageError extends Error {}

/** API error with an HTTP status (0 = unreachable). */
export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/** URL passed to the most recent connect() — used for honest connection errors. */
let lastInstanceUrl = "";
export function lastConnectedInstance() {
  return lastInstanceUrl;
}

export function assertInstance(flag) {
  const url = resolveInstance(flag);
  if (!url) {
    throw new UsageError(
      "No instance configured. Set one with:\n" +
        "  vibe-crm config set instance <url>   (persistent)\n" +
        "  CRM_INSTANCE=<url> vibe-crm <cmd>      (per invocation)\n" +
        "  vibe-crm <cmd> --instance <url>       (per invocation)"
    );
  }
  return url;
}

/** Resolve the instance + stored key. Throws UsageError when missing. */
export function connect(flag) {
  const url = assertInstance(flag);
  lastInstanceUrl = url;
  const key = getApiKey(url);
  if (!key) {
    throw new UsageError(
      `No API key stored for ${url}. Authenticate first:\n` +
        `  vibe-crm auth login --instance ${url} --token <vc_…>   (key from web /settings/tokens)`
    );
  }
  return { url, key };
}

/**
 * Raw request against the API.
 * @returns parsed JSON (or { ok:true } for empty bodies)
 * @throws ApiError with .status (0 when unreachable)
 */
export async function request(instance, { method = "GET", path = "/", query, body, token, timeoutMs = 15_000 } = {}) {
  const base = instance.replace(/\/+$/, "");
  let target = `${base}${path}`;
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === "") continue;
      qs.set(k, String(v));
    }
    const s = qs.toString();
    if (s) target += `?${s}`;
  }
  let res;
  try {
    res = await fetch(target, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (err) {
    throw new ApiError(`Cannot reach ${base}: ${err instanceof Error ? err.message : String(err)}`, 0, null);
  }
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text.slice(0, 500);
    }
  }
  if (!res.ok) {
    const detail = data && typeof data === "object" && data.error ? data.error : typeof data === "string" ? data : `HTTP ${res.status}`;
    const extra =
      data && typeof data === "object" && data.valid_fields ? ` (valid: ${(data.valid_fields ?? []).join(", ")})` : "";
    throw new ApiError(`${detail}${extra}`, res.status, data);
  }
  return data ?? { ok: true };
}

/** Instance health without any auth (public endpoint). */
export async function health(url) {
  try {
    const data = await request(url, { path: "/health", timeoutMs: 10_000 });
    return { ok: true, status: 200, body: data };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, status: err.status, body: err.body ?? err.message };
    return { ok: false, status: 0, body: err instanceof Error ? err.message : String(err) };
  }
}
