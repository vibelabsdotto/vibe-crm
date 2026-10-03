export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "UsageError";
  }
}

/** HTTP status 0 means the response could not be received. */
export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export function redactSecrets(value) {
  return String(value).replace(/\bvc_[a-zA-Z0-9_]+/g, "[redacted]");
}
