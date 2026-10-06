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

## Define custom fields

Authenticate against the chosen context first. Definitions belong to the selected shared workspace. All users and the web UI see them; a context only chooses the instance.

```sh
vibe-crm custom-fields --context dev --json
vibe-crm custom-fields --entity deal --context dev
vibe-crm custom-field add --entity deal --key next_action --label 'Next action' --type date --context dev
vibe-crm custom-field add --entity deal --key priority --label Priority --type enumeration --options '{"enum":["low","high"]}' --position 2 --context dev
vibe-crm custom-field add --entity company --key account_score --label 'Account score' --type integer --options '{"min":0,"max":100}' --context dev
vibe-crm custom-field add --entity contact --key outreach_notes --label 'Outreach notes' --type text --context dev
```

`custom-fields` lists all definitions, or filters by the exact entity `company`, `contact` or `deal`. Human output includes complete IDs, keys, labels, types, positions and options. JSON output is `{ "instance": "...", "defs": [...] }`.

`custom-field add` requires `--entity`, `--key` and `--label`. The optional `--type` supports all nine storage types: `string`, `text`, `integer`, `decimal`, `boolean`, `date`, `datetime`, `enumeration`, `json`. Defaults are `string`, options `{}`, and position `0`. `--options` must be a JSON object, not `null`, an array or a scalar; numbers must be finite. `--position` must be a safe finite base-10 integer without leading zeros, whitespace or exponent notation. Negative positions are allowed.

Keys must match `^[a-z][a-z0-9_]*$` exactly. The CLI does not trim, lowercase or slugify identifiers. Labels must not be blank, but nonblank labels are preserved as supplied. Existing keys and keys reserved by the API fail instead of updating a definition. There are no native definition update/delete commands.

After one POST, the CLI reads definitions for that entity and checks the exact created ID, key, label, type, options and position. Success returns `{ "instance": "...", "def": { ... } }` in JSON mode. A missing or mismatched readback fails with exit 1. A create may already have succeeded, so list the definitions before retrying.

Write values using the existing entity add/update commands. Replace the example ID with a real record ID on the selected instance:

```sh
vibe-crm deal update --id DEAL_ID --custom '{"next_action":"2026-10-06","priority":"high"}' --context dev
vibe-crm deal update --id DEAL_ID --set next_action=2026-10-06 --context dev
```

A custom `date` is a calendar date, such as `2026-10-06`, not a timestamp. The CLI sends the literal unchanged and does not shift it through UTC or the local timezone. Use `datetime` for timestamp values. Keep numbers, booleans, structured JSON and explicit `null` typed by using `--custom` JSON rather than the string-only `--set` form.

## Configure the shared deal view

Columns control the ordered fields in the web deal pipeline. Changes affect everyone on that instance, not just the current user, terminal or named context. They do not change the existing CLI `deals` and `pipeline` output formats.

```sh
vibe-crm deal-view fields --context dev --json
vibe-crm deal-view show --context dev --json
vibe-crm deal-view set --columns name,company_name,next_action,value --context dev
vibe-crm deal-view reset --context dev
```

`fields` lists the currently selectable standard and registered custom deal fields with keys, labels, types, sources and options. Use those exact keys in `set`. `set --columns` replaces the entire list and preserves the order you supply. `name` is mandatory, but you may move it within the list. Empty entries, duplicates, spaces and unknown keys fail; keys are never silently repaired. A valid order can therefore be `company_name,name,value`.

Default columns are `name,company_name,contact_name,product_name,value,close_date`. `reset` restores these columns only. It does not remove custom-field visibility rules or change stored deal values.

`show --json` returns `instance`, `fields`, `columns`, `default_columns`, `visibility` and `warnings`. `fields --json` returns `instance`, `fields` and `warnings`. Successful write commands return the same full view as `show`, after GET readback verification.

### Show custom fields only in selected stages

Visibility rules apply to registered custom deal fields in the deal editor. They do not select pipeline columns or clear values when a field is hidden. A field without a rule is always visible. Standard fields and company/contact custom fields are not valid rule targets.

```sh
vibe-crm stages --context dev
vibe-crm deal-view rule-set --field next_action --when stages --stages prospect,qualified --context dev
vibe-crm custom-field add --entity deal --key loss_reason --label 'Loss reason' --type text --context dev
vibe-crm deal-view rule-set --field loss_reason --when lost --context dev
vibe-crm deal-view rules --context dev --json
vibe-crm deal-view rules --field loss_reason --context dev --json
vibe-crm deal-view rule-remove --field loss_reason --context dev
```

`--when lost` matches any stage with `is_lost`, including a renamed stage. Do not supply `--stages` in this mode. `--when stages` requires a comma-separated list of existing exact stage keys without whitespace, empty entries or duplicates. Stage order is not a condition; the field appears in any listed stage.

`rule-set` replaces only the targeted field's rule. `rule-remove` removes only that rule and makes the field always visible again. Neither command changes columns or other fields' rules. Removing an already-unset rule for a registered custom field is allowed. `rules --field KEY` filters one registered custom deal field, returning an empty `visibility` object if that field has no rule. An unknown or removed target fails instead of pretending it has no rule. JSON rules output is `{ "instance": "...", "visibility": { ... }, "warnings": [...] }`.

Read commands normalize stale saved configuration against the current registry and stages. Removed field keys or removed stage targets are omitted, and `warnings` explains stale entries. Reads do not rewrite the stored settings. Fresh writes to unknown columns, non-custom or removed rule targets, or unknown stages fail. Re-read `fields`, `stages` and `show` to choose valid targets; do not recreate a missing field just to silence a warning.

Each write runs once and verifies the resulting columns and rules with `GET /v1/deals/view`. Set/reset preserve rules, and rule writes preserve columns and other rules. Readback failures and mismatches exit 1 without retrying. If this happens, use `show` or `rules` to check the current state before deciding whether to repeat the write.

Group and command help work offline, including JSON mode:

```sh
vibe-crm custom-field --help
vibe-crm custom-field add --help --json
vibe-crm custom-fields --help
vibe-crm deal-view --help
vibe-crm deal-view rule-set --help --json
```

Every command above supports `--instance`, `--context`, `--json` and `--help` through the same selection and credential rules as existing commands.

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
