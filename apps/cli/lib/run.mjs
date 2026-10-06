import * as C from "./commands.mjs";
import * as F from "./field-commands.mjs";
import { parseArgs, validateFlags } from "./args.mjs";
import { ApiError, UsageError, redactSecrets } from "./errors.mjs";
import { assertInstance, health, request } from "./client.mjs";
import { changeContext, getContext, listContexts, resolveSelection, tokenProvenance, deleteApiKey, getApiKey, instanceKey, instancesFilePath, listInstances, loadConfig, saveApiKey, saveConfig, validateTokenStorage } from "./config.mjs";
import { validateInstance } from "./instance.mjs";
import { readLoginToken } from "./token-input.mjs";

const GLOBAL = ["instance", "context", "json", "help", "h"];
const OUTPUT = ["json", "help", "h"];
const company = ["company-id", "companyId", "company"];
const contact = ["contact-id", "contactId", "contact"];
const product = ["product", "product-id", "productId"];
const custom = ["set", "custom"];
const personFields = ["first-name", "last-name", "email", "phone", "title", "status", ...company, ...custom];
const companyFields = ["name", "domain", "industry", "phone", "email", "notes", ...custom];
const dealFields = ["name", "value", "stage", "notes", "close-date", "closeDate", "close", ...contact, ...company, ...product, ...custom];
const subscriptionFields = ["name", "amount", "currency", "interval", "status", "start-date", "end-date", "notes", ...company, ...contact, ...product];
const paging = ["page", "limit"];
// Existing adapters remain the source of domain request/response behavior.
const DATA = {
  contacts: [C.cmdContacts, ["search", "status", ...company, ...paging]],
  "contact show": [C.cmdContactShow, ["id"]],
  "contact add": [C.cmdContactAdd, personFields],
  "contact update": [C.cmdContactUpdate, ["id", ...personFields]],
  "contact rm": [C.cmdContactRm, ["id"]],
  companies: [C.cmdCompanies, ["search", "industry", ...paging]],
  "company add": [C.cmdCompanyAdd, companyFields],
  "company update": [C.cmdCompanyUpdate, ["id", ...companyFields]],
  "company rm": [C.cmdCompanyRm, ["id"]],
  deals: [C.cmdDeals, ["search", "stage", ...product, ...paging]],
  "deal add": [C.cmdDealAdd, dealFields],
  "deal update": [C.cmdDealUpdate, ["id", ...dealFields]],
  "deal move": [C.cmdDealMove, ["id", "stage"]],
  "deal rm": [C.cmdDealRm, ["id"]],
  pipeline: [C.cmdPipeline, []], stages: [C.cmdStages, []],
  "custom-fields": [F.cmdCustomFields, ["entity"]],
  "custom-field add": [F.cmdCustomFieldAdd, ["entity", "key", "label", "type", "options", "position"]],
  "deal-view fields": [(a, c) => F.cmdDealView(a, c, "fields"), []],
  "deal-view show": [(a, c) => F.cmdDealView(a, c, "show"), []],
  "deal-view set": [(a, c) => F.cmdDealView(a, c, "set"), ["columns"]],
  "deal-view reset": [(a, c) => F.cmdDealView(a, c, "reset"), []],
  "deal-view rules": [(a, c) => F.cmdDealView(a, c, "rules"), ["field"]],
  "deal-view rule-set": [(a, c) => F.cmdDealView(a, c, "rule-set"), ["field", "when", "stages"]],
  "deal-view rule-remove": [(a, c) => F.cmdDealView(a, c, "rule-remove"), ["field"]],
  products: [C.cmdProducts, ["search"]],
  "product add": [C.cmdProductAdd, ["name", "key", "type", "status", "notes"]],
  "product rm": [C.cmdProductRm, ["key"]],
  subscriptions: [C.cmdSubscriptions, ["status", ...product, ...company, ...paging]],
  "subscription add": [C.cmdSubscriptionAdd, subscriptionFields],
  "subscription update": [C.cmdSubscriptionUpdate, ["id", ...subscriptionFields]],
  "subscription cancel": [C.cmdSubscriptionCancel, ["id"]],
  "subscription rm": [C.cmdSubscriptionRm, ["id"]], mrr: [C.cmdMrr, []],
  "activity log": [C.cmdActivityLog, ["entity", "id", "type", "body", "meta"]],
  "activity list": [C.cmdActivityList, ["entity", "id"]],
  "import contacts": [(a, c) => C.cmdImport(a, c, "contacts"), ["file", "dry-run", "dryRun", "infer-company", "inferCompany"]],
  "import companies": [(a, c) => C.cmdImport(a, c, "companies"), ["file", "dry-run", "dryRun"]],
  "import notion": [C.cmdImportNotion, ["file", "dry-run", "dryRun"]],
  "tokens create": [C.cmdTokensCreate, ["name"]],
  "tokens ls": [C.cmdTokensLs, []], "tokens revoke": [C.cmdTokensRevoke, ["id"]]
};
const LOCAL = {
  "context add": [...OUTPUT, "scope", "url"],
  "context use": [...OUTPUT, "scope"],
  "context remove": [...OUTPUT, "scope"],
  "context rm": [...OUTPUT, "scope"],
  "context list": [...OUTPUT, "scope"],
  "context show": [...GLOBAL, "scope"],
  "config set": [...OUTPUT, "scope"], "config get": GLOBAL,
  "auth login": [...GLOBAL, "scope", "token", "token-stdin"],
  "auth logout": GLOBAL, "auth whoami": GLOBAL,
  health: GLOBAL, doctor: GLOBAL
};
const CONTEXT_HELP = `vibe-crm context\n\n  context add <name> --url <url> --scope local|global\n  context use <name> --scope local|global\n  context list [--scope local|global]\n  context show [<name>] [--scope local|global]\n  context remove <name> --scope local|global\n\nContexts store only URLs. --context <name> selects one per invocation.\nExplicit names prefer local over global; active selections stay scope-bound.\nWrites require --scope. show and list are offline; show includes token provenance.`;
const HELP = {
  context: CONTEXT_HELP,
  config: "vibe-crm config\n\n  config set instance <url> [--scope local|global]\n  config get [--instance <url> | --context <name>]\n\nWithout --scope, legacy writes use existing .crm or the global directory.",
  auth: "vibe-crm auth\n\n  auth login [--instance <url> | --context <name>] --token-stdin [--scope local|global]\n  auth login [--instance <url> | --context <name>] --token <vc_…>\n  auth whoami [--instance <url> | --context <name>]\n  auth logout [--instance <url> | --context <name>]\n\nlogin validates public health and authenticated stats before saving.\nlogout removes local and global matching host tokens. It does not revoke tokens on the server.",
  health: C.HEALTH_HELP,
  doctor: "vibe-crm doctor [--instance <url> | --context <name>] [--json]\n\nShow selection/token provenance, check public health and stored-token authentication.\nNo secrets or token fragments are printed. Exit 1 if health or authentication fails.",
  contacts: C.CONTACTS_HELP, contact: C.CONTACT_HELP,
  companies: C.COMPANIES_HELP, company: C.COMPANY_HELP,
  deals: C.DEALS_HELP, deal: C.DEAL_HELP, pipeline: C.PIPELINE_HELP, stages: C.STAGES_HELP,
  "custom-fields": F.CUSTOM_FIELDS_HELP, "custom-field": F.CUSTOM_FIELD_HELP, "deal-view": F.DEAL_VIEW_HELP,
  products: C.PRODUCTS_HELP, product: C.PRODUCT_HELP,
  subscriptions: C.SUBSCRIPTIONS_HELP, subscription: C.SUBSCRIPTION_HELP,
  mrr: C.MRR_HELP, activity: C.ACTIVITY_HELP, import: C.IMPORT_HELP, tokens: C.TOKENS_HELP
};
const globalHelp = "\n\nGlobal options: --instance <url> | --context <name>, --json, --help.\nSelection: explicit flag > CRM_INSTANCE > local selection > global selection.";
function print(ctx, data, text) {
  process.stdout.write(redactSecrets(ctx.json ? JSON.stringify(data, null, 2) : text ?? JSON.stringify(data, null, 2)) + "\n");
}
function showHelp(ctx, help) { return print(ctx, { help }, help); }
function needSelection(selection) {
  if (!selection.instance) throw new UsageError("No instance configured. Use --instance <url>, --context <name>, or context add/use --scope local|global.");
  return selection.instance;
}

