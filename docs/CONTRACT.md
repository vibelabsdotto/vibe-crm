# Vibe CRM — Kontrakt v1

Verbindlich für `apps/api`, `apps/web`, `apps/cli`. Abweichungen nur nach Absprache (dann dieses Dokument aktualisieren).

Port von OpenCRM v4 (`/tmp/opencrm-audit`, Hono + D1) auf den VibeLabs-Stack.
**Diff zum Original:** keine Agent-UI im Browser (`?agent=true` entfällt) — dafür eine Agent-**CLI** (`apps/cli`) mit API-Keys + frei wählbarer Instance.

## 1. Begriffe

- **Company**: Firma (`name` Pflicht). Hat N Contacts.
- **Contact**: Person (`first_name` Pflicht). Gehört zu 0..1 Company, hat N Deals.
- **Deal**: Verkaufschance (`name` Pflicht). Gehört zu 0..1 Contact (Company geerbt).
- **Stage**: Pipeline-Stufe — **Data, not code** (`key` immutabel, `label/color/position/is_won/is_lost` editierbar).
- **Activity**: Timeline-Eintrag (`contact|company|deal` × `note|email|meeting|stage_change`).
- **Custom Field**: User-definiertes Feld = echte Spalte auf der Entity-Tabelle + Registry-Row.
- **API-Token**: Personal Access Token für CLI/Agents, Format `vc_<48 hex>` (Prefix `vc_`).
- **Product**: Produkt/Leistung (`key`-Slug, z.B. `daze`), aus Notion-Projects geseedet. Deals und Subscriptions hängen optional dran.
- **Subscription**: Laufender Vertrag (Retainer/Abo): Firma + Produkt + Betrag + Intervall + Zeitraum + Status. Antwort auf wiederkehrende Kundenzahlungen — Notion-Cashflow kennt nur Einzelbuchungen (`Recurring` überall false), das CRM wird das führende Retainer-System.
- **MRR**: Monthly Recurring Revenue = Summe über `active|trial`-Subscriptions: monthly=amount, quarterly=amount/3, yearly=amount/12, one_time=0.
- **Tenant-Modell v1: Single-Workspace.** Jede authentifizierte Identität (Session ODER Token) hat volles CRUD auf alle Daten. Kein Row-Ownership, kein Sharing.

## 2. Storage — SQLite (drizzle + better-sqlite3, Datei `/data/vibe-crm.sqlite` in Prod, `./data/vibe-crm.sqlite` lokal)

### Tabellen `user`, `session`, `account`, `verification` (Better Auth)

Von Better Auth verwaltet (Drizzle-Adapter). Nicht manuell verändern.

### Tabelle `companies`

| Spalte | Typ | Constraints |
| --- | --- | --- |
| `id` | TEXT | PRIMARY KEY (UUID v4, App-Layer `randomUUID`) |
| `name` | TEXT | NOT NULL |
| `domain` / `industry` / `phone` / `email` / `notes` | TEXT | NOT NULL DEFAULT `''` |
| `created_at` / `updated_at` | TEXT | NOT NULL, ISO-8601 |

### Tabelle `contacts`

`id` PK (UUID), `first_name` TEXT NOT NULL, `last_name`/`email`/`phone`/`title` TEXT DEFAULT `''`,
`company_id` TEXT NULL → `companies(id) ON DELETE SET NULL`,
`status` TEXT NOT NULL DEFAULT `'lead'` — Werte `lead|active|inactive|churned` (Whitelist, sonst 400),
`created_at`/`updated_at` ISO-8601.

### Tabelle `deals`

`id` PK (UUID), `name` TEXT NOT NULL, `contact_id` TEXT NULL → `contacts(id) ON DELETE SET NULL`,
`company_id` TEXT NULL → `companies(id) ON DELETE SET NULL` (direkt, nicht nur geerbt — Seed aus Notion kennt oft nur die Firma),
`product_id` TEXT NULL → `products(key) ON DELETE SET NULL`,
`value` REAL NOT NULL DEFAULT `0`, `stage` TEXT NOT NULL DEFAULT `'prospect'` (muss `stages.key` sein, sonst 400 + gültige Keys),
`close_date`/`notes` TEXT DEFAULT `''`, `created_at`/`updated_at` ISO-8601.

### Tabelle `products`

