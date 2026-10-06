---
name: vibe-crm
description: "Use when using Vibe CRM via CLI, API or web. Manage companies, contacts, deals, custom fields, shared list columns, stage-dependent field visibility, subscriptions, activities and imports with explicit instance selection and safe token authentication."
---

# Vibe CRM nutzen

Nutze diesen Skill für die Bedienung einer Vibe-CRM-Instanz, nicht für Entwicklung oder Deployment. Er ist instanzneutral. Hostnamen, Kontextnamen und Geschäftsregeln kommen aus dem Auftrag oder einem ergänzenden lokalen Skill.

## Einstieg

1. Ermittle die freigegebene **API-Basis-URL** und den gewünschten Kontext. Web-URL und API-URL können unterschiedliche Hosts sein. Die Basis-URL enthält noch kein `/v1`.
2. Verwende die vorhandene `vibe-crm`-CLI mit Node.js >=22. Ohne globalen Befehl funktioniert im Repository `node apps/cli/bin/vibe-crm.js`. Eine bereits vorhandene Installation nicht ungefragt ersetzen.
3. Prüfe Auswahl und Authentifizierung, bevor du Daten liest oder schreibst:

```sh
vibe-crm --help
vibe-crm context list --json
vibe-crm context show --context crm --json
vibe-crm doctor --context crm --json
```

`crm` ist in allen Beispielen ein Platzhalter für den tatsächlich eingerichteten Kontext. Shell-Variablen wie `$COMPANY_ID` müssen mit vollständigen, zuvor gelesenen IDs belegt sein. Beispiele für Schreibbefehle nicht als Einrichtungs- oder Prüfschritte ausführen.

## Verbindung und Anmeldung einrichten

Nur wenn Einrichtung oder Anmeldung beauftragt ist:

```sh
vibe-crm context add crm --url "$API_URL" --scope global --json
vibe-crm context use crm --scope global --json
```

- `$API_URL` muss die endgültige HTTP(S)-API-URL sein. Außerhalb von Loopback HTTPS verwenden. Eingebettete Credentials, Whitespace, Query und Fragment sind ungültig. Redirects werden nicht verfolgt.
- `context add` speichert nur die URL, aktiviert den Kontext nicht und überschreibt keine bestehenden Namen. Bestehenden Kontext erst mit `context show crm --scope global --json` prüfen.
- Ein Personal Access Token kommt aus der Web-App unter `/settings/tokens`. Token-Anmeldung benötigt keine Registrierung und keinen Passwort-Login.
- Tokenformat exakt `vc_` plus 48 kleingeschriebene Hex-Zeichen. Ungültige Werte nicht korrigieren oder probeweise senden.
- Ein vertrauenswürdiger Secret-Reader muss den Token über stdin liefern, nicht über Prozessargumente. Der sichere Empfänger ist `vibe-crm auth login --context crm --scope global --token-stdin --json`. Kein Token in Shell-History, Skills, Exporten oder Repository-Dateien.
- Login prüft `/health` und authentifiziertes `/v1/stats`, bevor der Token gespeichert wird. Er wechselt nicht die aktive Auswahl.

Anschließend den gespeicherten Zugang erneut prüfen:

```sh
vibe-crm auth whoami --context crm --json
vibe-crm doctor --context crm --json
```

`whoami` bestätigt den Token und liefert Statistiken, keine Benutzeridentität. `health` allein bestätigt nur die öffentliche Erreichbarkeit, nicht den Datenzugriff.

### Auswahl und Speicher

Explizit `--context` oder `--instance` > `CRM_INSTANCE` > lokale Auswahl > globale Auswahl. Beide Auswahlflags zusammen sind ungültig. Für Automation jede Datenoperation explizit an dieselbe Instanz binden.

- Globale Kontexte und Auswahl: `~/.config/vibe-crm/contexts.json` und `config.json`.
- Globale Tokens: `~/.config/vibe-crm/instances.json`.
- Lokale Entsprechungen: `./.crm/contexts.json`, `crm.json` und `instances.json`. Lokal meint den aktuellen Arbeitsordner, keine Suche in Elternordnern.
- Explizite Kontextnamen bevorzugen lokale Definitionen. Tokens werden ebenfalls lokal vor global gesucht, pro Host inklusive Port. Gleicher Host bedeutet gleicher Token, auch bei unterschiedlichen Kontextnamen oder URL-Pfaden.
- `--scope` für Einrichtungsbefehle explizit angeben. Lokale Schatten nicht ungefragt löschen. Diagnosebefehle zeigen Herkunft, aber keine Tokenwerte.
- Beschädigtes JSON und symlinkbehaftete Config-Pfade werden abgewiesen. Nicht durch manuelles Überschreiben oder gelockerte Prüfungen umgehen.

