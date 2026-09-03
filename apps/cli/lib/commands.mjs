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

Usage: vibe-crm deals [--search <q>] [--stage <key>] [--product <key>] [--page <n>] [--limit <n>]`;

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
      product: flag(args, "product", "product-id", "productId"),
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

export const DEAL_HELP = `vibe-crm deal — add | update | move | rm

Usage:
  vibe-crm deal add --name <v> [--contact-id <id>] [--company-id <id>] [--product <key>]
                    [--value <n>] [--stage <key>] [--close-date <iso>] [--notes <v>]
                    [--set key=value ...]
  vibe-crm deal update --id <id> [--name <v>] [--contact-id <id>] [--company-id <id>]
                       [--product <key>] [--value <n>] [--stage <key>] [--close-date <iso>]
                       [--notes <v>] [--set key=value ...]
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
  const companyId = flag(args, "company-id", "companyId", "company");
  if (companyId !== undefined) body.company_id = companyId;
  const productId = flag(args, "product", "product-id", "productId");
  if (productId !== undefined) body.product_id = productId;
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

export async function cmdDealUpdate(args, ctx) {
  if (args.help === true || args.h === true) {
    console.log(DEAL_HELP);
    return;
  }
  const { url, key } = connect(args.instance);
  const id = need(args, "id", "vibe-crm deal update needs --id <id>");
  const body = {};
  for (const [opt, api] of [["name", "name"], ["stage", "stage"], ["notes", "notes"]]) {
    const v = flag(args, opt);
    if (v !== undefined) body[api] = v;
  }
  const contactId = flag(args, "contact-id", "contactId", "contact");
  if (contactId !== undefined) body.contact_id = contactId;
  const companyId = flag(args, "company-id", "companyId", "company");
  if (companyId !== undefined) body.company_id = companyId;
  const productId = flag(args, "product", "product-id", "productId");
  if (productId !== undefined) body.product_id = productId;
  const value = flag(args, "value");
  if (value !== undefined) {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new UsageError(`--value must be a number (got "${value}")`);
    body.value = n;
  }
  const closeDate = flag(args, "close-date", "closeDate", "close");
  if (closeDate !== undefined) body.close_date = closeDate;
  const custom = customBag(args);
  if (Object.keys(custom).length) body.custom = custom;
  if (Object.keys(body).length === 0) throw new UsageError("vibe-crm deal update needs at least one field to change");
  const data = await request(url, { method: "PUT", path: `/v1/deals/${encodeURIComponent(id)}`, body, token: key });
  const d = data?.deal ?? data;
  emit(ctx, `✓ Updated deal ${d.id ?? id}`, { instance: url, deal: d });
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
  vibe-crm import notion <seed.json> [--dry-run]

CSV: header row with API field names (first_name,last_name,email,…).
JSON: an array of records, or {"contacts": [...]} / {"companies": [...]}.
--dry-run parses + validates locally without sending anything.
Notion seeds ({products, companies, contacts, deals, subscriptions, activities}) resolve
names to IDs case-insensitively; --dry-run reads existing records to project skips.`;

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

// ------------------------------------------------------------------- products

export const PRODUCTS_HELP = `vibe-crm products — list products (name-asc)

Usage: vibe-crm products [--search <q>]`;

export async function cmdProducts(args, ctx) {
  if (args.help === true || args.h === true) {
    console.log(PRODUCTS_HELP);
    return;
  }
  const { url, key } = connect(args.instance);
  const data = await request(url, {
    path: "/v1/products",
    query: { search: flag(args, "search") },
    token: key
  });
  const { rows } = asList(data, "products");
  if (ctx.json) return emit(ctx, "", { instance: url, products: rows });
  if (rows.length === 0) return console.log("No products found.");
  console.log(
    table(
      rows.map((p) => ({
        key: p.key ?? "",
        name: p.name ?? "",
        type: p.type ?? "",
        status: p.status ?? ""
      })),
      ["key", "name", "type", "status"]
    )
  );
  console.log(`\n${rows.length} product(s) on ${url}`);
}

export const PRODUCT_HELP = `vibe-crm product — add | rm

Usage:
  vibe-crm product add --name <v> [--key <slug>] [--type product|service|other]
                       [--status <v>] [--notes <v>]
  vibe-crm product rm --key <slug>`;

export async function cmdProductAdd(args, ctx) {
  if (args.help === true || args.h === true) {
    console.log(PRODUCT_HELP);
    return;
  }
  const { url, key } = connect(args.instance);
  const name = need(args, "name", "vibe-crm product add needs --name <v>");
  const body = { name };
  for (const f of ["key", "type", "status", "notes"]) {
    const v = flag(args, f);
    if (v !== undefined) body[f] = v;
  }
  const data = await request(url, { method: "POST", path: "/v1/products", body, token: key });
  const p = data?.product ?? data;
  emit(ctx, `Created product "${p.name ?? name}" (${p.key ?? ""})`, { instance: url, product: p });
}

export async function cmdProductRm(args, ctx) {
  if (args.help === true || args.h === true) {
    console.log(PRODUCT_HELP);
    return;
  }
  const { url, key } = connect(args.instance);
  const slug = need(args, "key", "vibe-crm product rm needs --key <slug>");
  await request(url, { method: "DELETE", path: `/v1/products/${encodeURIComponent(slug)}`, token: key });
  emit(ctx, `✓ Removed product ${slug}`, { instance: url, ok: true, key: slug });
}

// ------------------------------------------------------------------- subscriptions & mrr

export const SUBSCRIPTIONS_HELP = `vibe-crm subscriptions — list subscriptions

Usage: vibe-crm subscriptions [--status active|trial|paused|cancelled|expired]
                              [--product <key>] [--company-id <id>] [--page <n>] [--limit <n>]`;

export async function cmdSubscriptions(args, ctx) {
  if (args.help === true || args.h === true) {
    console.log(SUBSCRIPTIONS_HELP);
    return;
  }
  const { url, key } = connect(args.instance);
  const data = await request(url, {
    path: "/v1/subscriptions",
    query: {
      status: flag(args, "status"),
      product: flag(args, "product", "product-id", "productId"),
      company_id: flag(args, "company-id", "companyId", "company"),
      page: flag(args, "page"),
      limit: flag(args, "limit")
    },
    token: key
  });
  const { rows, total } = asList(data, "subscriptions");
  if (ctx.json) return emit(ctx, "", { instance: url, subscriptions: rows, total });
  if (rows.length === 0) return console.log("No subscriptions found.");
  console.log(
    table(
      rows.map((s) => ({
        id: short(s.id),
        name: s.name ?? "",
        amount: `${s.amount ?? 0} ${s.currency ?? ""}`.trim(),
        interval: s.interval ?? "",
        status: s.status ?? "",
        company: s.company_name ?? s.company_id ?? "",
        product: s.product_name ?? s.product_id ?? ""
      })),
      ["id", "name", "amount", "interval", "status", "company", "product"]
    )
  );
  console.log(`\n${rows.length}/${total} subscription(s) on ${url}`);
}

export const SUBSCRIPTION_HELP = `vibe-crm subscription — add | update | cancel | rm

Usage:
  vibe-crm subscription add --name <v> [--company-id <id>] [--contact-id <id>] [--product <key>]
                            [--amount <n>] [--currency <code>] [--interval monthly|quarterly|yearly|one_time]
                            [--start-date <iso>] [--end-date <iso>] [--status active|trial|paused|cancelled|expired]
                            [--notes <v>]
  vibe-crm subscription update --id <id> [--name <v> ...]
  vibe-crm subscription cancel --id <id>   (sets status=cancelled)
  vibe-crm subscription rm --id <id>`;

const SUB_INTERVALS = ["monthly", "quarterly", "yearly", "one_time"];
const SUB_STATUSES = ["active", "trial", "paused", "cancelled", "expired"];

function subAmount(args) {
  const raw = flag(args, "amount");
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new UsageError(`--amount must be a number (got "${raw}")`);
  return n;
}

export async function cmdSubscriptionAdd(args, ctx) {
  if (args.help === true || args.h === true) {
    console.log(SUBSCRIPTION_HELP);
    return;
  }
  const { url, key } = connect(args.instance);
  const name = need(args, "name", "vibe-crm subscription add needs --name <v>");
  const body = { name };
  const companyId = flag(args, "company-id", "companyId", "company");
  if (companyId !== undefined) body.company_id = companyId;
  const contactId = flag(args, "contact-id", "contactId", "contact");
  if (contactId !== undefined) body.contact_id = contactId;
  const productId = flag(args, "product", "product-id", "productId");
  if (productId !== undefined) body.product_id = productId;
  const amount = subAmount(args);
  if (amount !== undefined) body.amount = amount;
  for (const [opt, api] of [["currency", "currency"], ["start-date", "start_date"], ["end-date", "end_date"], ["notes", "notes"]]) {
    const v = flag(args, opt);
    if (v !== undefined) body[api] = v;
  }
  const interval = flag(args, "interval");
  if (interval !== undefined) {
    if (!SUB_INTERVALS.includes(interval)) throw new UsageError(`--interval must be one of: ${SUB_INTERVALS.join(" | ")} (got "${interval}")`);
    body.interval = interval;
  }
  const status = flag(args, "status");
  if (status !== undefined) {
    if (!SUB_STATUSES.includes(status)) throw new UsageError(`--status must be one of: ${SUB_STATUSES.join(" | ")} (got "${status}")`);
    body.status = status;
  }
  const data = await request(url, { method: "POST", path: "/v1/subscriptions", body, token: key });
  const s = data?.subscription ?? data;
  emit(ctx, `Created subscription "${s.name ?? name}" ${s.id ?? ""}`, { instance: url, subscription: s });
}

export async function cmdSubscriptionUpdate(args, ctx) {
  if (args.help === true || args.h === true) {
    console.log(SUBSCRIPTION_HELP);
    return;
  }
  const { url, key } = connect(args.instance);
  const id = need(args, "id", "vibe-crm subscription update needs --id <id>");
  const body = {};
  for (const [opt, api] of [
    ["name", "name"],
    ["currency", "currency"],
    ["start-date", "start_date"],
    ["end-date", "end_date"],
    ["notes", "notes"]
  ]) {
    const v = flag(args, opt);
    if (v !== undefined) body[api] = v;
  }
  const companyId = flag(args, "company-id", "companyId", "company");
  if (companyId !== undefined) body.company_id = companyId;
  const contactId = flag(args, "contact-id", "contactId", "contact");
  if (contactId !== undefined) body.contact_id = contactId;
  const productId = flag(args, "product", "product-id", "productId");
  if (productId !== undefined) body.product_id = productId;
  const amount = subAmount(args);
  if (amount !== undefined) body.amount = amount;
  const interval = flag(args, "interval");
  if (interval !== undefined) {
    if (!SUB_INTERVALS.includes(interval)) throw new UsageError(`--interval must be one of: ${SUB_INTERVALS.join(" | ")} (got "${interval}")`);
    body.interval = interval;
  }
  const status = flag(args, "status");
  if (status !== undefined) {
    if (!SUB_STATUSES.includes(status)) throw new UsageError(`--status must be one of: ${SUB_STATUSES.join(" | ")} (got "${status}")`);
    body.status = status;
  }
  if (Object.keys(body).length === 0) throw new UsageError("vibe-crm subscription update needs at least one field to change");
  const data = await request(url, { method: "PUT", path: `/v1/subscriptions/${encodeURIComponent(id)}`, body, token: key });
  const s = data?.subscription ?? data;
  emit(ctx, `✓ Updated subscription ${s.id ?? id}`, { instance: url, subscription: s });
}

export async function cmdSubscriptionCancel(args, ctx) {
  if (args.help === true || args.h === true) {
    console.log(SUBSCRIPTION_HELP);
    return;
  }
  const { url, key } = connect(args.instance);
  const id = need(args, "id", "vibe-crm subscription cancel needs --id <id>");
  const data = await request(url, {
    method: "PUT",
    path: `/v1/subscriptions/${encodeURIComponent(id)}`,
    body: { status: "cancelled" },
    token: key
  });
  const s = data?.subscription ?? data;
  emit(ctx, `✓ Cancelled subscription ${s.id ?? id}`, { instance: url, subscription: s });
}

export async function cmdSubscriptionRm(args, ctx) {
  if (args.help === true || args.h === true) {
    console.log(SUBSCRIPTION_HELP);
    return;
  }
  const { url, key } = connect(args.instance);
  const id = need(args, "id", "vibe-crm subscription rm needs --id <id>");
  await request(url, { method: "DELETE", path: `/v1/subscriptions/${encodeURIComponent(id)}`, token: key });
  emit(ctx, `✓ Removed subscription ${id}`, { instance: url, ok: true, id });
}

export const MRR_HELP = `vibe-crm mrr — monthly recurring revenue summary (active + trial subscriptions)

Usage: vibe-crm mrr`;

export async function cmdMrr(args, ctx) {
  if (args.help === true || args.h === true) {
    console.log(MRR_HELP);
    return;
  }
  const { url, key } = connect(args.instance);
  const data = await request(url, { path: "/v1/subscriptions/summary", token: key });
  if (ctx.json) return emit(ctx, "", { instance: url, ...data });
  const byProduct = Array.isArray(data?.byProduct) ? data.byProduct : [];
  console.log(
    [
      `MRR ${data?.mrr ?? 0} — ${data?.active ?? 0} active, ${data?.trial ?? 0} trial, ${data?.paused ?? 0} paused (${data?.total ?? 0} total)`,
      byProduct.length === 0
        ? "No product breakdown."
        : table(
            byProduct.map((p) => ({
              product: p.product ?? "",
              name: p.productName ?? "",
              mrr: p.mrr ?? 0,
              active: p.active ?? ""
            })),
            ["product", "name", "mrr", "active"]
          )
    ].join("\n")
  );
}

// ------------------------------------------------------------------- import notion

export const IMPORT_NOTION_HELP = `vibe-crm import notion — seed from a Notion export file (idempotent)

Usage: vibe-crm import notion <seed.json> [--dry-run]

Seed shape: { products[], companies[], contacts[], deals[], subscriptions[], activities[] }
  products:      { key, name, type?, status?, notes? }
  companies:     { name!, email?, phone?, notes? }
  contacts:      { first_name!, last_name?, email?, phone?, title?, company:NAME?, status?, notes? }
  deals:         { name!, company:NAME?, contact:FULL NAME?, product:KEY?, stage?, value?, notes? }
  subscriptions: { name!, company:NAME?, product:KEY?, amount?, currency?, interval?, status?, start_date?, end_date?, notes? }
  activities:    { company:NAME, body }

Order: products → companies → contacts → deals → subscriptions → activities.
Names resolve to IDs case-insensitively. Idempotency: companies skipped by name,
products upserted by key, deals/subscriptions skipped by name+company, contacts
skipped by email (or name+company). Activities are only created for companies and
contacts created in the same run (contacts have no notes field — notes become
note activities on the contact).
--dry-run reads existing records to project skips but sends no writes.`;

const norm = (v) => String(v ?? "").trim().toLowerCase();
const contactFullName = (c) => [c.first_name, c.last_name].filter(Boolean).join(" ").trim();

async function listAll(url, key, path) {
  const rows = [];
  for (let page = 1; page <= 100; page++) {
    const data = await request(url, { path, query: { page: String(page), limit: "100" }, token: key });
    const listKey = data && typeof data === "object" ? Object.keys(data).find((k) => Array.isArray(data[k])) : undefined;
    const batch = Array.isArray(data) ? data : listKey ? data[listKey] : [];
    rows.push(...batch);
    if (batch.length < 100 || rows.length >= (data?.total ?? rows.length)) break;
  }
  return rows;
}

function loadSeedFile(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    throw new UsageError(`Import file not found: ${file}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new UsageError(`Notion seed must be valid JSON: ${file}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new UsageError(`Notion seed must be an object {products, companies, contacts, deals, subscriptions, activities}: ${file}`);
  }
  const seed = {};
  for (const k of ["products", "companies", "contacts", "deals", "subscriptions", "activities"]) {
    const v = parsed[k] ?? [];
    if (!Array.isArray(v)) throw new UsageError(`Notion seed "${k}" must be an array: ${file}`);
    seed[k] = v;
  }
  return seed;
}

export async function cmdImportNotion(args, ctx) {
  if (args.help === true || args.h === true) {
    console.log(IMPORT_NOTION_HELP);
    return;
  }
  const file = flag(args, "file") ?? args._positional?.[0];
  if (!file) throw new UsageError("vibe-crm import notion needs <seed.json>");
  const seed = loadSeedFile(file);
  const dryRun = args["dry-run"] === true || args.dryRun === true;

  // --dry-run works offline (local counts only); otherwise resolve against the API.
  let url = null;
  let key = null;
  let online = false;
  try {
    ({ url, key } = connect(args.instance));
    online = true;
  } catch (err) {
    if (!dryRun) throw err;
  }

  const existing = { products: [], companies: [], contacts: [], deals: [], subscriptions: [] };
  if (online) {
    existing.products = await listAll(url, key, "/v1/products");
    existing.companies = await listAll(url, key, "/v1/companies");
    existing.contacts = await listAll(url, key, "/v1/contacts");
    existing.deals = await listAll(url, key, "/v1/deals");
    existing.subscriptions = await listAll(url, key, "/v1/subscriptions");
  }

  const companyByName = new Map(existing.companies.map((c) => [norm(c.name), c]));
  const productKeys = new Set(existing.products.map((p) => norm(p.key)));
  const contactByEmail = new Map(existing.contacts.filter((c) => norm(c.email)).map((c) => [norm(c.email), c]));
  const contactByNameCo = new Map(
    existing.contacts.map((c) => [`${norm(contactFullName(c))}\0${norm(c.company_name ?? "")}`, c])
  );
  const dealKeys = new Set(
    existing.deals.map((d) => `${norm(d.name)}\0${norm(d.company_name ?? d.company_id ?? "")}`)
  );
  const subKeys = new Set(
    existing.subscriptions.map((s) => `${norm(s.name)}\0${norm(s.company_name ?? s.company_id ?? "")}`)
  );

  const counts = {
    products: { created: 0, updated: 0 },
    companies: { created: 0, skipped: 0 },
    contacts: { created: 0, skipped: 0 },
    deals: { created: 0, skipped: 0 },
    subscriptions: { created: 0, skipped: 0 },
    activities: { created: 0 }
  };
  const failures = [];
  const fail = (step, ref, message) => failures.push({ step, ref: String(ref ?? "").slice(0, 80), message: String(message).slice(0, 200) });

  const findCompany = (name) => (name ? companyByName.get(norm(name)) : undefined);
  const findContact = (full) => {
    if (!full) return undefined;
    return existing.contacts.find((c) => norm(contactFullName(c)) === norm(full));
  };

  // ---- 1. products (upsert per key)
  const productUpserts = [];
  for (const p of seed.products) {
    if (!p.key || !p.name) {
      fail("products", p.name ?? p.key, "needs key + name — skipped");
      continue;
    }
    const isUpdate = productKeys.has(norm(p.key));
    const body = { name: p.name };
    for (const f of ["type", "status", "notes"]) if (p[f] !== undefined) body[f] = p[f];
    productUpserts.push({ p, body, isUpdate });
    if (dryRun && !isUpdate) productKeys.add(norm(p.key));
  }

  // ---- 2. companies (skip per name)
  const companyCreates = [];
  for (const c of seed.companies) {
    if (!c.name) {
      fail("companies", "", "needs name — skipped");
      continue;
    }
    if (companyByName.has(norm(c.name))) {
      counts.companies.skipped++;
      continue;
    }
    companyByName.set(norm(c.name), { id: null, name: c.name, __planned: true });
    companyCreates.push(c);
  }

  // ---- 3. contacts (skip per email, else name+company)
  const contactCreates = [];
  const plannedContactKeys = new Set();
  for (const c of seed.contacts) {
    if (!c.first_name) {
      fail("contacts", c.email ?? "", "needs first_name — skipped");
      continue;
    }
    const emailKey = norm(c.email);
    const coName = c.company ?? "";
    const nameCoKey = `${norm(contactFullName(c))}\0${norm(coName)}`;
    if ((emailKey && contactByEmail.has(emailKey)) || contactByNameCo.has(nameCoKey) || plannedContactKeys.has(emailKey || nameCoKey)) {
      counts.contacts.skipped++;
      continue;
    }
    plannedContactKeys.add(emailKey || nameCoKey);
    contactCreates.push(c);
  }

  // ---- 4. deals (skip per name+company)
  const dealCreates = [];
  for (const d of seed.deals) {
    if (!d.name) {
      fail("deals", "", "needs name — skipped");
      continue;
    }
    const dk = `${norm(d.name)}\0${norm(d.company ?? "")}`;
    if (dealKeys.has(dk)) {
      counts.deals.skipped++;
      continue;
    }
    dealKeys.add(dk);
    dealCreates.push(d);
  }

  // ---- 5. subscriptions (skip per name+company)
  const subCreates = [];
  for (const s of seed.subscriptions) {
    if (!s.name) {
      fail("subscriptions", "", "needs name — skipped");
      continue;
    }
    const sk = `${norm(s.name)}\0${norm(s.company ?? "")}`;
    if (subKeys.has(sk)) {
      counts.subscriptions.skipped++;
      continue;
    }
    subKeys.add(sk);
    subCreates.push(s);
  }

  const newCompanyIds = new Map(); // norm(name) -> id (real run)
  const newContactIds = new Map(); // norm(full name) -> id (real run)

  if (dryRun) {
    counts.products.created = productUpserts.filter((u) => !u.isUpdate).length;
    counts.products.updated = productUpserts.filter((u) => u.isUpdate).length;
    counts.companies.created = companyCreates.length;
    counts.contacts.created = contactCreates.length;
    counts.deals.created = dealCreates.length;
    counts.subscriptions.created = subCreates.length;
    // activities: seed entries with resolvable company + note activities for new contacts with notes
    for (const a of seed.activities) if (a.company && a.body && companyByName.has(norm(a.company))) counts.activities.created++;
    for (const c of contactCreates) if (norm(c.notes)) counts.activities.created++;
  } else {
    // ---- 1. products
    for (const { p, body, isUpdate } of productUpserts) {
      try {
        if (isUpdate) {
          await request(url, { method: "PUT", path: `/v1/products/${encodeURIComponent(p.key)}`, body, token: key });
          counts.products.updated++;
        } else {
          await request(url, { method: "POST", path: "/v1/products", body: { key: p.key, ...body }, token: key });
          counts.products.created++;
          productKeys.add(norm(p.key));
        }
      } catch (err) {
        fail("products", p.key, err instanceof Error ? err.message : String(err));
      }
    }
    // ---- 2. companies
    for (const c of companyCreates) {
      try {
        const body = { name: c.name };
        for (const f of ["email", "phone", "notes"]) if (c[f] !== undefined) body[f] = c[f];
        const data = await request(url, { method: "POST", path: "/v1/companies", body, token: key });
        const created = data?.company ?? data;
        companyByName.set(norm(c.name), created);
        if (created?.id) newCompanyIds.set(norm(c.name), created.id);
        counts.companies.created++;
      } catch (err) {
        companyByName.delete(norm(c.name));
        fail("companies", c.name, err instanceof Error ? err.message : String(err));
      }
    }
    // ---- 3. contacts
    for (const c of contactCreates) {
      try {
        const co = findCompany(c.company);
        const body = { first_name: c.first_name };
        for (const [seedKey, api] of [["last_name", "last_name"], ["email", "email"], ["phone", "phone"], ["title", "title"], ["status", "status"]]) {
          if (c[seedKey] !== undefined) body[api] = c[seedKey];
        }
        if (co?.id) body.company_id = co.id;
        const data = await request(url, { method: "POST", path: "/v1/contacts", body, token: key });
        const created = data?.contact ?? data;
        if (created?.id) newContactIds.set(norm(contactFullName(c)), created.id);
        if (created?.email && norm(created.email)) contactByEmail.set(norm(created.email), created);
        counts.contacts.created++;
        // contacts have no notes field — preserve as a note activity
        if (norm(c.notes) && created?.id) {
          try {
            await request(url, {
              method: "POST",
              path: "/v1/activities",
              body: { entity_type: "contact", entity_id: created.id, type: "note", body: c.notes },
              token: key
            });
            counts.activities.created++;
          } catch (err) {
            fail("activities", `contact:${contactFullName(c)}`, err instanceof Error ? err.message : String(err));
          }
        }
      } catch (err) {
        fail("contacts", c.email || contactFullName(c), err instanceof Error ? err.message : String(err));
      }
    }
    // ---- 4. deals
    for (const d of dealCreates) {
      try {
        const co = findCompany(d.company);
        if (d.company && !co?.id && !co?.__planned) throw new Error(`unknown company "${d.company}"`);
        const contact = findContact(d.contact);
        const body = { name: d.name };
        if (co?.id) body.company_id = co.id;
        const contactId = contact?.id ?? (d.contact ? newContactIds.get(norm(d.contact)) : undefined);
        if (contactId) body.contact_id = contactId;
        if (d.product && productKeys.has(norm(d.product))) body.product_id = d.product;
        else if (d.product) throw new Error(`unknown product "${d.product}"`);
        if (d.stage !== undefined) body.stage = d.stage;
        if (d.value !== undefined) body.value = d.value;
        if (d.notes !== undefined) body.notes = d.notes;
        await request(url, { method: "POST", path: "/v1/deals", body, token: key });
        counts.deals.created++;
      } catch (err) {
        fail("deals", d.name, err instanceof Error ? err.message : String(err));
      }
    }
    // ---- 5. subscriptions
    for (const s of subCreates) {
      try {
        const co = findCompany(s.company);
        if (s.company && !co?.id && !co?.__planned) throw new Error(`unknown company "${s.company}"`);
        const body = { name: s.name };
        if (co?.id) body.company_id = co.id;
        if (s.product && productKeys.has(norm(s.product))) body.product_id = s.product;
        else if (s.product) throw new Error(`unknown product "${s.product}"`);
        for (const [seedKey, api] of [
          ["amount", "amount"],
          ["currency", "currency"],
          ["interval", "interval"],
          ["status", "status"],
          ["start_date", "start_date"],
          ["end_date", "end_date"],
          ["notes", "notes"]
        ]) {
          if (s[seedKey] !== undefined) body[api] = s[seedKey];
        }
        await request(url, { method: "POST", path: "/v1/subscriptions", body, token: key });
        counts.subscriptions.created++;
      } catch (err) {
        fail("subscriptions", s.name, err instanceof Error ? err.message : String(err));
      }
    }
    // ---- 6. activities (only for companies created in this run — idempotent)
    for (const a of seed.activities) {
      if (!a.company || !a.body) {
        fail("activities", a.company ?? "", "needs company + body — skipped");
        continue;
      }
      const companyId = newCompanyIds.get(norm(a.company)) ?? findCompany(a.company)?.id;
      const isNew = newCompanyIds.has(norm(a.company));
      if (!companyId || !isNew) continue; // existing company → activity assumed from first import
      try {
        await request(url, {
          method: "POST",
          path: "/v1/activities",
          body: { entity_type: "company", entity_id: companyId, type: "note", body: a.body },
          token: key
        });
        counts.activities.created++;
      } catch (err) {
        fail("activities", a.company, err instanceof Error ? err.message : String(err));
      }
    }
  }

  const summary = { instance: url, dry_run: dryRun, file, counts, failures };
  if (ctx.json) {
    emit(ctx, "", summary);
  } else {
    const mode = dryRun ? `${file} — dry run, nothing sent${online ? "" : " (offline, no instance/key)"}` : `${file} → ${url}`;
    console.log(`Notion import ${mode}`);
    const line = (label, c, extra) => console.log(`  ${label.padEnd(14)} ${String(c).padEnd(4)} ${extra}`);
    line("products", seed.products.length, `${counts.products.created} created, ${counts.products.updated} updated`);
    line("companies", seed.companies.length, `${counts.companies.created} created, ${counts.companies.skipped} skipped`);
    line("contacts", seed.contacts.length, `${counts.contacts.created} created, ${counts.contacts.skipped} skipped`);
    line("deals", seed.deals.length, `${counts.deals.created} created, ${counts.deals.skipped} skipped`);
    line("subscriptions", seed.subscriptions.length, `${counts.subscriptions.created} created, ${counts.subscriptions.skipped} skipped`);
    line("activities", seed.activities.length, `${counts.activities.created} created`);
    if (failures.length === 0) {
      console.log(dryRun ? "✓ Dry run — nothing sent." : "✓ Import complete.");
    } else {
      console.error(`✗ ${failures.length} record(s) failed:`);
      for (const f of failures.slice(0, 10)) console.error(`  [${f.step}] ${f.ref}: ${f.message}`);
      if (failures.length > 10) console.error(`  … +${failures.length - 10} more`);
    }
  }
  if (failures.length > 0) process.exitCode = 1;
}
