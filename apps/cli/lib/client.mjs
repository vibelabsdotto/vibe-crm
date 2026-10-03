/** Zero-dependency HTTP client. No redirect, retry or credential forwarding. */
import { getApiKey, resolveInstance } from "./config.mjs";
import { ApiError, UsageError, redactSecrets } from "./errors.mjs";
import { validateInstance, validateToken } from "./instance.mjs";
export { ApiError, UsageError, validateInstance };

let lastInstanceUrl = "";
export function lastConnectedInstance() { return lastInstanceUrl; }
export function assertInstance(flag, context) {
  const url = resolveInstance(flag, context);
  if (!url) throw new UsageError("No instance configured. Use --instance <url>, --context <name>, CRM_INSTANCE, or context add/use --scope local|global.");
  return validateInstance(url);
}
export function connect(flag, context) {
  const url = assertInstance(flag, context);
  lastInstanceUrl = url;
  const key = getApiKey(url);
  if (!key) throw new UsageError(`No API token stored for ${url}. Use auth login --instance <url> --token-stdin, with a token from web /settings/tokens.`);
  return { url, key };
}

export async function request(instance, { method = "GET", path = "/", query, body, token, timeoutMs = 15_000 } = {}) {
  const base = validateInstance(instance).replace(/\/+$/, "");
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || /[\r\n#]/.test(path)) throw new UsageError("API path must be an absolute path on the selected instance.");
  if (token !== undefined) validateToken(token);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2 ** 31 - 1) throw new UsageError("timeoutMs must be a positive safe timer interval.");
  let target = `${base}${path}`;
  if (new URL(target).origin !== new URL(base).origin) throw new UsageError("API request must stay on the selected instance.");
  if (query) {
    const qs = new URLSearchParams();
    for (const [name, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") qs.set(name, String(value));
    }
    if (qs.size) target += `${target.includes("?") ? "&" : "?"}${qs}`;
  }
  lastInstanceUrl = instance;
  let res;
  let text;
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    res = await fetch(target, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token !== undefined ? { Authorization: `Bearer ${token}` } : {})
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      redirect: "manual",
      signal
    });
    if (res.status >= 300 && res.status < 400) {
      await res.body?.cancel();
      throw new ApiError("API redirect refused. Configure the final instance URL explicitly; no credentials were forwarded.", res.status, { error: "redirect_refused" });
    }
    text = await res.text();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(`Cannot reach ${base}: ${signal.aborted ? "request timed out" : "connection or response failed"}`, 0, null);
  }
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch {
      if (res.ok) throw new ApiError("API returned invalid JSON.", res.status, { error: "invalid_response" });
      data = redactSecrets(text.slice(0, 500));
    }
  }
  if (!res.ok) {
    const detail = data && typeof data === "object" && typeof data.error === "string" ? data.error : typeof data === "string" ? data : `HTTP ${res.status}`;
    const extra = Array.isArray(data?.valid_fields) ? ` (valid: ${data.valid_fields.join(", ")})` : "";
    throw new ApiError(redactSecrets(`${detail}${extra}`), res.status, data);
  }
  return text ? data : { ok: true };
}

/** Public readiness endpoint. A 200 HTML page or liveness-only object is not health. */
export async function health(url) {
  validateInstance(url);
  try {
    const data = await request(url, { path: "/health", timeoutMs: 10_000 });
    if (data?.ok !== true || data?.db !== true) return { ok: false, status: 200, body: { error: "unhealthy" } };
    return { ok: true, status: 200, body: data };
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, status: error.status, body: error.body ?? error.message };
    throw error;
  }
}
