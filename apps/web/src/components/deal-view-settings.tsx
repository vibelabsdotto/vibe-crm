"use client";

import { ArrowDownIcon, ArrowUpIcon, Columns3Icon, ListFilterIcon, RefreshCwIcon } from "lucide-react";
import { useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api";
import type { DealFieldVisibility, DealView } from "@/lib/deal-view";
import { asList, type Stage } from "@/lib/types";
import { useApi } from "@/lib/use-api";

type SettingsPanel = "columns" | "rules";
type RuleMode = "always" | "lost" | "stages";
const ruleModes: { value: RuleMode; label: string }[] = [
  { value: "always", label: "Immer anzeigen" },
  { value: "lost", label: "Nur in verlorenen Stages" },
  { value: "stages", label: "Nur in ausgewählten Stages" },
];

function confirmedView(value: DealView): DealView {
  if (!value || !Array.isArray(value.fields) || !Array.isArray(value.columns) || !Array.isArray(value.default_columns) || !Array.isArray(value.warnings) || !value.visibility || !value.columns.includes("name")) {
    throw new Error("Die gemeinsame Ansicht wurde nicht vollständig geliefert.");
  }
  return value;
}

function sameColumns(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((key, index) => key === right[index]);
}

function fieldRule(view: DealView, key: string): DealFieldVisibility | undefined {
  return Object.hasOwn(view.visibility, key) ? view.visibility[key] : undefined;
}

function sameRule(left: DealFieldVisibility | undefined, right: DealFieldVisibility | undefined): boolean {
  if (!left || !right) return left === right;
  if (left.mode !== right.mode) return false;
  return left.mode === "lost" || (right.mode === "stages" && left.stages.length === right.stages.length && left.stages.every((key) => right.stages.includes(key)));
}

export function DealViewSettings({ view, stages, disabled, onViewChange, onOpenChange }: {
  view: DealView;
  stages: Stage[];
  disabled: boolean;
  onViewChange: (view: DealView) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const api = useApi();
  const [panel, setPanel] = useState<SettingsPanel | null>(null);
  const [catalog, setCatalog] = useState(view);
  const [currentStages, setCurrentStages] = useState(stages);
  const [columns, setColumns] = useState(view.columns);
  const [fieldKey, setFieldKey] = useState("");
  const [mode, setMode] = useState<RuleMode>("always");
  const [ruleStages, setRuleStages] = useState<string[]>([]);
  const [pending, setPending] = useState<"loading" | "saving" | "resetting" | "removing" | null>(null);
  const [catalogReady, setCatalogReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const columnsButton = useRef<HTMLButtonElement | null>(null);
  const rulesButton = useRef<HTMLButtonElement | null>(null);
  const closeButton = useRef<HTMLButtonElement | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);

  const customFields = catalog.fields.filter((field) => field.source === "custom");
  const fieldItems = customFields.map((field) => ({ value: field.key, label: field.label }));
  const orderedFields = [
    ...columns.flatMap((key) => catalog.fields.filter((field) => field.key === key)),
    ...catalog.fields.filter((field) => !columns.includes(field.key)),
  ];
  const selectedField = customFields.find((field) => field.key === fieldKey);
  const selectedRule = mode === "always" ? undefined : mode === "lost" ? { mode: "lost" } as const : { mode: "stages", stages: ruleStages } as const;
  const columnsChanged = !sameColumns(columns, catalog.columns);
  const ruleChanged = !!selectedField && !sameRule(selectedRule, fieldRule(catalog, fieldKey));
  const invalidStages = mode === "stages" && ruleStages.length === 0;
  const locked = pending !== null || !catalogReady;

  function selectField(nextKey: string, nextView: DealView = catalog) {
    const rule = fieldRule(nextView, nextKey);
    setFieldKey(nextKey);
    setMode(rule?.mode ?? "always");
    setRuleStages(rule?.mode === "stages" ? rule.stages : []);
  }

  function close() {
    setPanel(null);
    onOpenChange(false);
  }

  async function reload() {
    if (busy.current) return;
    busy.current = true;
    setPending("loading");
    setCatalogReady(false);
    setError(null);
    try {
      const [response, stagesResponse] = await Promise.all([
        api<DealView>("/v1/deals/view"),
        api<unknown>("/v1/stages"),
      ]);
      const next = confirmedView(response);
      if (!Array.isArray(stagesResponse) && (!stagesResponse || typeof stagesResponse !== "object" || !Array.isArray((stagesResponse as { stages?: unknown }).stages))) {
        throw new Error("Stages konnten nicht geladen werden.");
      }
      const nextStages = asList<Stage>(stagesResponse, "stages").sort((a, b) => a.position - b.position);
      setCatalog(next);
      setCurrentStages(nextStages);
      setColumns(next.columns);
      const nextKey = next.fields.some((field) => field.source === "custom" && field.key === fieldKey)
        ? fieldKey : next.fields.find((field) => field.source === "custom")?.key ?? "";
      selectField(nextKey, next);
      onViewChange(next);
      setCatalogReady(true);
    } catch (cause) {
      setError(cause instanceof ApiError
        ? `Laden fehlgeschlagen: ${cause.code}. Die zuletzt bestätigte Ansicht bleibt erhalten.`
        : "Feldkatalog und Ansicht konnten nicht geladen werden. Die zuletzt bestätigte Ansicht bleibt erhalten.");
    } finally {
      busy.current = false;
      setPending(null);
    }
  }

  function open(nextPanel: SettingsPanel) {
    if (disabled || busy.current) return;
    opener.current = nextPanel === "columns" ? columnsButton.current : rulesButton.current;
    setPanel(nextPanel);
    onOpenChange(true);
    void reload();
  }

  function toggleColumn(key: string, checked: boolean) {
    if (locked || key === "name") return;
    setColumns((current) => checked ? [...current, key] : current.filter((column) => column !== key));
  }

  function reorder(key: string, direction: -1 | 1) {
    if (locked) return;
    setColumns((current) => {
      const index = current.indexOf(key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function persist(action: "saving" | "resetting" | "removing", path: string, method: "PUT" | "POST" | "DELETE", body: unknown, matches: (next: DealView) => boolean, title: string) {
    if (busy.current || !catalogReady) return;
    busy.current = true;
    setPending(action);
    setError(null);
    try {
      confirmedView(await api<DealView>(path, { method, ...(body === undefined ? {} : { body }) }));
      // Confirm the exact target with a fresh read; do not show an optimistic config.
      const next = confirmedView(await api<DealView>("/v1/deals/view"));
      if (!matches(next)) throw new Error("Die gespeicherte Auswahl wurde nicht bestätigt.");
      setCatalog(next);
      setColumns(next.columns);
      const nextKey = next.fields.some((field) => field.source === "custom" && field.key === fieldKey)
        ? fieldKey : next.fields.find((field) => field.source === "custom")?.key ?? "";
      selectField(nextKey, next);
      onViewChange(next);
      toast.add({ title, type: "success" });
      if (panel === "columns") close();
    } catch (cause) {
      setCatalogReady(false);
      setError(cause instanceof ApiError
        ? `Speichern fehlgeschlagen: ${cause.code}. Die zuletzt bestätigte Ansicht und deine Auswahl bleiben erhalten. Lade vor einem weiteren Versuch den aktuellen Stand neu.`
        : "Speichern konnte nicht bestätigt werden. Die zuletzt bestätigte Ansicht und deine Auswahl bleiben erhalten. Lade vor einem weiteren Versuch den aktuellen Stand neu.");
    } finally {
      busy.current = false;
      setPending(null);
    }
  }

  function saveColumns() {
    if (!columnsChanged) return;
    const requested = [...columns];
    void persist("saving", "/v1/deals/view", "PUT", { columns: requested }, (next) => sameColumns(next.columns, requested), "Spalten gespeichert");
  }

  function resetColumns() {
    void persist("resetting", "/v1/deals/view/reset", "POST", undefined, (next) => sameColumns(next.columns, next.default_columns), "Spalten zurückgesetzt");
  }

  function saveRule(remove = false) {
    if (!selectedField || (!remove && (!ruleChanged || invalidStages))) return;
    const key = fieldKey;
    const rule: DealFieldVisibility | undefined = remove || mode === "always" ? undefined : mode === "lost" ? { mode: "lost" } : { mode: "stages", stages: [...ruleStages] };
    void persist(remove ? "removing" : "saving", `/v1/deals/view/visibility/${encodeURIComponent(key)}`, rule ? "PUT" : "DELETE", rule, (next) => sameRule(fieldRule(next, key), rule), rule ? "Feldregel gespeichert" : "Feldregel entfernt");
  }

  return (
    <>
      <div className="flex max-w-full flex-wrap gap-2">
        <Button ref={columnsButton} type="button" variant="outline" disabled={disabled} onClick={() => open("columns")}><Columns3Icon data-icon="inline-start" />Spalten</Button>
        <Button ref={rulesButton} type="button" variant="outline" disabled={disabled} onClick={() => open("rules")}><ListFilterIcon data-icon="inline-start" />Feldregeln</Button>
      </div>
      <Dialog open={panel !== null} onOpenChange={(isOpen, details) => {
        if (!isOpen) {
          if (busy.current) details.cancel();
          else close();
        }
      }} disablePointerDismissal={pending !== null}>
        <DialogContent showCloseButton={false} className="flex max-h-[calc(100dvh-2rem)] min-w-0 flex-col sm:max-w-xl" initialFocus={closeButton} finalFocus={() => opener.current}>
          <DialogHeader>
            <DialogTitle>{panel === "columns" ? "Spalten" : "Feldregeln"}</DialogTitle>
            <DialogDescription>Gilt für den gemeinsamen Workspace und alle Benutzer. Nur die Darstellung ändert sich, keine Dealwerte.</DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto pr-1" aria-busy={pending !== null}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground" role="status">{pending === "loading" ? "Feldkatalog und Stages werden geladen…" : "Feldkatalog vom Server"}</p>
              <Button type="button" variant="outline" size="sm" disabled={pending !== null} onClick={() => { void reload(); }}><RefreshCwIcon data-icon="inline-start" />Neu laden</Button>
            </div>
            <p className="text-xs text-muted-foreground">Neu laden aktualisiert auch neue Felder und verwirft die noch nicht gespeicherte Auswahl.</p>
            {error && <Alert variant="destructive"><AlertTitle>Ansicht nicht bestätigt</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
            {catalog.warnings.length > 0 && <Alert><AlertTitle>Ansicht bereinigt</AlertTitle><AlertDescription><ul className="flex list-disc flex-col gap-1 pl-4">{catalog.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul></AlertDescription></Alert>}
            {panel === "columns" ? (
              <FieldSet className="min-w-0">
                <FieldLegend>Spalten auswählen und ordnen</FieldLegend>
                <FieldDescription>Ausgewählte Spalten stehen in ihrer Anzeigereihenfolge oben. Der Name bleibt sichtbar und kann verschoben werden. Feldregeln gelten zusätzlich je Stage.</FieldDescription>
                <FieldGroup className="gap-3">
                  {orderedFields.map((field) => {
                    const index = columns.indexOf(field.key);
                    const checked = index !== -1;
                    const mandatory = field.key === "name";
                    return <div key={field.key} className="flex min-w-0 items-center gap-2">
                      <Field orientation="horizontal" data-disabled={locked || mandatory} className="min-w-0 flex-1">
                        <Checkbox id={`deal-column-${field.key}`} checked={checked} disabled={locked || mandatory} onCheckedChange={(next) => toggleColumn(field.key, next)} />
                        <FieldContent className="min-w-0">
                          <FieldLabel htmlFor={`deal-column-${field.key}`} className="max-w-full flex-wrap break-words">{field.label}<Badge variant="secondary">{field.source === "custom" ? "Custom" : "Standard"}</Badge></FieldLabel>
                          {mandatory && <FieldDescription>Immer sichtbar</FieldDescription>}
                        </FieldContent>
                      </Field>
                      <div className="flex shrink-0 gap-1">
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={`${field.label} nach oben`} disabled={locked || !checked || index === 0} onClick={() => reorder(field.key, -1)}><ArrowUpIcon /></Button>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={`${field.label} nach unten`} disabled={locked || !checked || index === columns.length - 1} onClick={() => reorder(field.key, 1)}><ArrowDownIcon /></Button>
                      </div>
                    </div>;
                  })}
                </FieldGroup>
              </FieldSet>
            ) : customFields.length === 0 ? (
              <Empty><EmptyHeader><EmptyTitle>Keine benutzerdefinierten Deal-Felder</EmptyTitle><EmptyDescription>Vorhandene Deal-Felder aus den Custom-Field-Einstellungen erscheinen nach dem Neuladen hier.</EmptyDescription></EmptyHeader></Empty>
            ) : (
              <FieldGroup className="min-w-0">
                <Field data-disabled={locked}>
                  <FieldLabel htmlFor="deal-rule-field">Benutzerdefiniertes Feld</FieldLabel>
                  <Select items={fieldItems} value={fieldKey} onValueChange={(next) => selectField(next ?? "")} disabled={locked}>
                    <SelectTrigger id="deal-rule-field" className="w-full min-w-0"><SelectValue className="min-w-0" /></SelectTrigger>
                    <SelectContent><SelectGroup>{fieldItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
                  </Select>
                </Field>
                <Field data-disabled={locked}>
                  <FieldLabel htmlFor="deal-rule-mode">Anzeigen</FieldLabel>
                  <Select items={ruleModes} value={mode} onValueChange={(next) => { if (next) setMode(next); }} disabled={locked}>
                    <SelectTrigger id="deal-rule-mode" className="w-full min-w-0"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectGroup>{ruleModes.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
                  </Select>
                  <FieldDescription>Die Regel gilt für die Deal-Liste und den Deal-Editor. Verlorene Stages richten sich nach der Stage-Einstellung, nicht nach ihrem Namen. Ausgeblendete Werte bleiben gespeichert.</FieldDescription>
                </Field>
                {mode === "stages" && <FieldSet className="min-w-0">
                  <FieldLegend variant="label">Stages auswählen</FieldLegend>
                  <FieldGroup className="gap-3">
                    {currentStages.map((stage) => <Field key={stage.key} orientation="horizontal" data-disabled={locked}>
                      <Checkbox id={`deal-rule-stage-${stage.key}`} checked={ruleStages.includes(stage.key)} disabled={locked} aria-invalid={invalidStages} aria-describedby={invalidStages ? "deal-rule-stages-error" : undefined} onCheckedChange={(checked) => setRuleStages((current) => checked ? [...current, stage.key] : current.filter((key) => key !== stage.key))} />
                      <FieldLabel htmlFor={`deal-rule-stage-${stage.key}`} className="min-w-0 break-words">{stage.label}</FieldLabel>
                    </Field>)}
                  </FieldGroup>
                  {invalidStages && <FieldError id="deal-rule-stages-error">Wähle mindestens eine aktuelle Stage. Für alle Stages wähle „Immer anzeigen“.</FieldError>}
                </FieldSet>}
              </FieldGroup>
            )}
          </div>
          <DialogFooter className="shrink-0">
            {panel === "columns" ? <Button type="button" variant="outline" disabled={locked} onClick={resetColumns} className="h-auto min-h-8 whitespace-normal sm:mr-auto">{pending === "resetting" ? "Setzt zurück…" : "Spalten zurücksetzen"}</Button>
              : <Button type="button" variant="outline" disabled={locked || !selectedField || !fieldRule(catalog, fieldKey)} onClick={() => saveRule(true)} className="h-auto min-h-8 whitespace-normal sm:mr-auto">{pending === "removing" ? "Entfernt…" : "Regel entfernen"}</Button>}
            <DialogClose render={<Button ref={closeButton} type="button" variant="outline" disabled={pending !== null} />}>Schließen</DialogClose>
            <Button type="button" disabled={locked || (panel === "columns" ? !columnsChanged : !ruleChanged || invalidStages)} onClick={() => panel === "columns" ? saveColumns() : saveRule()}>{pending === "saving" ? "Speichert…" : "Speichern"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
