/**
 * vibe-crm commands — thin adapters over the REST API (CONTRACT §4).
 * --json prints the raw data object, otherwise human-readable tables.
 */
import fs from "node:fs";
import { UsageError, assertInstance, connect, health, request } from "./client.mjs";

/** Parsed flag bag — `instance` and `json` are reserved, everything else is a command flag. */
export function flag(args, ...names) {
  for (const name of names) {
    const v = args[name];
    if (typeof v === "string") return v;
    if (Array.isArray(v)) {
      const s = v.find((x) => typeof x === "string");
      if (s !== undefined) return s;
    }
  }
  return undefined;
}

function flagAll(args, ...names) {
  const out = [];
  for (const name of names) {
    const v = args[name];
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) out.push(...v.filter((x) => typeof x === "string"));
  }
  return out;
}

function need(args, name, usage) {
  const v = flag(args, name);
  if (v === undefined || v === "") throw new UsageError(usage);
  return v;
}

export function emit(ctx, text, data) {
  if (ctx.json) {
    process.stdout.write(JSON.stringify(data, null, 2) + "\n");
  } else {
    process.stdout.write(text + "\n");
  }
}

function pad(value, width) {
  return value.length > width ? value.slice(0, width - 1) + "…" : value + " ".repeat(width - value.length);
}

export function table(rows, headers) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[headers[i]] ?? "").length)));
  const line = (cells) => cells.map((c, i) => pad(c, widths[i])).join("  ");
  const out = [line(headers), line(widths.map((w) => "─".repeat(w)))];
  for (const row of rows) out.push(line(headers.map((h) => String(row[h] ?? ""))));
  return out.join("\n");
}

function short(id) {
  return String(id ?? "").slice(0, 8);
}

/** --set key=value (repeatable) + --custom '{"k":"v"}' → custom bag. */
function customBag(args) {
  const bag = {};
  for (const pair of flagAll(args, "set")) {
    const eq = pair.indexOf("=");
    if (eq < 0) throw new UsageError(`--set needs key=value (got "${pair}")`);
    bag[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  const raw = flag(args, "custom");
  if (raw !== undefined) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new UsageError(`--custom must be valid JSON (got "${raw}")`);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new UsageError(`--custom must be a JSON object (got "${raw}")`);
    }
    Object.assign(bag, parsed);
  }
  return bag;
}

function asList(data, key) {
  if (Array.isArray(data)) return { rows: data, total: data.length };
  const rows = data?.[key] ?? [];
  return { rows, total: data?.total ?? rows.length, extra: data };
}

// ------------------------------------------------------------------- health

export const HEALTH_HELP = `vibe-crm health — check instance reachability (no auth needed)

Usage: vibe-crm health [--instance <url>]`;

export async function cmdHealth(args, ctx) {
  if (args.help === true || args.h === true) {
    console.log(HEALTH_HELP);
    return;
  }
  const instance = assertInstance(args.instance);
  const result = await health(instance);
  if (ctx.json) {
    emit(ctx, "", { instance, ok: result.ok, status: result.status, body: result.body });
  } else if (result.ok) {
    console.log(`✓ ${instance} — API healthy`);
  } else {
    console.error(`✗ ${instance} — unreachable (status ${result.status}): ${JSON.stringify(result.body)}`);
    process.exitCode = 1;
  }
}

// ------------------------------------------------------------------- contacts

export const CONTACTS_HELP = `vibe-crm contacts — list contacts

Usage: vibe-crm contacts [--search <q>] [--status lead|active|inactive|churned]
                         [--company-id <id>] [--page <n>] [--limit <n>]`;

