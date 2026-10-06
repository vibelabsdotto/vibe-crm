# API-Ergänzungen zur CLI

Nutze die API nur für beauftragte Operationen, die die CLI nicht unterstützt. API-Basis-URL ausdrücklich festlegen; `/v1` ist Teil der folgenden Pfade, nicht der konfigurierten Instanz. Authentifizierung mit `Authorization: Bearer <token>` über einen vertrauenswürdigen Client. Den Token weder in Prozessargumenten noch in Ausgaben offenlegen und Redirects nicht verfolgen.

## Vorhandenen sicheren Client verwenden

Im Vibe-CRM-Repository kann der bestehende Node-Client mit dem bereits gespeicherten Token arbeiten. Dieses Beispiel liest ausschließlich die zusätzlichen Firmenfelder. `crm` durch den eingerichteten Kontext ersetzen:

```sh
node --input-type=module -e '
import { getContext, getApiKey } from "./apps/cli/lib/config.mjs";
import { request } from "./apps/cli/lib/client.mjs";
const { instance } = getContext("crm");
const token = getApiKey(instance);
if (!token) throw new Error("Kein gespeicherter Token für diese Instanz");
const result = await request(instance, {
  path: "/v1/custom-fields",
  query: { entity: "company" },
  token
});
console.log(JSON.stringify(result, null, 2));
'
```

Der vorhandene Client setzt den Auth-Header intern, begrenzt Timeouts und lehnt Redirects ab. Den Token selbst niemals ausgeben. Für Änderungen Methode und Body ausdrücklich setzen, den Auftrag prüfen und anschließend genau das Ziel erneut lesen. Die Tabellen sind keine Erlaubnis, Schreiboperationen automatisch auszuführen.

## Lesen und Bearbeiten

| Bereich | Lesen | Schreiben |
| --- | --- | --- |
| Übersicht | `GET /health` öffentlich; `GET /v1/stats` mit Auth | Keine |
| Firmen | `GET /v1/companies`, `GET /v1/companies/:id` | `POST /v1/companies`, `PUT /v1/companies/:id`, `DELETE /v1/companies/:id` |
| Kontakte | `GET /v1/contacts`, `GET /v1/contacts/:id` | `POST /v1/contacts`, `PUT /v1/contacts/:id`, `DELETE /v1/contacts/:id` |
| Deals | `GET /v1/deals`, `GET /v1/deals/board`, `GET /v1/deals/:id` | `POST /v1/deals`, `PUT /v1/deals/:id`, `DELETE /v1/deals/:id` |
| Produkte | `GET /v1/products` | `POST /v1/products`, `PUT /v1/products/:key`, `DELETE /v1/products/:key` |
| Abos | `GET /v1/subscriptions`, `GET /v1/subscriptions/summary`, `GET /v1/subscriptions/:id` | `POST /v1/subscriptions`, `PUT /v1/subscriptions/:id`, `DELETE /v1/subscriptions/:id` |
| Stages | `GET /v1/stages` | `POST /v1/stages`, `PUT /v1/stages/:key`, `DELETE /v1/stages/:key` |
| Zusatzfelder | `GET /v1/custom-fields?entity=company`, entsprechend `contact`/`deal` | `POST /v1/custom-fields`, `PUT /v1/custom-fields/:id`, `DELETE /v1/custom-fields/:id` |
| Timeline | `GET /v1/activities?entity_type=company&entity_id=<id>` | `POST /v1/activities` |
| Imports | Keine allgemeine Import-Read-Route | `POST /v1/companies/import`, `POST /v1/contacts/import` |
| Tokens | `GET /v1/tokens` | `POST /v1/tokens`, `DELETE /v1/tokens/:id` |

Einzel-GETs und Schreibantworten liefern die Entity-Envelopes `{ company }`, `{ contact }`, `{ deal }` beziehungsweise `{ subscription }`. Vollständige IDs vergleichen. Für die eigene Firma stehen GET/PUT `/v1/workspace/company` mit `{ company_id, company }` bereit; eine Zuordnung legt keine neue Firma an.

## Listen und Filter

Firmen, Kontakte, Deals und Abos unterstützen `page`, `limit` bis 100, `sort`, `order`, `search` und `filters`. `filters` ist ein JSON-Array aus `{ field, op, value }`; Operatoren `contains`, `is`, `is_not`, `is_empty`, `is_not_empty`, `gt`, `lt`. Feldnamen werden gegen vorhandene Spalten geprüft. URL-Parameter mit `URLSearchParams` oder dem bestehenden Client codieren, nicht manuell zusammenbauen.

