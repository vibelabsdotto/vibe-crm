import { UsageError } from "./errors.mjs";

/** Validate without repairing or normalizing an invalid source value. */
export function validateInstance(value) {
  let url;
  if (typeof value !== "string" || !/^https?:\/\//i.test(value) || /[\s\\\x00-\x1f\x7f?#]/.test(value)) {
    throw new UsageError("Instance must be an absolute HTTP(S) URL without credentials, whitespace, query or fragment.");
  }
  try { url = new URL(value); } catch {
    throw new UsageError("Instance must be a valid absolute HTTP(S) URL.");
  }
  const authority = value.slice(value.indexOf("://") + 3).split("/")[0];
  if (!authority || authority.includes("@") || !["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) {
    throw new UsageError("Instance URL must use HTTP(S) and must not contain credentials, query or fragment.");
  }
  return value;
}

export function validateToken(token) {
  if (typeof token !== "string" || !/^vc_[a-f0-9]{48}$/.test(token)) {
    throw new UsageError("Token must be exactly vc_ followed by 48 lowercase hexadecimal characters.");
  }
  return token;
}