export async function cmdContacts(args, ctx) {
  if (args.help === true || args.h === true) {
    console.log(CONTACTS_HELP);
    return;
  }
  const { url, key } = connect(args.instance);
  const data = await request(url, {
    path: "/v1/contacts",
    query: {
      search: flag(args, "search"),
      status: flag(args, "status"),
      company_id: flag(args, "company-id", "companyId", "company"),
      page: flag(args, "page"),
      limit: flag(args, "limit")
    },
    token: key
  });
  const { rows, total } = asList(data, "contacts");
  if (ctx.json) return emit(ctx, "", { instance: url, contacts: rows, total });
  if (rows.length === 0) return console.log("No contacts found.");
  console.log(
    table(
      rows.map((c) => ({
        id: short(c.id),
        name: [c.first_name, c.last_name].filter(Boolean).join(" "),
        email: c.email ?? "",
        title: c.title ?? "",
        status: c.status ?? "",
        company: c.company_name ?? c.company_id ?? ""
      })),
      ["id", "name", "email", "title", "status", "company"]
    )
  );
  console.log(`\n${rows.length}/${total} contact(s) on ${url}`);
}

export const CONTACT_HELP = `vibe-crm contact — show | add | update | rm

Usage:
  vibe-crm contact show --id <id>
  vibe-crm contact add --first-name <v> [--last-name <v>] [--email <v>] [--phone <v>]
                       [--company-id <id>] [--title <v>] [--status lead|active|inactive|churned]
                       [--set key=value ...] [--custom '{"k":"v"}']
  vibe-crm contact update --id <id> [--first-name <v> ...] [--set key=value ...]
  vibe-crm contact rm --id <id>`;

export async function cmdContactShow(args, ctx) {
  if (args.help === true || args.h === true) {
    console.log(CONTACT_HELP);
    return;
  }
  const { url, key } = connect(args.instance);
  const id = need(args, "id", "vibe-crm contact show needs --id <id>");
  const data = await request(url, { path: `/v1/contacts/${encodeURIComponent(id)}`, token: key });
  const c = data?.contact ?? data;
  if (ctx.json) return emit(ctx, "", { instance: url, contact: c });
  console.log(
    [
      `Contact ${c.id ?? id}`,
      `  name:    ${[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}`,
      `  email:   ${c.email || "—"}`,
      `  phone:   ${c.phone || "—"}`,
      `  title:   ${c.title || "—"}`,
      `  status:  ${c.status || "—"}`,
      `  company: ${c.company_name || c.company_id || "—"}`
    ].join("\n")
  );
}

export async function cmdContactAdd(args, ctx) {
  if (args.help === true || args.h === true) {
    console.log(CONTACT_HELP);
    return;
  }
  const { url, key } = connect(args.instance);
  const firstName = need(args, "first-name", "vibe-crm contact add needs --first-name <v>");
  const body = { first_name: firstName };
  for (const [opt, api] of [
    ["last-name", "last_name"],
    ["email", "email"],
    ["phone", "phone"],
    ["title", "title"],
    ["status", "status"]
  ]) {
    const v = flag(args, opt);
    if (v !== undefined) body[api] = v;
  }
  const companyId = flag(args, "company-id", "companyId", "company");
  if (companyId !== undefined) body.company_id = companyId;
  const custom = customBag(args);
  if (Object.keys(custom).length) body.custom = custom;
  const data = await request(url, { method: "POST", path: "/v1/contacts", body, token: key });
  const c = data?.contact ?? data;
  emit(ctx, `Created contact "${[c.first_name, c.last_name].filter(Boolean).join(" ")}" ${c.id ?? ""}`, {
    instance: url,
    contact: c
  });
}

export async function cmdContactUpdate(args, ctx) {
  if (args.help === true || args.h === true) {
    console.log(CONTACT_HELP);
    return;
  }
  const { url, key } = connect(args.instance);
  const id = need(args, "id", "vibe-crm contact update needs --id <id>");
  const body = {};
  for (const [opt, api] of [
    ["first-name", "first_name"],
    ["last-name", "last_name"],
    ["email", "email"],
    ["phone", "phone"],
    ["title", "title"],
    ["status", "status"]
  ]) {
    const v = flag(args, opt);
    if (v !== undefined) body[api] = v;
  }
  const companyId = flag(args, "company-id", "companyId", "company");
  if (companyId !== undefined) body.company_id = companyId;
  const custom = customBag(args);
  if (Object.keys(custom).length) body.custom = custom;
  if (Object.keys(body).length === 0) throw new UsageError("vibe-crm contact update needs at least one field to change");
  const data = await request(url, { method: "PUT", path: `/v1/contacts/${encodeURIComponent(id)}`, body, token: key });
  const c = data?.contact ?? data;
  emit(ctx, `✓ Updated contact ${c.id ?? id}`, { instance: url, contact: c });
}

