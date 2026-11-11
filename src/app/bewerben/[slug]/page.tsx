import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ClockCountdown, Info, Prohibit } from "@phosphor-icons/react/ssr";
import { Container, Notice, formatDay } from "@/components/ui";
import { ApplicationForm } from "@/components/apply/ApplicationForm";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getFormDefinition, getPublicPosition } from "@/lib/data/positions";
import { getEligibility } from "@/lib/applications/service";
import { getSettings } from "@/lib/settings";
import { effectiveMinAge } from "@/lib/applications/rules";
import type { AnswerMap } from "@/lib/applications/form";
import { generalComplete, prefillFromProfile, type ProfileAnswers } from "@/lib/applications/profile";

export const metadata: Metadata = { title: "Bewerben", robots: { index: false } };

export default function ApplyPage({ params }: PageProps<"/bewerben/[slug]">) {
  return (
    <section className="pt-28 sm:pt-32 pb-12">
      <Container>
        <Suspense fallback={<FormSkeleton />}>
          <Apply params={params} />
        </Suspense>
      </Container>
    </section>
  );
}

async function Apply({ params }: Pick<PageProps<"/bewerben/[slug]">, "params">) {
  const { slug } = await params;
  const user = await requireUser(`/bewerben/${slug}`);
  const position = await getPublicPosition(slug);
  if (!position) notFound();

  const settings = await getSettings();
  const eligibility = await getEligibility(user.id, position, settings);

  if (!eligibility.ok) {
    return (
      <div className="mx-auto max-w-xl space-y-4 pt-10">
        <h1 className="nv-headline text-4xl">
          {position.title} <em>– gerade nicht.</em>
        </h1>
        {eligibility.code === "open_exists" && (
          <Notice tone="info" icon={Info} title={eligibility.message}>
            <Link className="nv-link" href={`/dashboard/${eligibility.applicationId}`}>
              Zum Stand deiner Bewerbung
            </Link>
          </Notice>
        )}
        {eligibility.code === "cooldown" && (
          <Notice tone="warn" icon={ClockCountdown} title={eligibility.message}>
            Du kannst dich ab dem {formatDay(eligibility.until)} wieder bewerben.
          </Notice>
        )}
        {eligibility.code === "banned" && (
          <Notice tone="danger" icon={Prohibit} title={eligibility.message}>
            {eligibility.until ? `Die Sperre läuft bis ${formatDay(eligibility.until)}.` : "Bei Fragen melde dich im Support."}
          </Notice>
        )}
        {eligibility.code === "closed" && <Notice tone="info" icon={Info} title={eligibility.message} />}
        <Link href="/" className="nv-btn nv-btn-ghost">
          Andere Positionen ansehen
        </Link>
      </div>
    );
  }

  const [sections, draft, profile] = await Promise.all([
    getFormDefinition(position),
    eligibility.draftId ? db.application.findUnique({ where: { id: eligibility.draftId } }) : null,
    db.applicantProfile.findUnique({ where: { userId: user.id }, select: { age: true, answers: true } }),
  ]);

  // Allgemeine Antworten aus der letzten Bewerbung vorausfüllen (nur leere Felder)
  const data = profile
    ? prefillFromProfile(sections, (draft?.draftData ?? {}) as AnswerMap, (profile.answers ?? {}) as ProfileAnswers).data
    : { ...((draft?.draftData ?? {}) as AnswerMap) };
  const fileIds = Object.values(data).flatMap((v) => (Array.isArray(v) ? v : []));
  const uploads = fileIds.length
    ? await db.upload.findMany({ where: { id: { in: fileIds }, ownerId: user.id }, select: { id: true, fileName: true } })
    : [];
  // Nicht mehr vorhandene Uploads aus dem Entwurf entfernen
  const valid = new Set(uploads.map((u) => u.id));
  const fileQuestions = new Set(sections.flatMap((s) => s.questions.filter((q) => q.type === "FILE").map((q) => q.id)));
  for (const [k, v] of Object.entries(data)) {
    if (fileQuestions.has(k) && Array.isArray(v)) data[k] = v.filter((id) => valid.has(id));
  }

  return (
    <ApplicationForm
      position={{ id: position.id, title: position.title, slug: position.slug }}
      sections={sections}
      minAge={effectiveMinAge(position, { minAge: settings["applications.minAge"] })}
      displayName={user.globalName || user.username}
      initial={{
        draftId: draft?.id ?? null,
        data,
        step: draft?.draftStep ?? 0,
        age: draft?.age ?? profile?.age ?? null,
        fromProfile: !!profile && generalComplete(sections, data),
      }}
      initialUploads={Object.fromEntries(uploads.map((u) => [u.id, u]))}
    />
  );
}

function FormSkeleton() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[240px_1fr]">
      <div className="nv-skeleton h-72" />
      <div className="nv-skeleton h-[32rem]" />
    </div>
  );
}