## Datenmodell verstehen

| Objekt | Bedeutung | Wichtige Regeln |
| --- | --- | --- |
| Company | Firma | `name` ist Pflicht; allgemeine Telefonnummer, Domain, E-Mail und Notizen gehören hierhin. |
| Contact | Person | `first_name` ist Pflicht; optional `company_id`; Status nur `lead`, `active`, `inactive`, `churned`. Kein eingebautes `notes`-Feld, dafür Activities. |
| Deal | Verkaufschance | `name` ist Pflicht; optional Company, Contact und Product; `stage` ist ein existierender Stage-Key. |
| Stage | Pipeline-Stufe | Keys und Bedeutungen live lesen; `is_won` und `is_lost` bestimmen gewonnen/verloren, nicht allein das Label. |
| Product | Produkt oder Leistung | Fremdschlüssel ist der `key`-Slug, keine UUID. Typ `product`, `service` oder `other`. |
| Subscription | Vertrag oder Abo | `name` ist Pflicht; Betrag, Währung, Intervall, Status und Laufzeit ausdrücklich setzen. |
| Activity | Timeline-Eintrag | Entität `company`, `contact` oder `deal`; Typ `note`, `email`, `meeting` oder `stage_change`; `meta` ist ein JSON-Bag. |
| Custom Field | Zusätzliches Feld | Muss vorher registriert sein. Es ist eine echte Tabellenspalte, kein beliebiger Notiz-Key. |

V1 ist ein einzelner gemeinsamer Workspace. Jede authentifizierte Identität und jeder API-Token hat vollen CRUD-Zugriff. Ein Agent- oder Produktfilter ist **keine** serverseitige Berechtigungsgrenze.

## Erst lesen, dann gezielt ändern

```sh
vibe-crm companies --context crm --search "$COMPANY_QUERY" --page 1 --limit 100 --json
vibe-crm contacts --context crm --company-id "$COMPANY_ID" --page 1 --limit 100 --json
vibe-crm contact show --context crm --id "$CONTACT_ID" --json
vibe-crm stages --context crm --json
vibe-crm products --context crm --json
vibe-crm deals --context crm --product "$PRODUCT_KEY" --page 1 --limit 100 --json
vibe-crm pipeline --context crm --json
vibe-crm subscriptions --context crm --company-id "$COMPANY_ID" --page 1 --limit 100 --json
vibe-crm mrr --context crm --json
vibe-crm activity list --context crm --entity company --id "$COMPANY_ID" --json
```

- `companies`, `contacts`, `deals` und `subscriptions` sind paginiert. Bei vollständigen Listen mit unveränderten Filtern alle Seiten lesen, über vollständige IDs deduplizieren und den gezählten Bestand gegen `total` prüfen. Eine Seite mit 100 Einträgen ist nicht automatisch vollständig. Ein leeres Ergebnis vor dem angekündigten Total ist ein Prüfproblem.
- JSON-Listen enthalten den jeweiligen Array-Key, etwa `companies`, plus `total`. Die CLI gibt bei diesen Listen keine `page`-/`limit`-Metadaten zurück, daher die angeforderten Werte selbst festhalten.
- Menschliche Tabellen kürzen IDs. Immer die vollständige JSON-ID für Änderungen verwenden.
- Die CLI hat `contact show`, aber kein `company show`, `deal show`, allgemeines `--filters` oder Produktfilter für Firmen/Kontakte. Firmen und Deals vor/nach Änderungen anhand ihrer ID in den passenden Listen finden.
- Firmen sind produktübergreifend. Deals und Abos lassen sich nach Produkt filtern. `pipeline` zeigt die gesamte Pipeline, keinen einzelnen Produktbereich.
- Vor Create nach Firma, Domain, E-Mail und vorhandener Zuordnung suchen. Ähnliche Namen oder gleiche Adressen beweisen nicht dieselbe juristische Person. CRUD-Create ist kein Upsert und garantiert keine Dublettenvermeidung.