export async function cmdContactRm(args, ctx) {
  if (args.help === true || args.h === true) {
    console.log(CONTACT_HELP);
    return;
  }
  const { url, key } = connect(args.instance);
  const id = need(args, "id", "vibe-crm contact rm needs --id <id>");
  await request(url, { method: "DELETE", path: `/v1/contacts/${encodeURIComponent(id)}`, token: key });
  emit(ctx, `✓ Removed contact ${id} (deals kept, contact_id=NULL)`, { instance: url, ok: true, id });
}

// ------------------------------------------------------------------- companies

export const COMPANIES_HELP = `vibe-crm companies — list companies

Usage: vibe-crm companies [--search <q>] [--industry <v>] [--page <n>] [--limit <n>]`;

export async function cmdCompanies(args, ctx) {
  if (args.help === true || args.h === true) {
    console.log(COMPANIES_HELP);
    return;
  }
  const { url, key } = connect(args.instance);
  const data = await request(url, {
    path: "/v1/companies",
    query: {
      search: flag(args, "search"),
      industry: flag(args, "industry"),
      page: flag(args, "page"),
      limit: flag(args, "limit")
    },
    token: key
  });
  const { rows, total } = asList(data, "companies");
  if (ctx.json) return emit(ctx, "", { instance: url, companies: rows, total });
  if (rows.length === 0) return console.log("No companies found.");
  console.log(
    table(
      rows.map((c) => ({
        id: short(c.id),
        name: c.name ?? "",
        domain: c.domain ?? "",
        industry: c.industry ?? "",
        contacts: c.contact_count ?? ""
      })),
      ["id", "name", "domain", "industry", "contacts"]
    )
  );
  console.log(`\n${rows.length}/${total} companie(s) on ${url}`);
}

export const COMPANY_HELP = `vibe-crm company — add | update | rm

Usage:
  vibe-crm company add --name <v> [--domain <v>] [--industry <v>] [--phone <v>]
                       [--email <v>] [--notes <v>] [--set key=value ...]
  vibe-crm company update --id <id> [--name <v> ...]
  vibe-crm company rm --id <id>`;

export async function cmdCompanyAdd(args, ctx) {
  if (args.help === true || args.h === true) {
    console.log(COMPANY_HELP);
    return;
  }
  const { url, key } = connect(args.instance);
  const name = need(args, "name", "vibe-crm company add needs --name <v>");
  const body = { name };
  for (const f of ["domain", "industry", "phone", "email", "notes"]) {
    const v = flag(args, f);
    if (v !== undefined) body[f] = v;
  }
  const custom = customBag(args);
  if (Object.keys(custom).length) body.custom = custom;
  const data = await request(url, { method: "POST", path: "/v1/companies", body, token: key });
  const c = data?.company ?? data;
  emit(ctx, `Created company "${c.name ?? name}" ${c.id ?? ""}`, { instance: url, company: c });
}

export async function cmdCompanyUpdate(args, ctx) {
  if (args.help === true || args.h === true) {
    console.log(COMPANY_HELP);
    return;
  }
  const { url, key } = connect(args.instance);
  const id = need(args, "id", "vibe-crm company update needs --id <id>");
  const body = {};
  for (const f of ["name", "domain", "industry", "phone", "email", "notes"]) {
    const v = flag(args, f);
    if (v !== undefined) body[f] = v;
  }
  const custom = customBag(args);
  if (Object.keys(custom).length) body.custom = custom;
  if (Object.keys(body).length === 0) throw new UsageError("vibe-crm company update needs at least one field to change");
  const data = await request(url, { method: "PUT", path: `/v1/companies/${encodeURIComponent(id)}`, body, token: key });
  const c = data?.company ?? data;
  emit(ctx, `✓ Updated company ${c.id ?? id}`, { instance: url, company: c });
}

