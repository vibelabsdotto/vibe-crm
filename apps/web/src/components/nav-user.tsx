"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, LogOut } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";
import type { ServerUser } from "@/lib/server-auth";

export function NavUser({ user }: { user: ServerUser & { local?: boolean } }) {
  const { isMobile } = useSidebar();
  const router = useRouter();
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const name = user.name?.trim() || user.email;
  const initials = name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();

  async function signOut() {
    if (submitting.current || user.local === true) return;
    submitting.current = true;
    setBusy(true);
    setError(false);
    try {
      const result = await authClient.signOut();
      if (result.error || !result.data?.success) throw new Error("Sign-out failed");
      router.replace("/sign-in");
      router.refresh();
    } catch {
      setError(true);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={busy}
            aria-busy={busy}
            aria-label={`Konto von ${name}`}
            render={<SidebarMenuButton size="lg" className="aria-expanded:bg-muted" />}
          >
            <Avatar><AvatarFallback>{initials}</AvatarFallback></Avatar>
            <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{name}</span>
              <span className="truncate text-xs text-muted-foreground">{user.local === true ? "Lokaler Entwicklungsaccount" : user.email}</span>
            </div>
            <ChevronsUpDown className="ml-auto" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64 max-w-[calc(100vw-2rem)]" side={isMobile ? "top" : "right"} align="end" sideOffset={4}>
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar><AvatarFallback>{initials}</AvatarFallback></Avatar>
                  <div className="grid min-w-0 flex-1 gap-1 leading-tight">
                    <span className="truncate font-medium">{name}</span>
                    <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                    {user.local === true && <Badge variant="secondary">Lokale Entwicklung</Badge>}
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            {user.local !== true && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem disabled={busy} onClick={signOut}>
                    <LogOut aria-hidden="true" />
                    {busy ? "Wird abgemeldet…" : "Abmelden"}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {error && <Alert variant="destructive"><AlertDescription>Abmelden ist gerade nicht möglich. Bitte versuche es erneut.</AlertDescription></Alert>}
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