### Beauftragte Änderungen ausführen

Nur die verlangten Felder senden. Unbekannte Werte weglassen, nicht erfinden und keine bestehenden Angaben durch leere Strings ersetzen.

```sh
vibe-crm company add --context crm --name "$COMPANY_NAME" --domain "$DOMAIN" --json
vibe-crm company update --context crm --id "$COMPANY_ID" --phone "$PHONE" --json
vibe-crm contact add --context crm --first-name "$FIRST_NAME" --last-name "$LAST_NAME" --company-id "$COMPANY_ID" --status lead --json
vibe-crm contact update --context crm --id "$CONTACT_ID" --title "$TITLE" --json
vibe-crm deal add --context crm --name "$DEAL_NAME" --company-id "$COMPANY_ID" --product "$PRODUCT_KEY" --stage "$STAGE_KEY" --value "$VALUE" --json
vibe-crm deal move --context crm --id "$DEAL_ID" --stage "$STAGE_KEY" --json
vibe-crm activity log --context crm --entity company --id "$COMPANY_ID" --type note --body "$NOTE" --meta "$META_JSON" --json
vibe-crm subscription add --context crm --name "$SUBSCRIPTION_NAME" --company-id "$COMPANY_ID" --product "$PRODUCT_KEY" --amount "$AMOUNT" --currency "$CURRENCY" --interval "$INTERVAL" --status "$SUBSCRIPTION_STATUS" --json
```

Danach das konkrete Ziel erneut lesen und ID, geänderte Werte und Beziehungen vergleichen. Eine erfolgreiche Antwort allein ist keine bestätigte Änderung. `notes` wird als ganzer String ersetzt, deshalb vorherige Notizen lesen und bei Ergänzungen erhalten. Mehrere Entity-Schritte sind keine gemeinsame Transaktion; Teilfortschritt und offene Schritte getrennt melden.

- Ein Stage-Wechsel über `deal move` erzeugt bereits eine `stage_change`-Activity. Keine doppelte Stage-Activity anlegen.
- `activity log --type email` protokolliert eine Nachricht, sendet aber keine E-Mail. Auch `meeting` plant keinen Termin. Nur tatsächlich stattgefundene Kommunikation als solche protokollieren.
- Keine eingebauten Follow-up-Tasks, Erinnerungen oder Kalender-/E-Mail-Synchronisation voraussetzen. Nächste Schritte können als Notiz oder vereinbarte Activity-Metadaten gespeichert werden, ohne automatische Ausführung.
- Custom Writes über `--set key=value` oder `--custom '{"key":"value"}'` bei Firma, Kontakt und Deal. Vorher Definition und Typ prüfen. Unbekannte Keys ergeben 422; der Custom-Bag gewinnt bei Überschneidungen.

## Zusatzfelder registrieren und verwenden

Definitionen zuerst lesen. Eine neue Definition ist eine beauftragte Schemaänderung, kein beiläufiger Vorbereitungsschritt. Vorhandene Keys nicht erneut anlegen. Die folgenden Schreibbeispiele gelten nur für eine freigegebene Beispielinstanz und einen tatsächlich neuen Key:

```sh
vibe-crm custom-fields --context crm --entity deal --json
vibe-crm custom-field add --context crm --entity deal --key next_step --label "Nächster Schritt" --type enumeration --options '{"enum":["follow_up","meeting"]}' --position 0 --json
vibe-crm custom-fields --context crm --entity deal --json
vibe-crm deal update --context crm --id "$DEAL_ID" --set next_step=follow_up --json
vibe-crm deals --context crm --page 1 --limit 100 --json
```

`custom-field add` benötigt Entität, Key und Label. Typen sind `string`, `text`, `integer`, `decimal`, `boolean`, `date`, `datetime`, `enumeration`, `json`. `--options` ist ein JSON-Objekt, `--position` eine Ganzzahl. Die CLI bestätigt die Anlage durch Rücklesen der Registry. Sie bietet keine Befehle zum Ändern oder Löschen von Definitionen. Ein Konflikt oder unklarer Schreibausgang ist kein Anlass für einen blinden zweiten POST.