export async function cmdCompanyRm(args, ctx) {
  if (args.help === true || args.h === true) {
    console.log(COMPANY_HELP);
    return;
  }
  const { url, key } = connect(args.instance);
  const id = need(args, "id", "vibe-crm company rm needs --id <id>");
  await request(url, { method: "DELETE", path: `/v1/companies/${encodeURIComponent(id)}`, token: key });
  emit(ctx, `✓ Removed company ${id} (contacts kept, company_id=NULL)`, { instance: url, ok: true, id });
}

// ------------------------------------------------------------------- deals

export const DEALS_HELP = `vibe-crm deals — list deals

Usage: vibe-crm deals [--search <q>] [--stage <key>] [--page <n>] [--limit <n>]`;

export async function cmdDeals(args, ctx) {
  if (args.help === true || args.h === true) {
    console.log(DEALS_HELP);
    return;
  }
  const { url, key } = connect(args.instance);
  const data = await request(url, {
    path: "/v1/deals",
    query: {
      search: flag(args, "search"),
      stage: flag(args, "stage"),
      page: flag(args, "page"),
      limit: flag(args, "limit")
    },
    token: key
  });
  const { rows, total, extra } = asList(data, "deals");
  if (ctx.json) return emit(ctx, "", { instance: url, deals: rows, total, total_value: extra?.total_value });
  if (rows.length === 0) return console.log("No deals found.");
  console.log(
    table(
      rows.map((d) => ({
        id: short(d.id),
        name: d.name ?? "",
        value: d.value ?? 0,
        stage: d.stage ?? "",
        contact: d.contact_name ?? d.contact_id ?? "",
        close: d.close_date ?? ""
      })),
      ["id", "name", "value", "stage", "contact", "close"]
    )
  );
  const tv = extra?.total_value !== undefined ? ` · total value ${extra.total_value}` : "";
  console.log(`\n${rows.length}/${total} deal(s) on ${url}${tv}`);
}

export const DEAL_HELP = `vibe-crm deal — add | move | rm

Usage:
  vibe-crm deal add --name <v> [--contact-id <id>] [--value <n>] [--stage <key>]
                    [--close-date <iso>] [--notes <v>] [--set key=value ...]
  vibe-crm deal move --id <id> --stage <key>
  vibe-crm deal rm --id <id>`;

export async function cmdDealAdd(args, ctx) {
  if (args.help === true || args.h === true) {
    console.log(DEAL_HELP);
    return;
  }
  const { url, key } = connect(args.instance);
  const name = need(args, "name", "vibe-crm deal add needs --name <v>");
  const body = { name };
  const contactId = flag(args, "contact-id", "contactId", "contact");
  if (contactId !== undefined) body.contact_id = contactId;
  const value = flag(args, "value");
  if (value !== undefined) {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new UsageError(`--value must be a number (got "${value}")`);
    body.value = n;
  }
  const stage = flag(args, "stage");
  if (stage !== undefined) body.stage = stage;
  const closeDate = flag(args, "close-date", "closeDate", "close");
  if (closeDate !== undefined) body.close_date = closeDate;
  const notes = flag(args, "notes");
  if (notes !== undefined) body.notes = notes;
  const custom = customBag(args);
  if (Object.keys(custom).length) body.custom = custom;
  const data = await request(url, { method: "POST", path: "/v1/deals", body, token: key });
  const d = data?.deal ?? data;
  emit(ctx, `Created deal "${d.name ?? name}" ${d.id ?? ""}`, { instance: url, deal: d });
}

export async function cmdDealMove(args, ctx) {
  if (args.help === true || args.h === true) {
    console.log(DEAL_HELP);
    return;
  }
  const { url, key } = connect(args.instance);
  const id = need(args, "id", "vibe-crm deal move needs --id <id>");
  const stage = need(args, "stage", "vibe-crm deal move needs --stage <key>");
  const data = await request(url, {
    method: "PUT",
    path: `/v1/deals/${encodeURIComponent(id)}`,
    body: { stage },
    token: key
  });
  const d = data?.deal ?? data;
  emit(ctx, `✓ Moved deal ${d.id ?? id} → ${d.stage ?? stage}`, { instance: url, deal: d });
}

