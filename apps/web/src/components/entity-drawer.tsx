"use client";

import { ArrowLeft, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CompanyEditor, ContactEditor, DealEditor } from "@/components/entity-editors";
import { SubscriptionEditor } from "@/components/subscription-editor";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import type { EntityDefaults, EntityRecord, EntityType } from "@/lib/entity-drawer-types";
import type { Company, Contact, Deal, Subscription } from "@/lib/types";
import { useApi } from "@/lib/use-api";

export type { EntityDefaults, EntityType } from "@/lib/entity-drawer-types";

const PATHS: Record<EntityType, string> = { company: "/v1/companies", contact: "/v1/contacts", deal: "/v1/deals", subscription: "/v1/subscriptions" };
const LABELS: Record<EntityType, string> = { company: "Firma", contact: "Kontakt", deal: "Deal", subscription: "Vertrag" };

type Target = { type: EntityType; id: string | null; defaults: EntityDefaults };
type Session = Target & { token: number; version: number; record: EntityRecord | null; loading: boolean; error: string | null };
type DrawerContextValue = {
  openEntity: (type: EntityType, id: string, opener?: HTMLElement) => void;
  createEntity: (type: EntityType, defaults?: EntityDefaults, opener?: HTMLElement) => void;
  revision: number;
};
const EntityDrawerContext = createContext<DrawerContextValue | null>(null);

export function useEntityDrawer() {
  const context = useContext(EntityDrawerContext);
  if (!context) throw new Error("useEntityDrawer muss innerhalb von EntityDrawerProvider verwendet werden.");
  return context;
}

function readRecord(response: unknown, type: EntityType, expectedId: string): EntityRecord {
  if (!response || typeof response !== "object") throw new Error("Ungültige Detailantwort.");
  const record = (response as Record<string, unknown>)[type];
  if (!record || typeof record !== "object" || (record as EntityRecord).id !== expectedId) throw new Error("Die Detailantwort gehört nicht zum angeforderten Datensatz.");
  return record as EntityRecord;
}

function loadError(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) return "Dieser Datensatz existiert nicht mehr oder wurde gelöscht.";
  if (error instanceof ApiError && error.status === 401) return "Die Sitzung ist abgelaufen. Bitte melde dich erneut an.";
  return "Der Datensatz konnte nicht geladen werden. Deine Listenansicht bleibt erhalten.";
}