## Gemeinsame Deals-Ansicht konfigurieren

Die Spalten- und Feldregeln gelten für den gesamten Workspace und dieselbe Web-Ansicht. Nicht als persönliche Agent-Konfiguration behandeln. Verfügbare Keys, aktuelle Auswahl und aktuelle Stages zuerst lesen:

```sh
vibe-crm deal-view fields --context crm --json
vibe-crm deal-view show --context crm --json
vibe-crm stages --context crm --json
vibe-crm deal-view rules --context crm --json
```

Nur bei einem Konfigurationsauftrag ändern. Alle genannten Custom Fields und Stage-Keys müssen vorher als vorhanden gelesen sein:

```sh
vibe-crm deal-view set --context crm --columns name,company_name,value,next_step,next_step_note,next_step_date --json
vibe-crm deal-view show --context crm --json
vibe-crm deal-view rule-set --context crm --field lost_reason --when lost --json
vibe-crm deal-view rules --context crm --field lost_reason --json
vibe-crm deal-view rule-set --context crm --field next_step_note --when stages --stages prospect,qualified --json
vibe-crm deal-view rule-remove --context crm --field next_step_note --json
vibe-crm deal-view reset --context crm --json
```

- Die Reihenfolge in `--columns` ist die sichtbare Reihenfolge. `name` bleibt erforderlich, weil es den Deal identifiziert und öffnet. Keys nicht anhand von Labels erraten oder normalisieren.
- `reset` stellt ausschließlich die Standardspalten wieder her und erhält Sichtbarkeitsregeln. `rule-remove` hebt genau die genannte Feldregel auf. Die Standardansicht ist keine automatische Rücknahme anderer Workspace-Einstellungen.
- `--when lost` verwendet das Stage-Merkmal `is_lost`, nicht einen bestimmten Key oder das Label Lost. Konkrete Stage-Regeln verwenden zuvor gelesene Keys. Ohne Regel bleibt ein Feld sichtbar.
- Ausgeblendete Werte bleiben gespeichert. Regeln erteilen keine Berechtigungen, erzwingen keine zusätzlichen Pflichtwerte und verändern keine Deal-Stage. Veraltete Definitionen und entfernte Stage-Ziele werden kontrolliert mit Warnungen behandelt.
- Nach einer CLI-Änderung die Web-Ansicht aktualisieren. Nach einer UI-Änderung `deal-view show` oder `rules` erneut lesen. Es gibt keine getrennte CLI-Ansicht und keine ausschließlich lokale Spaltenauswahl.
- `next_step_date` bezeichnet ein Kalenderdatum der nächsten Aktion, nicht das Deal-Abschlussdatum. Es wird ohne Zeitzonenverschiebung angezeigt und erzeugt keine automatische Erinnerung.

## Abos und Umsatz

Intervalle sind `monthly`, `quarterly`, `yearly`, `one_time`; Statuswerte `active`, `trial`, `paused`, `cancelled`, `expired`. Ein gewonnener Deal ist nicht automatisch ein Abo.

`mrr` summiert aktive und Trial-Abos: monatlicher Betrag, Quartalsbetrag geteilt durch drei, Jahresbetrag geteilt durch zwölf; Einmalzahlungen zählen nicht. Berechnungen mit einem Tool ausführen. Bei unterschiedlichen Währungen nicht ungeprüft eine einheitliche Gesamtsumme behaupten.

`subscription cancel` setzt nur `status=cancelled`; es kündigt keine externe Zahlung und löscht den Datensatz nicht. Vertragsänderungen, Kündigungen und Löschungen verlangen einen entsprechenden Auftrag.

## Import

```sh
vibe-crm import companies "$IMPORT_JSON" --context crm --dry-run --json
vibe-crm import contacts "$IMPORT_JSON" --context crm --dry-run --infer-company=false --json
vibe-crm import notion "$SEED_JSON" --context crm --dry-run --json
```

