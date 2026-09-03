process.env.DATABASE_PATH = ':memory:';
process.env.BETTER_AUTH_SECRET = 'e2e-test-secret-with-at-least-32-bytes!!';
process.env.WEB_BASE_URL = 'http://localhost:3100';
process.env.CORS_ORIGIN = 'http://localhost:3000';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { toNodeHandler } from 'better-auth/node';
import { AppModule } from './app.module';
import { AuthProviderToken } from './auth/auth.constants';
import { JsonExceptionFilter } from './http/json-exception.filter';

const EMAIL = 'e2e@vibe-crm.test';
const PASSWORD = 'e2e-test-password-123';

describe('API (e2e)', () => {
  let app: NestExpressApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let cookie = '';

  async function signIn(): Promise<string> {
    const res = await request(server)
      .post('/api/auth/sign-in/email')
      .send({ email: EMAIL, password: PASSWORD });
    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies.length).toBeGreaterThan(0);
    return cookies.map((c) => c.split(';')[0]).join('; ');
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    // Better Auth handler mounted exactly like in main.ts (contract §3).
    const auth = moduleRef.get(AuthProviderToken, { strict: false });
    app.use('/api/auth', toNodeHandler(auth));
    // Same parser config as main.ts.
    app.useBodyParser('json', { limit: '3mb' });
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(new JsonExceptionFilter());
    await app.init();
    server = app.getHttpServer();

    // Better Auth answers sign-up with 200 (session created immediately).
    const signup = await request(server)
      .post('/api/auth/sign-up/email')
      .send({ name: 'e2e', email: EMAIL, password: PASSWORD });
    expect(signup.status).toBe(200);
    cookie = await signIn();
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  it('GET /health is public and checks the DB', async () => {
    const res = await request(server).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, db: true });
  });

  it('GET /v1/stats without auth is 401', async () => {
    const res = await request(server).get('/v1/stats');
    expect(res.status).toBe(401);
    expect(typeof res.body.error).toBe('string');
  });

  it('company/contact CRUD over the session cookie', async () => {
    const created = await request(server)
      .post('/v1/companies')
      .set('Cookie', cookie)
      .send({ name: 'Acme Corp', domain: 'acme.test', industry: 'Testing' });
    expect(created.status).toBe(201);
    expect(created.body.company.name).toBe('Acme Corp');
    const companyId = created.body.company.id as string;

    const updated = await request(server)
      .put(`/v1/companies/${companyId}`)
      .set('Cookie', cookie)
      .send({ industry: 'Software' });
    expect(updated.status).toBe(200);
    expect(updated.body.company.industry).toBe('Software');

    const listed = await request(server)
      .get('/v1/companies')
      .set('Cookie', cookie);
    expect(listed.status).toBe(200);
    expect(listed.body.total).toBe(1);

    const contact = await request(server)
      .post('/v1/contacts')
      .set('Cookie', cookie)
      .send({
        first_name: 'Ada',
        last_name: 'Lovelace',
        email: 'ada@acme.test',
        company_id: companyId,
      });
    expect(contact.status).toBe(201);
    const contactId = contact.body.contact.id as string;

    const got = await request(server)
      .get(`/v1/contacts/${contactId}`)
      .set('Cookie', cookie);
    expect(got.status).toBe(200);
    expect(got.body.contact.company_name).toBe('Acme Corp');

    const contactUpdated = await request(server)
      .put(`/v1/contacts/${contactId}`)
      .set('Cookie', cookie)
      .send({ status: 'active', title: 'Engineer' });
    expect(contactUpdated.status).toBe(200);
    expect(contactUpdated.body.contact.status).toBe('active');

    const contactDeleted = await request(server)
      .delete(`/v1/contacts/${contactId}`)
      .set('Cookie', cookie);
    expect(contactDeleted.status).toBe(200);
    expect(contactDeleted.body).toEqual({ ok: true });

    const companyDeleted = await request(server)
      .delete(`/v1/companies/${companyId}`)
      .set('Cookie', cookie);
    expect(companyDeleted.status).toBe(200);
    expect(companyDeleted.body).toEqual({ ok: true });
  });

  it('deal lifecycle incl. stage_change activity and stats', async () => {
    const company = await request(server)
      .post('/v1/companies')
      .set('Cookie', cookie)
      .send({ name: 'Deal Co' });
    expect(company.status).toBe(201);
    const companyId = company.body.company.id as string;

    const contact = await request(server)
      .post('/v1/contacts')
      .set('Cookie', cookie)
      .send({ first_name: 'Grace', company_id: companyId });
    expect(contact.status).toBe(201);
    const contactId = contact.body.contact.id as string;

    const deal = await request(server)
      .post('/v1/deals')
      .set('Cookie', cookie)
      .send({ name: 'Big Deal', contact_id: contactId, value: 1500 });
    expect(deal.status).toBe(201);
    expect(deal.body.deal.stage).toBe('prospect');
    const dealId = deal.body.deal.id as string;

    const moved = await request(server)
      .put(`/v1/deals/${dealId}`)
      .set('Cookie', cookie)
      .send({ stage: 'won' });
    expect(moved.status).toBe(200);
    expect(moved.body.deal.stage).toBe('won');

    const activities = await request(server)
      .get('/v1/activities')
      .set('Cookie', cookie)
      .query({ entity_type: 'deal', entity_id: dealId });
    expect(activities.status).toBe(200);
    const change = (
      activities.body.activities as Array<{ type: string; body: string }>
    ).find((a) => a.type === 'stage_change');
    expect(change).toBeDefined();
    expect(change?.body).toMatch(/won/i);

    const stats = await request(server).get('/v1/stats').set('Cookie', cookie);
    expect(stats.status).toBe(200);
    expect(stats.body).toEqual({
      contacts: 1,
      companies: 1,
      deals: 1,
      dealValue: 1500,
    });

    const dealDeleted = await request(server)
      .delete(`/v1/deals/${dealId}`)
      .set('Cookie', cookie);
    expect(dealDeleted.body).toEqual({ ok: true });

    const contactDeleted = await request(server)
      .delete(`/v1/contacts/${contactId}`)
      .set('Cookie', cookie);
    expect(contactDeleted.body).toEqual({ ok: true });

    const companyDeleted = await request(server)
      .delete(`/v1/companies/${companyId}`)
      .set('Cookie', cookie);
    expect(companyDeleted.body).toEqual({ ok: true });
  });

  it('api tokens: create once-visible, list camelCase, bearer auth, revoke', async () => {
    const created = await request(server)
      .post('/v1/tokens')
      .set('Cookie', cookie)
      .send({ name: 'cli' });
    expect(created.status).toBe(201);
    const token = created.body.token as string;
    const id = created.body.id as string;
    expect(token).toMatch(/^vc_[0-9a-f]{48}$/);
    expect(created.body.prefix).toBe(token.slice(0, 12));

    const list = await request(server).get('/v1/tokens').set('Cookie', cookie);
    expect(list.status).toBe(200);
    expect(list.body.tokens).toHaveLength(1);
    expect(list.body.tokens[0]).toMatchObject({
      id,
      name: 'cli',
      prefix: token.slice(0, 12),
    });
    expect(list.body.tokens[0].createdAt).toEqual(expect.any(String));
    expect(list.body.tokens[0]).not.toHaveProperty('token');
    expect(list.body.tokens[0]).not.toHaveProperty('tokenHash');

    // Token authenticates without a session cookie (contract §3 fallback).
    const authed = await request(server)
      .get('/v1/stats')
      .set('Authorization', `Bearer ${token}`);
    expect(authed.status).toBe(200);
    expect(authed.body).toEqual({
      contacts: 0,
      companies: 0,
      deals: 0,
      dealValue: 0,
    });

    // Using the token sets lastUsedAt (never the hash/token itself).
    const listed = await request(server)
      .get('/v1/tokens')
      .set('Cookie', cookie);
    expect(listed.body.tokens[0].lastUsedAt).not.toBeNull();

    const revoked = await request(server)
      .delete(`/v1/tokens/${id}`)
      .set('Cookie', cookie);
    expect(revoked.status).toBe(200);
    expect(revoked.body).toEqual({ ok: true });

    const dead = await request(server)
      .get('/v1/stats')
      .set('Authorization', `Bearer ${token}`);
    expect(dead.status).toBe(401);

    const again = await request(server)
      .delete(`/v1/tokens/${id}`)
      .set('Cookie', cookie);
    expect(again.status).toBe(404);
  });

  it('rejects unknown custom fields with 422', async () => {
    const res = await request(server)
      .post('/v1/contacts')
      .set('Cookie', cookie)
      .send({ first_name: 'Nope', bogus_field_xyz: 'x' });
    expect(res.status).toBe(422);
    expect(res.body.unknown_fields).toEqual(['bogus_field_xyz']);
    expect(Array.isArray(res.body.valid_fields)).toBe(true);
    expect(typeof res.body.error).toBe('string');
  });

  it('rejects bad stage/status with 400 and missing records with 404', async () => {
    const badStage = await request(server)
      .post('/v1/deals')
      .set('Cookie', cookie)
      .send({ name: 'Bad', stage: 'nope' });
    expect(badStage.status).toBe(400);

    const badStatus = await request(server)
      .post('/v1/contacts')
      .set('Cookie', cookie)
      .send({ first_name: 'Bad', status: 'nope' });
    expect(badStatus.status).toBe(400);

    const missingContact = await request(server)
      .get('/v1/contacts/does-not-exist')
      .set('Cookie', cookie);
    expect(missingContact.status).toBe(404);
    expect(typeof missingContact.body.error).toBe('string');

    const missingDeal = await request(server)
      .put('/v1/deals/does-not-exist')
      .set('Cookie', cookie)
      .send({ notes: 'x' });
    expect(missingDeal.status).toBe(404);
  });

  it('refuses stage delete without reassign_to with 409', async () => {
    const stage = await request(server)
      .post('/v1/stages')
      .set('Cookie', cookie)
      .send({ label: 'E2E Temp' });
    expect(stage.status).toBe(201);
    const key = stage.body.stage.key as string;

    const deal = await request(server)
      .post('/v1/deals')
      .set('Cookie', cookie)
      .send({ name: 'Temp Deal', stage: key });
    expect(deal.status).toBe(201);
    const dealId = deal.body.deal.id as string;

    const conflict = await request(server)
      .delete(`/v1/stages/${key}`)
      .set('Cookie', cookie);
    expect(conflict.status).toBe(409);

    const moved = await request(server)
      .delete(`/v1/stages/${key}`)
      .set('Cookie', cookie)
      .query({ reassign_to: 'prospect' });
    expect(moved.status).toBe(200);
    expect(moved.body).toEqual({ ok: true, reassigned: 1 });

    const cleanup = await request(server)
      .delete(`/v1/deals/${dealId}`)
      .set('Cookie', cookie);
    expect(cleanup.body).toEqual({ ok: true });
  });
});
