# Vibe CRM

Kontakte, Firmen, Deals — für Menschen im Browser, für Agents per CLI.

- **Web:** `apps/web` (Next.js 16, `https://crm.vibelabs.to`)
- **API:** `apps/api` (NestJS + SQLite + Better Auth, `https://api-crm.vibelabs.to`)
- **CLI:** `apps/cli` (`vibe-crm`, benannte Kontexte und API-Tokens, `--json` für Agents)

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

## CLI-Kontexte

Ohne globale Installation funktioniert die CLI direkt aus dem Repository:

Mit `npm link --workspace apps/cli --ignore-scripts` ist `vibe-crm` auch direkt
im Terminal verfügbar und zeigt auf diesen Checkout.

```sh
node apps/cli/bin/vibe-crm.js context add dev --url http://localhost:3100 --scope local
node apps/cli/bin/vibe-crm.js context add prod --url https://api-crm.vibelabs.to --scope global
node apps/cli/bin/vibe-crm.js context use dev --scope local
node apps/cli/bin/vibe-crm.js context list --json
node apps/cli/bin/vibe-crm.js health --context prod --json
```

Ein Kontext speichert nur die API-URL. Für Datenbefehle braucht die CLI weiterhin
einen API-Token aus der jeweiligen Web-App unter Einstellungen → API-Tokens.
`auth login --context <name> --token-stdin` nimmt ihn aus einer vertrauenswürdigen
Pipe entgegen. Tokens gehören weder in Shell-History noch ins Repository.

`--context` und `--instance` sind gegenseitig ausgeschlossen. Danach gelten
`CRM_INSTANCE`, die lokale Auswahl und die globale Auswahl in dieser Reihenfolge.
`doctor --context <name> --json` prüft Auswahl, Tokenherkunft, Health und Auth.
Weitere Befehle und Speicherdetails stehen in [apps/cli/README.md](apps/cli/README.md).