`key` TEXT PRIMARY KEY (Slug, z.B. `daze`), `name` TEXT NOT NULL,
`type` TEXT NOT NULL DEFAULT `'product'` (`product|service|other`),
`status` TEXT NOT NULL DEFAULT `''` (frei, Notion-Status wird übernommen),
`notes` TEXT NOT NULL DEFAULT `''`, `created_at`/`updated_at` ISO-8601.
Seed aus Notion-Projects. DELETE → 409 `{ error: 'conflict' }` solange Deals/Subscriptions referenzieren (kein Reassign — Produkt erst umhängen).

### Tabelle `subscriptions`

`id` PK (UUID), `company_id` TEXT NULL → `companies(id) ON DELETE SET NULL`,
`contact_id` TEXT NULL → `contacts(id) ON DELETE SET NULL`,
`product_id` TEXT NULL → `products(key) ON DELETE SET NULL`,
`name` TEXT NOT NULL (z.B. `DAZE Monatspauschale`),
`amount` REAL NOT NULL DEFAULT `0`, `currency` TEXT NOT NULL DEFAULT `'EUR'`,
`interval` TEXT NOT NULL DEFAULT `'monthly'` (`monthly|quarterly|yearly|one_time`, sonst 400),
`start_date`/`end_date` TEXT DEFAULT `''` (ISO-Datum, end leer = unbefristet),
`status` TEXT NOT NULL DEFAULT `'active'` (`active|trial|paused|cancelled|expired`, sonst 400),
`notes` TEXT DEFAULT `''`, `created_at`/`updated_at` ISO-8601.
Indizes `(company_id)`, `(status)`.

### Tabelle `stages`

`key` TEXT PRIMARY KEY (immutabel, slug aus Label), `label` TEXT NOT NULL,
`color` TEXT NOT NULL DEFAULT `'slate'` (Whitelist: `sky emerald amber rose violet fuchsia teal orange slate`),
`position` INTEGER NOT NULL, `is_won`/`is_lost` INTEGER NOT NULL DEFAULT `0` (nie beide 1),
`created_at`/`updated_at`. Seed bei leerer Tabelle (Boot): prospect→qualified→proposal→negotiation→won(is_won)→lost(is_lost).

### Tabelle `activities`

`id` PK (UUID), `entity_type` TEXT NOT NULL (`contact|company|deal`),
`entity_id` TEXT NOT NULL (kein FK), `type` TEXT NOT NULL DEFAULT `'note'` (`note|email|meeting|stage_change`),
`body` TEXT DEFAULT `''`, `meta` TEXT DEFAULT `'{}'` (JSON-Bag), `created_at` ISO-8601.
Index `(entity_type, entity_id)`.

### Tabelle `custom_field_defs`

`id` PK (UUID), `entity_type` (`contact|company|deal`), `key` (Spaltenname `^[a-z][a-z0-9_]*$`),
`label` NOT NULL, `field_type` (`string|text|integer|decimal|boolean|date|datetime|enumeration|json`),
`options` TEXT JSON DEFAULT `'{}'` (`{required?, enum?[], min?, max?}`),
`position` INTEGER DEFAULT `0`, timestamps. UNIQUE(`entity_type`,`key`).
Jede Def = echte Spalte auf der Entity-Tabelle (`ALTER TABLE ADD/DROP COLUMN`, Affinity: integer/boolean→INTEGER, decimal→REAL, Rest TEXT).

### Tabelle `api_tokens`

`id` PK (UUID), `owner_email` TEXT NOT NULL, `name` TEXT NOT NULL,
`token_hash` TEXT NOT NULL UNIQUE (SHA-256 hex), `prefix` TEXT NOT NULL (erste 12 Zeichen),
`created_at` NOT NULL, `last_used_at` NULL. (Kein `owner_id` — Single-Workspace.)

Migrationen via drizzle-kit, committed unter `apps/api/drizzle/`. Pragmas: WAL, busy_timeout 5000, foreign_keys ON.

**v1-Nicht-Ziele:** Clawnify-Integrationen (Gmail/Calendar/Slack) entfallen ersatzlos; Activity-Typen `email|meeting` nur manuell via API schreibbar. Deal-Import gibt es nicht. Demo-Seed: nur Stages, keine Demo-Records.

## 3. Auth

