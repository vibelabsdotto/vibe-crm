import { redirect } from "next/navigation";
import { getSession } from "@/lib/server-auth";
import { CompanySettings } from "./company-settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Eigenes Unternehmen" };

export default async function CompanySettingsPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in?redirect=%2Fsettings%2Fcompany");

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">Einstellungen</p>
        <h1 className="text-2xl font-semibold tracking-tight">Eigenes Unternehmen</h1>
        <p className="text-sm text-muted-foreground">
          Ordne dein Unternehmen einer vorhandenen Firma zu und pflege ihre Stammdaten.
        </p>
      </header>
      <CompanySettings />
    </div>
  );
}
