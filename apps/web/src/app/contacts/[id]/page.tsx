import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { getSession } from "@/lib/server-auth";
import { asList, type Activity, type Contact } from "@/lib/types";
import { ContactTimeline } from "./contact-timeline";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kontakt-Detail" };

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
    contact =
      contactData && typeof contactData === "object" && "contact" in contactData
        ? (contactData as { contact: Contact }).contact
        : (contactData as Contact);
    activities = asList<Activity>(activitiesData, "activities");
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) missing = true;
    else
      error =
        e instanceof ApiError
          ? `API-Fehler ${e.status}: ${e.code}`
          : "API nicht erreichbar. Läuft apps/api auf Port 3100?";
  }

  if (missing || (!contact && !error)) notFound();

  return (
    <div className="page page-narrow">
      <p className="small" style={{ marginBottom: 12 }}>
        <Link href="/contacts" prefetch={false}>
          ← Alle Kontakte
        </Link>
      </p>
      {error || !contact ? (
        <div className="error-box">
          <strong>Fehler beim Laden</strong>
          <p>{error ?? "Keine Daten."}</p>
        </div>
      ) : (
        <div className="stack">
          <div className="page-head" style={{ marginBottom: 0 }}>
            <h1>
              {contact.first_name} {contact.last_name}
            </h1>
            <span className="badge">{contact.status}</span>
          </div>

          <div className="card">
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2" style={{ margin: 0 }}>
              {(
                [
                  ["Titel", contact.title],
                  ["E-Mail", contact.email],
                  ["Telefon", contact.phone],
                  ["Firma", String(contact.company_name ?? "")],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="small muted">{label}</dt>
                  <dd style={{ margin: 0 }}>{value || "—"}</dd>
                </div>
              ))}
            </dl>
          </div>

          <h2 style={{ fontSize: 18, margin: "8px 0 0" }}>Timeline</h2>
          <ContactTimeline entityId={contact.id} initialActivities={activities} />
        </div>
      )}
    </div>
  );
}
