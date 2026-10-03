"use client";

import { InfoIcon, ListFilterIcon, Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import {
  Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api";
import type { CustomFieldDef } from "@/lib/types";
import { useApi } from "@/lib/use-api";

type Entity = "contact" | "company" | "deal";

const ENTITIES: { value: Entity; label: string }[] = [
  { value: "contact", label: "Kontakte" },
  { value: "company", label: "Firmen" },
  { value: "deal", label: "Deals" },
];

const FIELD_TYPES = [
  { value: "string", label: "Kurzer Text" },
  { value: "text", label: "Langer Text" },
  { value: "integer", label: "Ganzzahl" },
  { value: "decimal", label: "Dezimalzahl" },
  { value: "boolean", label: "Ja / Nein" },
  { value: "date", label: "Datum" },
  { value: "datetime", label: "Datum und Uhrzeit" },
  { value: "enumeration", label: "Auswahlliste" },
  { value: "json", label: "JSON" },
];

export function PropertiesManager({ defs }: { defs: CustomFieldDef[] }) {
  const api = useApi();
  const router = useRouter();
  const [entity, setEntity] = useState<Entity>("contact");
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState<string>("string");
  const [required, setRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalidField, setInvalidField] = useState<"key" | "label" | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [deleteTarget, setDeleteTarget] = useState<CustomFieldDef | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const deletePending = useRef(false);
  const createButton = useRef<HTMLButtonElement>(null);
  const cancelDelete = useRef<HTMLButtonElement>(null);
  const disabled = busy || deleting;
  const entityLabel = ENTITIES.find((item) => item.value === entity)?.label;

  const visible = useMemo(
    () => defs.filter((def) => def.entity_type === entity).sort((a, b) => a.position - b.position),
    [defs, entity],
  );

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || deletePending.current) return;
    if (!/^[a-z][a-z0-9_]*$/.test(key.trim())) {
      setInvalidField("key");
      setError("Der Key muss mit einem Kleinbuchstaben beginnen. Erlaubt sind Kleinbuchstaben, Zahlen und Unterstriche.");
      return;
    }
    if (!label.trim()) {
      setInvalidField("label");
      setError("Bitte eine Bezeichnung eingeben.");
      return;
    }
    pending.current = true;
    setBusy(true);
    setError(null);
    setInvalidField(null);
    try {
      await api("/v1/custom-fields", {
        method: "POST",
        body: {
          entity_type: entity, key: key.trim(), label: label.trim(),
          field_type: fieldType, options: required ? { required: true } : {},
        },
      });
      setKey("");
      setLabel("");
      setRequired(false);
      router.refresh();
      toast.add({ title: "Feld erstellt", type: "success" });
    } catch (err) {
      setError(err instanceof ApiError ? `Erstellen fehlgeschlagen: ${err.code}` : "Erstellen fehlgeschlagen.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function remove() {
    if (!deleteTarget || deletePending.current || pending.current) return;
    deletePending.current = true;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api(`/v1/custom-fields/${encodeURIComponent(deleteTarget.id)}`, { method: "DELETE" });
      router.refresh();
      setDeleteTarget(null);
      toast.add({ title: "Feld gelöscht", type: "success" });
    } catch (err) {
      setDeleteError(err instanceof ApiError ? `Löschen fehlgeschlagen: ${err.code}` : "Löschen fehlgeschlagen.");
    } finally {
      deletePending.current = false;
      setDeleting(false);
    }
  }

  function requestDelete(def: CustomFieldDef) {
    setDeleteError(null);
    setDeleteTarget(def);
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <Alert role="note">
        <InfoIcon />
        <AlertTitle>Eigene Felder für deine Datensätze</AlertTitle>
        <AlertDescription>
          Jedes Feld legt eine Spalte für Kontakte, Firmen oder Deals an. Beim Löschen werden die Spalte und ihre gespeicherten Werte dauerhaft entfernt.
        </AlertDescription>
      </Alert>
      <FieldGroup className="w-full max-w-xs">
        <Field data-disabled={disabled}>
          <FieldLabel htmlFor="property-entity">Felder verwalten für</FieldLabel>
          <Select
            items={ENTITIES} value={entity} disabled={disabled}
            onValueChange={(value) => {
              if (value !== null) {
                setEntity(value);
                setError(null);
                setInvalidField(null);
              }
            }}
          >
            <SelectTrigger id="property-entity" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {ENTITIES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>
      <Card>
        <CardHeader>
          <CardTitle><h2>Neues Feld für {entityLabel}</h2></CardTitle>
          <CardDescription>Der technische Key und der Typ können später nicht geändert werden.</CardDescription>
        </CardHeader>
        <CardContent>
          <form id="property-create-form" onSubmit={create} aria-busy={busy} className="flex min-w-0 flex-col gap-5">
            <FieldSet disabled={disabled}>
              <FieldLegend variant="label">Feldeigenschaften</FieldLegend>
              <FieldGroup className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Field data-disabled={disabled} data-invalid={invalidField === "key"}>
                  <FieldLabel htmlFor="property-key">Key</FieldLabel>
                  <Input
                    id="property-key" value={key} onChange={(event) => {
                      setKey(event.target.value);
                      if (invalidField === "key") { setInvalidField(null); setError(null); }
                    }}
                    placeholder="z. B. branche_detail" pattern="[a-z][a-z0-9_]*" required disabled={disabled}
                    className="font-mono" aria-invalid={invalidField === "key"}
                    aria-describedby={invalidField === "key" ? "property-key-error" : "property-key-hint"}
                  />
                  <FieldDescription id="property-key-hint">Kleinbuchstaben, Zahlen und Unterstriche. Beginnt mit einem Buchstaben.</FieldDescription>
                  {invalidField === "key" && <FieldError id="property-key-error">{error}</FieldError>}
                </Field>
                <Field data-disabled={disabled} data-invalid={invalidField === "label"}>
                  <FieldLabel htmlFor="property-label">Bezeichnung</FieldLabel>
                  <Input
                    id="property-label" value={label} onChange={(event) => {
                      setLabel(event.target.value);
                      if (invalidField === "label") { setInvalidField(null); setError(null); }
                    }}
                    required disabled={disabled} aria-invalid={invalidField === "label"}
                    aria-describedby={invalidField === "label" ? "property-label-error" : undefined}
                  />
                  {invalidField === "label" && <FieldError id="property-label-error">{error}</FieldError>}
                </Field>
                <Field data-disabled={disabled}>
                  <FieldLabel htmlFor="property-type">Typ</FieldLabel>
                  <Select
                    items={FIELD_TYPES} value={fieldType} disabled={disabled}
                    onValueChange={(value) => { if (value !== null) setFieldType(value); }}
                  >
                    <SelectTrigger id="property-type" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {FIELD_TYPES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field data-disabled={disabled} orientation="horizontal" className="sm:self-center">
                  <Checkbox
                    id="property-required" checked={required} onCheckedChange={setRequired}
                    disabled={disabled} aria-describedby="property-required-hint"
                  />
                  <FieldContent>
                    <FieldLabel htmlFor="property-required">Pflichtfeld</FieldLabel>
                    <FieldDescription id="property-required-hint">Muss bei neuen Datensätzen ausgefüllt werden.</FieldDescription>
                  </FieldContent>
                </Field>
              </FieldGroup>
            </FieldSet>
            {error && !invalidField && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          </form>
        </CardContent>
        <CardFooter>
          <Button ref={createButton} type="submit" form="property-create-form" disabled={disabled}>
            {busy ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : <PlusIcon data-icon="inline-start" />}
            {busy ? "Erstellt…" : "Feld erstellen"}
          </Button>
        </CardFooter>
      </Card>
      {visible.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><ListFilterIcon /></EmptyMedia>
            <EmptyTitle>Noch keine eigenen Felder</EmptyTitle>
            <EmptyDescription>Für {entityLabel} sind noch keine zusätzlichen Felder angelegt.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <section aria-label={`Felder für ${entityLabel}`} className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-medium">Felder für {entityLabel}</h2>
            <Badge variant="secondary">{visible.length} Felder</Badge>
          </div>
          <Card className="hidden min-w-0 md:flex">
            <CardHeader>
              <CardTitle>Feldübersicht</CardTitle>
              <CardDescription>Technische Keys und sichtbare Bezeichnungen in der gespeicherten Reihenfolge.</CardDescription>
            </CardHeader>
            <CardContent className="min-w-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Key</TableHead>
                    <TableHead scope="col">Bezeichnung</TableHead>
                    <TableHead scope="col">Typ</TableHead>
                    <TableHead scope="col" className="text-right"><span className="sr-only">Aktionen</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((def) => (
                    <TableRow key={def.id}>
                      <TableCell className="font-mono text-xs">{def.key}</TableCell>
                      <TableCell className="max-w-64 whitespace-normal break-words">{def.label}</TableCell>
                      <TableCell><Badge variant="secondary">{def.field_type}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button" variant="destructive" size="sm" disabled={disabled}
                          onClick={() => requestDelete(def)} aria-label={`Feld ${def.label} löschen`}
                        ><Trash2Icon data-icon="inline-start" />Löschen</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <div className="grid min-w-0 grid-cols-1 gap-3 md:hidden">
            {visible.map((def) => (
              <Card key={def.id} size="sm">
                <CardHeader>
                  <CardTitle className="break-words">{def.label}</CardTitle>
                  <CardDescription className="break-all font-mono">{def.key}</CardDescription>
                </CardHeader>
                <CardContent><Badge variant="secondary">{def.field_type}</Badge></CardContent>
                <CardFooter>
                  <Button
                    type="button" variant="destructive" size="sm" disabled={disabled}
                    onClick={() => requestDelete(def)} aria-label={`Feld ${def.label} löschen`}
                  ><Trash2Icon data-icon="inline-start" />Löschen</Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </section>
      )}
      <Dialog
        open={deleteTarget !== null} disablePointerDismissal={deleting}
        onOpenChange={(open, details) => {
          if (!open && deletePending.current) details.cancel();
          else if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent showCloseButton={false} initialFocus={cancelDelete} finalFocus={createButton}>
          <DialogHeader>
            <DialogTitle>Feld dauerhaft löschen?</DialogTitle>
            <DialogDescription>
              „{deleteTarget?.label}“ und alle Werte in der Spalte „{deleteTarget?.key}“ werden entfernt. Diese Aktion kann nicht rückgängig gemacht werden.
            </DialogDescription>
          </DialogHeader>
          {deleteError && <Alert variant="destructive"><AlertDescription>{deleteError}</AlertDescription></Alert>}
          <DialogFooter>
            <DialogClose render={<Button ref={cancelDelete} type="button" variant="outline" disabled={deleting} />}>Abbrechen</DialogClose>
            <Button type="button" variant="destructive" disabled={deleting} onClick={remove}>
              {deleting && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
              {deleting ? "Löscht…" : "Feld löschen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
