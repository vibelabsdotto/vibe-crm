"use client";

import { CheckIcon, CopyIcon, KeyRoundIcon, Loader2Icon, PlusIcon, ShieldAlertIcon, Trash2Icon } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api";
import type { ApiTokenMeta, CreatedApiToken } from "@/lib/types";
import { useApi } from "@/lib/use-api";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("de-DE");
}

export function TokensManager({ initialTokens }: { initialTokens: ApiTokenMeta[] }) {
  const api = useApi();
  const [tokens, setTokens] = useState(initialTokens);
  const [name, setName] = useState("");
  const [created, setCreated] = useState<CreatedApiToken | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const createPending = useRef(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiTokenMeta | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);
  const revokePending = useRef(false);
  const cancelRevoke = useRef<HTMLButtonElement>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const createDisabled = busy || revoking || created !== null;

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (createPending.current || revokePending.current || created) return;
    if (!name.trim()) {
      setNameError("Bitte einen Namen für den Token eingeben.");
      return;
    }
    createPending.current = true;
    setBusy(true);
    setError(null);
    setNameError(null);
    try {
      const result = await api<CreatedApiToken>("/v1/tokens", {
        method: "POST", body: { name: name.trim() },
      });
      setCreated(result);
      setCopied(false);
      setCopyError(null);
      setName("");
      toast.add({ title: "Token erstellt", type: "success" });
      try {
        const data = await api<{ tokens: ApiTokenMeta[] }>("/v1/tokens");
        setTokens(data.tokens);
      } catch {
        setError("Der Token wurde erstellt und ist unten sichtbar. Die Token-Liste konnte nicht aktualisiert werden. Sichere den Token vor dem Neuladen der Seite.");
      }
    } catch (err) {
      setError(err instanceof ApiError ? `Erstellen fehlgeschlagen: ${err.code}` : "Erstellen fehlgeschlagen.");
    } finally {
      createPending.current = false;
      setBusy(false);
    }
  }

  async function copyToken() {
    if (!created || copying) return;
    setCopying(true);
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(created.token);
      setCopied(true);
      toast.add({ title: "Token kopiert", type: "success" });
    } catch {
      setCopied(false);
      setCopyError("Der Token konnte nicht kopiert werden. Bitte den angezeigten Token markieren und manuell kopieren.");
    } finally {
      setCopying(false);
    }
  }

  async function revoke() {
    if (!revokeTarget || revokePending.current || createPending.current) return;
    const token = revokeTarget;
    revokePending.current = true;
    setRevoking(true);
    setRevokeError(null);
    try {
      await api(`/v1/tokens/${encodeURIComponent(token.id)}`, { method: "DELETE" });
      setTokens((current) => current.filter((item) => item.id !== token.id));
      if (created?.id === token.id) setCreated(null);
      setRevokeTarget(null);
      toast.add({ title: "Token widerrufen", type: "success" });
    } catch (err) {
      setRevokeError(err instanceof ApiError ? `Widerrufen fehlgeschlagen: ${err.code}` : "Widerrufen fehlgeschlagen.");
    } finally {
      revokePending.current = false;
      setRevoking(false);
    }
  }

  const sorted = [...tokens].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle><h2>Neuen Token erstellen</h2></CardTitle>
          <CardDescription>Tokens erlauben der CLI und deinen Integrationen den Zugriff auf das CRM.</CardDescription>
        </CardHeader>
        <CardContent>
          <form id="token-create-form" onSubmit={create} aria-busy={busy}>
            <FieldGroup>
              <Field data-disabled={createDisabled} data-invalid={nameError !== null}>
                <FieldLabel htmlFor="token-name">Token-Name</FieldLabel>
                <Input
                  id="token-name" value={name} onChange={(event) => { setName(event.target.value); setNameError(null); }}
                  placeholder="z. B. MacBook CLI" maxLength={100} required disabled={createDisabled}
                  aria-invalid={nameError !== null}
                  aria-describedby={nameError ? "token-name-error" : "token-name-hint"}
                />
                <FieldDescription id="token-name-hint">
                  {created ? "Sichere den erstellten Token und blende ihn aus, bevor du einen weiteren erstellst." : "Ein verständlicher Name hilft dir, den Zugriff später zuzuordnen."}
                </FieldDescription>
                {nameError && <FieldError id="token-name-error">{nameError}</FieldError>}
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
        <CardFooter>
          <Button type="submit" form="token-create-form" disabled={createDisabled}>
            {busy ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : <PlusIcon data-icon="inline-start" />}
            {busy ? "Erstellt…" : "Token erstellen"}
          </Button>
        </CardFooter>
      </Card>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {created && (
        <Card role="status" className="min-w-0">
          <CardHeader>
            <CardTitle>Token erstellt</CardTitle>
            <CardDescription>Der vollständige Token wird nur einmal angezeigt. Jetzt kopieren und sicher aufbewahren.</CardDescription>
          </CardHeader>
          <CardContent className="flex min-w-0 flex-col gap-4">
            <code className="block break-all rounded-md bg-muted p-3 font-mono text-sm">{created.token}</code>
            <p className="break-all font-mono text-xs text-muted-foreground">vibe-crm auth login --token {created.token}</p>
            {copyError && <Alert variant="destructive"><AlertDescription>{copyError}</AlertDescription></Alert>}
          </CardContent>
          <CardFooter className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={copyToken} disabled={copying || revoking}>
              {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
              {copying ? "Kopiert…" : copied ? "Kopiert" : "Token kopieren"}
            </Button>
            <Button
              type="button" variant="ghost" disabled={busy || revoking || copying}
              onClick={() => { setCreated(null); setCopied(false); setCopyError(null); }}
            >Token ausblenden</Button>
          </CardFooter>
        </Card>
      )}
      <Alert role="note">
        <ShieldAlertIcon />
        <AlertTitle>Zugriff über die CLI</AlertTitle>
        <AlertDescription>
          <p>Mit <code className="break-all font-mono text-xs">vibe-crm auth login --token vc_…</code> meldest du die CLI an.</p>
          <p>Ein widerrufener Token verliert sofort den Zugriff. Der vollständige Token ist später nicht mehr abrufbar.</p>
        </AlertDescription>
      </Alert>
      <section aria-labelledby="token-list-heading" className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="token-list-heading" ref={listHeading} tabIndex={-1} className="text-base font-medium">Aktive Tokens</h2>
          <Badge variant="secondary">{tokens.length} Tokens</Badge>
        </div>
        {sorted.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon"><KeyRoundIcon /></EmptyMedia>
              <EmptyTitle>Noch keine Tokens</EmptyTitle>
              <EmptyDescription>Erstelle einen Token für die CLI oder eine Integration.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Tokenübersicht</CardTitle>
              <CardDescription>Hier siehst du nur den Prefix. Der vollständige Token bleibt verborgen.</CardDescription>
            </CardHeader>
            <CardContent className="min-w-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Name</TableHead>
                    <TableHead scope="col" className="hidden sm:table-cell">Prefix</TableHead>
                    <TableHead scope="col" className="hidden md:table-cell">Erstellt</TableHead>
                    <TableHead scope="col" className="hidden md:table-cell">Zuletzt genutzt</TableHead>
                    <TableHead scope="col" className="text-right"><span className="sr-only">Aktionen</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((token) => (
                    <TableRow key={token.id}>
                      <TableCell className="max-w-64 whitespace-normal">
                        <span className="break-words font-medium">{token.name}</span>
                        <span className="mt-1 block break-all font-mono text-xs text-muted-foreground sm:hidden">{token.prefix}…</span>
                      </TableCell>
                      <TableCell className="hidden font-mono text-xs text-muted-foreground sm:table-cell">{token.prefix}…</TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell"><time dateTime={token.createdAt}>{formatDate(token.createdAt)}</time></TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {token.lastUsedAt ? <time dateTime={token.lastUsedAt}>{formatDate(token.lastUsedAt)}</time> : "Noch nicht genutzt"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button" variant="destructive" size="sm" disabled={busy || revoking}
                          onClick={() => { setRevokeError(null); setRevokeTarget(token); }}
                          aria-label={`Token ${token.name} widerrufen`}
                        ><Trash2Icon data-icon="inline-start" />Widerrufen</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </section>
      <Dialog
        open={revokeTarget !== null} disablePointerDismissal={revoking}
        onOpenChange={(open, details) => {
          if (!open && revokePending.current) details.cancel();
          else if (!open) setRevokeTarget(null);
        }}
      >
        <DialogContent showCloseButton={false} initialFocus={cancelRevoke} finalFocus={listHeading}>
          <DialogHeader>
            <DialogTitle>Token widerrufen?</DialogTitle>
            <DialogDescription>
              „{revokeTarget?.name}“ verliert sofort den Zugriff. CLIs und Integrationen mit diesem Token können sich danach nicht mehr anmelden.
            </DialogDescription>
          </DialogHeader>
          {revokeError && <Alert variant="destructive"><AlertDescription>{revokeError}</AlertDescription></Alert>}
          <DialogFooter>
            <DialogClose render={<Button ref={cancelRevoke} type="button" variant="outline" disabled={revoking} />}>Abbrechen</DialogClose>
            <Button type="button" variant="destructive" disabled={revoking} onClick={revoke}>
              {revoking && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
              {revoking ? "Widerruft…" : "Token widerrufen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
