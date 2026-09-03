import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { AppSidebar } from "@/components/app-sidebar";
import { BottomNav } from "@/components/bottom-nav";
import { SiteHeader } from "@/components/site-header";
import { ThemeProvider } from "@/components/theme-provider";
import { Sidebar, SidebarProvider } from "@/components/ui/sidebar";
import { getSession } from "@/lib/server-auth";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: "700",
  variable: "--font-space-grotesk",
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: {
    default: "Vibe CRM",
    template: "%s · Vibe CRM",
  },
  description: "Vibe CRM — Kontakte, Firmen, Deals.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  return (
    <html lang="de" suppressHydrationWarning>
      <body className={`${inter.variable} ${spaceGrotesk.variable} ${jetBrainsMono.variable}`}>
        <ThemeProvider>
          {session ? (
            <SidebarProvider>
              <Sidebar>
                <AppSidebar />
              </Sidebar>
              <div className="flex min-w-0 flex-1 flex-col">
                <SiteHeader userEmail={session.user.email} />
                <main className="min-w-0 flex-1 pb-20 md:pb-0">{children}</main>
                <BottomNav />
              </div>
            </SidebarProvider>
          ) : (
            <div className="flex min-h-svh w-full flex-col bg-background text-foreground">
              <main className="min-w-0 flex-1">{children}</main>
            </div>
          )}
        </ThemeProvider>
      </body>
    </html>
  );
}
