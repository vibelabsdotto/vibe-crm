# AGENTS.md — Vibe CRM Monorepo

## Verbindliche Quellen

1. `docs/CONTRACT.md` — API-Endpunkte, DB-Schema, CLI-Spec. **Nicht abweichen.**
2. Referenz-Implementierung (Konventionen, NICHT blind kopieren): `~/Coding/vibeplans/apps/api` (NestJS+drizzle+Better Auth) und `~/Coding/vibeplans/apps/web` (Next.js+Better Auth).
3. Original-Domäne: `/tmp/opencrm-audit` (OpenCRM v4, Hono+D1) — Schema, Import-Algorithmen, Stage-Semantik.

## Lane-Regeln (parallel agents)

- Arbeite NUR in deinem Verzeichnis: `apps/api` | `apps/web` | `apps/cli`. Root-Dateien (package.json, package-lock.json, docs/) sind read-only für Lanes.
- Commits scopen: `git add apps/api` (bzw. dein Pfad), niemals `git commit -a`.
- Keine Branches, keine Worktrees — direkt auf `main` im shared checkout.
- Kein `npm install` in Lanes (Lockfile wird zentral verwaltet). Fehlt eine Dep, melden statt selbst installieren.
- Typecheck + Tests + Build deiner Lane müssen grün sein, bevor du fertig meldest.
- Keine Secrets committen. `.env*` ist gitignored; nur `.env.example` mit Platzhaltern.

## Stil

- TypeScript strict. ESLint flat config wie VibePlans.
- Keine überflüssigen Abstraktionen; kleinster funktionierender Slice zuerst, dann härten.
- Tests sind Teil der Arbeit.