- Kontakt-/Firmenimporte akzeptieren JSON-Arrays oder `{ "contacts": [...] }` / `{ "companies": [...] }`, beziehungsweise **kommagetrennte** CSV mit API-Feldnamen. Semikolon-CSV vorab kontrolliert konvertieren; vorzugsweise JSON verwenden.
- Maximal 2000 Records pro Kontakt-/Firmenimport. JSON-Felder, Beziehungen und Pflichtwerte selbst prüfen. Dieser Dry-run parst und zählt lokal, beweist weder Servervalidierung noch erfolgreiche Speicherung.
- `--infer-company=false` verhindert unerwünschte Firmenableitung aus E-Mail-Domains. Ableitung nur aktivieren, wenn sie beauftragt und fachlich sinnvoll ist.
- `import notion` verarbeitet einen vorbereiteten Seed, greift nicht auf Notion zu. Es ordnet Namen/Keys zu, überspringt vorhandene Firmen sowie Deals/Abos anhand Name+Firma und führt Product-Upserts aus. Ein Wiederholungslauf ist kein allgemeiner Synchronisationsmechanismus und repariert nicht sämtliche unvollständigen Einträge.
- Der Notion-Dry-run liest vorhandene Daten bei eingerichtetem Zugang. Ohne Zugang kann er nur lokale Planwerte liefern, keinen bestätigten Dublettenabgleich.
- Vor dem echten Import den Dry-run, Datenumfang und Ziel prüfen. Erst mit Importauftrag `--dry-run` entfernen. Rückgabe einschließlich `failures`, `skipped` und `duplicates` auswerten und konkrete Zielrecords erneut lesen. Kein blinder Wiederholungslauf nach Timeout.

## Web und API

Die Web-App bietet Dashboard `/`, Kontakte `/contacts`, Kontakt-Details `/contacts/:id`, Firmen `/companies`, Deals `/deals`, Abos `/subscriptions` und Einstellungen `/settings/company`, `/settings/products`, `/settings/properties`, `/settings/tokens`. Firmen, Kontakte, Deals und Abos öffnen im seitlichen Drawer. Die Deals-Liste hat eine gemeinsame Spalten- und Feldregelkonfiguration. Menschen nutzen die Web-App; Agents bevorzugen CLI und `--json` statt UI-Automation. Tokenzugang ist keine Web-Session.

Für Stage-Verwaltung, Änderungen bestehender Custom-Field-Definitionen, Product-Updates oder zusätzliche API-Filter, die die CLI nicht anbietet, lies [references/api.md](references/api.md). Im Quellcheckout ist `docs/CONTRACT.md` verbindlich; `apps/cli/README.md` und die tatsächliche `--help`-Ausgabe belegen CLI-Verhalten. Keine vermuteten CLI-Befehle erfinden.

## Fehler und Grenzen

- `--json`: Daten auf stdout, strukturierte Fehler auf stderr, Fehlercode 1. `doctor` und `health` liefern auch bei Fehlern Diagnosedaten auf stdout und Exit 1. Hilfe kann mit `--json` gelesen werden.
- 401: Token ungültig/fehlend. Auswahl und Herkunft prüfen; nicht ungefragt rotieren oder einen anderen Token kopieren. 403: verweigerter Zugriff. 400/422: Felder, Typen und gültige Keys prüfen. 409: Konflikt oder referenzierte Daten. 429: Rate-Limit respektieren. Transport-/Serverfehler sind kein leeres CRM.
- Requests haben begrenzte Timeouts und keine automatischen Retries. Nach unklarer Schreibantwort zuerst das Ziel lesen, sonst drohen Dubletten.
- Löschen, Schemaänderungen, Imports, Token-Erstellung/-Widerruf und Kündigungen nicht aus einem reinen Lese- oder Einrichtungsauftrag ableiten.
- Firmen-/Kontaktlöschung lässt abhängige Records bestehen und löst deren Beziehungen. Produktlöschung wird bei referenzierenden Deals/Abos abgewiesen. Stage-Löschung kann Reassignment verlangen; Custom-Field-Löschung entfernt die Spalte und ihre Werte.
- `auth logout` entfernt gespeicherte Credentials für den Host in beiden Scopes, widerruft den Token aber nicht auf dem Server. `context remove` löscht keinen Token. `tokens create` gibt einmalig ein Secret aus; nicht als Diagnosebefehl verwenden.
- Keine Produktions-Testrecords, unangefragten Backups, direkten Datenbankeingriffe, Commits oder Deployments für eine Bedienungsaufgabe.
