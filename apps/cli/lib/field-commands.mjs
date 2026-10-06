import { isDeepStrictEqual } from "node:util";
import { connect, request } from "./client.mjs";
import { ApiError, UsageError, redactSecrets } from "./errors.mjs";
import { table } from "./commands.mjs";

const ENTITIES = ["company", "contact", "deal"];
const TYPES = ["string", "text", "integer", "decimal", "boolean", "date", "datetime", "enumeration", "json"];
const VIEW_PATH = "/v1/deals/view";

export const CUSTOM_FIELDS_HELP = `vibe-crm custom-fields

Usage: vibe-crm custom-fields [--entity company|contact|deal]

List registered definitions, including exact keys, types, options and positions.
Without --entity, list all three entity types. --json returns { instance, defs }.`;

export const CUSTOM_FIELD_HELP = `vibe-crm custom-field add

Usage: vibe-crm custom-field add --entity company|contact|deal --key KEY --label LABEL
                                [--type TYPE] [--options JSON_OBJECT] [--position INTEGER]

Types: string, text, integer, decimal, boolean, date, datetime, enumeration, json.
Defaults: --type string, --options '{}', --position 0.
Keys must match ^[a-z][a-z0-9_]*$ exactly. Labels must not be blank.
Options must be a JSON object, not an array, null or a scalar. Quote JSON in the shell.
Position must be a safe finite base-10 integer, without whitespace or exponent notation.
No trimming, lowercasing or slug repair. Existing or reserved keys fail, never overwrite.
Create only. Definition update/delete are not CLI commands.
The CLI sends POST once, then verifies the exact definition via GET custom-fields.
A verification failure exits 1; re-read before retrying a possibly completed write.
Definitions belong to the shared selected workspace, not an individual user or context.
Custom date values remain calendar dates such as 2026-10-06, without timezone conversion.
Use --custom JSON or --set key=value on company/contact/deal add/update to write values.

Examples:
  vibe-crm custom-field add --entity deal --key next_action --label 'Next action' --type date
  vibe-crm custom-field add --entity deal --key priority --label Priority --type enumeration --options '{"enum":["low","high"]}' --position 2
  vibe-crm custom-fields --entity deal --json`;

export const DEAL_VIEW_HELP = `vibe-crm deal-view

Usage:
  vibe-crm deal-view fields
  vibe-crm deal-view show
  vibe-crm deal-view set --columns name,company_name,next_action
  vibe-crm deal-view reset
  vibe-crm deal-view rules [--field KEY]
  vibe-crm deal-view rule-set --field KEY --when lost
  vibe-crm deal-view rule-set --field KEY --when stages --stages prospect,qualified
  vibe-crm deal-view rule-remove --field KEY

fields lists selectable standard and registered custom deal fields with exact keys/types.
show returns fields, ordered columns, default_columns, visibility and warnings.
set replaces the complete ordered column list. name is mandatory but may be reordered.
Use comma-separated exact keys, with no spaces, empty entries or duplicates.
Defaults: name,company_name,contact_name,product_name,value,close_date.
reset restores only default columns. It does not erase field visibility rules.

Rules control when a registered custom deal field appears in the deal editor.
--when lost matches any stage marked is_lost, not just a stage named lost.
--when stages requires --stages with existing exact stage keys.
--when lost must not include --stages. A field without a rule is always visible.
rule-set replaces only that field's rule; rule-remove removes only that rule.
rules --field filters to one registered custom field, returning no rule if unset.
Rules do not clear stored values or select pipeline columns.

Columns and rules are shared by everyone on the selected workspace, including the web UI.
Unknown column keys, non-custom rule targets and unknown stages fail instead of being repaired.
Removed/stale fields and stages are normalized by GET without rewriting stored settings;
warnings explain omissions. Read commands do not clean up or persist settings.
Every write is sent once and verified by an exact GET readback. On verification failure,
exit 1 and re-read show/rules before retrying. No write is blindly retried.
--json on show/set/reset/rule-set/rule-remove returns the full view plus instance.
--json on fields returns { instance, fields, warnings }; rules returns { instance, visibility, warnings }.

Examples:
  vibe-crm deal-view fields --context dev --json
  vibe-crm deal-view set --columns name,company_name,next_action,value --context dev
  vibe-crm deal-view rule-set --field next_action --when stages --stages prospect,qualified
  vibe-crm deal-view rule-set --field loss_reason --when lost
  vibe-crm deal-view rules --field loss_reason --json
  vibe-crm deal-view reset`;