export async function cmdDealRm(args, ctx) {
  if (args.help === true || args.h === true) {
    console.log(DEAL_HELP);
    return;
  }
  const { url, key } = connect(args.instance);
  const id = need(args, "id", "vibe-crm deal rm needs --id <id>");
  await request(url, { method: "DELETE", path: `/v1/deals/${encodeURIComponent(id)}`, token: key });
  emit(ctx, `✓ Removed deal ${id}`, { instance: url, ok: true, id });
}

// ------------------------------------------------------------------- pipeline & stages

export const PIPELINE_HELP = `vibe-crm pipeline — deals grouped by stage (client-side grouping of /v1/deals/board)

Usage: vibe-crm pipeline`;

export async function cmdPipeline(args, ctx) {
  if (args.help === true || args.h === true) {
    console.log(PIPELINE_HELP);
    return;
  }
  const { url, key } = connect(args.instance);
  const data = await request(url, { path: "/v1/deals/board", token: key });
  const deals = Array.isArray(data) ? data : (data?.deals ?? []);
  const stages = await request(url, { path: "/v1/stages", token: key }).catch(() => null);
  const stageRows = stages ? asList(stages, "stages").rows : [];
  const order = new Map(stageRows.map((s, i) => [s.key, s.position ?? i]));
  const groups = new Map();
  for (const d of deals) {
    const k = d.stage ?? "?";
    if (!groups.has(k)) groups.set(k, { deals: [], value: 0 });
    groups.get(k).deals.push(d);
    groups.get(k).value += Number(d.value ?? 0);
  }
  const keys = [...groups.keys()].sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999));
  if (ctx.json) {
    const grouped = Object.fromEntries(keys.map((k) => [k, groups.get(k)]));
    return emit(ctx, "", { instance: url, pipeline: grouped });
  }
  if (deals.length === 0) return console.log("Pipeline is empty.");
  for (const k of keys) {
    const g = groups.get(k);
    console.log(`${k} — ${g.deals.length} deal(s), value ${g.value}`);
    for (const d of g.deals) console.log(`  ${short(d.id)}  ${d.name ?? ""}  (${d.value ?? 0})`);
  }
  console.log(`\n${deals.length} deal(s) on ${url}`);
}

export const STAGES_HELP = `vibe-crm stages — list pipeline stages (position-asc, data not code)

Usage: vibe-crm stages`;

export async function cmdStages(args, ctx) {
  if (args.help === true || args.h === true) {
    console.log(STAGES_HELP);
    return;
  }
  const { url, key } = connect(args.instance);
  const data = await request(url, { path: "/v1/stages", token: key });
  const { rows } = asList(data, "stages");
  if (ctx.json) return emit(ctx, "", { instance: url, stages: rows });
  if (rows.length === 0) return console.log("No stages found.");
  console.log(
    table(
      rows.map((s) => ({
        key: s.key ?? "",
        label: s.label ?? "",
        color: s.color ?? "",
        pos: s.position ?? "",
        flags: [s.is_won ? "won" : null, s.is_lost ? "lost" : null].filter(Boolean).join(",")
      })),
      ["key", "label", "color", "pos", "flags"]
    )
  );
}

// ------------------------------------------------------------------- activity

export const ACTIVITY_HELP = `vibe-crm activity — log | list timeline entries

Usage:
  vibe-crm activity log --entity contact|company|deal --id <entityId>
                        [--type note|email|meeting|stage_change] [--body <text>]
                        [--meta '{"k":"v"}']
  vibe-crm activity list --entity contact|company|deal --id <entityId>`;

