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
    expect(res.body).toEqual({ error: 'unauthorized' });
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
    expect(dead.body).toEqual({ error: 'unauthorized' });

    const again = await request(server)
      .delete(`/v1/tokens/${id}`)
      .set('Cookie', cookie);
    expect(again.status).toBe(404);
    expect(again.body).toEqual({ error: 'not_found' });
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
    expect(missingContact.body).toEqual({ error: 'not_found' });

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

  it('products CRUD incl. key dup 409 and referenced 409', async () => {
    const noName = await request(server)
      .post('/v1/products')
      .set('Cookie', cookie)
      .send({ type: 'product' });
    expect(noName.status).toBe(400);

    const created = await request(server)
      .post('/v1/products')
      .set('Cookie', cookie)
      .send({ name: 'E2E Widget', type: 'product', status: 'live' });
    expect(created.status).toBe(201);
    expect(created.body.product).toMatchObject({
      key: 'e2e_widget',
      name: 'E2E Widget',
      type: 'product',
    });

    const dup = await request(server)
      .post('/v1/products')
      .set('Cookie', cookie)
      .send({ key: 'e2e_widget', name: 'Dupe' });
    expect(dup.status).toBe(409);
    expect(typeof dup.body.error).toBe('string');

    const second = await request(server)
      .post('/v1/products')
      .set('Cookie', cookie)
      .send({ key: 'aaa_first', name: 'Zed Last' });
    expect(second.status).toBe(201);

    const listed = await request(server)
      .get('/v1/products')
      .set('Cookie', cookie);
    expect(listed.status).toBe(200);
    const keys = (listed.body.products as Array<{ key: string }>).map(
      (p) => p.key,
    );
    // name-asc ordering: 'Zed Last' sorts after 'E2E Widget'.
    expect(keys.indexOf('aaa_first')).toBeGreaterThan(
      keys.indexOf('e2e_widget'),
    );

    const searched = await request(server)
      .get('/v1/products')
      .set('Cookie', cookie)
      .query({ search: 'widget' });
    expect(
      (searched.body.products as Array<{ key: string }>).map((p) => p.key),
    ).toEqual(['e2e_widget']);

    const updated = await request(server)
      .put('/v1/products/e2e_widget')
      .set('Cookie', cookie)
      .send({ status: 'archived', type: 'service' });
    expect(updated.status).toBe(200);
    expect(updated.body.product.status).toBe('archived');

    const badType = await request(server)
      .put('/v1/products/e2e_widget')
      .set('Cookie', cookie)
      .send({ type: 'nope' });
    expect(badType.status).toBe(400);

    const missing = await request(server)
      .put('/v1/products/does-not-exist')
      .set('Cookie', cookie)
      .send({ status: 'x' });
    expect(missing.status).toBe(404);

    // Referenced product cannot be deleted (409), like stages.
    const deal = await request(server)
      .post('/v1/deals')
      .set('Cookie', cookie)
      .send({ name: 'Widget Deal', product_id: 'e2e_widget' });
    expect(deal.status).toBe(201);
    const dealId = deal.body.deal.id as string;

    const conflict = await request(server)
      .delete('/v1/products/e2e_widget')
      .set('Cookie', cookie);
    expect(conflict.status).toBe(409);

    await request(server)
      .delete(`/v1/deals/${dealId}`)
      .set('Cookie', cookie);
    await request(server)
      .delete('/v1/products/aaa_first')
      .set('Cookie', cookie);
    const removed = await request(server)
      .delete('/v1/products/e2e_widget')
      .set('Cookie', cookie);
    expect(removed.body).toEqual({ ok: true });

    const gone = await request(server)
      .delete('/v1/products/e2e_widget')
      .set('Cookie', cookie);
    expect(gone.status).toBe(404);
  });

  it('subscriptions CRUD incl. filters, summary MRR and 400s', async () => {
    const noName = await request(server)
      .post('/v1/subscriptions')
      .set('Cookie', cookie)
      .send({ amount: 10 });
    expect(noName.status).toBe(400);

    for (const bad of [
      { name: 'x', interval: 'nope' },
      { name: 'x', status: 'nope' },
      { name: 'x', product_id: 'no-such-product' },
      { name: 'x', company_id: 'no-such-company' },
    ]) {
      const res = await request(server)
        .post('/v1/subscriptions')
        .set('Cookie', cookie)
        .send(bad);
      expect(res.status).toBe(400);
    }

    for (const p of [
      { key: 'sub_p1', name: 'Sub P1' },
      { key: 'sub_p2', name: 'Sub P2' },
    ]) {
      const res = await request(server)
        .post('/v1/products')
        .set('Cookie', cookie)
        .send(p);
      expect(res.status).toBe(201);
    }
    const company = await request(server)
      .post('/v1/companies')
      .set('Cookie', cookie)
      .send({ name: 'Sub Co' });
    expect(company.status).toBe(201);
    const companyId = company.body.company.id as string;

    const mk = async (body: Record<string, unknown>): Promise<string> => {
      const res = await request(server)
        .post('/v1/subscriptions')
        .set('Cookie', cookie)
        .send(body);
      expect(res.status).toBe(201);
      return res.body.subscription.id as string;
    };
    const s1 = await mk({
      name: 'Retainer A',
      product_id: 'sub_p1',
      company_id: companyId,
      amount: 90,
      interval: 'monthly',
      status: 'active',
    });
    const s2 = await mk({
      name: 'Retainer B',
      product_id: 'sub_p1',
      amount: 300,
      interval: 'quarterly',
      status: 'active',
    });
    const s3 = await mk({
      name: 'Trial C',
      product_id: 'sub_p2',
      amount: 1200,
      interval: 'yearly',
      status: 'trial',
    });
    const s4 = await mk({
      name: 'Once D',
      product_id: 'sub_p2',
      amount: 500,
      interval: 'one_time',
      status: 'active',
    });
    const s5 = await mk({
      name: 'Paused E',
      product_id: 'sub_p1',
      amount: 50,
      interval: 'monthly',
      status: 'paused',
    });

    const one = await request(server)
      .get('/v1/subscriptions')
      .set('Cookie', cookie)
      .query({ company_id: companyId });
    expect(one.status).toBe(200);
    expect(one.body.total).toBe(1);
    expect(one.body.subscriptions[0].company_name).toBe('Sub Co');
    expect(one.body.subscriptions[0].product_name).toBe('Sub P1');

    const byStatus = await request(server)
      .get('/v1/subscriptions')
      .set('Cookie', cookie)
      .query({ status: 'active' });
    expect(byStatus.body.total).toBe(3);

    const byProduct = await request(server)
      .get('/v1/subscriptions')
      .set('Cookie', cookie)
      .query({ product: 'sub_p1' });
    expect(byProduct.body.total).toBe(3);

    // MRR: 90 + 300/3 + 1200/12 + 0 (one_time) + 0 (paused) = 290.
    const summary = await request(server)
      .get('/v1/subscriptions/summary')
      .set('Cookie', cookie);
    expect(summary.status).toBe(200);
    expect(summary.body).toMatchObject({
      mrr: 290,
      active: 3,
      trial: 1,
      paused: 1,
      total: 5,
    });
    expect(summary.body.byProduct).toEqual([
      { product: 'sub_p1', productName: 'Sub P1', mrr: 190, active: 2 },
      { product: 'sub_p2', productName: 'Sub P2', mrr: 100, active: 2 },
    ]);

    const moved = await request(server)
      .put(`/v1/subscriptions/${s5}`)
      .set('Cookie', cookie)
      .send({ status: 'cancelled' });
    expect(moved.status).toBe(200);
    expect(moved.body.subscription.status).toBe('cancelled');

    const badUpdate = await request(server)
      .put(`/v1/subscriptions/${s4}`)
      .set('Cookie', cookie)
      .send({ interval: 'nope' });
    expect(badUpdate.status).toBe(400);

    const missing = await request(server)
      .put('/v1/subscriptions/does-not-exist')
      .set('Cookie', cookie)
      .send({ status: 'active' });
    expect(missing.status).toBe(404);

    // Subscription reference blocks product delete (409).
    const blocked = await request(server)
      .delete('/v1/products/sub_p2')
      .set('Cookie', cookie);
    expect(blocked.status).toBe(409);

    for (const id of [s1, s2, s3, s4, s5]) {
      const res = await request(server)
        .delete(`/v1/subscriptions/${id}`)
        .set('Cookie', cookie);
      expect(res.body).toEqual({ ok: true });
    }
    const goneSub = await request(server)
      .delete(`/v1/subscriptions/${s1}`)
      .set('Cookie', cookie);
    expect(goneSub.status).toBe(404);

    for (const key of ['sub_p1', 'sub_p2']) {
      const res = await request(server)
        .delete(`/v1/products/${key}`)
        .set('Cookie', cookie);
      expect(res.body).toEqual({ ok: true });
    }
    const companyDeleted = await request(server)
      .delete(`/v1/companies/${companyId}`)
      .set('Cookie', cookie);
    expect(companyDeleted.body).toEqual({ ok: true });
  });

  it('deals support company_id/product_id incl. product filter and 400', async () => {
    for (const p of [
      { key: 'deal_p1', name: 'Deal P1' },
      { key: 'deal_p2', name: 'Deal P2' },
    ]) {
      const res = await request(server)
        .post('/v1/products')
        .set('Cookie', cookie)
        .send(p);
      expect(res.status).toBe(201);
    }
    const company = await request(server)
      .post('/v1/companies')
      .set('Cookie', cookie)
      .send({ name: 'Deal Product Co' });
    expect(company.status).toBe(201);
    const companyId = company.body.company.id as string;

    const badProduct = await request(server)
      .post('/v1/deals')
      .set('Cookie', cookie)
      .send({ name: 'Bad Product Deal', product_id: 'no-such-product' });
    expect(badProduct.status).toBe(400);

    const badCompany = await request(server)
      .post('/v1/deals')
      .set('Cookie', cookie)
      .send({ name: 'Bad Company Deal', company_id: 'no-such-company' });
    expect(badCompany.status).toBe(400);

    const deal = await request(server)
      .post('/v1/deals')
      .set('Cookie', cookie)
      .send({
        name: 'Product Deal',
        company_id: companyId,
        product_id: 'deal_p1',
        value: 250,
      });
    expect(deal.status).toBe(201);
    expect(deal.body.deal).toMatchObject({
      company_id: companyId,
      product_id: 'deal_p1',
      company_name: 'Deal Product Co',
      product_name: 'Deal P1',
    });
    const dealId = deal.body.deal.id as string;

    const filtered = await request(server)
      .get('/v1/deals')
      .set('Cookie', cookie)
      .query({ product: 'deal_p1' });
    expect(filtered.status).toBe(200);
    expect(filtered.body.total).toBe(1);
    expect(filtered.body.deals[0].id).toBe(dealId);

    const empty = await request(server)
      .get('/v1/deals')
      .set('Cookie', cookie)
      .query({ product: 'deal_p2' });
    expect(empty.body.total).toBe(0);

    const moved = await request(server)
      .put(`/v1/deals/${dealId}`)
      .set('Cookie', cookie)
      .send({ product_id: 'deal_p2' });
    expect(moved.status).toBe(200);
    expect(moved.body.deal.product_id).toBe('deal_p2');

    const badMove = await request(server)
      .put(`/v1/deals/${dealId}`)
      .set('Cookie', cookie)
      .send({ product_id: 'no-such-product' });
    expect(badMove.status).toBe(400);

    const dealDeleted = await request(server)
      .delete(`/v1/deals/${dealId}`)
      .set('Cookie', cookie);
    expect(dealDeleted.body).toEqual({ ok: true });
    for (const key of ['deal_p1', 'deal_p2']) {
      const res = await request(server)
        .delete(`/v1/products/${key}`)
        .set('Cookie', cookie);
      expect(res.body).toEqual({ ok: true });
    }
    const companyDeleted = await request(server)
      .delete(`/v1/companies/${companyId}`)
      .set('Cookie', cookie);
    expect(companyDeleted.body).toEqual({ ok: true });
  });
});
