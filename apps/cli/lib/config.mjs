/**
 * Vibe CRM CLI configuration.
 *
 * Instance resolution precedence (first set wins):
 *   1. --instance <url>              (flag, per invocation)
 *   2. CRM_INSTANCE=<url>            (environment)
 *   3. ./.crm/crm.json               (repo-local, gitignored)
 *   4. ~/.config/vibe-crm/config.json (user-global)
 *
 * Per-instance API keys (vc_… tokens from the web /settings/tokens page) live in:
 *   ./.crm/instances.json (repo-local, gitignored) or ~/.config/vibe-crm/instances.json
 * Never in env, never printed unredacted, never committed.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function homeDir() {
  return path.join(os.homedir(), ".config", "vibe-crm");
}

function localDir() {
  return path.join(process.cwd(), ".crm");
}

/** Prefer the repo-local dir (when it exists), fall back to ~/.config. */
function configFile() {
  const local = path.join(localDir(), "crm.json");
  if (fs.existsSync(localDir()) || fs.existsSync(local)) return local;
  return path.join(homeDir(), "config.json");
}

function instancesFile() {
  const local = path.join(localDir(), "instances.json");
  if (fs.existsSync(localDir()) || fs.existsSync(local)) return local;
  return path.join(homeDir(), "instances.json");
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeJsonAtomic(file, data) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
  try {
    fs.chmodSync(dir, 0o700);
    fs.chmodSync(file, 0o600);
  } catch {
    /* best effort on odd filesystems */
  }
}

export function loadConfig() {
  return readJson(configFile()) ?? {};
}

export function configFilePath() {
  return configFile();
}

export function saveConfig(config) {
  writeJsonAtomic(configFile(), config);
}

export function listInstances() {
  return readJson(instancesFile()) ?? {};
}

export function instancesFilePath() {
  return instancesFile();
}

export function instanceKey(url) {
  try {
    return new URL(url).host;
  } catch {
    return String(url).replace(/[^a-z0-9.-]/gi, "_");
  }
}

function readStore(file) {
  return readJson(file);
}

export function getApiKey(url) {
  const key = instanceKey(url);
  for (const file of [path.join(localDir(), "instances.json"), path.join(homeDir(), "instances.json")]) {
    const store = readStore(file);
    if (store?.[key]?.apiKey) return store[key].apiKey;
  }
  return null;
}

export function getInstanceEntry(url) {
  const key = instanceKey(url);
  for (const file of [path.join(localDir(), "instances.json"), path.join(homeDir(), "instances.json")]) {
    const store = readStore(file);
    if (store?.[key]) return store[key];
  }
  return null;
}

export function saveApiKey(url, apiKey, meta) {
  const file = instancesFile();
  const store = readJson(file) ?? {};
  const key = instanceKey(url);
  store[key] = {
    apiKey,
    email: meta?.email,
    savedAt: new Date().toISOString()
  };
  writeJsonAtomic(file, store);
}

export function deleteApiKey(url) {
  const file = instancesFile();
  const store = readJson(file);
  if (!store?.[instanceKey(url)]) return false;
  delete store[instanceKey(url)];
  writeJsonAtomic(file, store);
  return true;
}

export function resolveInstance(flag) {
  if (flag) return flag;
  if (process.env.CRM_INSTANCE) return process.env.CRM_INSTANCE;
  const local = readJson(path.join(localDir(), "crm.json"));
  if (local?.instance) return local.instance;
  const home = readJson(path.join(homeDir(), "config.json"));
  if (home?.instance) return home.instance;
  return null;
}

export function redact(token) {
  if (!token || token.length <= 10) return "****";
  return `${token.slice(0, 6)}…${token.slice(-4)} (${token.length} chars)`;
}
