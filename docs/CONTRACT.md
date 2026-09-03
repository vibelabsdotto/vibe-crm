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
`value` REAL NOT NULL DEFAULT `0`, `stage` TEXT NOT NULL DEFAULT `'prospect'` (muss `stages.key` sein, sonst 400 + gültige Keys),
`close_date`/`notes` TEXT DEFAULT `''`, `created_at`/`updated_at` ISO-8601.

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
| GET | `/v1/deals` | `?stage=`; Search name/notes; +`total_value`; Kontakt/Company-Extras |
| POST | `/v1/deals` | `{name!, contact_id?, value?, stage? (default erste Stage), close_date?, notes?, custom?}` → 201 |
| PUT | `/v1/deals/:id` | partiell; Stage-Wechsel → `stage_change`-Activity (`won`/`lost`-Text); → 200 |
| DELETE | `/v1/deals/:id` | → `{ ok: true }` |
| GET | `/v1/deals/board` | alle Deals `ORDER BY created_at ASC` → `{ deals }` (Gruppierung clientseitig) |
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

- Routes: `/` (Dashboard: Stats + Pipeline-Summary), `/contacts`, `/contacts/:id` (Detail + Timeline), `/companies`, `/deals` (Board + Tabelle), `/settings/properties` (Custom Fields), `/settings/tokens` (API-Keys), `/sign-in`, `/sign-up`.
- Shell: Sidebar (`collapsible="offcanvas"`, vibevision-Pattern) + sticky Header mit `SidebarTrigger` + mobile Bottom-Nav (`md:hidden`, 4 Kernziele). Sidebar-Badges: offene Deals (Anzahl nicht-gewonnen/verloren).
- Tabellen (Contacts/Companies): Sekundärspalten `hidden sm/md/lg:table-cell` + Card-Grid-Fallback + `overflow-x-auto`. Deals-Board: Spalten stapeln auf Mobile, dnd-kit optional (Select-Wechsel genügt v1).
- Theme: Tailwind v4, Dark-Mode via Klasse + `@custom-variant dark`, Brand-HEX aus vibeplans (`--coral #FF7A5C, --teal #2CCABB, --amber #EFBB63, --danger #F1646B, --bg #0B0C0E, --surface-2 #1C1D21, --border #232529, --text #F2F2F2`), Fonts Inter + Space Grotesk + JetBrains Mono, Buttons `min-h-11` (44px Touch).
- API-Client: `apiFetch` (Bearer + Cookie-Passthrough serverseitig), `NEXT_PUBLIC_API_URL` (Build-Arg), `NEXT_PUBLIC_WEB_URL`.
- Kein `?agent=true`-Modus. Keine Fumadocs. `export const dynamic = "force-dynamic"` auf allen Seiten mit Session-Zugriff.

## 6. CLI (`apps/cli`, plain ESM, `bin/vibe-crm.js`)

- Instance-Precedence: `--instance > CRM_INSTANCE > ./.crm/crm.json > ~/.config/vibe-crm/config.json`.
- Keys: `./.crm/instances.json | ~/.config/vibe-crm/instances.json`, `Record<host, { apiKey, email?, savedAt? }>`, mkdir 0o700 / file 0o600, Anzeige nur redacted.
- Auth: `auth login --instance <url> --token <vc_…>` (Key aus Web `/settings/tokens` kopiert; verify via `GET /health` + `GET /v1/stats`) — KEIN Password-Flow (Single-Workspace, Token genügt). `auth whoami`, `auth logout`, `health` (ohne Key).
- Befehle: `contacts [--search] [--status] [--limit]`, `contact show|add|update|rm`, `companies`, `company add|update|rm`, `deals [--stage]`, `deal add|move|rm`, `pipeline`, `stages`, `activity log|list`, `import contacts|companies <file.csv|json> [--dry-run]`, `tokens create|ls|revoke` (braucht Session-Login? nein — Token-Auth genügt, Self-Service).
- `--json` → rohes Objekt, sonst humane Tabelle/Einzeiler. Fehler: `✗`-Prefix, exit 1.

## 7. Ops

- Repo `vibelabsdotto/vibe-crm` (privat), 2 Coolify-Apps auf `hostinger`, `vibe-crm-web` (`https://crm.vibelabs.to`, 3000) + `vibe-crm-api` (`https://api-crm.vibelabs.to`, 3100). DNS: Wildcard deckt ab, kein Record nötig.
- API-Env: `PORT=3100, DATABASE_PATH=/data/vibe-crm.sqlite, WEB_BASE_URL, CORS_ORIGIN=https://crm.vibelabs.to, BETTER_AUTH_SECRET, GOOGLE_* (optional)` + Coolify Persistent Storage → `/data`.
- Web-Build-Args: `NEXT_PUBLIC_API_URL=https://api-crm.vibelabs.to, NEXT_PUBLIC_WEB_URL=https://crm.vibelabs.to`.
- Gates pro Lane: `typecheck` → `lint` → `test` → `build` grün. Prod-E2E: Health, Auth (Session + Token), CRUD je Entity, Board, Import, CLI gegen Prod-Instance.
