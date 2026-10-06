"use client";

import { Collapsible } from "@base-ui/react/collapsible";
import { ChevronRightIcon, GripVerticalIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type DragEvent, type MouseEvent } from "react";
import { useEntityDrawer } from "@/components/entity-drawer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api";
import type { Deal, Product, Stage } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

const DEAL_DRAG_TYPE = "application/x-vibe-crm-deal";
const rowGrid = "grid min-w-0 grid-cols-[1.5rem_minmax(0,1fr)] gap-x-2 gap-y-1 lg:grid-cols-[1.5rem_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_6rem_5.5rem_7.5rem_1.75rem] lg:items-center";
type StageOverride = { stage: string; confirmedAt: string | null };
type SelectOption = { value: string; label: string };

function eur(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency", currency: "EUR", maximumFractionDigits: 0,
  }).format(value);
}

function contactName(deal: Deal): string {
  if (deal.contact_name) return deal.contact_name;
  return [deal.contact_first_name, deal.contact_last_name]
    .filter((name): name is string => typeof name === "string" && name.length > 0)
    .join(" ");
}

function closeDate(value: string): string {
  if (!value) return "Kein Datum";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("de-DE", { timeZone: "UTC" }).format(date);
}

function DealSelectField({ id, label, items, value, onValueChange, disabled }: {
  id: string;
  label: string;
  items: SelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <Field data-disabled={disabled} className="min-w-0">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select items={items} value={value} onValueChange={(next) => onValueChange(next ?? "")} disabled={disabled}>
        <SelectTrigger id={id} className="w-full min-w-0"><SelectValue className="min-w-0" /></SelectTrigger>
        <SelectContent><SelectGroup>
          {items.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
        </SelectGroup></SelectContent>
      </Select>
    </Field>
  );
}

export function DealsBoard({ deals, stages, products, initialStage, initialProduct }: {
  deals: Deal[];
  stages: Stage[];
  products: Product[];
  initialStage: string;
  initialProduct: string;
}) {
  const api = useApi();
  const router = useRouter();
  const { openEntity, createEntity, revision } = useEntityDrawer();
  const previousRevision = useRef(revision);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [stageOverrides, setStageOverrides] = useState<Record<string, StageOverride>>({});
  const [removedIds, setRemovedIds] = useState<Set<string>>(() => new Set());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropStage, setDropStage] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [deleteDeal, setDeleteDeal] = useState<Deal | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [filterPending, startFilterTransition] = useTransition();
  const mutationPending = useRef(false);
  const dragDealId = useRef<string | null>(null);
  const suppressClickUntil = useRef(0);
  const createButton = useRef<HTMLButtonElement | null>(null);
  const deleteOpener = useRef<HTMLButtonElement | null>(null);
  const cancelButton = useRef<HTMLButtonElement | null>(null);
  const stageButtons = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (previousRevision.current !== revision) {
      previousRevision.current = revision;
      router.refresh();
    }
  }, [revision, router]);

  const ordered = useMemo(() => [...stages].sort((a, b) => a.position - b.position), [stages]);
  const stageItems = ordered.map((stage) => ({ value: stage.key, label: stage.label }));
  const effectiveDeals = useMemo(() => {
    const seen = new Set<string>();
    return deals.filter((deal) => {
      if (removedIds.has(deal.id) || seen.has(deal.id)) return false;
      seen.add(deal.id);
      return true;
    }).map((deal) => {
      const override = stageOverrides[deal.id];
      // Keep the confirmed move through stale refreshes, but let a newer edit win.
      if (!override || (override.confirmedAt !== null && (deal.updated_at > override.confirmedAt || (deal.updated_at === override.confirmedAt && deal.stage === override.stage)))) return deal;
      return { ...deal, stage: override.stage };
    });
  }, [deals, removedIds, stageOverrides]);
  const filteredDeals = useMemo(() => effectiveDeals.filter((deal) =>
    (!initialProduct || deal.product_id === initialProduct) && (!initialStage || deal.stage === initialStage),
  ), [effectiveDeals, initialProduct, initialStage]);
  const groupedDeals = useMemo(() => {
    const groups = new Map<string, Deal[]>();
    for (const deal of filteredDeals) {
      const group = groups.get(deal.stage) ?? [];
      group.push(deal);
      groups.set(deal.stage, group);
    }
    return groups;
  }, [filteredDeals]);
  // A stage filter must not remove possible drop targets during a drag.
  const visibleStages = initialStage && !draggingId ? ordered.filter((stage) => stage.key === initialStage) : ordered;
  const totalValue = filteredDeals.reduce((sum, deal) => sum + (deal.value ?? 0), 0);
  const rowBusy = movingId !== null || deleting || filterPending;

  function pushFilters(nextStage: string, nextProduct: string) {
    if (mutationPending.current || dragDealId.current) return;
    const query = new URLSearchParams();
    if (nextStage) query.set("stage", nextStage);
    if (nextProduct) query.set("product", nextProduct);
    const search = query.toString();
    startFilterTransition(() => router.push(`/deals${search ? `?${search}` : ""}`, { scroll: false }));
  }

  function finishDrag(timestamp: number) {
    dragDealId.current = null;
    suppressClickUntil.current = timestamp + 300;
    setDraggingId(null);
    setDropStage(null);
  }

  async function move(deal: Deal, nextStage: string) {
    if (mutationPending.current || filterPending || !ordered.some((stage) => stage.key === nextStage) || nextStage === deal.stage) return;
    mutationPending.current = true;
    const previous = stageOverrides[deal.id];
    setMovingId(deal.id);
    setError(null);
    setStageOverrides((current) => ({ ...current, [deal.id]: { stage: nextStage, confirmedAt: null } }));
    try {
      const response = await api<{ deal: Deal }>(`/v1/deals/${encodeURIComponent(deal.id)}`, { method: "PUT", body: { stage: nextStage } });
      const saved = response?.deal;
      if (!saved || saved.id !== deal.id || saved.stage !== nextStage || typeof saved.updated_at !== "string") {
        throw new Error("Stage-Wechsel wurde nicht bestätigt.");
      }
      setStageOverrides((current) => ({ ...current, [deal.id]: { stage: saved.stage, confirmedAt: saved.updated_at } }));
      toast.add({ title: "Deal verschoben", type: "success" });
      router.refresh();
      // Moving a row can unmount its select, especially in a collapsed target.
      (stageButtons.current[nextStage] ?? createButton.current)?.focus();
    } catch (cause) {
      setStageOverrides((current) => {
        const restored = { ...current };
        if (previous) restored[deal.id] = previous;
        else delete restored[deal.id];
        return restored;
      });
      const from = ordered.find((stage) => stage.key === deal.stage)?.label ?? deal.stage;
      setError(cause instanceof ApiError
        ? `Die Anzeige für „${deal.name}“ wurde auf „${from}“ zurückgesetzt. Verschieben fehlgeschlagen: ${cause.code}`
        : `„${deal.name}“ wurde auf „${from}“ zurückgesetzt. Der Stage-Wechsel konnte nicht bestätigt werden. Lade die Seite neu, bevor du es erneut versuchst.`);
    } finally {
      mutationPending.current = false;
      setMovingId(null);
    }
  }

  function dragStart(event: DragEvent<HTMLButtonElement>, deal: Deal) {
    if (rowBusy || mutationPending.current || deleteDeal) {
      event.preventDefault();
      return;
    }
    dragDealId.current = deal.id;
    suppressClickUntil.current = Number.POSITIVE_INFINITY;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(DEAL_DRAG_TYPE, deal.id);
    event.dataTransfer.setData("text/plain", deal.name);
    setDraggingId(deal.id);
    setError(null);
  }

  function dragOver(event: DragEvent<HTMLElement>, stage: string) {
    if (!dragDealId.current || mutationPending.current || !event.dataTransfer.types.includes(DEAL_DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropStage(stage);
  }

  function drop(event: DragEvent<HTMLElement>, stage: string) {
    const id = dragDealId.current;
    if (!id || event.dataTransfer.getData(DEAL_DRAG_TYPE) !== id) return;
    event.preventDefault();
    event.stopPropagation();
    const deal = effectiveDeals.find((item) => item.id === id);
    // Clear synchronously so bubbled/repeated drops cannot send another write.
    finishDrag(event.timeStamp);
    if (deal) void move(deal, stage);
  }

  function openRow(event: MouseEvent<HTMLLIElement>, deal: Deal) {
    if (rowBusy || mutationPending.current || event.timeStamp < suppressClickUntil.current) return;
    if (!(event.target instanceof Element) || !event.currentTarget.contains(event.target)) return;
    const control = event.target.closest("button, input, select, textarea, a, [role='button'], [role='combobox']");
    if (control && event.currentTarget.contains(control)) return;
    if (window.getSelection()?.toString()) return;
    const opener = event.currentTarget.querySelector<HTMLButtonElement>("[data-deal-opener]");
    openEntity("deal", deal.id, opener ?? event.currentTarget);
  }

  async function remove() {
    if (!deleteDeal || mutationPending.current) return;
    mutationPending.current = true;
    const id = deleteDeal.id;
    setDeleting(true);
    setDeleteError(null);
    try {
      const result = await api<{ ok: boolean }>(`/v1/deals/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (result?.ok !== true) throw new Error("Löschen wurde nicht bestätigt.");
      setRemovedIds((current) => new Set(current).add(id));
      toast.add({ title: "Deal gelöscht", type: "success" });
      deleteOpener.current = null;
      setDeleteDeal(null);
      router.refresh();
    } catch (cause) {
      setDeleteError(cause instanceof ApiError ? `Löschen fehlgeschlagen: ${cause.code}` : "Löschen konnte nicht bestätigt werden. Lade die Seite neu, bevor du es erneut versuchst.");
    } finally {
      mutationPending.current = false;
      setDeleting(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <FieldGroup className="grid w-full max-w-full grid-cols-1 gap-3 sm:w-[28rem] sm:shrink-0 sm:grid-cols-2">
          <DealSelectField id="deal-stage-filter" label="Stage filtern" value={initialStage} onValueChange={(value) => pushFilters(value, initialProduct)} items={[{ value: "", label: "Alle Stages" }, ...stageItems]} disabled={rowBusy || draggingId !== null} />
          <DealSelectField id="deal-product-filter" label="Produkt filtern" value={initialProduct} onValueChange={(value) => pushFilters(initialStage, value)} items={[{ value: "", label: "Alle Produkte" }, ...products.map((item) => ({ value: item.key, label: item.name }))]} disabled={rowBusy || draggingId !== null} />
        </FieldGroup>
        <p className="text-sm text-muted-foreground" role="status">{filterPending ? "Filter wird geladen…" : `${filteredDeals.length} Deals · ${eur(totalValue)}`}</p>
        <Button ref={createButton} type="button" onClick={(event) => createEntity("deal", {}, event.currentTarget)} className="sm:ml-auto" disabled={rowBusy || draggingId !== null}>
          <PlusIcon data-icon="inline-start" />Deal anlegen
        </Button>
      </div>

      {error && <Alert variant="destructive"><AlertTitle>Deal nicht verschoben</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      <p id="deal-move-help" className="text-xs text-muted-foreground">Am Griff in eine Stage ziehen, auch wenn sie leer oder eingeklappt ist. Alternativ die Stage am Deal auswählen.</p>
      <p className="sr-only" role="status">{movingId ? "Stage-Wechsel wird gespeichert." : draggingId ? "Alle Stages sind jetzt als Drop-Ziel verfügbar." : ""}</p>

      {ordered.length === 0 ? (
        <Empty className="border"><EmptyHeader><EmptyTitle>Keine Stages vorhanden</EmptyTitle><EmptyDescription>Lege in den Einstellungen zuerst die Stages deiner Pipeline an.</EmptyDescription></EmptyHeader></Empty>
      ) : visibleStages.length === 0 ? (
        <Empty className="border"><EmptyHeader><EmptyTitle>Stage nicht gefunden</EmptyTitle><EmptyDescription>Die gewählte Stage ist nicht mehr verfügbar. Wähle eine andere Stage im Filter.</EmptyDescription></EmptyHeader></Empty>
      ) : (
        <div className="flex min-w-0 flex-col gap-4" aria-label="Deal-Pipeline" aria-busy={filterPending}>
          <div className={cn(rowGrid, "hidden px-2 text-xs text-muted-foreground lg:grid")} aria-hidden="true">
            <span /><span>Deal</span><span>Firma</span><span>Kontakt</span><span>Produkt</span><span className="text-right">Wert</span><span>Abschluss</span><span>Stage</span><span />
          </div>
          {visibleStages.map((stage) => {
            const rows = groupedDeals.get(stage.key) ?? [];
            const value = rows.reduce((sum, deal) => sum + (deal.value ?? 0), 0);
            return (
              <Collapsible.Root key={stage.key} open={!collapsed.has(stage.key)} onOpenChange={(open) => setCollapsed((current) => {
                const next = new Set(current);
                if (open) next.delete(stage.key);
                else next.add(stage.key);
                return next;
              })} render={<section aria-labelledby={`stage-${stage.key}`} />} data-stage={stage.key}
                className={cn("min-w-0 rounded-lg", draggingId && "outline-1 outline-dashed outline-border", dropStage === stage.key && "bg-accent outline-2 outline-primary")}
                onDragOver={(event) => dragOver(event, stage.key)} onDrop={(event) => drop(event, stage.key)}
                onDragLeave={(event) => {
                  if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDropStage((current) => current === stage.key ? null : current);
                }}>
                <div className="flex min-w-0 flex-wrap items-center gap-2 px-1 py-1.5">
                  <h2 id={`stage-${stage.key}`} className="min-w-0">
                    <Collapsible.Trigger ref={(element) => { stageButtons.current[stage.key] = element; }} render={<Button type="button" variant="ghost" size="sm" />} className="h-auto min-h-7 max-w-full justify-start whitespace-normal">
                      <ChevronRightIcon data-icon="inline-start" className={cn(!collapsed.has(stage.key) && "rotate-90")} />
                      <Badge variant={stage.is_lost ? "destructive" : stage.is_won ? "default" : "secondary"} className="max-w-full whitespace-normal break-words">{stage.label}</Badge>
                    </Collapsible.Trigger>
                  </h2>
                  <span className="text-xs text-muted-foreground tabular-nums">{rows.length} Deals</span>
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">{eur(value)}</span>
                  {dropStage === stage.key && <span className="text-xs font-medium">Hier ablegen</span>}
                </div>
                <Collapsible.Panel>
                  {rows.length === 0 ? (
                    <Empty className="min-h-0 items-start px-10 py-3"><EmptyHeader className="items-start"><EmptyTitle>Keine Deals</EmptyTitle><EmptyDescription>{draggingId ? "Deal hier ablegen." : "Keine Deals für die aktuelle Auswahl. Hier kann ein Deal abgelegt werden."}</EmptyDescription></EmptyHeader></Empty>
                  ) : (
                    <ul className="min-w-0" aria-label={`Deals in ${stage.label}`}>
                      {rows.map((deal) => (
                        <li key={deal.id} data-deal-id={deal.id} onClick={(event) => openRow(event, deal)} aria-busy={movingId === deal.id}
                          className={cn(rowGrid, "rounded-md px-2 py-2 transition-colors hover:bg-muted/60 lg:py-1", draggingId === deal.id && "opacity-40", movingId === deal.id && "opacity-60")}>
                          <Button type="button" variant="ghost" size="icon-xs" draggable={!rowBusy} disabled={rowBusy} className="row-start-1 cursor-grab active:cursor-grabbing lg:row-auto"
                            aria-label={`Deal ${deal.name} ziehen`} aria-describedby="deal-move-help" onClick={(event) => event.stopPropagation()} onDragStart={(event) => dragStart(event, deal)} onDragEnd={(event) => finishDrag(event.timeStamp)}><GripVerticalIcon /></Button>
                          <Button data-deal-opener type="button" variant="ghost" disabled={rowBusy} className="col-start-2 row-start-1 h-auto min-h-7 min-w-0 justify-start px-0 whitespace-normal lg:col-auto lg:row-auto lg:whitespace-nowrap"
                            title={deal.name} onClick={(event) => {
                              if (!mutationPending.current && event.timeStamp >= suppressClickUntil.current) openEntity("deal", deal.id, event.currentTarget);
                            }}><span className="min-w-0 break-words text-left lg:truncate">{deal.name}</span></Button>
                          <div className="col-start-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground lg:contents">
                            <span className="max-w-full truncate" title={deal.company_name || "Keine Firma"}><span className="sr-only">Firma: </span>{deal.company_name || "Keine Firma"}</span>
                            <span className="max-w-full truncate" title={contactName(deal) || "Kein Kontakt"}><span className="sr-only">Kontakt: </span>{contactName(deal) || "Kein Kontakt"}</span>
                            <span className="max-w-full truncate" title={deal.product_name || "Kein Produkt"}><span className="sr-only">Produkt: </span>{deal.product_name || "Kein Produkt"}</span>
                            <span className="font-medium text-foreground tabular-nums lg:text-right"><span className="sr-only">Wert: </span>{eur(deal.value ?? 0)}</span>
                            <span className="max-w-full truncate tabular-nums" title={`Abschluss: ${closeDate(deal.close_date)}`}><span className="sr-only">Abschluss: </span>{closeDate(deal.close_date)}</span>
                          </div>
                          <div className="col-start-2 flex min-w-0 items-center justify-end gap-2 lg:contents">
                            <NativeSelect size="sm" className="w-[7.5rem] max-w-full" value={deal.stage} disabled={rowBusy} aria-label={`Stage für ${deal.name}`} aria-describedby="deal-move-help" onChange={(event) => { void move(deal, event.target.value); }}>
                              {stageItems.map((item) => <NativeSelectOption key={item.value} value={item.value}>{item.label}</NativeSelectOption>)}
                            </NativeSelect>
                            <Button type="button" variant="ghost" size="icon-sm" disabled={rowBusy} aria-label={`Deal ${deal.name} löschen`} onClick={(event) => {
                              if (mutationPending.current || event.timeStamp < suppressClickUntil.current) return;
                              deleteOpener.current = event.currentTarget;
                              setDeleteError(null);
                              setDeleteDeal(deal);
                            }}><Trash2Icon /></Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Collapsible.Panel>
              </Collapsible.Root>
            );
          })}
        </div>
      )}

      <Dialog open={deleteDeal !== null} onOpenChange={(open, details) => {
        if (!open) {
          if (mutationPending.current) details.cancel();
          else setDeleteDeal(null);
        }
      }} disablePointerDismissal={deleting}>
        <DialogContent showCloseButton={false} initialFocus={cancelButton} finalFocus={() => deleteOpener.current?.isConnected ? deleteOpener.current : createButton.current}>
          <DialogHeader><DialogTitle>Deal löschen?</DialogTitle><DialogDescription className="break-words">Der Deal „{deleteDeal?.name}“ wird dauerhaft gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.</DialogDescription></DialogHeader>
          {deleteError && <Alert variant="destructive"><AlertTitle>Deal nicht gelöscht</AlertTitle><AlertDescription>{deleteError}</AlertDescription></Alert>}
          <DialogFooter>
            <DialogClose render={<Button ref={cancelButton} type="button" variant="outline" disabled={deleting} />}>Abbrechen</DialogClose>
            <Button type="button" variant="destructive" disabled={deleting} onClick={() => { void remove(); }}>{deleting ? "Löscht…" : "Deal löschen"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
