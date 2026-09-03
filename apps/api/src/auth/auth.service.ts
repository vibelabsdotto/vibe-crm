import {
  Injectable,
  Inject,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { DatabaseService } from '../database/database.service';
import { apiTokens, session as sessionTable, user } from '../database/schema';
import { AuthProviderToken } from './auth.constants';
import type { AuthContext } from './auth.types';
import type { Auth } from './auth';

export const API_TOKEN_PATTERN = /^vc_[0-9a-f]{48}$/;

/** Better Auth's default session cookie (split-cookie suffix shares the name). */
export const SESSION_COOKIE = 'better-auth.session_token';

export interface CreatedToken {
  id: string;
  token: string;
  prefix: string;
}

export type TokenMeta = Pick<
  ApiTokenRow,
  'id' | 'name' | 'prefix' | 'createdAt' | 'lastUsedAt'
>;

type ApiTokenRow = typeof apiTokens.$inferSelect;

/** `last_used_at` is refreshed at most once per minute (contract §3). */
const LAST_USED_THROTTLE_MS = 60_000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  /** In-memory throttle cache for token last_used_at updates. */
  private readonly lastUsedCache = new Map<string, number>();

  constructor(
    private readonly database: DatabaseService,
    config: ConfigService,
    @Inject(AuthProviderToken) auth?: Auth,
  ) {
    // Fail fast on a missing/placeholder secret instead of silently
    // starting with unsigned sessions (contract §3).
    const secret = config.get<string>('BETTER_AUTH_SECRET');
    if (!secret || secret.startsWith('replace-me')) {
      throw new Error(
        'BETTER_AUTH_SECRET must be set to a real secret (32+ bytes) — see .env.example',
      );
    }
    if (auth) this.auth = auth;
  }

  private auth?: Auth;

  /**
   * Verification order per contract §3:
   * 1. Better-Auth session cookie (`auth.api.getSession`, join fallback),
   * 2. API token (`Authorization: Bearer *** Single-workspace: the
   * identity is just { email, via } — no ownership.
   * Returns null when neither mechanism authenticates.
   */
  async authenticate(request: Request): Promise<AuthContext | null> {
    const sessionContext = await this.authenticateSession(request.headers);
    if (sessionContext) return sessionContext;

    const header = request.header('authorization');
    if (!header?.startsWith('Bearer ')) return null;
    return this.authenticateApiToken(header.slice(7).trim());
  }

  /** Attaches the mounted Better Auth handler (wired in app.module.ts). */
  attachAuth(auth: Auth): void {
    this.auth = auth;
  }

  private async authenticateSession(
    headers: Request['headers'],
  ): Promise<AuthContext | null> {
    try {
      const result = await this.auth?.api.getSession({
        headers: toPlainHeaders(headers),
      });
      if (result?.user?.id) {
        return {
          email: result.user.email.toLowerCase(),
          via: 'session',
        };
      }
    } catch (error) {
      this.logger.debug(`session lookup failed: ${stringifyError(error)}`);
    }
    // Fallback: direct session↔user join over the same tables Better Auth
    // uses via the drizzle adapter.
    return this.authenticateSessionByJoin(headers);
  }

  private authenticateSessionByJoin(
    headers: Request['headers'],
  ): AuthContext | null {
    let cookies: Record<string, string>;
    try {
      cookies = parseCookieHeader(headers.cookie);
    } catch {
      return null;
    }
    // Split-cookie mode appends a hash suffix to the cookie name, and a
    // production cookiePrefix renames it — accept anything session-shaped.
    const candidates = Object.entries(cookies)
      .filter(([name, value]) => value !== '' && name.includes('session_token'))
      .map(([, value]) => value);
    if (candidates.length === 0) return null;

    for (const candidate of candidates) {
      const row = this.database.db
        .select({
          email: user.email,
          expiresAt: sessionTable.expiresAt,
        })
        .from(sessionTable)
        .innerJoin(user, eq(sessionTable.userId, user.id))
        .where(eq(sessionTable.token, hashToken(candidate)))
        .get();
      if (!row) continue;
      if (row.expiresAt.getTime() <= Date.now()) continue;
      return {
        email: row.email.toLowerCase(),
        via: 'session',
      };
    }
    return null;
  }

  private authenticateApiToken(token: string): AuthContext | null {
    if (!API_TOKEN_PATTERN.test(token)) return null;
    const row = this.database.db
      .select()
      .from(apiTokens)
      .where(eq(apiTokens.tokenHash, hashToken(token)))
      .get();
    if (!row) return null;

    const now = Date.now();
    const previous = this.lastUsedCache.get(row.id);
    if (
      previous === undefined ||
      now - previous >= LAST_USED_THROTTLE_MS ||
      (row.lastUsedAt !== null &&
        now - new Date(row.lastUsedAt).getTime() >= LAST_USED_THROTTLE_MS)
    ) {
      this.lastUsedCache.set(row.id, now);
      this.database.db
        .update(apiTokens)
        .set({ lastUsedAt: new Date(now).toISOString() })
        .where(eq(apiTokens.id, row.id))
        .run();
    }
    return { email: row.ownerEmail, via: 'token' };
  }

  createToken(ownerEmail: string, name: string): CreatedToken {
    const token = `vc_${randomBytes(24).toString('hex')}`;
    const row: typeof apiTokens.$inferInsert = {
      id: randomUUID(),
      ownerEmail,
      name,
      tokenHash: hashToken(token),
      prefix: token.slice(0, 12),
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
    };
    this.database.db.insert(apiTokens).values(row).run();
    return { id: row.id, token, prefix: row.prefix };
  }

  /** Single-workspace: lists all tokens, newest first, never hashes. */
  listTokens(): TokenMeta[] {
    return this.database.db
      .select({
        id: apiTokens.id,
        name: apiTokens.name,
        prefix: apiTokens.prefix,
        createdAt: apiTokens.createdAt,
        lastUsedAt: apiTokens.lastUsedAt,
      })
      .from(apiTokens)
      .all();
  }

  /** Returns false when the token does not exist. */
  revokeToken(id: string): boolean {
    const row = this.database.db
      .select({ id: apiTokens.id })
      .from(apiTokens)
      .where(eq(apiTokens.id, id))
      .get();
    if (!row) return false;
    this.database.db.delete(apiTokens).where(eq(apiTokens.id, id)).run();
    return true;
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Parses a Cookie header into name→value pairs; throws on malformed input. */
export function parseCookieHeader(header?: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of header?.split(';') ?? []) {
    const separator = part.indexOf('=');
    if (separator <= 0) {
      if (part.trim() !== '') throw new UnauthorizedException('unauthorized');
      continue;
    }
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    cookies[name] = value;
  }
  return cookies;
}

/**
 * Converts Express `IncomingHttpHeaders` (string | string[] | undefined)
 * into the plain record shape accepted by Better Auth's `HeadersInit`.
 */
function toPlainHeaders(headers: Request['headers']): Record<string, string> {
  const plain: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (Array.isArray(value)) plain[name] = value.join(', ');
    else if (typeof value === 'string') plain[name] = value;
  }
  return plain;
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
