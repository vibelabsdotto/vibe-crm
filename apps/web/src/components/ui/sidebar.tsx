"use client";

import { PanelLeft } from "lucide-react";
import * as React from "react";
import { useIsMobile } from "@/lib/hooks/use-mobile";
import { cn } from "@/lib/utils";

type SidebarContextProps = {
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextProps | null>(null);

export function useSidebar() {
  const ctx = React.useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within a SidebarProvider.");
  return ctx;
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = React.useState(true);
  const [openMobile, setOpenMobile] = React.useState(false);

  const toggleSidebar = React.useCallback(() => {
    if (isMobile) setOpenMobile((v) => !v);
    else setOpen((v) => !v);
  }, [isMobile]);

  const value = React.useMemo(
    () => ({ open, setOpen, openMobile, setOpenMobile, toggleSidebar }),
    [open, openMobile, toggleSidebar],
  );

  return (
    <SidebarContext.Provider value={value}>
      <div className="flex min-h-svh w-full bg-background text-foreground">{children}</div>
    </SidebarContext.Provider>
  );
}

/** Offcanvas-Sidebar (Contract §5): Drawer mobil, ein-/ausblendbar Desktop. */
export function Sidebar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { open, openMobile, setOpenMobile } = useSidebar();

  return (
    <>
      {/* Mobile Drawer */}
      <div
        className={cn(
          "fixed inset-0 z-50 bg-black/60 md:hidden",
          openMobile ? "block" : "hidden",
        )}
        onClick={() => setOpenMobile(false)}
        aria-hidden="true"
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-sidebar text-sidebar-foreground transition-transform duration-200 md:hidden",
          openMobile ? "translate-x-0" : "-translate-x-full",
          className,
        )}
      >
        {children}
      </aside>
      {/* Desktop */}
      <aside
        className={cn(
          "hidden shrink-0 flex-col overflow-hidden border-r border-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex",
          open ? "w-64" : "w-0 border-r-0",
          className,
        )}
      >
        <div className="flex h-full w-64 flex-col">{children}</div>
      </aside>
    </>
  );
}

export function SidebarTrigger({ className }: { className?: string }) {
  const { toggleSidebar } = useSidebar();
  return (
    <button
      type="button"
      onClick={toggleSidebar}
      className={cn(
        "inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border bg-surface text-text",
        className,
      )}
      aria-label="Sidebar umschalten"
    >
      <PanelLeft size={18} />
    </button>
  );
}

export function SidebarHeader({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2 p-4">{children}</div>;
}

export function SidebarContent({ children }: { children: React.ReactNode }) {
  return <div className="flex-1 overflow-y-auto px-3 pb-4">{children}</div>;
}

export function SidebarFooter({ children }: { children: React.ReactNode }) {
  return <div className="border-t border-border p-3">{children}</div>;
}

export function SidebarGroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 pb-1 pt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-teal">
      {children}
    </p>
  );
}

export function SidebarMenuItem({
  href,
  active,
  icon,
  label,
  badge,
  onNavigate,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  badge?: number | null;
  onNavigate?: () => void;
}) {
  return (
    <a
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm",
        active
          ? "bg-surface-2 font-medium text-text"
          : "text-muted-foreground hover:bg-surface-2 hover:text-text hover:no-underline",
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1">{label}</span>
      {badge != null && badge > 0 && (
        <span className="badge" title="Offene Deals">
          {badge}
        </span>
      )}
    </a>
  );
}
