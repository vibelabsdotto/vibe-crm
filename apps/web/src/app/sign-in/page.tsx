import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SignInForm } from "@/components/auth-forms";
import { getSession } from "@/lib/server-auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Anmelden" };

export default async function SignInPage() {
  const session = await getSession();
  if (session) redirect("/");

  return (
    <>
      <header className="flex items-center px-6 py-4">
        <Link href="/sign-in" className="brand-gradient-text font-display text-lg font-bold hover:no-underline">
          Vibe CRM
        </Link>
      </header>
      <main className="auth-wrap">
        <Suspense fallback={<div className="auth-card" aria-busy="true" />}>
          <SignInForm />
        </Suspense>
      </main>
    </>
  );
}
