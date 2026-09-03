"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { webUrl } from "@/lib/env";

function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="form-error" role="alert">
      {message}
    </p>
  );
}

/** Google-OAuth-Button (Better Auth social sign-in, Contract §3 — optional via Env). */
function GoogleButton({ redirectTo }: { redirectTo: string }) {
  const [busy, setBusy] = useState(false);
  async function googleSignIn() {
    setBusy(true);
    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: `${webUrl()}${redirectTo}`,
      });
    } catch {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      className="btn btn-block"
      onClick={googleSignIn}
      disabled={busy}
      style={{ marginBottom: 12 }}
    >
      {busy ? "Weiter zu Google…" : "Mit Google anmelden"}
    </button>
  );
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
    setBusy(true);
    setError(null);
    try {
      const { error: authError } = await authClient.signIn.email({
        email,
        password,
        callbackURL: redirectTo,
      });
      if (authError) {
        setError(
          authError.status === 401
            ? "E-Mail oder Passwort ist falsch."
            : (authError.message ?? "Anmeldung fehlgeschlagen."),
        );
        setBusy(false);
        return;
      }
      window.location.assign(redirectTo);
    } catch {
      setError("Anmeldung fehlgeschlagen — API erreichbar?");
      setBusy(false);
    }
  }

  return (
    <div className="auth-card">
      <h1>Anmelden</h1>
      <GoogleButton redirectTo={redirectTo} />
      <form onSubmit={submit}>
        <label className="field">
          <span className="field-label">E-Mail</span>
          <input
            className="input"
            type="email"
            name="email"
            autoComplete="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label className="field">
          <span className="field-label">Passwort</span>
          <input
            className="input"
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <AuthError message={error} />
        <button type="submit" className="btn btn-accent btn-block" disabled={busy}>
          {busy ? "Anmelden…" : "Anmelden"}
        </button>
      </form>
      <p className="auth-alt">
        Noch kein Konto?{" "}
        <Link href={`/sign-up${redirectTo !== "/" ? `?redirect=${encodeURIComponent(redirectTo)}` : ""}`}>
          Registrieren
        </Link>
      </p>
    </div>
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
    setBusy(true);
    setError(null);
    try {
      const { error: authError } = await authClient.signUp.email({
        name: name.trim() || email.split("@")[0],
        email,
        password,
        callbackURL: redirectTo,
      });
      if (authError) {
        setError(authError.message ?? "Registrierung fehlgeschlagen.");
        setBusy(false);
        return;
      }
      window.location.assign(redirectTo);
    } catch {
      setError("Registrierung fehlgeschlagen — API erreichbar?");
      setBusy(false);
    }
  }

  return (
    <div className="auth-card">
      <h1>Registrieren</h1>
      <GoogleButton redirectTo={redirectTo} />
      <form onSubmit={submit}>
        <label className="field">
          <span className="field-label">Name (optional)</span>
          <input
            className="input"
            type="text"
            name="name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </label>
        <label className="field">
          <span className="field-label">E-Mail</span>
          <input
            className="input"
            type="email"
            name="email"
            autoComplete="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span className="field-label">Passwort</span>
          <input
            className="input"
            type="password"
            name="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </label>
        <AuthError message={error} />
        <button type="submit" className="btn btn-accent btn-block" disabled={busy}>
          {busy ? "Registrieren…" : "Registrieren"}
        </button>
      </form>
      <p className="auth-alt">
        Schon ein Konto?{" "}
        <Link href={`/sign-in${redirectTo !== "/" ? `?redirect=${encodeURIComponent(redirectTo)}` : ""}`}>
          Anmelden
        </Link>
      </p>
    </div>
  );
}
