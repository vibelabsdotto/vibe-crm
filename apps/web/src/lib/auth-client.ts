"use client";

import { createAuthClient } from "better-auth/react";
import { apiUrl } from "./env";

/**
 * Better-Auth-Client gegen apps/api (Contract §3/§5).
 * Der Better-Auth-Handler ist dort unter /api/auth/* gemountet.
 * Cookies laufen mit credentials: "include".
 */
export const authClient = createAuthClient({
  baseURL: `${apiUrl()}/api/auth`,
  fetchOptions: {
    credentials: "include",
  },
});
