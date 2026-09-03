#!/usr/bin/env node
/**
 * vibe-crm — the Vibe CRM Agent-CLI (plain ESM, zero deps, runs with system node).
 *
 * Operates any Vibe CRM instance with a stored API token (vc_… from web /settings/tokens).
 *
 * Global flags: --instance <url> (override instance), --json (machine output).
 */
import {
  deleteApiKey,
  getApiKey,
  getInstanceEntry,
  instanceKey,
  listInstances,
  loadConfig,
  redact,
  resolveInstance,
  saveApiKey,
  saveConfig
} from "../lib/config.mjs";
import { ApiError, UsageError, assertInstance, connect, health, lastConnectedInstance, request } from "../lib/client.mjs";
import * as C from "../lib/commands.mjs";

const HELP = `vibe-crm — Vibe CRM CLI (contacts, companies, deals, products, subscriptions)

Usage: vibe-crm <command> [flags]

Instance (first set wins): --instance <url> | CRM_INSTANCE=<url> | ./.crm/crm.json | ~/.config/vibe-crm/config.json
Output: --json prints the raw data object (default: human-readable tables)

INSTANCE & AUTH
  vibe-crm config set instance <url>        remember the instance for future runs
  vibe-crm config get                       show current instance + stored keys
  vibe-crm auth login --instance <url> --token <vc_…>
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
  vibe-crm auth login --instance http://localhost:3100 --token vc_abc…
  vibe-crm contacts --status lead --json
  vibe-crm deal move --id <id> --stage won`;

function fail(message) {
  process.stderr.write(`✗ ${message}\n`);
  process.exit(1);
}

function parseFlags(argv) {
  const flags = {};
  const positional = [];
  const push = (name, value) => {
    if (flags[name] === undefined) flags[name] = value;
    else if (Array.isArray(flags[name])) flags[name].push(value);
    else flags[name] = [flags[name], value];
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const body = arg.slice(2);
      const eq = body.indexOf("=");
      if (eq >= 0) {
        push(body.slice(0, eq), body.slice(eq + 1));
      } else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          push(body, next);
          i++;
        } else {
          flags[body] = true;
        }
      }
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

function str(flags, name) {
  const v = flags[name];
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.find((x) => typeof x === "string");
  return undefined;
}

