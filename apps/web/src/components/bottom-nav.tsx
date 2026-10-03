"use client";

import { Building2, Handshake, LayoutDashboard, Menu, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/contacts", label: "Kontakte", icon: Users },
  { href: "/companies", label: "Firmen", icon: Building2 },
  { href: "/deals", label: "Deals", icon: Handshake },
];

export function BottomNav() {
  const pathname = usePathname();
  const { openMobile, toggleSidebar } = useSidebar();
  return (
    <nav className="grid shrink-0 grid-cols-5 border-t bg-background px-1 pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Mobile Navigation">
      {items.map((item) => {
        const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            className={cn("flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-md px-1 py-2 text-xs text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring", active && "bg-accent font-medium text-accent-foreground")}
            aria-current={active ? "page" : undefined}
          >
            <item.icon className="size-4" aria-hidden="true" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
      <Button type="button" variant="ghost" size="xs" className="h-auto min-h-14 min-w-0 flex-col gap-1 px-1 py-2" aria-label="Navigation öffnen" aria-expanded={openMobile} onClick={toggleSidebar}>
        <Menu aria-hidden="true" />
        <span>Mehr</span>
      </Button>
    </nav>
  );
}
