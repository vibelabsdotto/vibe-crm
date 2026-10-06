"use client";

import type { ComponentProps } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, ChevronUp, GalleryVerticalEnd, Handshake, KeyRound, LayoutDashboard, ListFilter, Repeat, Settings, Tags, Users } from "lucide-react";
import { NavUser } from "@/components/nav-user";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,

  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { apiFetch } from "@/lib/api";
import type { ServerUser } from "@/lib/server-auth";
import { asList, type Deal, type Stage, type SubscriptionSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/contacts", label: "Kontakte", icon: Users },
  { href: "/companies", label: "Firmen", icon: Building2 },
  { href: "/deals", label: "Deals", icon: Handshake },
  { href: "/subscriptions", label: "Abos", icon: Repeat },
];

const settingsNavigation = [
  { href: "/settings/company", label: "Eigenes Unternehmen", icon: Building2 },
  { href: "/settings/products", label: "Produkte", icon: Tags },
  { href: "/settings/properties", label: "Custom Fields", icon: ListFilter },
  { href: "/settings/tokens", label: "API-Tokens", icon: KeyRound },
];

function useNavigationCounts() {
  const [openDeals, setOpenDeals] = useState<number | null>(null);
  const [activeSubscriptions, setActiveSubscriptions] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch<unknown>("/v1/deals/board"),
      apiFetch<unknown>("/v1/stages"),
    ]).then(([board, stageData]) => {
      if (cancelled) return;
      const stages = asList<Stage>(stageData, "stages");
      const closed = new Set(stages.filter((stage) => stage.is_won === 1 || stage.is_lost === 1).map((stage) => stage.key));
      setOpenDeals(asList<Deal>(board, "deals").filter((deal) => !closed.has(deal.stage)).length);
    }).catch(() => {
      if (!cancelled) setOpenDeals(null);
    });
    apiFetch<SubscriptionSummary>("/v1/subscriptions/summary").then((summary) => {
      if (!cancelled) setActiveSubscriptions(summary.active);
    }).catch(() => {
      if (!cancelled) setActiveSubscriptions(null);
    });
    return () => { cancelled = true; };
  }, []);

  return { openDeals, activeSubscriptions };
}

export function AppSidebar({ user, ...props }: ComponentProps<typeof Sidebar> & { user: ServerUser & { local?: boolean } }) {
  const pathname = usePathname();
  const { state, isMobile, openMobile, setOpenMobile } = useSidebar();
  const collapsed = !isMobile && state === "collapsed";
  const expanded = isMobile ? openMobile : !collapsed;
  const { openDeals, activeSubscriptions } = useNavigationCounts();

  function isActive(href: string) {
    return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className={cn("h-16 flex-row items-center", collapsed && "justify-center")}>
        {!collapsed && (
          <SidebarMenu className="min-w-0 flex-1">
            <SidebarMenuItem>
              <SidebarMenuButton render={<Link href="/" prefetch={false} onNavigate={() => setOpenMobile(false)} />}>
                <GalleryVerticalEnd aria-hidden="true" />
                <span>Vibe CRM</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
        <SidebarTrigger
          aria-label={expanded ? "Seitenleiste einklappen" : "Seitenleiste aufklappen"}
          title={expanded ? "Seitenleiste einklappen" : "Seitenleiste aufklappen"}
          aria-expanded={expanded}
        />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <nav aria-label="Hauptnavigation">
              <SidebarMenu>
                {navigation.map((item) => {
                  const count = item.href === "/deals" ? openDeals : item.href === "/subscriptions" ? activeSubscriptions : null;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={isActive(item.href)}
                        tooltip={item.label}
                        className={cn(count != null && count > 0 && "pr-10")}
                        render={<Link href={item.href} prefetch={false} aria-current={isActive(item.href) ? "page" : undefined} onNavigate={() => setOpenMobile(false)} />}
                      >
                        <item.icon aria-hidden="true" />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                      {count != null && count > 0 && (
                        <SidebarMenuBadge title={item.href === "/deals" ? "Offene Deals" : "Aktive Abos"}>{count}</SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="shrink-0">
        <SidebarMenu>
          <SidebarMenuItem className={cn("flex items-center gap-1", collapsed && "flex-col")}>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Einstellungen"
                render={<SidebarMenuButton isActive={pathname.startsWith("/settings/")} tooltip="Einstellungen" className={cn(!collapsed && "min-w-0 flex-1")} />}
              >
                <Settings aria-hidden="true" />
                {!collapsed && <><span>Einstellungen</span><ChevronUp className="ml-auto" aria-hidden="true" /></>}
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="max-h-[min(20rem,var(--available-height))] w-56 max-w-[calc(100vw-2rem)]"
                side={collapsed ? "right" : "top"}
                align={collapsed ? "end" : "start"}
                sideOffset={8}
                aria-label="Einstellungen"
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Einstellungen</DropdownMenuLabel>
                  {settingsNavigation.map((item) => (
                    <DropdownMenuItem
                      key={item.href}
                      render={<Link href={item.href} prefetch={false} aria-current={isActive(item.href) ? "page" : undefined} onNavigate={() => setOpenMobile(false)} />}
                    >
                      <item.icon aria-hidden="true" />
                      <span>{item.label}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <ThemeToggle />
          </SidebarMenuItem>
        </SidebarMenu>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
