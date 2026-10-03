# VibeCRM CLI

Plain Node.js ESM, Node >=22, no runtime dependencies. Run from the repository with `node apps/cli/bin/vibe-crm.js`, or use the workspace's `vibe-crm` binary. `--help` works without configuration or network access. Existing contacts, companies, deals, pipeline, stages, products, subscriptions, MRR, activity, imports and token commands remain available.

## Contexts

```sh
vibe-crm context add dev --url http://localhost:3100 --scope local
vibe-crm context add prod --url https://api-crm.vibelabs.to --scope global
vibe-crm context use dev --scope local
vibe-crm context list --json
vibe-crm context show --json
vibe-crm contacts --context prod --json
vibe-crm doctor --context prod --json
vibe-crm context remove dev --scope local
```

`context add`, `use` and `remove` require `--scope local|global`. `rm` aliases `remove`. Add refuses to overwrite an existing name and does not activate it. Removing an active context clears that scope's selection, allowing the other scope to take over. It does not remove or revoke tokens.

Selection order is explicit `--instance <url>` or `--context <name>`, then `CRM_INSTANCE`, local selection, global selection. `--instance` and `--context` cannot be combined. Global flags work before or after command words. Invalid higher-priority selections fail instead of falling back to another instance. An explicit context name prefers the local definition; an active global context always resolves within the global scope, even if a local context has the same name.

Contexts contain only `{ "instance": "<url>" }` in `./.crm/contexts.json` or `~/.config/vibe-crm/contexts.json`. Active names live in `./.crm/crm.json` or `~/.config/vibe-crm/config.json`. Existing `{ "instance": "<url>" }` selections and per-host `instances.json` token stores remain compatible. Local means the current working directory, not an upward repository search.

## Authentication and diagnostics

Create an API token on the selected instance's web `/settings/tokens` page. Feed it from a trusted secret source through a pipe:

```sh
<secret-source-command> | vibe-crm auth login --context prod --token-stdin
vibe-crm auth whoami --context prod --json
vibe-crm health --context prod --json
vibe-crm auth logout --context prod --json
```

Replace `<secret-source-command>` with the command that retrieves your token. Do not put a token in shell history. The older `--token <value>` form still works but exposes the value in process arguments. Both forms require exactly `vc_` followed by 48 lowercase hex characters. Stdin accepts one optional LF or CRLF, not whitespace trimming or multiple lines. Only one token source may be supplied.

Login verifies `GET /health`, requiring `{ "ok": true, "db": true }`, and authenticated `GET /v1/stats` before storing anything. It does not change the active instance/context. `--scope` can select the login store. Without it, login and legacy `config set instance <url>` write to the existing `./.crm` directory, or otherwise the global directory. Prefer explicit scopes in automation. A global login refuses to write a key hidden by an existing local key.

Token lookup remains local first, then global, keyed by host including port. Contexts with the same host share credentials, even if URL scheme or base path differs. Use separate hosts or ports for separate credentials. Logout removes matching entries in both scopes so a shadowed global key cannot reappear. It leaves other hosts untouched and does not revoke the remote token.

`context show`, `config get`, `auth whoami` and `doctor --json` report selection and token provenance without token values or fragments. `doctor` checks health and authentication and exits 1 if either fails. `health` needs no token and exits 1 when unhealthy, including JSON mode. `tokens create` is the deliberate exception: its newly issued secret is printed once.

## Safety and output

Instances must be absolute HTTP(S) URLs without embedded credentials, whitespace, query or fragment. HTTPS is recommended outside loopback. Redirects are never followed, including same-origin redirects. Configure the final API URL explicitly. Requests use bounded timeouts and are not retried.

Configuration files must contain JSON objects. Malformed JSON, invalid context/token entries, symlinked files and symlinked parent directories are rejected, not silently replaced. Writes use a private same-directory temporary file, fsync and atomic rename, with directories `0700` and files `0600`. Each file write is atomic; operations touching two stores are not cross-file transactions. Do not mutate the same store concurrently.

`--json` produces JSON on stdout. Errors produce `{ "error": "…", "detail": "…", "status": 401 }` on stderr with exit 1; status appears only for HTTP/transport errors. Health and doctor keep diagnostic results on stdout even when a check fails. Help with `--json` produces `{ "help": "…" }`. Human errors use the `✗` prefix. Unknown options, duplicate single-value flags and unexpected operands fail before requests. `--set key=value` remains repeatable. Import booleans support `--dry-run` and `--infer-company=false`.

```sh
npm run check --workspace vibe-crm
npm run typecheck --workspace vibe-crm
npm run build --workspace vibe-crm
```

These commands syntax-check every JavaScript source and load the router/import graph. This plain-JavaScript package has no TypeScript compiler step, bundle or generated output. No test files are generated.
