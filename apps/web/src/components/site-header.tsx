"use client";

import { LogOut, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { authClient } from "@/lib/auth-client";
import { SidebarTrigger } from "./ui/sidebar";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // Hydration-Mismatch vermeiden: erst nach Mount das echte Icon zeigen.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const dark = mounted ? resolvedTheme !== "light" : true;
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border bg-surface text-text"
      aria-label={dark ? "Zu hellem Modus wechseln" : "Zu dunklem Modus wechseln"}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

export function SiteHeader({ userEmail }: { userEmail?: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function signOut() {
    setBusy(true);
    try {
      await authClient.signOut();
    } finally {
      router.push("/sign-in");
    }
  }

  return (
    <header className="sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur md:px-6">
      <SidebarTrigger />
      <span className="brand-gradient-text font-display text-base font-bold md:hidden">Vibe CRM</span>
      <div className="flex-1" />
      {userEmail && (
        <span className="hidden truncate text-sm muted sm:block" title={userEmail}>
          {userEmail}
        </span>
      )}
      <ThemeToggle />
      {userEmail && (
        <button
          type="button"
          onClick={signOut}
          disabled={busy}
          className="btn btn-sm"
          aria-label="Abmelden"
        >
          <LogOut size={15} />
          <span className="hidden sm:inline">Abmelden</span>
        </button>
      )}
    </header>
  );
}
