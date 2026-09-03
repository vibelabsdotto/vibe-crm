import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { ConfigService } from '@nestjs/config';
import { databaseSchema } from '../database/schema';

/**
 * Better Auth core instance (contract §3).
 *
 * Mounted as an Express middleware under `/api/auth/*` in `main.ts`
 * (BEFORE the Nest router — the API guard must not apply there):
 * `app.use('/api/auth', toNodeHandler(auth))`.
 *
 * Email + password login; Google OAuth is enabled only when BOTH
 * GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set. No email
 * verification (personal tool) — global rate limiting covers abuse.
 */
export function createAuth(
  db: BetterSQLite3Database<typeof databaseSchema>,
  config: ConfigService,
) {
  const corsOrigin = config.get<string>('CORS_ORIGIN');
  const googleClientId = config.get<string>('GOOGLE_CLIENT_ID');
  const googleClientSecret = config.get<string>('GOOGLE_CLIENT_SECRET');

  // Cookie-Domain: In Prod liegen Web (crm.vibelabs.to) und API
  // (api-crm.vibelabs.to) auf verschiedenen Subdomains. Damit der
  // OAuth-Callback auf der API die Session für die Web-App lesbar macht,
  // muessen die Cookies auf der Parent-Domain .vibelabs.to landen.
  // Lokal (localhost) darf keine Domain gesetzt werden — Chrome lehnt
  // Domain-Attribute fuer Hostnames ohne Dot ab.
  const webUrl = config.get<string>('WEB_BASE_URL') ?? '';
  const isProd = webUrl.includes('https://');
  const cookieDomain = (() => {
    if (!isProd) return undefined;
    try {
      const host = new URL(webUrl).hostname; // crm.vibelabs.to
      const parts = host.split('.');
      return '.' + parts.slice(-2).join('.'); // .vibelabs.to
    } catch {
      return undefined;
    }
  })();

  return betterAuth({
    secret: config.get<string>('BETTER_AUTH_SECRET') ?? undefined,
    ...(cookieDomain
      ? {
          advanced: {
            defaultCookieAttributes: { domain: cookieDomain },
            cookiePrefix: 'vibe-crm',
          },
        }
      : {}),
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: {
        user: databaseSchema.user,
        session: databaseSchema.session,
        account: databaseSchema.account,
        verification: databaseSchema.verification,
      },
    }),
    emailAndPassword: { enabled: true },
    ...(googleClientId && googleClientSecret
      ? {
          socialProviders: {
            google: {
              clientId: googleClientId,
              clientSecret: googleClientSecret,
            },
          },
        }
      : {}),
    trustedOrigins: corsOrigin
      ? corsOrigin
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean)
      : [],
  });
}

export type Auth = ReturnType<typeof createAuth>;
