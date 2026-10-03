import { ArrowLeft } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch, ApiError } from "@/lib/api";
import { getSession } from "@/lib/server-auth";
import { asList, type Activity, type Contact } from "@/lib/types";
import { ContactTimeline } from "./contact-timeline";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kontakt-Detail" };

const STATUS_LABELS = { lead: "Lead", active: "Aktiv", inactive: "Inaktiv", churned: "Abgewandert" };

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/sign-in?redirect=%2Fcontacts");
  const { id } = await params;

  let contact: Contact | null = null;
  let activities: Activity[] = [];
  let error: string | null = null;
  let missing = false;

  try {
    const jar = await cookies();
    const cookie = jar.toString();
    const enc = encodeURIComponent(id);
    const [contactData, activitiesData] = await Promise.all([
      apiFetch<Contact | { contact: Contact }>(`/v1/contacts/${enc}`, { cookie }),
      apiFetch<unknown>(`/v1/activities?entity_type=contact&entity_id=${enc}`, { cookie }),
    ]);
    contact = contactData && typeof contactData === "object" && "contact" in contactData ? (contactData as { contact: Contact }).contact : (contactData as Contact);
    activities = asList<Activity>(activitiesData, "activities");
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) missing = true;
    else error = e instanceof ApiError ? `API-Fehler ${e.status}: ${e.code}` : "API nicht erreichbar. Läuft apps/api auf Port 3100?";
  }

  if (missing || (!contact && !error)) notFound();

  return (
    <div className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <div><Link href="/contacts" prefetch={false} className={buttonVariants({ variant: "ghost", size: "sm" })}><ArrowLeft data-icon="inline-start" />Alle Kontakte</Link></div>
      {error || !contact ? (
        <Alert variant="destructive"><AlertTitle>Fehler beim Laden</AlertTitle><AlertDescription>{error ?? "Keine Daten."}</AlertDescription></Alert>
      ) : (
        <>
          <header className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="min-w-0 break-words text-2xl font-semibold tracking-tight">{contact.first_name} {contact.last_name}</h1>
            <Badge variant="secondary">{STATUS_LABELS[contact.status] ?? contact.status}</Badge>
          </header>
          <Card>
            <CardHeader>
              <CardTitle><h2>Kontaktinformationen</h2></CardTitle>
              <CardDescription>Position, Kontaktdaten und zugeordnete Firma.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {([
                  ["Titel", contact.title],
                  ["E-Mail", contact.email],
                  ["Telefon", contact.phone],
                  ["Firma", String(contact.company_name ?? "")],
                ] as const).map(([label, value]) => (
                  <div key={label} className="flex min-w-0 flex-col gap-1">
                    <dt className="text-sm text-muted-foreground">{label}</dt>
                    <dd className="break-words text-sm">{value || "—"}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
          <section className="flex min-w-0 flex-col gap-4" aria-labelledby="contact-timeline-title">
            <h2 id="contact-timeline-title" className="text-lg font-semibold tracking-tight">Timeline</h2>
            <ContactTimeline key={contact.id} entityId={contact.id} initialActivities={activities} />
          </section>
        </>
      )}
    </div>
  );
}