async function main() {
  const [command, sub, ...rest] = process.argv.slice(2);
  // a flag right after the command (e.g. `vibe-crm contacts --json`) is not a subcommand
  const effectiveSub = sub && sub.startsWith("--") ? undefined : sub;
  const effectiveRest = sub && sub.startsWith("--") ? [sub, ...rest] : rest;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(HELP + "\n");
    return;
  }
  const { flags, positional } = parseFlags(effectiveRest);
  flags._positional = positional;
  const json = flags.json === true;
  const instanceFlag = str(flags, "instance");

  // ---- no-connect commands
  if (command === "config") {
    if (flags.help === true || flags.h === true) {
      console.log("vibe-crm config — set | get\n\nUsage:\n  vibe-crm config set instance <url>\n  vibe-crm config get");
      return;
    }
    if (effectiveSub === "set" && positional[0] === "instance") {
      const url = positional[1];
      if (!url) fail("vibe-crm config set instance <url>");
      saveConfig({ ...loadConfig(), instance: url });
      console.log(`Instance set to ${url}`);
      return;
    }
    if (effectiveSub === "get" || !effectiveSub) {
      const instance = resolveInstance(instanceFlag) ?? "(not set)";
      console.log(`instance: ${instance}`);
      const store = listInstances();
      const keys = Object.entries(store);
      if (keys.length === 0) console.log("stored API tokens: (none)");
      for (const [host, entry] of keys) {
        console.log(`stored API token: ${host}${entry.email ? ` (${entry.email})` : ""} ${redact(entry.apiKey)}`);
      }
      return;
    }
    fail(`Unknown config command "vibe-crm config ${effectiveSub}". Try: config set instance <url> | config get`);
  }

  if (command === "auth") {
    if (flags.help === true || flags.h === true || !effectiveSub) {
      console.log(
        "vibe-crm auth — login | whoami | logout\n\nUsage:\n  vibe-crm auth login --instance <url> --token <vc_…>\n  vibe-crm auth whoami [--instance <url>]\n  vibe-crm auth logout [--instance <url>]"
      );
      return;
    }
    const url = (instanceFlag ?? resolveInstance()) ?? fail("vibe-crm auth needs --instance <url> (or a configured instance)");
    if (effectiveSub === "login") {
      const token = str(flags, "token");
      if (!token) fail("vibe-crm auth login needs --token <vc_…> (copy the key from web /settings/tokens)");
      if (!token.startsWith("vc_")) fail("The token must start with vc_ (copy the full key from web /settings/tokens)");
      const check = await health(url);
      if (!check.ok) fail(`Instance unhealthy/unreachable at ${url} (status ${check.status}) — not storing the token.`);
      let stats;
      try {
        stats = await request(url, { path: "/v1/stats", token });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) fail(`Token rejected by ${url} (401) — not storing it.`);
        throw err;
      }
      saveApiKey(url, token);
      const n = stats && typeof stats === "object" ? stats : {};
      console.log(
        `✓ API token stored for ${instanceKey(url)} (${n.contacts ?? "?"} contacts, ${n.companies ?? "?"} companies, ${n.deals ?? "?"} deals). Use: vibe-crm contacts`
      );
      return;
    }
    if (effectiveSub === "whoami") {
      const entry = getInstanceEntry(url);
      if (!entry) fail(`No API token stored for ${instanceKey(url)}. Run: vibe-crm auth login --instance ${url} --token <vc_…>`);
      let stats;
      try {
        stats = await request(url, { path: "/v1/stats", token: entry.apiKey });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          fail(`API token rejected (401). Re-run: vibe-crm auth login --instance ${url} --token <vc_…>`);
        }
        throw err;
      }
      if (json) {
        process.stdout.write(JSON.stringify({ instance: url, ok: true, key: redact(entry.apiKey), stats }, null, 2) + "\n");
      } else {
        const n = stats && typeof stats === "object" ? stats : {};
        console.log(
          `✓ ${instanceKey(url)} — API token valid ${redact(entry.apiKey)} (${n.contacts ?? "?"} contacts, ${n.companies ?? "?"} companies, ${n.deals ?? "?"} deals, value ${n.dealValue ?? "?"})`
        );
      }
      return;
    }
    if (effectiveSub === "logout") {
      if (deleteApiKey(url)) console.log(`✓ Removed API token for ${instanceKey(url)}`);
      else console.log(`No stored API token for ${instanceKey(url)}.`);
      return;
    }
    fail(`Unknown auth command "vibe-crm auth ${effectiveSub}". Try: login | whoami | logout`);
  }

  if (command === "health") {
    await C.cmdHealth(flags, { instance: "", json });
    return;
  }

  // ---- help-first routing for data commands (no instance/key needed for --help)
  if (flags.help === true || flags.h === true) {
    if (command === "import" && effectiveSub === "notion") {
      console.log(C.IMPORT_NOTION_HELP);
      return;
    }
    const helpMap = {
      contacts: C.CONTACTS_HELP,
      contact: C.CONTACT_HELP,
      companies: C.COMPANIES_HELP,
      company: C.COMPANY_HELP,
      deals: C.DEALS_HELP,
      deal: C.DEAL_HELP,
      pipeline: C.PIPELINE_HELP,
      stages: C.STAGES_HELP,
      products: C.PRODUCTS_HELP,
      product: C.PRODUCT_HELP,
      subscriptions: C.SUBSCRIPTIONS_HELP,
      subscription: C.SUBSCRIPTION_HELP,
      mrr: C.MRR_HELP,
      activity: C.ACTIVITY_HELP,
      import: C.IMPORT_HELP,
      tokens: C.TOKENS_HELP
    };
    const text = helpMap[command];
    if (text) {
      console.log(text);
      return;
    }
  }

  // ---- data commands (all connect first)
  const ctx = { instance: "", json };
  try {
    switch (command) {
      case "contacts":
        await C.cmdContacts(flags, ctx);
        break;
      case "contact":
        if (effectiveSub === "show") await C.cmdContactShow(flags, ctx);
        else if (effectiveSub === "add") await C.cmdContactAdd(flags, ctx);
        else if (effectiveSub === "update") await C.cmdContactUpdate(flags, ctx);
        else if (effectiveSub === "rm") await C.cmdContactRm(flags, ctx);
        else fail('vibe-crm contact needs a subcommand: show | add | update | rm (try: vibe-crm contact --help)');
        break;
      case "companies":
        await C.cmdCompanies(flags, ctx);
        break;
      case "company":
        if (effectiveSub === "add") await C.cmdCompanyAdd(flags, ctx);
        else if (effectiveSub === "update") await C.cmdCompanyUpdate(flags, ctx);
        else if (effectiveSub === "rm") await C.cmdCompanyRm(flags, ctx);
        else fail('vibe-crm company needs a subcommand: add | update | rm (try: vibe-crm company --help)');
        break;
      case "deals":
        await C.cmdDeals(flags, ctx);
        break;
      case "deal":
        if (effectiveSub === "add") await C.cmdDealAdd(flags, ctx);
        else if (effectiveSub === "update") await C.cmdDealUpdate(flags, ctx);
        else if (effectiveSub === "move") await C.cmdDealMove(flags, ctx);
        else if (effectiveSub === "rm") await C.cmdDealRm(flags, ctx);
        else fail('vibe-crm deal needs a subcommand: add | update | move | rm (try: vibe-crm deal --help)');
        break;
      case "pipeline":
        await C.cmdPipeline(flags, ctx);
        break;
      case "stages":
        await C.cmdStages(flags, ctx);
        break;
      case "products":
        await C.cmdProducts(flags, ctx);
        break;
      case "product":
        if (effectiveSub === "add") await C.cmdProductAdd(flags, ctx);
        else if (effectiveSub === "rm") await C.cmdProductRm(flags, ctx);
        else fail('vibe-crm product needs a subcommand: add | rm (try: vibe-crm product --help)');
        break;
      case "subscriptions":
        await C.cmdSubscriptions(flags, ctx);
        break;
      case "subscription":
        if (effectiveSub === "add") await C.cmdSubscriptionAdd(flags, ctx);
        else if (effectiveSub === "update") await C.cmdSubscriptionUpdate(flags, ctx);
        else if (effectiveSub === "cancel") await C.cmdSubscriptionCancel(flags, ctx);
        else if (effectiveSub === "rm") await C.cmdSubscriptionRm(flags, ctx);
        else fail('vibe-crm subscription needs a subcommand: add | update | cancel | rm (try: vibe-crm subscription --help)');
        break;
      case "mrr":
        await C.cmdMrr(flags, ctx);
        break;
      case "activity":
        if (effectiveSub === "log") await C.cmdActivityLog(flags, ctx);
        else if (effectiveSub === "list") await C.cmdActivityList(flags, ctx);
        else fail('vibe-crm activity needs a subcommand: log | list (try: vibe-crm activity --help)');
        break;
      case "import":
        if (effectiveSub === "contacts") await C.cmdImport(flags, ctx, "contacts");
        else if (effectiveSub === "companies") await C.cmdImport(flags, ctx, "companies");
        else if (effectiveSub === "notion") await C.cmdImportNotion(flags, ctx);
        else fail('vibe-crm import needs a subcommand: contacts | companies | notion (try: vibe-crm import --help)');
        break;
      case "tokens":
        if (effectiveSub === "create") await C.cmdTokensCreate(flags, ctx);
        else if (effectiveSub === "ls") await C.cmdTokensLs(flags, ctx);
        else if (effectiveSub === "revoke") await C.cmdTokensRevoke(flags, ctx);
        else fail('vibe-crm tokens needs a subcommand: create | ls | revoke (try: vibe-crm tokens --help)');
        break;
      default:
        fail(`Unknown command "vibe-crm ${command}". Run: vibe-crm help`);
    }
  } catch (err) {
    if (err instanceof UsageError) {
      process.stderr.write(`\n${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
}

main()
  .then(() => {
    process.exit(process.exitCode ?? 0);
  })
  .catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    const status = err?.status;
    if (status === 0 || /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed/i.test(message)) {
      const where = lastConnectedInstance();
      try {
        assertInstance(undefined);
      } catch {
        /* usage error already handled below */
      }
      fail(
        `Cannot reach the API${where ? ` at ${where}` : ""} — connection refused or timed out. ` +
          `Is the instance running? (override: --instance <url> / CRM_INSTANCE=<url>)`
      );
    }
    if (status && status >= 400) {
      const hint = {
        400: "Bad request — check the flags.",
        401: "Unauthorized — the token is missing/invalid (vibe-crm auth login --token <vc_…>).",
        404: "Not found — check the id/key.",
        409: "Conflict — e.g. duplicate key or stage in use without ?reassign_to=.",
        413: "Payload too large — shrink the request (import limit 2000).",
        422: "Validation error — unknown field (see message for valid fields).",
        429: "Rate limited — retry later."
      }[status];
      fail(`${message}${hint ? ` (${hint})` : ""}`);
    }
    fail(message);
  });
