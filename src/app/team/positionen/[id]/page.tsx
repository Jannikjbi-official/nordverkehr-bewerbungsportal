import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "@phosphor-icons/react/ssr";
import { PositionForm } from "@/components/team/PositionForm";
import { FormBuilder } from "@/components/team/FormBuilder";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Position bearbeiten" };

export default function PositionEditPage({ params }: PageProps<"/team/positionen/[id]">) {
  return (
    <div className="space-y-6">
      <Link href="/team/positionen" className="nv-btn nv-btn-quiet nv-btn-sm -ml-3">
        <ArrowLeft size={14} aria-hidden /> Alle Positionen
      </Link>
      <Suspense fallback={<div className="nv-skeleton h-[40rem]" />}>
        <Editor params={params} />
      </Suspense>
    </div>
  );
}

async function Editor({ params }: Pick<PageProps<"/team/positionen/[id]">, "params">) {
  await requireAdmin();
  const { id } = await params;

  if (id === "neu") {
    return (
      <>
        <h1 className="nv-headline text-4xl">
          Neue <em>Position.</em>
        </h1>
        <PositionForm position={null} />
      </>
    );
  }

  const isGeneral = id === "allgemein";
  const position = isGeneral ? null : await db.position.findUnique({ where: { id } });
  if (!isGeneral && !position) notFound();

  const applicationCount = position
    ? await db.application.count({ where: { positionId: position.id, submittedAt: { not: null }, status: { not: "WITHDRAWN" } } })
    : 0;
  const sections = await db.formSection.findMany({
    where: { positionId: isGeneral ? null : position!.id, NOT: { archived: true } },
    orderBy: { sortOrder: "asc" },
    include: { questions: { where: { archived: false }, orderBy: { sortOrder: "asc" } } },
  });
  // Alle aktiven Fragen (allgemein + alle Positionen) für die Duplikat-Warnung im Builder
  const allQuestions = await db.question.findMany({
    where: { archived: false, section: { NOT: { archived: true } } },
    select: { id: true, key: true, label: true, section: { select: { title: true, position: { select: { title: true } } } } },
  });

  return (
    <>
      <h1 className="nv-headline text-4xl">
        {isGeneral ? (
          <>
            Allgemeine <em>Fragen.</em>
          </>
        ) : (
          <>
            {position!.title} <em>bearbeiten.</em>
          </>
        )}
      </h1>
      {position && (
        <PositionForm
          position={{
            id: position.id,
            slug: position.slug,
            title: position.title,
            tagline: position.tagline,
            description: position.description,
            tasks: position.tasks,
            requirements: position.requirements,
            icon: position.icon,
            status: position.status,
            minAge: position.minAge,
            cooldownDays: position.cooldownDays,
            acceptRoleId: position.acceptRoleId,
            opensAt: position.opensAt?.toISOString() ?? null,
            closesAt: position.closesAt?.toISOString() ?? null,
            maxApplications: position.maxApplications ?? null,
            quizMinScore: position.quizMinScore ?? null,
            interviewQuestions: position.interviewQuestions ?? [],
            minProVotes: position.minProVotes ?? null,
            requireAdminApproval: !!position.requireAdminApproval,
            teamRoleIds: position.teamRoleIds ?? [],
          }}
          applicationCount={applicationCount}
        />
      )}
      <section className="space-y-3">
        <div>
          <h2 className="font-semibold text-lg">Formular-Schritte</h2>
          <p className="text-sm text-muted">
            {isGeneral
              ? "Diese Schritte sehen alle Bewerber, egal für welche Position."
              : "Diese Schritte kommen nach den allgemeinen Fragen – nur für diese Position."}{" "}
            Geänderte Fragen wirken nur auf neue Bewerbungen; eingereichte Antworten bleiben unverändert.
          </p>
        </div>
        <FormBuilder
          positionId={position?.id ?? null}
          keyPrefix={position?.slug ?? null}
          existingQuestions={allQuestions.map((q) => ({
            id: q.id,
            key: q.key,
            label: q.label,
            where: `${q.section.position?.title ?? "Allgemein"} › ${q.section.title}`,
          }))}
          sections={sections.map((s) => ({
            id: s.id,
            key: s.key,
            general: s.positionId === null,
            title: s.title,
            description: s.description,
            questions: s.questions.map((q) => ({
              id: q.id,
              key: q.key,
              label: q.label,
              helpText: q.helpText,
              placeholder: q.placeholder,
              type: q.type,
              required: q.required,
              minLength: q.minLength,
              maxLength: q.maxLength,
              minValue: q.minValue,
              maxValue: q.maxValue,
              options: q.options,
              correctOption: q.correctOption,
            })),
          }))}
        />
      </section>
    </>
  );
}
