import { cookies, headers } from "next/headers";
import { isIP } from "node:net";
import { serverApiFetch } from "./api";
import { apiUrl, webUrl } from "./env";

export type ServerUser = {
  id: string;
  email: string;
  name?: string;
  local?: boolean;
};

type GetSessionResponse = {
  user?: Partial<ServerUser> | null;
} | null;

function isLoopbackAddress(address: string): boolean {
  if (isIP(address) === 4) return address.startsWith("127.");
  if (isIP(address) !== 6) return false;
  const normalized = new URL(`http://[${address}]`).hostname;
  return (
    normalized === "[::1]" ||
    /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/.test(normalized)
  );
}

function isLoopbackHost(host: string | null): boolean {
  if (!host || /\s/.test(host)) return false;
  const match = /^(localhost|[^:[\]\s]+|\[[^\]\s]+\])(?::([0-9]{1,5}))?$/.exec(
    host,
  );
  if (!match) return false;
  if (match[2] && (Number(match[2]) < 1 || Number(match[2]) > 65535))
    return false;
  const address = match[1].startsWith("[") ? match[1].slice(1, -1) : match[1];
  if (match[1].startsWith("[") && isIP(address) !== 6) return false;
  return address === "localhost" || isLoopbackAddress(address);
}

function loopbackOrigin(value: string): string | null {
  // Validate the literal authority before URL can turn 127.1/decimal/hex into IPv4.
  const match = /^https?:\/\/([^/?#]+)\/?$/.exec(value);
  return match && match[0] === value && isLoopbackHost(match[1])
    ? new URL(value).origin
    : null;
}

function localAccountConfig(): { apiOrigin: string; webOrigin: string } | null {
  // This is a server-only runtime opt-in, never NEXT_PUBLIC_LOCAL_WEB_ACCOUNT.
  if (process.env.LOCAL_WEB_ACCOUNT !== "true") return null;
  const apiOrigin = loopbackOrigin(apiUrl());
  const webOrigin = loopbackOrigin(webUrl());
  if (process.env.NODE_ENV !== "development" || !apiOrigin || !webOrigin) {
    throw new Error(
      "LOCAL_WEB_ACCOUNT requires development and literal loopback API/Web origins",
    );
  }
  return { apiOrigin, webOrigin };
}

function hasUnsafeForwarding(incoming: Headers, webOrigin: string): boolean {
  const web = new URL(webOrigin);
  // Next adds these four headers itself, so accept only consistent local values.
  for (const [name, value] of incoming.entries()) {
    if (name === "forwarded") return true;
    if (!name.startsWith("x-forwarded-")) continue;
    switch (name) {
      case "x-forwarded-host":
        if (!isLoopbackHost(value) || value !== incoming.get("host"))
          return true;
        break;
      case "x-forwarded-for":
        if (!isLoopbackAddress(value)) return true;
        break;
      case "x-forwarded-proto":
        if (`${value}:` !== web.protocol) return true;
        break;
      case "x-forwarded-port":
        if (value !== (web.port || (web.protocol === "https:" ? "443" : "80")))
          return true;
        break;
      default:
        return true;
    }
  }
  return false;
}

/** Real Better Auth sessions keep precedence; the local account has no browser cookie. */
export async function getSession(): Promise<{ user: ServerUser } | null> {
  const local = localAccountConfig();
  const jar = await cookies();
  try {
    const data = await serverApiFetch<GetSessionResponse>(
      "/api/auth/get-session",
      jar.toString(),
    );
    const user = data?.user;
    if (
      user &&
      typeof user.id === "string" &&
      user.id &&
      typeof user.email === "string" &&
      user.email
    ) {
      return { user: { id: user.id, email: user.email, name: user.name } };
    }
  } catch {
    // An unavailable/invalid real session must not fabricate an identity.
  }
  if (!local) return null;

  const incoming = await headers();
  // Do not trust x-forwarded-host/origin. A remote Host must not gain local SSR identity.
  if (!isLoopbackHost(incoming.get("host"))) return null;
  if (hasUnsafeForwarding(incoming, local.webOrigin)) return null;
  const origin = incoming.get("origin");
  if (origin !== null && origin !== local.webOrigin) return null;

  try {
    const response = await fetch(`${local.apiOrigin}/v1/local-account`, {
      cache: "no-store",
      redirect: "error",
      headers: { Origin: local.webOrigin },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as GetSessionResponse;
    const user = data?.user;
    if (
      !user ||
      user.local !== true ||
      typeof user.id !== "string" ||
      !user.id ||
      typeof user.email !== "string" ||
      !user.email ||
      typeof user.name !== "string"
    )
      return null;
    return {
      user: { id: user.id, email: user.email, name: user.name, local: true },
    };
  } catch {
    return null;
  }
}
