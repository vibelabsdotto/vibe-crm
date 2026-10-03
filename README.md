# Vibe CRM

Kontakte, Firmen, Deals — für Menschen im Browser, für Agents per CLI.

- **Web:** `apps/web` (Next.js 16, `https://crm.vibelabs.to`)
- **API:** `apps/api` (NestJS + SQLite + Better Auth, `https://api-crm.vibelabs.to`)
- **CLI:** `apps/cli` (`vibe-crm` — Instance + API-Key, `--json` für Agents)

Vertrag: `docs/CONTRACT.md`. Deployment: 2 Coolify-Apps auf `hostinger`.

## Lokal entwickeln

Starte im Repository zwei Terminals:

```sh
npm run dev:api
npm run dev:web
```

Die Web-App läuft auf `http://localhost:3000`, die API auf `http://localhost:3100`.
Beide Entwicklungsskripte aktivieren `LOCAL_WEB_ACCOUNT=true`. Ein lokaler Account
wird idempotent in der lokalen SQLite-Datenbank angelegt. Die Oberfläche öffnet
sich ohne Registrierung oder manuelle Anmeldung. Es werden keine Produktionsdaten
importiert und keine festen Zugangsdaten gespeichert.

Der Modus ist ausschließlich für `NODE_ENV=development` und direkte
Loopback-Verbindungen erlaubt. Die API bindet dann nur an Loopback. Fremde Hosts,
Origins und weitergeleitete Anfragen bekommen keine lokale Identität.
Production verwendet weiterhin normale E-Mail-/Passwort-Anmeldung und API-Tokens.
Die Web-App bietet keinen Google-Login mehr an.

## Komponenten und Theme

Die Produkt-App verwendet das neutrale `base-nova`-Theme mit Geist/Geist Mono und
Base-UI-shadcn-Komponenten wie `openfibu/apps/web`. CRM-Navigation und bestehende
Geschäftsfunktionen bleiben erhalten.
