#!/usr/bin/env node
/** Plain ESM, Node >=22, zero dependencies. */
import { run, reportError } from "../lib/run.mjs";

const HELP = `vibe-crm — Vibe CRM CLI (contacts, companies, deals, products, subscriptions)

Usage: vibe-crm <command> [flags]

Selection: --instance <url> | --context <name> > CRM_INSTANCE > local selection > global selection
Global flags work anywhere; --instance and --context are mutually exclusive.
Output: --json prints the raw data object (default: human-readable tables)

CONTEXTS, INSTANCE & AUTH
  vibe-crm context add <name> --url <url> --scope local|global
  vibe-crm context use <name> --scope local|global
  vibe-crm context list [--scope local|global]
  vibe-crm context show [<name>] [--scope local|global] [--json]
  vibe-crm context remove <name> --scope local|global
  vibe-crm doctor [--context <name>] [--json]   selection, token provenance, health/auth checks
  vibe-crm config set instance <url>        remember the instance for future runs
  vibe-crm config get                       show current instance + stored keys
  vibe-crm auth login [--instance <url> | --context <name>] --token-stdin
                                      verify & store the API token (from web /settings/tokens)
  vibe-crm auth whoami --instance <url>     verify the stored token against the instance
  vibe-crm auth logout --instance <url>     remove the stored token
  vibe-crm health                           check instance reachability (no auth needed)

CONTACTS & COMPANIES
  vibe-crm contacts [--search <q>] [--status lead|active|inactive|churned] [--company-id <id>] [--limit <n>]
  vibe-crm contact show --id <id>
  vibe-crm contact add --first-name <v> [--last-name <v>] [--email <v>] [--phone <v>]
                       [--company-id <id>] [--title <v>] [--status <v>] [--set key=value ...]
  vibe-crm contact update --id <id> [--first-name <v> ...]
  vibe-crm contact rm --id <id>
  vibe-crm companies [--search <q>] [--industry <v>] [--limit <n>]
  vibe-crm company add --name <v> [--domain <v>] [--industry <v>] [--phone <v>] [--email <v>] [--notes <v>]
  vibe-crm company update --id <id> [--name <v> ...]
  vibe-crm company rm --id <id>

DEALS & PIPELINE
  vibe-crm deals [--search <q>] [--stage <key>] [--product <key>]
  vibe-crm deal add --name <v> [--contact-id <id>] [--company-id <id>] [--product <key>]
                    [--value <n>] [--stage <key>] [--close-date <iso>] [--notes <v>]
  vibe-crm deal update --id <id> [--name <v> ...] [--company-id <id>] [--product <key>]
  vibe-crm deal move --id <id> --stage <key>
  vibe-crm deal rm --id <id>
  vibe-crm pipeline                         deals grouped by stage
  vibe-crm stages                           list pipeline stages

PRODUCTS & SUBSCRIPTIONS
  vibe-crm products [--search <q>]
  vibe-crm product add --name <v> [--key <slug>] [--type product|service|other] [--status <v>] [--notes <v>]
  vibe-crm product rm --key <slug>
  vibe-crm subscriptions [--status <v>] [--product <key>] [--company-id <id>]
  vibe-crm subscription add --name <v> [--company-id <id>] [--product <key>] [--amount <n>]
                            [--interval monthly|quarterly|yearly|one_time] [--status <v>] [--notes <v>]
  vibe-crm subscription update --id <id> [--name <v> ...]
  vibe-crm subscription cancel --id <id>   (sets status=cancelled)
  vibe-crm subscription rm --id <id>
  vibe-crm mrr                              recurring-revenue summary

ACTIVITY / IMPORT / TOKENS
  vibe-crm activity log --entity contact|company|deal --id <entityId> [--type note|email|meeting|stage_change] [--body <text>]
  vibe-crm activity list --entity contact|company|deal --id <entityId>
  vibe-crm import contacts <file.csv|json> [--dry-run] [--infer-company]
  vibe-crm import companies <file.csv|json> [--dry-run]
  vibe-crm import notion <seed.json> [--dry-run]   (Notion export, idempotent)
  vibe-crm tokens create --name <label>     (prints the vc_… secret ONCE)
  vibe-crm tokens ls
  vibe-crm tokens revoke --id <id>

Every command supports --help. Examples:
  vibe-crm context add dev --url http://localhost:3100 --scope local
  vibe-crm context use dev --scope local
  vibe-crm contacts --status lead --json
  vibe-crm deal move --id <id> --stage won`;

const argv = process.argv.slice(2);
run(argv, HELP).catch((error) => reportError(error, argv.some((arg) => ["--json", "--json=true", "-j"].includes(arg))));