Spezielle Parameter:

- Firmen: `industry`.
- Kontakte: `status`, `company_id`.
- Deals: `stage`, `product` mit Product-Key, `company_id` für direkte oder über den Kontakt geerbte Firmenzuordnung.
- Abos: `status`, `company_id`, `product` mit Product-Key, `deal_id` für eine ausdrückliche Vertragsbeziehung.

Firmen-/Kontakt-/Deal-/Abo-Listen liefern den jeweiligen Array-Key und `total`, `page`, `limit`. CLI-Ausgaben können Teile dieser Metadaten weglassen. Alle Seiten und exakte IDs prüfen, bevor vollständige Bestände behauptet werden.

## Zusatzfelder und Stages

Custom-Field-Create benötigt `entity_type`, `key`, `label`; optional `field_type`, `options`, `position`. Typen sind `string`, `text`, `integer`, `decimal`, `boolean`, `date`, `datetime`, `enumeration`, `json`. Keyformat `^[a-z][a-z0-9_]*$`. Schemaänderungen sind ein eigener Auftrag, keine Voraussetzung für das Speichern einer normalen Notiz. Löschen entfernt die Spalte samt Werten.

Nach Registrierung können Firma, Kontakt oder Deal flache Zusatzfelder oder einen `custom`-Bag empfangen. Der Bag gewinnt. `options.required` wird beim Create geprüft; Imports behandeln Pflichtwerte anders und können fehlerhafte Zellen zu null coercieren. Ein Dry-run ersetzt die Datenprüfung nicht.

Stage-Create benötigt `label`; Key optional, anschließend unveränderlich. `is_won` und `is_lost` dürfen nicht gleichzeitig wahr sein. Bei belegter Stage verlangt Delete `reassign_to=<vorhandener-key>`; die letzte Stage kann nicht gelöscht werden. Vor Änderungen die aktuelle Stage-Liste lesen.

## Gemeinsame Deals-Ansicht und Feldregeln

GET `/v1/deals/view` liefert `{ fields, columns, default_columns, visibility, warnings }`. Der Feldkatalog enthält `{ key, label, field_type, source, options? }`; `source` ist `standard` oder `custom`. Die Konfiguration gilt für den gesamten Workspace und dieselbe Web-/CLI-Ansicht.

- PUT `/v1/deals/view` nimmt ausschließlich `{ columns: string[] }`. Reihenfolge ist relevant; Keys müssen bekannt, eindeutig und nicht leer sein. `name` bleibt als identifizierbarer Drawer-Auslöser erforderlich.
- POST `/v1/deals/view/reset` setzt nur Spalten auf den definierten Standard zurück und erhält Feldregeln.
- PUT `/v1/deals/view/visibility/:key` setzt für ein registriertes Deal-Custom-Field `{ mode: "lost" }` oder `{ mode: "stages", stages: ["vorhandener-stage-key"] }`.
- DELETE auf demselben Regelpfad entfernt genau diese Sichtbarkeitsregel. Es löscht weder Felddefinition noch Deal-Werte.
- Alle Konfigurationsmutationen liefern die vollständige Ansicht wie GET. Gegen genau diesen Zielstand zurücklesen; nicht mit Entity-Envelopes verwechseln.

Lost-Regeln verwenden `is_lost`. Ohne Regel bleibt ein Feld sichtbar. Werden Stage-Ziele entfernt, bleiben gültige Ziele wirksam; fehlt jedes Ziel, wird die veraltete Regel mit Warnung ignoriert statt sämtliche Werte zu verstecken. Entfernte Definitionen werden aus der wirksamen Auswahl ausgelassen. GET verändert dabei keine gespeicherten Daten. Neue ungültige Konfigurationen werden abgewiesen.

Sichtbarkeit ist keine Berechtigungs- oder Pflichtfeldregel. Custom-Field-Werte bleiben über die API erreichbar und werden beim Ausblenden nicht gelöscht. Kalenderdaten wie `next_step_date` werden ohne Zeitzonenverschiebung angezeigt und sind keine automatischen Erinnerungen.

## Schreibantworten

POST liefert normalerweise 201, PUT 200, DELETE 200 mit `{ "ok": true }`. Bodies und aktuelle Felddefinitionen stehen in `docs/CONTRACT.md`. Fehler sind JSON mit `error`; 422 kann zusätzlich `unknown_fields` und `valid_fields` enthalten. Die Erfolgsmeldung ist erst nach erneutem Lesen des konkreten Records bestätigt.
