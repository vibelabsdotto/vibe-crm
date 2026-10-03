import { UsageError } from "./errors.mjs";

const BOOLEANS = new Set(["json", "help", "h", "dry-run", "dryRun", "infer-company", "inferCompany", "token-stdin"]);

/** Global flags work anywhere. Boolean flags never consume command operands. */
export function parseArgs(argv) {
  const flags = Object.create(null);
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i];
    if (arg === "--") { positional.push(...argv.slice(i + 1)); break; }
    if (arg === "-h") arg = "--help";
    if (arg === "-j") arg = "--json";
    if (!arg.startsWith("--")) {
      if (/^-[a-z]/i.test(arg)) throw new UsageError(`Unknown option ${arg}.`);
      positional.push(arg);
      continue;
    }
    const equal = arg.indexOf("=");
    const name = arg.slice(2, equal === -1 ? undefined : equal);
    if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(name)) throw new UsageError("Invalid option name.");
    let value;
    if (BOOLEANS.has(name)) {
      const raw = equal === -1 ? undefined : arg.slice(equal + 1);
      if (raw !== undefined && !["true", "false"].includes(raw)) throw new UsageError(`--${name} expects true or false.`);
      value = raw !== "false";
      // Preserve the old import option's explicit true/false value form.
      if (["infer-company", "inferCompany"].includes(name) && equal === -1 && ["true", "false"].includes(argv[i + 1])) value = argv[++i] === "true";
    } else {
      value = equal === -1 ? argv[++i] : arg.slice(equal + 1);
      if (value === undefined || value.startsWith("--") || /^-[a-z]/i.test(value)) throw new UsageError(`--${name} needs a value.`);
    }
    if (Object.hasOwn(flags, name)) {
      if (name !== "set") throw new UsageError(`--${name} may only occur once.`);
      flags[name] = [].concat(flags[name], value);
    } else flags[name] = value;
  }
  return { flags, positional };
}

export function validateFlags(flags, allowed) {
  for (const name of Object.keys(flags)) if (!allowed.includes(name)) throw new UsageError(`Unknown option --${name}. Allowed: ${allowed.map((value) => `--${value}`).join(" ")}`);
  if (flags.instance !== undefined && flags.context !== undefined) throw new UsageError("--instance and --context are mutually exclusive.");
  if (flags.scope !== undefined && !["local", "global"].includes(flags.scope)) throw new UsageError("--scope must be local or global.");
  for (const name of ["page", "limit"]) if (flags[name] !== undefined && (!/^[1-9]\d*$/.test(flags[name]) || !Number.isSafeInteger(Number(flags[name])))) throw new UsageError(`--${name} expects a positive integer.`);
  for (const aliases of [["company-id", "companyId", "company"], ["contact-id", "contactId", "contact"], ["product", "product-id", "productId"], ["close-date", "closeDate", "close"], ["dry-run", "dryRun"], ["infer-company", "inferCompany"], ["help", "h"]]) {
    if (aliases.filter((name) => flags[name] !== undefined).length > 1) throw new UsageError(`Use only one spelling: ${aliases.map((name) => `--${name}`).join(" | ")}.`);
  }
}
