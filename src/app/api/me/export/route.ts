import { accessErrorResponse, assertUserApi } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Datenexport (Art. 15/20 DSGVO). Enthält alle personenbezogenen Daten des
 * Nutzers. Interne Team-Inhalte (Notizen, Kommentare) werden mit ausgegeben,
 * die Identität der Teammitglieder wird dabei nicht offengelegt.
 */
export async function GET() {
  let user;
  try {
    user = await assertUserApi();
  } catch (err) {
    return accessErrorResponse(err);
  }
  const rl = await rateLimit(`export:${user.id}`, 5, 3600);
  if (!rl.ok) return Response.json({ error: "Zu viele Exporte. Bitte später erneut." }, { status: 429 });

  const full = await db.user.findUnique({
    where: { id: user.id },
    include: {
      applications: {
        include: {
          position: { select: { title: true, slug: true } },
          answers: { select: { sectionTitle: true, label: true, type: true, value: true } },
          statusChanges: { select: { from: true, to: true, createdAt: true } },
          messages: { select: { direction: true, body: true, deliveryStatus: true, createdAt: true, sentAt: true } },
          uploads: { select: { id: true, fileName: true, size: true, createdAt: true } },
          comments: { select: { body: true, createdAt: true } },
          votes: { select: { value: true, createdAt: true } },
        },
      },
      profile: { select: { age: true, answers: true, createdAt: true, updatedAt: true } },
      notesAbout: { select: { body: true, createdAt: true } },
      bansAbout: { select: { reason: true, expiresAt: true, createdAt: true, liftedAt: true } },
      suggestions: { select: { kind: true, title: true, body: true, location: true, status: true, adminNote: true, createdAt: true, updatedAt: true } },
    },
  });
  if (!full) return new Response("Nicht gefunden", { status: 404 });

  const data = {
    exportiertAm: new Date().toISOString(),
    hinweis: "Datenexport aus dem Nordverkehr-Bewerbungsportal (Art. 15 & 20 DSGVO).",
    account: {
      discordId: full.discordId,
      benutzername: full.username,
      anzeigename: full.globalName,
      discordAccountErstellt: full.discordCreatedAt,
      imPortalSeit: full.createdAt,
      letzterLogin: full.lastLoginAt,
      aufDemServer: full.inGuild,
      serverBeitritt: full.guildJoinedAt,
    },
    bewerbungen: full.applications.map((a) => ({
      bewerbungsId: a.publicId,
      position: a.position.title,
      status: a.status,
      alter: a.age,
      eingereicht: a.submittedAt,
      entschieden: a.decidedAt,
      gespraech: a.interviewAt,
      einwilligung: { version: a.consentVersion, am: a.consentAt },
      bestaetigungen: a.confirmations,
      entwurf: a.status === "DRAFT" ? a.draftData : undefined,
      antworten: a.answers,
      regelQuiz: a.quizTotal ? { richtig: a.quizCorrect, fragen: a.quizTotal } : undefined,
      statusverlauf: a.statusChanges,
      nachrichten: a.messages,
      bilder: a.uploads,
      hinweise: a.flags,
      kiZusammenfassung: a.aiSummary,
      interneKommentare: a.comments,
      abstimmungen: a.votes,
    })),
    gespeicherteAllgemeineAngaben: full.profile
      ? { alter: full.profile.age, antworten: full.profile.answers, angelegt: full.profile.createdAt, aktualisiert: full.profile.updatedAt }
      : null,
    interneNotizen: full.notesAbout,
    sperren: full.bansAbout,
    ideenUndMeldungen: full.suggestions,
  };

  await audit("user.export", { actorId: user.id, targetType: "user", targetId: user.id });
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="nordverkehr-daten-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