export async function cmdActivityLog(args, ctx) {
  if (args.help === true || args.h === true) {
    console.log(ACTIVITY_HELP);
    return;
  }
  const { url, key } = connect(args.instance);
  const entityType = need(args, "entity", "vibe-crm activity log needs --entity contact|company|deal");
  if (!["contact", "company", "deal"].includes(entityType)) {
    throw new UsageError(`--entity must be one of: contact | company | deal (got "${entityType}")`);
  }
  const entityId = need(args, "id", "vibe-crm activity log needs --id <entityId>");
  const body = { entity_type: entityType, entity_id: entityId };
  const type = flag(args, "type");
  if (type !== undefined) {
    if (!["note", "email", "meeting", "stage_change"].includes(type)) {
      throw new UsageError(`--type must be one of: note | email | meeting | stage_change (got "${type}")`);
    }
    body.type = type;
  }
  const text = flag(args, "body");
  if (text !== undefined) body.body = text;
  const meta = flag(args, "meta");
  if (meta !== undefined) {
    try {
      body.meta = JSON.parse(meta);
    } catch {
      throw new UsageError(`--meta must be valid JSON (got "${meta}")`);
    }
  }
  const data = await request(url, { method: "POST", path: "/v1/activities", body, token: key });
  const a = data?.activity ?? data;
  emit(ctx, `Logged ${a.type ?? "note"} on ${entityType} ${short(entityId)} (${a.id ?? ""})`, {
    instance: url,
    activity: a
  });
}

export async function cmdActivityList(args, ctx) {
  if (args.help === true || args.h === true) {
    console.log(ACTIVITY_HELP);
    return;
  }
  const { url, key } = connect(args.instance);
  const entityType = need(args, "entity", "vibe-crm activity list needs --entity contact|company|deal");
  const entityId = need(args, "id", "vibe-crm activity list needs --id <entityId>");
  const data = await request(url, {
    path: "/v1/activities",
    query: { entity_type: entityType, entity_id: entityId },
    token: key
  });
  const { rows } = asList(data, "activities");
  if (ctx.json) return emit(ctx, "", { instance: url, entity_type: entityType, entity_id: entityId, activities: rows });
  if (rows.length === 0) return console.log(`No activity for ${entityType} ${entityId}.`);
  console.log(
    table(
      rows.map((a) => ({
        id: short(a.id),
        type: a.type ?? "",
        body: String(a.body ?? "").slice(0, 60),
        at: a.created_at ?? ""
      })),
      ["id", "type", "body", "at"]
    )
  );
}

// ------------------------------------------------------------------- import

export const IMPORT_HELP = `vibe-crm import — bulk import from CSV or JSON

Usage:
  vibe-crm import contacts <file.csv|json> [--dry-run] [--infer-company]
  vibe-crm import companies <file.csv|json> [--dry-run]

CSV: header row with API field names (first_name,last_name,email,…).
JSON: an array of records, or {"contacts": [...]} / {"companies": [...]}.
--dry-run parses + validates locally without sending anything.`;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])));
}

function loadImportFile(file, kind) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    throw new UsageError(`Import file not found: ${file}`);
  }
  const lower = file.toLowerCase();
  if (lower.endsWith(".csv")) {
    const rows = parseCsv(text).filter((r) => Object.values(r).some((v) => v !== ""));
    return rows;
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new UsageError(`Import file is neither valid JSON nor .csv: ${file}`);
  }
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object" && Array.isArray(parsed[kind])) return parsed[kind];
  throw new UsageError(`JSON import needs an array or a {"${kind}": [...]} object: ${file}`);
}

