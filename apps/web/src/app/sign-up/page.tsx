import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SignUpForm } from "@/components/auth-forms";
import { getSession } from "@/lib/server-auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Registrieren" };

export default async function SignUpPage() {
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
          <SignUpForm />
        </Suspense>
      </main>
    </>
  );
}
