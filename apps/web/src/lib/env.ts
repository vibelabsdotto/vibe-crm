export function apiUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3100").replace(/\/+$/, "");
}

/**
 * Absolute Web-Origin für OAuth-callbackURLs (Contract §5).
 * Lazy verwenden — nie window im Render aufrufen.
 */
export function webUrl(): string {
  const configured = process.env.NEXT_PUBLIC_WEB_URL;
  if (configured) return configured.replace(/\/+$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "http://localhost:3000";
}