function output(ctx, data, text) {
  process.stdout.write(redactSecrets(ctx.json ? JSON.stringify(data, null, 2) : text) + "\n");
}
function required(args, name) {
  const value = args[name];
  if (typeof value !== "string" || !value) throw new UsageError(`--${name} is required. Use --help.`);
  return value;
}
function entity(value) {
  if (!ENTITIES.includes(value)) throw new UsageError("--entity must be exactly company, contact or deal.");
  return value;
}
function fieldKey(value, flag) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_]*$/.test(value) || /\s/.test(value)) {
    throw new UsageError(`--${flag} keys must match ^[a-z][a-z0-9_]*$ exactly. No whitespace or key repair.`);
  }
  return value;
}
function keyList(value, flag) {
  const keys = value.split(",").map((key) => fieldKey(key, flag));
  if (new Set(keys).size !== keys.length) throw new UsageError(`--${flag} must not contain duplicate keys.`);
  return keys;
}
function optionsObject(raw) {
  let value;
  try { value = JSON.parse(raw); } catch { throw new UsageError("--options must be valid JSON. Quote the JSON object in the shell."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new UsageError("--options must be a JSON object, not null, an array or a scalar.");
  // JSON.parse accepts numeric overflow, but JSON.stringify would silently turn it into null.
  const finite = (item) => typeof item === "number" ? Number.isFinite(item) : item && typeof item === "object" ? Object.values(item).every(finite) : true;
  if (!finite(value)) throw new UsageError("--options must not contain non-finite JSON numbers.");
  return value;
}
function position(raw) {
  if (!/^-?(?:0|[1-9]\d*)$/.test(raw) || /\s/.test(raw) || !Number.isSafeInteger(Number(raw))) {
    throw new UsageError("--position must be a safe finite base-10 integer, without whitespace, leading zeros or exponent notation.");
  }
  return Number(raw);
}
function invalidResponse(message) { throw new ApiError(message, 200, { error: "invalid_response" }); }
function defsResponse(data) {
  const valid = (def) => def !== null && typeof def === "object" && typeof def.id === "string" && ENTITIES.includes(def.entity_type) && typeof def.key === "string" && typeof def.label === "string" && TYPES.includes(def.field_type) && def.options !== null && typeof def.options === "object" && !Array.isArray(def.options) && Number.isInteger(def.position);
  if (!Array.isArray(data?.defs) || !data.defs.every(valid)) invalidResponse("API returned an invalid custom-field definitions response.");
  return data.defs;
}
function viewResponse(data) {
  const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  const strings = (value) => Array.isArray(value) && value.every((item) => typeof item === "string");
  const field = (value) => record(value) && typeof value.key === "string" && typeof value.label === "string" && TYPES.includes(value.field_type) && ["standard", "custom"].includes(value.source) && (value.options === undefined || record(value.options));
  const rule = (value) => record(value) && (value.mode === "lost" ? Object.keys(value).length === 1 : value.mode === "stages" && Object.keys(value).length === 2 && strings(value.stages) && value.stages.length > 0 && new Set(value.stages).size === value.stages.length);
  if (!record(data) || !Array.isArray(data.fields) || !data.fields.every(field) || !strings(data.columns) || !strings(data.default_columns) || !record(data.visibility) || !Object.values(data.visibility).every(rule) || !strings(data.warnings)) {
    invalidResponse("API returned an invalid deal-view response.");
  }
  return data;
}
function warnings(view) { return view.warnings.length ? "\n\nWarnings:\n" + view.warnings.map((warning) => `  ${warning}`).join("\n") : ""; }
function fieldsTable(fields) {
  return fields.length ? table(fields.map((field) => ({ key: field.key, label: field.label, type: field.field_type, source: field.source, options: JSON.stringify(field.options ?? {}) })), ["key", "label", "type", "source", "options"]) : "No selectable fields.";
}
function rulesTable(visibility) {
  const rows = Object.entries(visibility).map(([key, rule]) => ({ field: key, when: rule.mode, stages: rule.mode === "stages" ? rule.stages.join(",") : "" }));
  return rows.length ? table(rows, ["field", "when", "stages"]) : "No visibility rules. Fields without rules are always visible.";
}
function viewText(view) {
  return `Columns: ${view.columns.join(",")}\nDefaults: ${view.default_columns.join(",")}\n\n${fieldsTable(view.fields)}\n\n${rulesTable(view.visibility)}${warnings(view)}`;
}
function customTarget(view, key) {
  if (!view.fields.some((field) => field.key === key && field.source === "custom")) {
    throw new UsageError(`Rule target "${key}" must be a registered custom deal field. Use deal-view fields.`);
  }
}
async function verifyRead(url, token, path, query) {
  try { return await request(url, { path, query, token }); } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    throw new ApiError(`Write accepted, but readback failed: ${error.message}. Re-read the target before retrying.`, error.status, error.body);
  }
}
function verified(condition, target) {
  if (!condition) throw new ApiError(`Write accepted, but exact ${target} readback did not match. Re-read the target before retrying.`, 200, { error: "verification_failed" });
}

export async function cmdCustomFields(args, ctx) {
  const selectedEntity = args.entity === undefined ? undefined : entity(args.entity);
  const { url, key } = connect(args.instance, args.context);
  const data = await request(url, { path: "/v1/custom-fields", query: { entity: selectedEntity }, token: key });
  const defs = defsResponse(data);
  const text = defs.length ? table(defs.map((def) => ({ id: def.id, entity: def.entity_type, key: def.key, label: def.label, type: def.field_type, position: def.position, options: JSON.stringify(def.options) })), ["id", "entity", "key", "label", "type", "position", "options"]) : "No custom-field definitions.";
  output(ctx, { instance: url, defs }, text);
}

export async function cmdCustomFieldAdd(args, ctx) {
  const body = {
    entity_type: entity(required(args, "entity")),
    key: fieldKey(required(args, "key"), "key"),
    label: required(args, "label"),
    field_type: args.type ?? "string",
    options: args.options === undefined ? {} : optionsObject(args.options),
    position: args.position === undefined ? 0 : position(args.position)
  };
  if (!body.label.trim()) throw new UsageError("--label must not be blank.");
  if (!TYPES.includes(body.field_type)) throw new UsageError(`--type must be exactly one of: ${TYPES.join(", ")}.`);
  const { url, key } = connect(args.instance, args.context);
  const created = await request(url, { method: "POST", path: "/v1/custom-fields", body, token: key });
  if (typeof created?.def?.id !== "string" || !created.def.id) invalidResponse("Create returned no definition ID. Re-read custom-fields before retrying a possibly completed write.");
  const defs = defsResponse(await verifyRead(url, key, "/v1/custom-fields", { entity: body.entity_type }));
  const matches = defs.filter((def) => def.id === created.def.id);
  const def = matches[0];
  // Compare the JSON wire values. JSON represents numeric -0 as 0.
  const sent = JSON.parse(JSON.stringify(body));
  verified(matches.length === 1 && isDeepStrictEqual(def, created.def) && Object.entries(sent).every(([name, value]) => isDeepStrictEqual(def[name], value)), "custom-field definition");
  output(ctx, { instance: url, def }, `Created ${def.entity_type} field ${def.key} (${def.field_type}), ID ${def.id}. Verified by readback.`);
}

export async function cmdDealView(args, ctx, action) {
  let columns;
  let target;
  let rule;
  if (action === "set") {
    columns = keyList(required(args, "columns"), "columns");
    if (!columns.includes("name")) throw new UsageError("--columns must include name. It may be reordered, not hidden.");
  }
  if (args.field !== undefined || ["rule-set", "rule-remove"].includes(action)) target = fieldKey(required(args, "field"), "field");
  if (action === "rule-set") {
    const mode = required(args, "when");
    if (mode === "lost") {
      if (args.stages !== undefined) throw new UsageError("--when lost must not include --stages.");
      rule = { mode: "lost" };
    } else if (mode === "stages") rule = { mode: "stages", stages: keyList(required(args, "stages"), "stages") };
    else throw new UsageError("--when must be exactly lost or stages.");
  }
  const { url, key } = connect(args.instance, args.context);
  const before = viewResponse(await request(url, { path: VIEW_PATH, token: key }));
  if (target !== undefined) customTarget(before, target);
  if (action === "fields") return output(ctx, { instance: url, fields: before.fields, warnings: before.warnings }, fieldsTable(before.fields) + warnings(before));
  if (action === "rules") {
    const visibility = target === undefined ? before.visibility : Object.hasOwn(before.visibility, target) ? { [target]: before.visibility[target] } : {};
    return output(ctx, { instance: url, visibility, warnings: before.warnings }, rulesTable(visibility) + warnings(before));
  }
  if (action === "show") return output(ctx, { instance: url, ...before }, viewText(before));
  let method;
  let path = VIEW_PATH;
  let body;
  const expectedVisibility = { ...before.visibility };
  if (action === "set") {
    const unknown = columns.filter((column) => !before.fields.some((field) => field.key === column));
    if (unknown.length) throw new UsageError(`Unknown column key(s): ${unknown.join(", ")}. Use deal-view fields; stale keys cannot be selected.`);
    method = "PUT";
    body = { columns };
  } else if (action === "reset") {
    method = "POST";
    path += "/reset";
    body = {};
    columns = before.default_columns;
  } else {
    path += `/visibility/${encodeURIComponent(target)}`;
    columns = before.columns;
    method = action === "rule-set" ? "PUT" : "DELETE";
    if (action === "rule-set") { body = rule; expectedVisibility[target] = rule; }
    else delete expectedVisibility[target];
  }
  viewResponse(await request(url, { method, path, body, token: key }));
  const after = viewResponse(await verifyRead(url, key, VIEW_PATH));
  // Stage rules are sets. Require exactly the requested keys, regardless of server sorting.
  const canonicalRules = (visibility) => Object.fromEntries(Object.entries(visibility).map(([field, value]) => [field, value.mode === "stages" ? { ...value, stages: [...value.stages].sort() } : value]));
  verified(isDeepStrictEqual(after.columns, columns) && isDeepStrictEqual(canonicalRules(after.visibility), canonicalRules(expectedVisibility)), "deal-view columns and rules");
  output(ctx, { instance: url, ...after }, viewText(after) + "\n\nSaved and verified by readback.");
}
