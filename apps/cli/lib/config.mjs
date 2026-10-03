/** Named contexts contain URLs only. Tokens remain in compatible per-host stores. */
import os from "node:os";
import path from "node:path";
import { inspectPath, readJson, writeJsonAtomic } from "./files.mjs";
import { UsageError } from "./errors.mjs";
import { validateInstance, validateToken } from "./instance.mjs";

const SCOPES = ["local", "global"];
function validateScope(scope) {
  if (!SCOPES.includes(scope)) throw new UsageError("--scope local|global is required for context changes.");
  return scope;
}
function directory(scope) {
  validateScope(scope);
  return scope === "local" ? path.join(process.cwd(), ".crm") : path.join(os.homedir(), ".config", "vibe-crm");
}
function scopedFile(scope, kind = "config") {
  const name = kind === "config" ? (scope === "local" ? "crm.json" : "config.json") : `${kind}.json`;
  return path.join(directory(scope), name);
}
function defaultScope() {
  const local = directory("local");
  const info = inspectPath(local);
  if (info && !info.isDirectory()) throw new UsageError(`Configuration directory must be a regular directory: ${local}`);
  return info ? "local" : "global";
}
function selectedScope(scope) { return scope === undefined ? defaultScope() : validateScope(scope); }

export function configFilePath(scope) { return scopedFile(selectedScope(scope)); }
export function instancesFilePath(scope) { return scopedFile(selectedScope(scope), "instances"); }
export function loadConfig(scope) { return readJson(configFilePath(scope)) ?? {}; }
export function saveConfig(config, scope) {
  const file = configFilePath(scope);
  readJson(file);
  validateConfigFields(config, file);
  writeJsonAtomic(file, config);
}
function validateConfigFields(config, file) {
  if (Object.hasOwn(config, "instance")) validateInstance(config.instance);
  if (Object.hasOwn(config, "context")) contextName(config.context);
  if (Object.hasOwn(config, "instance") && Object.hasOwn(config, "context")) {
    throw new UsageError(`Configuration contains both instance and context. Resolve with config set or context use: ${file}`);
  }
}

export function instanceKey(url) { return new URL(validateInstance(url)).host; }
function tokenStore(scope) {
  const file = scopedFile(scope, "instances");
  const store = readJson(file) ?? {};
  for (const [host, entry] of Object.entries(store)) {
    if (!host || !entry || typeof entry !== "object" || Array.isArray(entry) || !Object.hasOwn(entry, "apiKey")) throw new UsageError(`Invalid per-host token store. File will not be overwritten: ${file}`);
    try { validateToken(entry.apiKey); } catch { throw new UsageError(`Invalid token format in stored configuration. File will not be overwritten: ${file}`); }
    for (const name of ["email", "savedAt"]) if (entry[name] !== undefined && typeof entry[name] !== "string") throw new UsageError(`Invalid token metadata. File will not be overwritten: ${file}`);
  }
  return store;
}
export function validateTokenStorage(scope) { tokenStore(selectedScope(scope)); }
export function listInstances() {
  return { ...tokenStore("global"), ...tokenStore("local") };
}
function tokenMatch(url) {
  const host = instanceKey(url);
  for (const scope of SCOPES) {
    const store = tokenStore(scope);
    if (Object.hasOwn(store, host)) return { entry: store[host], scope, host, file: scopedFile(scope, "instances") };
  }
  return null;
}
export function getApiKey(url) { return tokenMatch(url)?.entry.apiKey ?? null; }
export function getInstanceEntry(url) { return tokenMatch(url)?.entry ?? null; }
export function tokenProvenance(url) {
  if (!url) return { state: "missing", source: "none" };
  const match = tokenMatch(url);
  return match ? { state: "stored", source: match.scope, file: match.file, host: match.host } : { state: "missing", source: "none", host: instanceKey(url) };
}
export function saveApiKey(url, apiKey, meta, scope) {
  validateToken(apiKey);
  if (meta?.email !== undefined && typeof meta.email !== "string") throw new UsageError("Token email metadata must be a string.");
  const target = selectedScope(scope);
  const store = tokenStore(target);
  Object.defineProperty(store, instanceKey(url), { value: { apiKey, ...(meta?.email !== undefined ? { email: meta.email } : {}), savedAt: new Date().toISOString() }, enumerable: true, configurable: true, writable: true });
  writeJsonAtomic(scopedFile(target, "instances"), store);
}
export function deleteApiKey(url) {
  const host = instanceKey(url);
  // Read and validate both stores before any mutation. Shadowed keys must not return.
  const stores = SCOPES.map((scope) => ({ scope, store: tokenStore(scope) }));
  let removed = false;
  for (const { scope, store } of stores) {
    if (!Object.hasOwn(store, host)) continue;
    delete store[host];
    writeJsonAtomic(scopedFile(scope, "instances"), store);
    removed = true;
  }
  return removed;
}

