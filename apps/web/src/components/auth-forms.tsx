"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";

function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return <Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert>;
}

export function SignInForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const redirectTo = params.get("redirect") || "/";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { error: authError } = await authClient.signIn.email({ email, password, callbackURL: redirectTo });
      if (authError) {
        setError(authError.status === 401 ? "E-Mail oder Passwort ist falsch." : (authError.message ?? "Anmeldung fehlgeschlagen."));
        setBusy(false);
        return;
      }
      window.location.assign(redirectTo);
    } catch {
      setError("Anmeldung fehlgeschlagen. Ist die API erreichbar?");
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle><h1>Anmelden</h1></CardTitle>
        <CardDescription>Mit deinem VibeCRM-Konto anmelden.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} aria-busy={busy}>
          <FieldGroup>
            <Field data-disabled={busy}>
              <FieldLabel htmlFor="sign-in-email">E-Mail</FieldLabel>
              <Input id="sign-in-email" type="email" name="email" autoComplete="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus disabled={busy} />
            </Field>
            <Field data-disabled={busy}>
              <FieldLabel htmlFor="sign-in-password">Passwort</FieldLabel>
              <Input id="sign-in-password" type="password" name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={busy} />
            </Field>
            <AuthError message={error} />
            <Button type="submit" disabled={busy} className="w-full">
              {busy && <Spinner data-icon="inline-start" />}
              {busy ? "Anmelden…" : "Anmelden"}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter className="flex-wrap justify-center gap-1">
        <p className="text-sm text-muted-foreground">Noch kein Konto?</p>
        <Link href={`/sign-up${redirectTo !== "/" ? `?redirect=${encodeURIComponent(redirectTo)}` : ""}`} className={buttonVariants({ variant: "link", size: "sm" })}>Registrieren</Link>
      </CardFooter>
    </Card>
  );
}

export function SignUpForm() {
  const params = useSearchParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const redirectTo = params.get("redirect") || "/";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { error: authError } = await authClient.signUp.email({ name: name.trim() || email.split("@")[0], email, password, callbackURL: redirectTo });
      if (authError) {
        setError(authError.message ?? "Registrierung fehlgeschlagen.");
        setBusy(false);
        return;
      }
      window.location.assign(redirectTo);
    } catch {
      setError("Registrierung fehlgeschlagen. Ist die API erreichbar?");
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle><h1>Registrieren</h1></CardTitle>
        <CardDescription>Ein VibeCRM-Konto mit E-Mail und Passwort erstellen.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} aria-busy={busy}>
          <FieldGroup>
            <Field data-disabled={busy}>
              <FieldLabel htmlFor="sign-up-name">Name <span className="text-muted-foreground">optional</span></FieldLabel>
              <Input id="sign-up-name" type="text" name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} autoFocus disabled={busy} />
            </Field>
            <Field data-disabled={busy}>
              <FieldLabel htmlFor="sign-up-email">E-Mail</FieldLabel>
              <Input id="sign-up-email" type="email" name="email" autoComplete="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={busy} />
            </Field>
            <Field data-disabled={busy}>
              <FieldLabel htmlFor="sign-up-password">Passwort</FieldLabel>
              <Input id="sign-up-password" type="password" name="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} disabled={busy} aria-describedby="sign-up-password-description" />
              <FieldDescription id="sign-up-password-description">Mindestens 8 Zeichen.</FieldDescription>
            </Field>
            <AuthError message={error} />
            <Button type="submit" disabled={busy} className="w-full">
              {busy && <Spinner data-icon="inline-start" />}
              {busy ? "Registrieren…" : "Registrieren"}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter className="flex-wrap justify-center gap-1">
        <p className="text-sm text-muted-foreground">Schon ein Konto?</p>
        <Link href={`/sign-in${redirectTo !== "/" ? `?redirect=${encodeURIComponent(redirectTo)}` : ""}`} className={buttonVariants({ variant: "link", size: "sm" })}>Anmelden</Link>
      </CardFooter>
    </Card>
  );
}
