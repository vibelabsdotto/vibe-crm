import { UsageError } from "./errors.mjs";
import { validateToken } from "./instance.mjs";

export async function readLoginToken(flags) {
  const stdin = flags["token-stdin"] === true;
  if ((flags.token !== undefined ? 1 : 0) + (stdin ? 1 : 0) !== 1) throw new UsageError("Use exactly one token source: --token-stdin or --token <vc_…>.");
  if (!stdin) return validateToken(flags.token);
  if (process.stdin.isTTY) throw new UsageError("--token-stdin requires a pipe, not an interactive terminal.");
  const chunks = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    length += chunk.length;
    if (length > 128) throw new UsageError("Token input is too long.");
    chunks.push(chunk);
  }
  // Accept one line ending. Never trim, repair or lowercase the credential.
  return validateToken(Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, ""));
}
