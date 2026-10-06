import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppSidebar } from "@/components/app-sidebar";
import { BottomNav } from "@/components/bottom-nav";
import { EntityDrawerProvider } from "@/components/entity-drawer";

import { ThemeProvider } from "@/components/theme-provider";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getSession } from "@/lib/server-auth";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: { default: "Vibe CRM", template: "%s · Vibe CRM" },
  description: "Kontakte, Firmen, Deals und Abonnements verwalten.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();

  return (
    <html lang="de" suppressHydrationWarning>
      <body className={`${geist.variable} ${geistMono.variable} font-sans antialiased`}>
        <ThemeProvider>
          <Toaster>
            <TooltipProvider>
              <a href="#main-content" className="sr-only fixed top-2 left-2 z-50 rounded-md bg-background px-4 py-2 text-sm ring-2 ring-ring focus:not-sr-only">Zum Inhalt springen</a>
              {session ? (
                <EntityDrawerProvider>
                  <SidebarProvider className="h-svh min-h-0 overflow-hidden">
                    <AppSidebar user={session.user} />
                    <SidebarInset className="min-h-0 min-w-0 overflow-hidden">
                      <div id="main-content" tabIndex={-1} className="min-h-0 min-w-0 flex-1 overflow-auto outline-none">{children}</div>
                      <BottomNav />
                    </SidebarInset>
                  </SidebarProvider>
                </EntityDrawerProvider>
              ) : (
                <main id="main-content" className="min-h-svh min-w-0 bg-background text-foreground" tabIndex={-1}>{children}</main>
              )}
            </TooltipProvider>
          </Toaster>
        </ThemeProvider>
      </body>
    </html>
  );
}