export async function cmdImport(args, ctx, kind) {
  if (args.help === true || args.h === true || !kind) {
    console.log(IMPORT_HELP);
    return;
  }
  const file = flag(args, "file") ?? args._positional?.[0];
  if (!file) throw new UsageError(`vibe-crm import ${kind} needs <file.csv|json>`);
  const records = loadImportFile(file, kind);
  if (records.length > 2000) throw new UsageError(`Import limit is 2000 records (got ${records.length})`);
  const dryRun = args["dry-run"] === true || args.dryRun === true;
  if (ctx.json && dryRun) {
    return emit(ctx, "", { instance: null, dry_run: true, kind, file, count: records.length, sample: records.slice(0, 3) });
  }
  if (dryRun) {
    console.log(`Dry run: ${records.length} ${kind} record(s) in ${file} — nothing sent.`);
    for (const r of records.slice(0, 5)) console.log(`  ${JSON.stringify(r).slice(0, 120)}`);
    if (records.length > 5) console.log(`  … +${records.length - 5} more`);
    return;
  }
  const { url, key } = connect(args.instance);
  const path = kind === "contacts" ? "/v1/contacts/import" : "/v1/companies/import";
  const body = { [kind]: records };
  if (kind === "contacts") {
    const infer = flag(args, "infer-company", "inferCompany");
    if (infer !== undefined) body.inferCompanyFromEmail = infer === true || infer === "true";
    else if (args["infer-company"] === true) body.inferCompanyFromEmail = true;
  }
  const data = await request(url, { method: "POST", path, body, token: key });
  if (ctx.json) return emit(ctx, "", { instance: url, ...data });
  if (kind === "contacts") {
    console.log(
      `✓ Imported ${data.imported ?? "?"} contact(s), ${data.companiesCreated ?? 0} companie(s) created, ${data.skipped ?? 0} skipped.`
    );
  } else {
    console.log(
      `✓ Imported ${data.imported ?? "?"} companie(s), ${data.skipped ?? 0} skipped${data.duplicates ? ` (${data.duplicates} duplicates)` : ""}.`
    );
  }
}

// ------------------------------------------------------------------- tokens

export const TOKENS_HELP = `vibe-crm tokens — manage API tokens (token auth suffices, self-service)

Usage:
  vibe-crm tokens create --name <label>   (prints the vc_… secret ONCE — store it)
  vibe-crm tokens ls
  vibe-crm tokens revoke --id <id>`;

export async function cmdTokensCreate(args, ctx) {
  if (args.help === true || args.h === true) {
    console.log(TOKENS_HELP);
    return;
  }
  const { url, key } = connect(args.instance);
  const name = need(args, "name", "vibe-crm tokens create needs --name <label>");
  const data = await request(url, { method: "POST", path: "/v1/tokens", body: { name }, token: key });
  const t = data?.token ?? data;
  if (ctx.json) return emit(ctx, "", { instance: url, ...data });
  console.log(`Created token "${name}" ${t.id ?? ""} (prefix ${t.prefix ?? "?"})`);
  if (t.token) {
    console.log(`\n  ${t.token}\n`);
    console.log("Store this secret now — it is shown only once. Set it via:");
    console.log(`  vibe-crm auth login --instance ${url} --token <vc_…>`);
  }
}

export async function cmdTokensLs(args, ctx) {
  if (args.help === true || args.h === true) {
    console.log(TOKENS_HELP);
    return;
  }
  const { url, key } = connect(args.instance);
  const data = await request(url, { path: "/v1/tokens", token: key });
  const { rows } = asList(data, "tokens");
  if (ctx.json) return emit(ctx, "", { instance: url, tokens: rows });
  if (rows.length === 0) return console.log("No API tokens yet. Create one with: vibe-crm tokens create --name <label>");
  console.log(
    table(
      rows.map((t) => ({
        id: short(t.id),
        name: t.name ?? "",
        prefix: t.prefix ?? "",
        created: (t.createdAt ?? t.created_at ?? "").slice(0, 10),
        last_used: (t.lastUsedAt ?? t.last_used_at ?? "")?.slice?.(0, 10) ?? ""
      })),
      ["id", "name", "prefix", "created", "last_used"]
    )
  );
}

export async function cmdTokensRevoke(args, ctx) {
  if (args.help === true || args.h === true) {
    console.log(TOKENS_HELP);
    return;
  }
  const { url, key } = connect(args.instance);
  const id = need(args, "id", "vibe-crm tokens revoke needs --id <id>");
  await request(url, { method: "DELETE", path: `/v1/tokens/${encodeURIComponent(id)}`, token: key });
  emit(ctx, `✓ Revoked token ${id}`, { instance: url, ok: true, id });
}
