"use client";

import { useCallback } from "react";
import { apiFetch } from "./api";

/**
 * Client-seitiger API-Zugriff: Better-Auth-Session-Cookie läuft per
 * credentials: "include" mit (Contract §5).
 */
export function useApi() {
  return useCallback(
    async <T,>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> => {
      return apiFetch<T>(path, { ...opts });
    },
    [],
  );
}
