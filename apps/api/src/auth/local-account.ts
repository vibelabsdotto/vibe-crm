import type { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { isIP } from 'node:net';

// A reserved identity, never an email lookup or an existing signup account.
export const LOCAL_ACCOUNT_ID = 'vibe-crm-local-development';
export const LOCAL_ACCOUNT_EMAIL = 'local@vibe-crm.invalid';

export interface LocalAccountUser {
  id: string;
  email: string;
  name: string;
  local: true;
}

export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  if (isIP(address) === 4) return address.startsWith('127.');
  if (isIP(address) !== 6) return false;
  const host = new URL(`http://[${address}]`).hostname;
  return (
    host === '[::1]' || /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/.test(host)
  );
}

/** Inspect the literal authority before URL parsing can normalize IPv4 aliases. */
export function isLoopbackHost(host: string | undefined): boolean {
  if (!host || /\s/.test(host)) return false;
  const match = /^(localhost|[^:[\]\s]+|\[[^\]\s]+\])(?::([0-9]{1,5}))?$/.exec(
    host,
  );
  if (!match) return false;
  if (match[2] && (Number(match[2]) < 1 || Number(match[2]) > 65535)) {
    return false;
  }
  const address = match[1].startsWith('[') ? match[1].slice(1, -1) : match[1];
  if (match[1].startsWith('[') && isIP(address) !== 6) return false;
  return address === 'localhost' || isLoopbackAddress(address);
}

export function localWebAccountOrigin(config: ConfigService): string | null {
  if (config.get<string>('LOCAL_WEB_ACCOUNT') !== 'true') return null;
  const configured = config.get<string>('WEB_BASE_URL');
  const match = configured && /^https?:\/\/([^/?#]+)\/?$/.exec(configured);
  if (
    config.get<string>('NODE_ENV') !== 'development' ||
    !match ||
    match[0] !== configured ||
    !isLoopbackHost(match[1])
  ) {
    throw new Error(
      'LOCAL_WEB_ACCOUNT requires NODE_ENV=development and a literal loopback WEB_BASE_URL origin',
    );
  }
  return new URL(configured).origin;
}

export function isLocalAccountRequest(
  request: Request,
  origin: string | null,
): boolean {
  if (!origin) return false;
  // Local auto-auth is for direct connections, not proxy/forwarded requests.
  if (
    Object.keys(request.headers).some((name) => {
      const lower = name.toLowerCase();
      return lower === 'forwarded' || lower.startsWith('x-forwarded-');
    })
  )
    return false;
  // Never use req.ip, req.hostname or forwarded headers for these checks.
  if (!isLoopbackAddress(request.socket.remoteAddress)) return false;
  if (!isLoopbackHost(request.headers.host)) return false;
  return (
    request.headers.origin === undefined || request.headers.origin === origin
  );
}