Reihenfolge überall: 1. **Better-Auth-Session (Cookie)**, 2. **API-Token** `Authorization: Bearer vc_…` (SHA-256 → Lookup, `last_used_at`-Update throttled 60 s).
Better-Auth-Handler als Express-Middleware unter `/api/auth/*` (VOR dem Nest-Router, dort kein Guard). Login: Email + Password; Google optional via Env (beide gesetzt = aktiv). Kein E-Mail-Verify (persönliches Tool).
Guard: globaler `APP_GUARD` + `@Public()` für `/health`. Fehler: `401 { error: 'unauthorized' }`.
`BETTER_AUTH_SECRET` fehlt/Platzhalter → Boot-Fail.

## 4. API (NestJS, Prefix `/v1`, Port lokal `3100`)

Alle Responses JSON. Fehler flach `{ error: string }`. Codes: `unauthorized` 401, `not_found` 404, `bad_request` 400, `conflict` 409, `unprocessable` 422 (`{ error, unknown_fields, valid_fields }`), `payload_too_large` 413, `rate_limited` 429, `internal_error` 500.
Body-Limit 3 MB. ValidationPipe (whitelist + forbidNonWhitelisted). POST→201, PUT/PATCH→200, DELETE→200 `{ ok: true }` (OpenCRM-Shape, kein 204).
List-Query: `?page&limit(≤100)&sort&order&search&filters` (`filters` = JSON `[{field,op,value}]`, ops `contains|is|is_not|is_empty|is_not_empty|gt|lt`, Feldnamen gegen `PRAGMA table_info` allowlist-validiert).

### Öffentlich

| Method | Pfad | Verhalten |
| --- | --- | --- |
| GET | `/health` | `{ ok: true, db: true }`, DB-Check inkl. |
| GET | `/api/auth/*` | Better Auth (kein Guard) |

### Authentifiziert

| Method | Pfad | Verhalten |
| --- | --- | --- |
| GET | `/v1/stats` | `{ contacts, companies, deals, dealValue }` (dealValue = SUM exkl. is_lost) |
| GET | `/v1/companies` | `?industry=`; Search name/domain/email; +`contact_count`; → `{ companies, total, page, limit }` |
| POST | `/v1/companies` | `{name!, domain?, industry?, phone?, email?, notes?, custom?}` → 201 |
| PUT | `/v1/companies/:id` | partiell → 200; 404 |
| DELETE | `/v1/companies/:id` | → `{ ok: true }`; Kontakte bleiben (`company_id=NULL`) |
| GET | `/v1/contacts` | `?status=&company_id=`; Search Name/Email/Titel/Company; +`company_name/domain` |
| POST | `/v1/contacts` | `{first_name!, last_name?, email?, phone?, company_id?, title?, status?, custom?}` → 201 |
| PUT | `/v1/contacts/:id` | partiell → 200 |
| DELETE | `/v1/contacts/:id` | → `{ ok: true }`; Deals bleiben (`contact_id=NULL`) |
| GET | `/v1/contacts/:id` | einzelner Kontakt + Company-Extras; 404 |
| GET | `/v1/deals` | `?stage=&product=`; Search name/notes; +`total_value`; Kontakt/Company-Extras (+`product_id`, `company_id`) |
| POST | `/v1/deals` | `{name!, contact_id?, company_id?, product_id? (muss existieren, sonst 400), value?, stage? (default erste Stage), close_date?, notes?, custom?}` → 201 |
| PUT | `/v1/deals/:id` | partiell (inkl. `company_id`, `product_id`); Stage-Wechsel → `stage_change`-Activity (`won`/`lost`-Text); → 200 |
| DELETE | `/v1/deals/:id` | → `{ ok: true }` |
| GET | `/v1/deals/board` | alle Deals `ORDER BY created_at ASC` → `{ deals }` (Gruppierung clientseitig) |
| GET/POST | `/v1/products` | Liste (name-asc) / `{key? (default Slug aus name), name!, type?, status?, notes?}` → 201 (409 Key-Dup) |
| PUT/DELETE | `/v1/products/:key` | `name/type/status/notes` / DELETE → `{ ok: true }`, 409 solange Deals/Subscriptions referenzieren |
| GET/POST | `/v1/subscriptions` | `?status=&company_id=&product=` → `{ subscriptions, total, page, limit }` (+Company-/Produkt-Extras) / `{company_id?, contact_id?, product_id? (muss existieren, sonst 400), name!, amount?, currency?, interval?, start_date?, end_date?, status?, notes?}` → 201 |
| PUT/DELETE | `/v1/subscriptions/:id` | partiell → 200; DELETE → `{ ok: true }` |
| GET | `/v1/subscriptions/summary` | `{ mrr, active, trial, paused, total, byProduct: [{ product, productName, mrr, active }] }` (MRR-Regel §1) |
| GET/POST | `/v1/stages` | Liste (position-asc) / `{label!, key?, color?, position?, is_won?, is_lost?}` → 201 (409 Key-Dup) |
| PUT/DELETE | `/v1/stages/:key` | alles außer `key` / `?reassign_to=` Pflicht bei belegten Stages (409 sonst); letzte Stage nicht löschbar |
| GET/POST | `/v1/custom-fields` | `?entity=` → `{ defs }` / `{entity_type!, key!, label!, field_type?, options?, position?}` → 201 |
| PUT/DELETE | `/v1/custom-fields/:id` | nur label/options/position / Registry + Spalte droppen |
| GET/POST | `/v1/activities` | `?entity_type=&entity_id=` → `{ activities }` DESC / `{entity_type!, entity_id!, type?, body?, meta?}` → 201 |
| POST | `/v1/contacts/import` | `{ contacts: [{first_name!, …company, company_domain/industry/phone, custom?}], inferCompanyFromEmail? }` Limit 2000 → `{ imported, companiesCreated, skipped }` |
| POST | `/v1/companies/import` | `{ companies: [{name!, …}] }` Dedupe per Name → `{ imported, skipped, duplicates }` |
| POST/GET/DELETE | `/v1/tokens` | `{name!}→201 { id, token, prefix }` (einmalig) / Liste camelCase ohne Hash / `:id` → `{ ok: true }` |

