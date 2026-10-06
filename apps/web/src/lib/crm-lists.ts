import { apiFetch } from "@/lib/api";

type Fetcher = <T>(path: string) => Promise<T>;

/** Load a complete CRM relation, never silently truncate at the API page limit. */
export async function fetchAllCrm<T>(path: string, key: string, fetcher: Fetcher = apiFetch): Promise<T[]> {
  const records: T[] = [];
  let page = 1;
  let expectedTotal: number | null = null;
  for (;;) {
    const query = new URLSearchParams(path.split("?", 2)[1] ?? "");
    query.set("page", String(page));
    query.set("limit", "100");
    const response = await fetcher<Record<string, unknown>>(`${path.split("?", 1)[0]}?${query}`);
    const batch = response[key];
    const total = response.total;
    if (!Array.isArray(batch) || typeof total !== "number" || !Number.isSafeInteger(total) || total < 0) {
      throw new Error("Ungültige Listen-Antwort.");
    }
    if (expectedTotal !== null && total !== expectedTotal) {
      throw new Error("Der Bestand hat sich während des Ladens geändert. Bitte neu laden.");
    }
    expectedTotal = total;
    records.push(...batch as T[]);
    if (records.length === total) return records;
    if (records.length > total || batch.length === 0) {
      throw new Error("Der Bestand konnte nicht vollständig geladen werden.");
    }
    page += 1;
  }
}
