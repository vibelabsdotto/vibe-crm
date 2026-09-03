import { ConsoleLogger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { toNodeHandler } from 'better-auth/node';
import { AppModule } from './app.module';
import { AuthProviderToken } from './auth/auth.constants';
import type { Auth } from './auth/auth';
import { JsonExceptionFilter } from './http/json-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: new ConsoleLogger({ json: true }),
  });

  // Better Auth under /api/auth/* — mounted before the Nest router, so the
  // API guard never applies there (contract §3). Sign-up/sign-in happen via
  // POST /api/auth/sign-up/email and /api/auth/sign-in/email.
  // WICHTIG: CORS muss VOR diesem Mount aktiviert werden — Express arbeitet
  // die Middleware in Registrierungsreihenfolge ab. toNodeHandler terminiert
  // OPTIONS-Preflights selbst (404 ohne CORS-Header), wenn cors nicht zuerst
  // registriert ist → Browser blockt Cross-Origin-Requests auf /api/auth/*.
  const config = app.get(ConfigService);
  const corsOrigin = config.get<string>('CORS_ORIGIN');
  if (corsOrigin) {
    app.enableCors({
      origin: corsOrigin
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type'],
      credentials: true,
    });
  }
  const auth = app.get<Auth>(AuthProviderToken);
  app.use('/api/auth', toNodeHandler(auth));

  // Ops hardening: no framework fingerprint, security headers.
  // CSP is disabled — this is a pure JSON API; browsers only
  // ever talk to it via fetch/XHR, so a document CSP adds nothing.
  app.set('x-powered-by', false);
  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );

  app.useBodyParser('json', { limit: '3mb' });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new JsonExceptionFilter());

  app.enableShutdownHooks();
  await app.listen(config.get<number>('PORT') ?? 3100, '0.0.0.0');
}

void bootstrap();