Custom-Write: flache Keys ODER `custom:{}`-Bag (Bag gewinnt); unbekannte Keys → 422; `options.required` → 400 auf Create (Update: nur explizites Leeren); Import-Coercion lenient (bad cell→null), required beim Import NICHT enforced.
Stage-Löschen mit Deals ohne `reassign_to` → 409. `DELETE company/contact` kaskadiert nie (FK SET NULL).

## 5. Web (Next.js 16.3, App Router, Port 3000)

- Routes: `/` (Dashboard: Stats + Pipeline-Summary + MRR), `/contacts`, `/contacts/:id` (Detail + Timeline), `/companies`, `/deals` (Board + Tabelle, `?product=`-Filter), `/subscriptions` (Summary-Cards + Tabelle), `/settings/properties` (Custom Fields), `/settings/products` (Produkt-CRUD), `/settings/tokens` (API-Keys), `/sign-in`, `/sign-up`.
- Sidebar: + Item „Abos" (`Repeat`-Icon, Badge aktive Subscriptions).
- Shell: Sidebar (`collapsible="offcanvas"`, vibevision-Pattern) + sticky Header mit `SidebarTrigger` + mobile Bottom-Nav (`md:hidden`, 4 Kernziele). Sidebar-Badges: offene Deals (Anzahl nicht-gewonnen/verloren).
- Tabellen (Contacts/Companies): Sekundärspalten `hidden sm/md/lg:table-cell` + Card-Grid-Fallback + `overflow-x-auto`. Deals-Board: Spalten stapeln auf Mobile, dnd-kit optional (Select-Wechsel genügt v1).
- Theme: Tailwind v4, Dark-Mode via Klasse + `@custom-variant dark`, Brand-HEX aus vibeplans (`--coral #FF7A5C, --teal #2CCABB, --amber #EFBB63, --danger #F1646B, --bg #0B0C0E, --surface-2 #1C1D21, --border #232529, --text #F2F2F2`), Fonts Inter + Space Grotesk + JetBrains Mono, Buttons `min-h-11` (44px Touch).
- API-Client: `apiFetch` (Bearer + Cookie-Passthrough serverseitig), `NEXT_PUBLIC_API_URL` (Build-Arg), `NEXT_PUBLIC_WEB_URL`.
- Kein `?agent=true`-Modus. Keine Fumadocs. `export const dynamic = "force-dynamic"` auf allen Seiten mit Session-Zugriff.

## 6. CLI (`apps/cli`, plain ESM, `bin/vibe-crm.js`)