function contextName(name) {
  if (typeof name !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(name)) throw new UsageError("Context name must contain 1 to 64 letters, digits, _ or -, starting with a letter or digit.");
  return name;
}
function contextStore(scope) {
  const file = scopedFile(scope, "contexts");
  const store = readJson(file) ?? {};
  for (const [name, entry] of Object.entries(store)) {
    contextName(name);
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || Object.keys(entry).length !== 1 || !Object.hasOwn(entry, "instance")) throw new UsageError(`Contexts may contain only an instance URL, never credentials: ${file}`);
    validateInstance(entry.instance);
  }
  return store;
}
export function listContexts(scope) {
  const scopes = scope === undefined ? SCOPES : [validateScope(scope)];
  return scopes.flatMap((item) => {
    const store = contextStore(item);
    const config = readJson(scopedFile(item)) ?? {};
    return Object.entries(store).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([name, entry]) => ({ name, instance: entry.instance, scope: item, file: scopedFile(item, "contexts"), active: config.context === name }));
  });
}
export function getContext(name, scope) {
  contextName(name);
  for (const item of scope === undefined ? SCOPES : [validateScope(scope)]) {
    const store = contextStore(item);
    if (Object.hasOwn(store, name)) return { name, instance: store[name].instance, scope: item, file: scopedFile(item, "contexts") };
  }
  throw new UsageError(`Context not found${scope ? ` in ${scope}` : ""}: ${name}`);
}
export function changeContext(action, name, scope, url) {
  if (!["add", "use", "remove", "rm"].includes(action)) throw new UsageError("Context action must be add, use or remove.");
  contextName(name);
  validateScope(scope);
  const file = scopedFile(scope, "contexts");
  const store = contextStore(scope);
  if (action === "add") {
    const instance = validateInstance(url);
    if (Object.hasOwn(store, name)) throw new UsageError("Context already exists. Remove it explicitly or choose another name.");
    Object.defineProperty(store, name, { value: { instance }, enumerable: true, configurable: true, writable: true });
    writeJsonAtomic(file, store);
  } else {
    if (!Object.hasOwn(store, name)) throw new UsageError(`Context not found in ${scope}: ${name}`);
    const configPath = scopedFile(scope);
    const config = readJson(configPath) ?? {};
    if (action === "use") {
      delete config.instance;
      config.context = name;
      writeJsonAtomic(configPath, config);
    } else {
      if (config.context === name) {
        delete config.context;
        // A stale legacy instance must not revive after removing the active context.
        delete config.instance;
        writeJsonAtomic(configPath, config);
      }
      delete store[name];
      writeJsonAtomic(file, store);
    }
  }
  return { ok: true, action: action === "rm" ? "remove" : action, name, scope };
}
export function resolveSelection(flag, context) {
  if (flag !== undefined && context !== undefined) throw new UsageError("--instance and --context are mutually exclusive.");
  if (context !== undefined) {
    const selected = getContext(context);
    return { instance: selected.instance, source: "context-flag", context, scope: selected.scope, file: selected.file };
  }
  if (flag !== undefined) return { instance: validateInstance(flag), source: "flag" };
  if (process.env.CRM_INSTANCE !== undefined) return { instance: validateInstance(process.env.CRM_INSTANCE), source: "environment" };
  for (const scope of SCOPES) {
    const file = scopedFile(scope);
    const config = readJson(file);
    if (!config) continue;
    validateConfigFields(config, file);
    if (Object.hasOwn(config, "instance")) return { instance: config.instance, source: scope, file };
    if (Object.hasOwn(config, "context")) {
      // Active selections are scope-bound, not subject to name shadowing.
      const selected = getContext(config.context, scope);
      return { instance: selected.instance, source: `${scope}-context`, context: config.context, scope, file, contextFile: selected.file };
    }
  }
  return { instance: null, source: "none" };
}
export function resolveInstance(flag, context) { return resolveSelection(flag, context).instance; }

/** Do not print even fragments of persisted credentials. */
export function redact(token) { return token ? "[stored]" : "[missing]"; }
