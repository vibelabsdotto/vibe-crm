"use client";

import { Building2, Handshake, KeyRound, LayoutDashboard, Settings, Tags, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { asList, type Deal, type Stage } from "@/lib/types";
import { useSidebar, SidebarContent, SidebarFooter, SidebarGroupLabel, SidebarHeader, SidebarMenuItem } from "./ui/sidebar";

const NAV = [
  { href: "/", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
  { href: "/contacts", label: "Kontakte", icon: <Users size={18} /> },
  { href: "/companies", label: "Firmen", icon: <Building2 size={18} /> },
  { href: "/deals", label: "Deals", icon: <Handshake size={18} /> },
];

const SETTINGS_NAV = [
  { href: "/settings/properties", label: "Custom Fields", icon: <Tags size={18} /> },
  { href: "/settings/tokens", label: "API-Tokens", icon: <KeyRound size={18} /> },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Badge: offene Deals (Stage weder gewonnen noch verloren). Fehler → kein Badge. */
function OpenDealsBadge() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [board, stagesData] = await Promise.all([
          apiFetch<unknown>("/v1/deals/board"),
          apiFetch<unknown>("/v1/stages"),
        ]);
        const deals = asList<Deal>(board, "deals");
        const stages = asList<Stage>(stagesData, "stages");
        const closed = new Set(stages.filter((s) => s.is_won === 1 || s.is_lost === 1).map((s) => s.key));
        const open = deals.filter((d) => !closed.has(d.stage)).length;
        if (!cancelled) setCount(open);
      } catch {
        if (!cancelled) setCount(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return count;
}

export function AppSidebar() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const openDeals = OpenDealsBadge();
  const closeMobile = () => setOpenMobile(false);

  return (
    <>
      <SidebarHeader>
        <Link href="/" prefetch={false} onClick={closeMobile} className="hover:no-underline">
          <span className="brand-gradient-text font-display text-lg font-bold tracking-tight">
            Vibe CRM
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <nav className="flex flex-col gap-1" aria-label="Hauptnavigation">
          {NAV.map((item) => (
            <SidebarMenuItem
              key={item.href}
              href={item.href}
              active={isActive(pathname, item.href)}
              icon={item.icon}
              label={item.label}
              badge={item.href === "/deals" ? openDeals : undefined}
              onNavigate={closeMobile}
            />
          ))}
        </nav>

        <SidebarGroupLabel>
          <span className="inline-flex items-center gap-1">
            <Settings size={12} /> Einstellungen
          </span>
        </SidebarGroupLabel>
        <nav className="flex flex-col gap-1" aria-label="Einstellungen">
          {SETTINGS_NAV.map((item) => (
            <SidebarMenuItem
              key={item.href}
              href={item.href}
              active={isActive(pathname, item.href)}
              icon={item.icon}
              label={item.label}
              onNavigate={closeMobile}
            />
          ))}
        </nav>
      </SidebarContent>

      <SidebarFooter>
        <p className="px-2 text-xs muted">Single-Workspace · v1</p>
      </SidebarFooter>
    </>
  );
}
