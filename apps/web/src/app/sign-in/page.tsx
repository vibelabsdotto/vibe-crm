import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SignInForm } from "@/components/auth-forms";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getSession } from "@/lib/server-auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Anmelden" };

export default async function SignInPage() {
  const session = await getSession();
  if (session) redirect("/");

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex items-center px-6 py-4">
        <Link
          href="/sign-in"
          className="text-sm font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          Vibe CRM
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <Suspense
            fallback={
              <Card aria-busy="true" aria-label="Anmeldung wird geladen">
                <CardHeader>
                  <Skeleton className="h-6 w-32" />
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </CardContent>
              </Card>
            }
          >
            <SignInForm />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