async function local(command, flags, ctx) {
  const name = flags._positional[0];
  if (command === "context list") return print(ctx, { contexts: listContexts(flags.scope) });
  if (command === "context show") {
    if (name && (flags.instance !== undefined || flags.context !== undefined)) throw new UsageError("Use a context name or a selection flag, not both.");
    if (!name && flags.scope !== undefined) throw new UsageError("context show --scope requires a context name.");
    const selection = name ? { ...getContext(name, flags.scope), context: name, source: "context-name" } : resolveSelection(flags.instance, flags.context);
    return print(ctx, { ...selection, token: tokenProvenance(selection.instance) });
  }
  if (command.startsWith("context ")) return print(ctx, changeContext(command.split(" ")[1], name, flags.scope, flags.url));
  if (command === "config set") {
    if (flags._positional.length !== 2 || name !== "instance") throw new UsageError("Usage: config set instance <url> [--scope local|global]");
    const instance = validateInstance(flags._positional[1]);
    const config = { ...loadConfig(flags.scope), instance };
    delete config.context;
    saveConfig(config, flags.scope);
    return print(ctx, { ok: true, instance }, `Instance set to ${instance}`);
  }
  const selection = resolveSelection(flags.instance, flags.context);
  if (command === "config get") {
    const tokens = Object.entries(listInstances()).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([host, entry]) => ({ host, state: "stored", ...(entry.email ? { email: entry.email } : {}) }));
    return print(ctx, { ...selection, token: tokenProvenance(selection.instance), tokens });
  }
  if (command === "doctor") {
    const token = tokenProvenance(selection.instance);
    const check = selection.instance ? await health(selection.instance) : { ok: false, status: 0, state: "unconfigured" };
    if (selection.instance && token.state === "stored") {
      try {
        await request(selection.instance, { path: "/v1/stats", token: getApiKey(selection.instance) });
        token.state = "valid";
        token.status = 200;
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
        token.state = error.status === 401 ? "invalid" : error.status === 403 ? "forbidden" : "unknown";
        token.status = error.status;
      }
    }
    const ok = check.ok && token.state === "valid";
    if (!ok) process.exitCode = 1;
    return print(ctx, { ok, ...selection, health: { ok: check.ok, status: check.status, ...(check.state ? { state: check.state } : {}) }, token });
  }
  const instance = needSelection(selection);
  if (command === "health") return C.cmdHealth({ ...flags, instance, context: undefined }, ctx);
  if (command === "auth login") {
    const token = await readLoginToken(flags);
    validateTokenStorage(flags.scope);
    const current = tokenProvenance(instance);
    if (current.state === "stored" && current.file !== instancesFilePath(flags.scope)) throw new UsageError("A local token shadows the requested global login. Use --scope local or logout first.");
    const check = await health(instance);
    if (!check.ok) throw new ApiError("Instance unhealthy or unreachable. Token was not stored.", check.status, check.body);
    await request(instance, { path: "/v1/stats", token });
    saveApiKey(instance, token, undefined, flags.scope);
    return print(ctx, { ok: true, ...selection, token: tokenProvenance(instance) }, `API token stored for ${instanceKey(instance)}.`);
  }
  if (command === "auth logout") {
    const removed = deleteApiKey(instance);
    return print(ctx, { ok: true, ...selection, removed }, removed ? `Removed all stored tokens for ${instanceKey(instance)}.` : `No stored token for ${instanceKey(instance)}.`);
  }
  const token = tokenProvenance(instance);
  const key = getApiKey(instance);
  if (!key) throw new UsageError("No stored token. Use auth login --token-stdin.");
  const stats = await request(instance, { path: "/v1/stats", token: key });
  return print(ctx, { ok: true, ...selection, token: { ...token, state: "valid" }, stats }, `API token valid for ${instanceKey(instance)}.`);
}

