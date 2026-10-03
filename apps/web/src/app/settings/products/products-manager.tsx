"use client";

import { InfoIcon, Loader2Icon, PackageIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api";
import { asList, type Product } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const TYPES = [
  { value: "product", label: "Produkt" },
  { value: "service", label: "Dienstleistung" },
  { value: "other", label: "Sonstiges" },
];

type FormState = {
  key: string;
  name: string;
  type: string;
  status: string;
  notes: string;
};

function emptyForm(): FormState {
  return { key: "", name: "", type: "product", status: "", notes: "" };
}

function formFromProduct(product: Product): FormState {
  return {
    key: product.key, name: product.name, type: product.type,
    status: product.status, notes: product.notes,
  };
}

function ProductDialog({
  initial, editKey, onClose, onSaved,
}: {
  initial: FormState;
  editKey: string | null;
  onClose: () => void;
  onSaved: (product: Product) => Promise<void>;
}) {
  const api = useApi();
  const [form, setForm] = useState<FormState>(initial);
  const [error, setError] = useState<string | null>(null);
  const [invalidField, setInvalidField] = useState<"name" | "key" | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    if (invalidField === key) {
      setInvalidField(null);
      setError(null);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    if (!form.name.trim()) {
      setInvalidField("name");
      setError("Bitte einen Namen eingeben.");
      return;
    }
    if (!editKey && form.key.trim() && !/^[a-z][a-z0-9_-]*$/.test(form.key.trim())) {
      setInvalidField("key");
      setError("Der Key muss mit einem Kleinbuchstaben beginnen. Erlaubt sind Kleinbuchstaben, Zahlen, Unterstriche und Bindestriche.");
      return;
    }
    pending.current = true;
    setBusy(true);
    setError(null);
    setInvalidField(null);
    try {
      const body: Record<string, string> = {
        name: form.name.trim(), type: form.type,
        status: form.status, notes: form.notes.trim(),
      };
      if (!editKey && form.key.trim()) body.key = form.key.trim();
      const result = await api<{ product: Product }>(
        editKey ? `/v1/products/${encodeURIComponent(editKey)}` : "/v1/products",
        { method: editKey ? "PUT" : "POST", body },
      );
      await onSaved(result.product);
      toast.add({ title: editKey ? "Produkt gespeichert" : "Produkt angelegt", type: "success" });
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === "conflict") {
        setInvalidField("key");
        setError("Dieser Key ist bereits vergeben. Bitte einen anderen wählen.");
      } else {
        setError(err instanceof ApiError ? `Speichern fehlgeschlagen: ${err.code}` : "Speichern fehlgeschlagen.");
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      disablePointerDismissal={busy}
      onOpenChange={(open, details) => {
        if (!open && pending.current) details.cancel();
        else if (!open) onClose();
      }}
    >
      <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editKey ? "Produkt bearbeiten" : "Produkt anlegen"}</DialogTitle>
          <DialogDescription>
            Produkte können Deals und Abos zugeordnet werden. Der Key bleibt nach dem Anlegen unverändert.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} aria-busy={busy} className="flex min-w-0 flex-col gap-6">
          <FieldGroup>
            <Field data-disabled={busy} data-invalid={invalidField === "name"}>
              <FieldLabel htmlFor="product-name">Name</FieldLabel>
              <Input
                id="product-name" value={form.name} onChange={(event) => set("name", event.target.value)}
                required disabled={busy} aria-invalid={invalidField === "name"}
                aria-describedby={invalidField === "name" ? "product-name-error" : undefined}
              />
              {invalidField === "name" && <FieldError id="product-name-error">{error}</FieldError>}
            </Field>
            <FieldGroup className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field data-disabled={busy || editKey !== null} data-invalid={invalidField === "key"}>
                <FieldLabel htmlFor="product-key">Key</FieldLabel>
                <Input
                  id="product-key" value={form.key} onChange={(event) => set("key", event.target.value)}
                  disabled={busy || editKey !== null} placeholder="z. B. daze"
                  className="font-mono" aria-invalid={invalidField === "key"}
                  aria-describedby={invalidField === "key" ? "product-key-error" : "product-key-hint"}
                />
                <FieldDescription id="product-key-hint">
                  {editKey ? "Der Key kann nicht geändert werden." : "Leer lassen, um den Key aus dem Namen zu erzeugen."}
                </FieldDescription>
                {invalidField === "key" && <FieldError id="product-key-error">{error}</FieldError>}
              </Field>
              <Field data-disabled={busy}>
                <FieldLabel htmlFor="product-type">Typ</FieldLabel>
                <Select
                  items={TYPES} value={form.type} disabled={busy}
                  onValueChange={(value) => { if (value !== null) set("type", value); }}
                >
                  <SelectTrigger id="product-type" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {TYPES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>
            <Field data-disabled={busy}>
              <FieldLabel htmlFor="product-status">Status</FieldLabel>
              <Input
                id="product-status" value={form.status} onChange={(event) => set("status", event.target.value)}
                disabled={busy} placeholder="z. B. aktiv"
              />
            </Field>
            <Field data-disabled={busy}>
              <FieldLabel htmlFor="product-notes">Notizen</FieldLabel>
              <Textarea
                id="product-notes" value={form.notes} onChange={(event) => set("notes", event.target.value)}
                disabled={busy} rows={3}
              />
            </Field>
          </FieldGroup>
          {error && !invalidField && (
            <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
          )}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={busy} />}>
              Abbrechen
            </DialogClose>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
              {busy ? "Speichert…" : "Speichern"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ProductsManager({ initialProducts }: { initialProducts: Product[] }) {
  const api = useApi();
  const [products, setProducts] = useState(initialProducts);
  const [dialog, setDialog] = useState<{ initial: FormState; editKey: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const deletePending = useRef(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const cancelDelete = useRef<HTMLButtonElement>(null);

  async function saved(product: Product) {
    setProducts((current) => [...current.filter((item) => item.key !== product.key), product]);
    setError(null);
    try {
      const data = await api<unknown>("/v1/products");
      setProducts(asList<Product>(data, "products"));
    } catch {
      setError("Das Produkt wurde gespeichert. Die Liste konnte nicht neu geladen werden. Bitte die Seite neu laden.");
    }
  }

  async function remove() {
    if (!deleteTarget || deletePending.current) return;
    const product = deleteTarget;
    deletePending.current = true;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api(`/v1/products/${encodeURIComponent(product.key)}`, { method: "DELETE" });
      setProducts((current) => current.filter((item) => item.key !== product.key));
      setDeleteTarget(null);
      toast.add({ title: "Produkt gelöscht", type: "success" });
    } catch (err) {
      setDeleteError(err instanceof ApiError && err.code === "conflict"
        ? `„${product.name}“ wird noch von Deals oder Abos verwendet. Bitte die Zuordnungen vor dem Löschen ändern.`
        : err instanceof ApiError ? `Löschen fehlgeschlagen: ${err.code}` : "Löschen fehlgeschlagen.");
    } finally {
      deletePending.current = false;
      setDeleting(false);
    }
  }

  const sorted = [...products].sort((a, b) => a.name.localeCompare(b.name, "de"));

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <Alert role="note">
        <InfoIcon />
        <AlertTitle>Zuordnungen bleiben geschützt</AlertTitle>
        <AlertDescription>Ein Produkt kann nur gelöscht werden, wenn keine Deals oder Abos mehr darauf verweisen.</AlertDescription>
      </Alert>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{products.length} Produkte</p>
        <Button ref={addButton} type="button" onClick={() => setDialog({ initial: emptyForm(), editKey: null })}>
          <PlusIcon data-icon="inline-start" />Produkt anlegen
        </Button>
      </div>
      {sorted.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><PackageIcon /></EmptyMedia>
            <EmptyTitle>Noch keine Produkte</EmptyTitle>
            <EmptyDescription>Lege ein Produkt an, um es deinen Deals und Abos zuzuordnen.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle><h2>Produktkatalog</h2></CardTitle>
            <CardDescription>Produkte, Dienstleistungen und ihr aktueller Status.</CardDescription>
          </CardHeader>
          <CardContent className="min-w-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Name</TableHead>
                  <TableHead scope="col" className="hidden sm:table-cell">Key</TableHead>
                  <TableHead scope="col" className="hidden md:table-cell">Typ</TableHead>
                  <TableHead scope="col" className="hidden md:table-cell">Status</TableHead>
                  <TableHead scope="col" className="text-right"><span className="sr-only">Aktionen</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((product) => (
                  <TableRow key={product.key}>
                    <TableCell className="max-w-64 whitespace-normal">
                      <span className="break-words font-medium">{product.name}</span>
                      <span className="mt-1 block break-all font-mono text-xs text-muted-foreground sm:hidden">{product.key}</span>
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs text-muted-foreground sm:table-cell">{product.key}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant="secondary">{TYPES.find((item) => item.value === product.type)?.label ?? product.type}</Badge>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{product.status || "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          type="button" variant="outline" size="sm"
                          onClick={() => setDialog({ initial: formFromProduct(product), editKey: product.key })}
                          aria-label={`Produkt ${product.name} bearbeiten`}
                        ><PencilIcon data-icon="inline-start" /><span className="hidden sm:inline">Bearbeiten</span></Button>
                        <Button
                          type="button" variant="destructive" size="icon-sm"
                          onClick={() => { setDeleteError(null); setDeleteTarget(product); }}
                          aria-label={`Produkt ${product.name} löschen`}
                        ><Trash2Icon /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      {dialog && (
        <ProductDialog initial={dialog.initial} editKey={dialog.editKey} onClose={() => setDialog(null)} onSaved={saved} />
      )}
      <Dialog
        open={deleteTarget !== null} disablePointerDismissal={deleting}
        onOpenChange={(open, details) => {
          if (!open && deletePending.current) details.cancel();
          else if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent showCloseButton={false} initialFocus={cancelDelete} finalFocus={addButton}>
          <DialogHeader>
            <DialogTitle>Produkt löschen?</DialogTitle>
            <DialogDescription>
              „{deleteTarget?.name}“ wird dauerhaft entfernt. Verwendete Produkte können nicht gelöscht werden.
            </DialogDescription>
          </DialogHeader>
          {deleteError && <Alert variant="destructive"><AlertDescription>{deleteError}</AlertDescription></Alert>}
          <DialogFooter>
            <DialogClose render={<Button ref={cancelDelete} type="button" variant="outline" disabled={deleting} />}>Abbrechen</DialogClose>
            <Button type="button" variant="destructive" disabled={deleting} onClick={remove}>
              {deleting && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
              {deleting ? "Löscht…" : "Produkt löschen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
