import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { UsageError } from "./errors.mjs";

const MAX_JSON_BYTES = 1024 * 1024;
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

/** Inspect every existing component, including dangling symlinks. */
export function inspectPath(file) {
  const absolute = path.resolve(file);
  const parts = absolute.slice(path.parse(absolute).root.length).split(path.sep);
  let current = path.parse(absolute).root;
  let info = null;
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    try { info = fs.lstatSync(current); } catch (error) {
      if (error.code === "ENOENT") return null;
      throw new UsageError(`Cannot inspect configuration path: ${file}`);
    }
    if (info.isSymbolicLink() || (i < parts.length - 1 && !info.isDirectory())) {
      throw new UsageError(`Configuration paths must not contain symlinks or non-directory parents: ${file}`);
    }
  }
  return info;
}

export function readJson(file) {
  const info = inspectPath(file);
  if (!info) return null;
  if (!info.isFile() || info.size > MAX_JSON_BYTES) throw new UsageError(`Configuration must be a regular JSON file of at most 1 MiB: ${file}`);
  let fd;
  let text;
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || opened.dev !== info.dev || opened.ino !== info.ino || opened.size > MAX_JSON_BYTES) throw new Error("changed");
    text = fs.readFileSync(fd, "utf8");
    if (Buffer.byteLength(text) > MAX_JSON_BYTES) throw new Error("too large");
  } catch {
    throw new UsageError(`Cannot safely read configuration. File was not changed: ${file}`);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  let data;
  try { data = JSON.parse(text); } catch {
    throw new UsageError(`Configuration contains invalid JSON. File will not be overwritten: ${file}`);
  }
  if (!object(data)) throw new UsageError(`Configuration must contain a JSON object. File will not be overwritten: ${file}`);
  return data;
}

function sameFile(before, after) {
  if (!before || !after) return before === after;
  return before.dev === after.dev && before.ino === after.ino && before.size === after.size && before.mtimeMs === after.mtimeMs;
}

/** Same-directory exclusive temporary file, fsync, rename, directory fsync. */
export function writeJsonAtomic(file, data) {
  if (!object(data)) throw new UsageError("Configuration must be a JSON object.");
  const text = JSON.stringify(data, null, 2) + "\n";
  if (Buffer.byteLength(text) > MAX_JSON_BYTES) throw new UsageError("Configuration exceeds 1 MiB.");
  // Never turn a malformed existing file into an empty store.
  const before = inspectPath(file);
  readJson(file);
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const dirInfo = inspectPath(dir);
  if (!dirInfo?.isDirectory() || (process.getuid && dirInfo.uid !== process.getuid())) throw new UsageError(`Configuration directory must be owned by the current user: ${dir}`);
  fs.chmodSync(dir, 0o700);
  const temporary = path.join(dir, `.crm-${randomUUID()}.tmp`);
  let fd;
  try {
    fd = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    fs.fchmodSync(fd, 0o600);
    fs.writeFileSync(fd, text, "utf8");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    if (!sameFile(before, inspectPath(file))) throw new UsageError(`Configuration changed during write. Retry after inspection: ${file}`);
    fs.renameSync(temporary, file);
    const directoryFd = fs.openSync(dir, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try { fs.fsyncSync(directoryFd); } finally { fs.closeSync(directoryFd); }
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
}