export async function run(argv, mainHelp) {
  const { flags, positional } = parseArgs(argv);
  const ctx = { json: flags.json === true };
  if (positional[0] === "help") { positional.shift(); flags.help = true; }
  if (!positional.length) {
    validateFlags(flags, GLOBAL);
    return showHelp(ctx, mainHelp);
  }
  if (positional.length === 1 && ["auth", "context"].includes(positional[0]) && !flags.help && !flags.h) flags.help = true;
  if (positional.length === 1 && positional[0] === "config" && !flags.help && !flags.h) positional.push("get");
  const group = positional[0];
  const command = [positional.slice(0, 2).join(" "), group].find((key) => Object.hasOwn(DATA, key) || Object.hasOwn(LOCAL, key));
  if (!command) {
    if ((flags.help || flags.h) && HELP[group] && positional.length === 1) {
      validateFlags(flags, GLOBAL);
      return showHelp(ctx, HELP[group] + globalHelp);
    }
    throw new UsageError(`Unknown or incomplete command: ${positional.join(" ")}. Use --help.`);
  }
  validateFlags(flags, DATA[command] ? [...GLOBAL, ...DATA[command][1]] : LOCAL[command]);
  flags._positional = positional.slice(command.split(" ").length);
  const maxPositionals = command === "config set" ? 2 : ((command.startsWith("context ") && command !== "context list") || command.startsWith("import ")) ? 1 : 0;
  if (flags._positional.length > maxPositionals) throw new UsageError("Unexpected positional argument. Use --help.");
  if (command.startsWith("import ") && flags.file !== undefined && flags._positional.length) throw new UsageError("Specify the import file positionally or with --file, not both.");
  if (flags.help || flags.h) return showHelp(ctx, (command === "import notion" ? C.IMPORT_NOTION_HELP : HELP[group]) + globalHelp);
  if (Object.hasOwn(LOCAL, command)) return local(command, flags, ctx);
  // Resolve once before an adapter can issue HTTP or fall back to offline dry-run.
  const selection = resolveSelection(flags.instance, flags.context);
  ctx.selection = selection;
  if (selection.instance) flags.instance = selection.instance;
  delete flags.context;
  return DATA[command][0](flags, ctx);
}

export function reportError(error, json) {
  const status = error instanceof ApiError ? error.status : undefined;
  const result = {
    error: error instanceof UsageError ? "usage_error" : status === 0 ? "connection_error" : typeof error.body?.error === "string" ? error.body.error : status !== undefined ? `api_error_${status}` : "error",
    detail: error instanceof Error ? error.message : String(error),
    ...(status !== undefined ? { status } : {})
  };
  for (const name of ["unknown_fields", "valid_fields"]) if (Array.isArray(error.body?.[name])) result[name] = error.body[name];
  process.stderr.write(redactSecrets(json ? JSON.stringify(result, null, 2) : `✗ ${result.detail}`) + "\n");
  process.exitCode = 1;
}
