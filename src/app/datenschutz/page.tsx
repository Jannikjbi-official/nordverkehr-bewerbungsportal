import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Container, PageHero } from "@/components/ui";
import { getSettings } from "@/lib/settings";
import { publicEnv } from "@/lib/env";
import { isAiConfigured } from "@/lib/ai/config";

export const metadata: Metadata = { title: "Datenschutz" };

export default function PrivacyPage() {
  return (
    <>
      <PageHero label="NORDVERKEHR // DATENSCHUTZ" title="Datenschutz" emphasis="im Bewerbungsportal." compact>
        <p>Kurz und ehrlich: welche Daten wir für Team-Bewerbungen verarbeiten, warum, wie lange – und was du tun kannst.</p>
      </PageHero>
      <Container>
        <Suspense fallback={<div className="nv-skeleton h-[40rem] max-w-3xl" />}>
          <Content />
        </Suspense>
      </Container>
    </>
  );
}

async function Content() {
  await connection();
  const s = await getSettings();
  const ai = s["ai.enabled"] && isAiConfigured();
  const main = publicEnv.mainSiteUrl;

  return (
    <article className="max-w-3xl text-fg-2 leading-relaxed [&_p]:mt-3 [&_li]:mt-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mt-3">
      <p>
        Diese Hinweise ergänzen die{" "}
        <a className="nv-link" href={`${main}/datenschutz`}>
          Datenschutzerklärung der Hauptseite
        </a>
        . Verantwortlich ist der Betreiber von Nordverkehr; Kontaktdaten findest du dort.
      </p>

      <H>Welche Daten?</H>
      <ul>
        <li>
          <strong>Discord-Login:</strong> Discord-ID, Benutzername, Anzeigename, Avatar. Wir fragen nur den Scope{" "}
          <code className="nv-kbd">identify</code> an – keine E-Mail, keine Serverliste.
        </li>
        <li>
          <strong>Server-Mitgliedschaft:</strong> Ob du auf unserem Discord bist, seit wann, und ob du eine Team-Rolle hast
          (über unseren Bot, für Zugriffskontrolle und das Team-Profil).
        </li>
        <li>
          <strong>Bewerbung:</strong> dein Alter, deine Antworten, hochgeladene Bilder (ohne Metadaten), Zeitpunkte, Status,
          Nachrichten zwischen dir und dem Team.
        </li>
        <li>
          <strong>Allgemeine Angaben:</strong> Deine Antworten auf die allgemeinen Fragen (z. B. Verfügbarkeit, Erfahrung)
          und dein Alter merken wir uns nach dem Absenden, damit du sie bei einer weiteren Bewerbung nicht neu eintippen
          musst. Du siehst sie vorausgefüllt und kannst sie jederzeit anpassen.
        </li>
        <li>
          <strong>Intern:</strong> Abstimmungen, Kommentare und Notizen des Teams, automatische Hinweise (z. B. „sehr kurze
          Antworten“) – keine automatische Bewertung oder Punktzahl.
        </li>
        <li>
          <strong>Technisch:</strong> Sicherheits-Logs (Audit-Log), Zähler für Rate Limits.
        </li>
      </ul>

      <H>Wozu und auf welcher Grundlage?</H>
      <p>
        Zur Durchführung des Bewerbungsverfahrens für das ehrenamtliche Team, auf Grundlage deiner Einwilligung (Art. 6
        Abs. 1 lit. a DSGVO), die du beim Absenden erteilst und jederzeit widerrufen kannst – z. B. indem du deine Bewerbung
        zurückziehst oder deinen Account löschst. Sicherheitsmaßnahmen (Spam-Schutz, Sperren, Audit-Log) beruhen auf unserem
        berechtigten Interesse (Art. 6 Abs. 1 lit. f DSGVO).
      </p>

      <H>Mindestalter &amp; Jugendschutz</H>
      <p>
        Team-Bewerbungen sind erst ab {s["applications.minAge"]} Jahren möglich. Wir fragen dein Alter ab und nehmen jüngere
        Bewerbungen nicht an.
      </p>

      <H>Wer bekommt die Daten?</H>
      <ul>
        <li>Das Nordverkehr-Team mit der entsprechenden Discord-Rolle.</li>
        <li>
          <strong>Discord</strong> (Discord Inc., USA): Bestätigungen und Antworten schicken wir dir per Direktnachricht über
          unseren Bot.
        </li>
        <li>
          <strong>Anthropic</strong> (Anthropic PBC, USA) –{" "}
          {ai ? <strong>derzeit aktiv</strong> : <strong>derzeit deaktiviert</strong>}: Wenn die KI-Unterstützung
          eingeschaltet ist, kann das Team Inhalte deiner Bewerbung (Position und Antworttexte – nicht dein Name, deine
          Discord-ID oder Bilder) an die Claude-API von Anthropic senden, um Zusammenfassungen, Vorschläge für Rückfragen
          und Hinweise auf Auffälligkeiten zu erstellen. Die KI trifft keine Entscheidungen über deine Bewerbung; das
          entscheiden ausschließlich Menschen aus dem Team. Außerdem werden neue Bewerbungen automatisch in beschreibende Kategorien eingeordnet (z. B.
          „Rückfrage nötig“). Für den internen Bewertungsbogen gibt die KI zusätzlich eine <strong>Einschätzung mit Punkten</strong> (1–5)
          zu festen Kriterien wie Kommunikation, Erfahrung oder Umgang mit Szenarien ab, jeweils mit kurzer Begründung. Diese Punkte
          sind nur eine Orientierung für das Team: Sie werden nicht mit den Bewertungen der Teammitglieder verrechnet, es gibt kein
          Ranking zwischen Bewerbern, und über deine Bewerbung entscheidet immer ein Mensch (keine automatisierte Entscheidung im
          Sinne von Art. 22 DSGVO). Du kannst jederzeit Auskunft über die Einschätzung verlangen (Datenexport).
          {s["ai.autoReplyEnabled"] && (
            <>
              {" "}
              Wenn du dem Team im Portal schreibst und gerade niemand online ist, kann eine automatische, klar
              gekennzeichnete KI-Antwort kommen; dafür wird deine Nachricht (ohne Namen/IDs) zusammen mit Position und
              Status an Anthropic übermittelt.
            </>
          )}{" "}
          Anthropic verarbeitet die Daten als Auftragsverarbeiter und nutzt API-Daten nicht zum Training. Die
          Übermittlung in die USA erfolgt auf Basis des EU-US Data Privacy Framework bzw. der EU-Standardvertragsklauseln.
        </li>
        <li>
          <strong>Vercel</strong> (Vercel Inc., USA) – Hosting des Portals: Beim Aufruf verarbeitet Vercel technisch nötige
          Daten (z. B. IP-Adresse, Zeitpunkt, aufgerufene Seite) in Server-Logs und leitet Anfragen an die Anwendung
          weiter. Vercel ist unser Auftragsverarbeiter.
        </li>
        <li>
          <strong>MongoDB Atlas</strong> (MongoDB, Inc., USA) – Datenbank: Hier liegen alle Inhalte des Portals (Account,
          Bewerbungen, Nachrichten, Bilder). Die Datenbank wird in einem Rechenzentrum in der EU betrieben; MongoDB ist
          unser Auftragsverarbeiter.
        </li>
      </ul>
      <p>
        Mit allen genannten Dienstleistern bestehen Verträge zur Auftragsverarbeitung bzw. entsprechende Vereinbarungen.
        Soweit Daten in die USA übermittelt werden (Discord, Anthropic, Vercel, ggf. Support-Zugriffe von MongoDB),
        erfolgt dies auf Grundlage des EU-US Data Privacy Framework bzw. der EU-Standardvertragsklauseln.
      </p>

      <H>Wie lange?</H>
      <ul>
        <li>Nicht abgeschickte Entwürfe: {s["retention.draftDays"]} Tage nach der letzten Änderung</li>
        <li>Zurückgezogene Bewerbungen: {s["retention.withdrawnDays"]} Tage</li>
        <li>Abgelehnte Bewerbungen: {s["retention.rejectedDays"]} Tage nach der Entscheidung (für die Sperrfrist)</li>
        <li>Angenommene Bewerbungen: {s["retention.acceptedDays"]} Tage nach der Entscheidung</li>
        <li>Gespeicherte allgemeine Angaben: bis keine eingereichte Bewerbung mehr von dir gespeichert ist</li>
        <li>Audit-Log: {s["retention.auditDays"]} Tage</li>
      </ul>
      <p>Die Löschung läuft automatisch.</p>

      <H>Deine Rechte</H>
      <p>
        Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch sowie
        auf Beschwerde bei einer Datenschutz-Aufsichtsbehörde. Export und Löschung kannst du direkt selbst unter{" "}
        <a className="nv-link" href="/konto">
          Konto &amp; Daten
        </a>{" "}
        erledigen.
      </p>

      <H>Cookies</H>
      <p>
        Wir setzen nur technisch notwendige Cookies für den Login (Sitzung, CSRF-Schutz). Die Wahl zwischen hellem und
        dunklem Design speichert dein Browser lokal. Kein Tracking, keine Werbung.
      </p>
    </article>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display text-2xl mt-10 mb-3 text-fg">{children}</h2>;
}