export function EntityDrawerProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [open, setOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [history, setHistory] = useState<Target[]>([]);
  const [confirmation, setConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);
  const current = useRef<Session | null>(null);
  const isOpen = useRef(false);
  const sequence = useRef(0);
  const dirty = useRef(false);
  const pending = useRef(false);
  const pendingAction = useRef<(() => void) | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const cancelDiscard = useRef<HTMLButtonElement>(null);

  const activate = useCallback((target: Target) => {
    const token = ++sequence.current;
    dirty.current = false;
    pending.current = false;
    setBusy(false);
    const next: Session = { ...target, token, version: 0, record: null, loading: target.id !== null, error: null };
    current.current = next;
    isOpen.current = true;
    setSession(next);
    setOpen(true);
    if (target.id === null) return;
    api<unknown>(`${PATHS[target.type]}/${encodeURIComponent(target.id)}`).then((response) => {
      if (current.current?.token !== token || !isOpen.current) return;
      const record = readRecord(response, target.type, target.id!);
      const loaded = { ...next, record, loading: false };
      current.current = loaded;
      setSession(loaded);
    }).catch((error: unknown) => {
      if (current.current?.token !== token || !isOpen.current) return;
      const failed = { ...next, loading: false, error: loadError(error) };
      current.current = failed;
      setSession(failed);
    });
  }, [api]);

  const guard = useCallback((action: () => void) => {
    if (pending.current) return;
    if (dirty.current) {
      pendingAction.current = action;
      setConfirmation(true);
      return;
    }
    action();
  }, []);

  const navigate = useCallback((target: Target, element?: HTMLElement) => {
    guard(() => {
      const previous = current.current;
      if (isOpen.current && previous) {
        if (previous.type === target.type && previous.id !== null && previous.id === target.id) return;
        setHistory((list) => [...list, { type: previous.type, id: previous.id, defaults: previous.defaults }]);
      } else {
        setHistory([]);
        opener.current = element ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      }
      activate(target);
    });
  }, [activate, guard]);

  const openEntity = useCallback((type: EntityType, id: string, element?: HTMLElement) => {
    navigate({ type, id, defaults: {} }, element);
  }, [navigate]);
  const createEntity = useCallback((type: EntityType, defaults: EntityDefaults = {}, element?: HTMLElement) => {
    navigate({ type, id: null, defaults: { ...defaults } }, element);
  }, [navigate]);
  const close = useCallback(() => guard(() => {
    isOpen.current = false;
    setOpen(false);
  }), [guard]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (isOpen.current && (dirty.current || pending.current)) event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  const token = session?.token;
  const recordName = session?.record
    ? session.type === "contact"
      ? [(session.record as Contact).first_name, (session.record as Contact).last_name].filter(Boolean).join(" ")
      : String(session.record.name ?? "")
    : "";
  useEffect(() => {
    if (token === undefined) return;
    title.current?.focus({ preventScroll: true });
    scroll.current?.scrollTo({ top: 0 });
  }, [token]);

  const context = useMemo(() => ({ openEntity, createEntity, revision }), [openEntity, createEntity, revision]);
  const callbacks = {
    onDirtyChange: (value: boolean) => { if (current.current?.token === token) dirty.current = value; },
    onBusyChange: (value: boolean) => { if (current.current?.token === token) { pending.current = value; setBusy(value); } },
    onCancel: close,
    onSaved: (record: EntityRecord) => {
      const active = current.current;
      if (!active || active.token !== token || !isOpen.current) return;
      dirty.current = false;
      pending.current = false;
      setBusy(false);
      const next = { ...active, token: ++sequence.current, id: record.id, record, version: active.version + 1 };
      current.current = next;
      setSession(next);
      setRevision((value) => value + 1);
      router.refresh();
    },
  };

  return (
    <EntityDrawerContext.Provider value={context}>
      {children}
      <Drawer open={open} swipeDirection="right" disablePointerDismissal={busy || confirmation} onOpenChange={(nextOpen, details) => {
        if (nextOpen) return;
        if (pending.current || confirmation) { details.cancel(); return; }
        if (dirty.current) { details.cancel(); close(); return; }
        isOpen.current = false;
        setOpen(false);
      }} onOpenChangeComplete={(nextOpen) => {
        if (!nextOpen && !isOpen.current) {
          current.current = null;
          dirty.current = false;
          setSession(null);
          setHistory([]);
        }
      }}>
        <DrawerContent initialFocus={title} finalFocus={() => {
          if (opener.current?.isConnected) return opener.current;
          const fallback = document.querySelector<HTMLElement>("[data-entity-drawer-focus-fallback], [data-sidebar=trigger], main");
          if (fallback && !fallback.hasAttribute("tabindex")) fallback.tabIndex = -1;
          return fallback ?? true;
        }} className="w-full max-w-full data-[swipe-axis=x]:h-dvh data-[swipe-axis=x]:w-full data-[swipe-axis=x]:sm:w-[min(42rem,100vw)]">
          <DrawerHeader className="gap-3 border-b pb-4">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="flex min-w-0 flex-col gap-1">
                <DrawerTitle ref={title} tabIndex={-1} className="break-words outline-none">{session ? `${LABELS[session.type]} ${session.id ? "bearbeiten" : "anlegen"}${recordName ? ` · ${recordName}` : ""}` : "Details"}</DrawerTitle>
                <DrawerDescription>Stammdaten und verknüpfte Datensätze. Änderungen werden erst mit Speichern übernommen.</DrawerDescription>
              </div>
              <Button type="button" variant="ghost" size="icon" disabled={busy} onClick={close} aria-label="Details schließen"><X /></Button>
            </div>
            {history.length > 0 && <Button type="button" variant="outline" size="sm" className="w-fit" disabled={busy} onClick={() => guard(() => {
              const previous = history.at(-1);
              if (!previous) return;
              setHistory((list) => list.slice(0, -1));
              activate(previous);
            })}><ArrowLeft data-icon="inline-start" />Zurück zu {LABELS[history.at(-1)!.type]}</Button>}
          </DrawerHeader>
          <div ref={scroll} className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {session?.loading && <div role="status" aria-label="Datensatz wird geladen" className="flex flex-col gap-4"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-24 w-full" /><Skeleton className="h-40 w-full" /></div>}
            {session?.error && <Alert variant="destructive"><AlertTitle>Datensatz nicht verfügbar</AlertTitle><AlertDescription className="flex flex-col gap-3"><p>{session.error}</p><Button variant="outline" type="button" className="w-fit" onClick={() => activate(session)}>Erneut laden</Button></AlertDescription></Alert>}
            {session && !session.loading && !session.error && <div key={`${session.token}:${session.version}`} className="flex min-w-0 flex-col gap-6">
              {session.type === "company" && <CompanyEditor record={session.record as Company | null} defaults={session.defaults} {...callbacks} />}
              {session.type === "contact" && <ContactEditor record={session.record as Contact | null} defaults={session.defaults} {...callbacks} />}
              {session.type === "deal" && <DealEditor record={session.record as Deal | null} defaults={session.defaults} {...callbacks} />}
              {session.type === "subscription" && <SubscriptionEditor record={session.record as Subscription | null} defaults={session.defaults} {...callbacks} />}
            </div>}
          </div>
        </DrawerContent>
        <AlertDialog open={confirmation} onOpenChange={(value) => { if (!value) { pendingAction.current = null; setConfirmation(false); } }}>
          <AlertDialogContent initialFocus={cancelDiscard} finalFocus={() => isOpen.current ? title.current : false}>
            <AlertDialogHeader><AlertDialogTitle>Änderungen verwerfen?</AlertDialogTitle><AlertDialogDescription>Die nicht gespeicherten Eingaben gehen verloren. Bereits gesendete, noch nicht bestätigte Schreibvorgänge werden dadurch nicht rückgängig gemacht.</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel ref={cancelDiscard}>Weiter bearbeiten</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => {
                const action = pendingAction.current;
                pendingAction.current = null;
                dirty.current = false;
                setConfirmation(false);
                action?.();
              }}>Verwerfen</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Drawer>
    </EntityDrawerContext.Provider>
  );
}