- Instance-Precedence: `--instance > CRM_INSTANCE > ./.crm/crm.json > ~/.config/vibe-crm/config.json`.
- Keys: `./.crm/instances.json | ~/.config/vibe-crm/instances.json`, `Record<host, { apiKey, email?, savedAt? }>`, mkdir 0o700 / file 0o600, Anzeige nur redacted.
- Auth: `auth login --instance <url> --token <vc_…>` (Key aus Web `/settings/tokens` kopiert; verify via `GET /health` + `GET /v1/stats`) — KEIN Password-Flow (Single-Workspace, Token genügt). `auth whoami`, `auth logout`, `health` (ohne Key).
- Befehle: `contacts [--search] [--status] [--limit]`, `contact show|add|update|rm`, `companies`, `company add|update|rm`, `deals [--stage] [--product]`, `deal add|update|move|rm` (`--product`, `--company`), `pipeline`, `stages`, `products`, `product add|rm`, `subscriptions [--status] [--product]`, `subscription add|update|cancel|rm`, `mrr` (Summary), `activity log|list`, `import contacts|companies <file.csv|json> [--dry-run]`, `import notion <seed.json> [--dry-run]` (Notion-Export seeden, idempotent per Name/Key), `tokens create|ls|revoke` (Token-Auth genügt, Self-Service).
- `--json` → rohes Objekt, sonst humane Tabelle/Einzeiler. Fehler: `✗`-Prefix, exit 1.

## 7. Ops

- Repo `vibelabsdotto/vibe-crm` (public), 2 Coolify-Apps auf `hostinger`, `vibe-crm-web` (`https://crm.vibelabs.to`, 3000) + `vibe-crm-api` (`https://api-crm.vibelabs.to`, 3100). DNS: Wildcard deckt ab, kein Record nötig.
- API-Env: `PORT=3100, DATABASE_PATH=/data/vibe-crm.sqlite, WEB_BASE_URL, CORS_ORIGIN=https://crm.vibelabs.to, BETTER_AUTH_SECRET, GOOGLE_* (optional)` + Coolify Persistent Storage → `/data`.
- Web-Build-Args: `NEXT_PUBLIC_API_URL=https://api-crm.vibelabs.to, NEXT_PUBLIC_WEB_URL=https://crm.vibelabs.to`.
- Gates pro Lane: `typecheck` → `lint` → `test` → `build` grün. Prod-E2E: Health, Auth (Session + Token), CRUD je Entity, Board, Import, CLI gegen Prod-Instance.

## 9. Notion-Seed (Stand 2026-09-03, DBs: Leads 55, Projects 27, Cashflow 52, Sources 3)

Seed-Format: JSON `{ products[], companies[], contacts[], deals[], subscriptions[] }`, eingespielt via `vibe-crm import notion` (idempotent: Company-Dedupe per Name case-insensitiv, Product-Upsert per Key, Deals/Subscriptions Dedupe per Name+Company).

- **Products**: alle 27 Notion-Projects (key = Slug aus Name, type aus Notion-Type gemappt Product→product sonst other, status = Notion-Status, inkl. archived — Status bleibt sichtbar).
- **Companies/Contacts**: alle 55 Leads. Company `{name, email, phone, notes: "Notion-Lead • <Status> • Quelle/Details…"}`. Contact wo Contact Person gesetzt (erster Name gesplittet, Rest in notes; mehrere Nummern: erste ins phone-Feld, Rest notes). Contact-Status: Won→`active`, Lost/Unqualified→`churned`, Rest→`lead`. Last Contact/Next Action → Activity-Notes an Company (nicht an Contact — Timeline hängt an beiden, Company ist stabiler).
- **Lead-Status → Stage**: Won→`won`, Lost/Unqualified→`lost`, Proposal Sent→`proposal`, Replied/Meeting Scheduled/Qualified Opportunity→`qualified`, New/Researching/Ready for Outreach/Outreach Sent/Follow-Up Due→`prospect` (`negotiation` bleibt manueller Nutzung vorbehalten). Original-Status steht in Company-Notes + Seed-Activity.
- **Deals**: nur für fortgeschrittene Leads (Proposal Sent, Qualified Opportunity, Meeting Scheduled, Won, Lost): Name `{Company} – DAZE`, `product_id: daze`, `company_id` (+`contact_id` wo vorhanden), value 0 (unbekannt), close_date leer.
- **Subscriptions (Annahmen, aus Cashflow-Titel-Muster abgeleitet — Max bestätigt)**: `DAZE – HUEG` (LAUSITZER HÜGELLAND AGRAR AG, 90 EUR monthly, active, start 2024-11-18), `DAZE – HAAG` (Harslebener Agrargenossenschaft eG, 74.25 EUR monthly, active, start 2025-11-14). MRR danach ≈ 164.25 €. Cashflow-Einzelbuchungen werden NICHT migriert (Buchhaltung bleibt Notion).
