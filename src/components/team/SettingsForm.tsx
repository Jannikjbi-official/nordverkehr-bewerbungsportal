"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle, FloppyDisk, XCircle } from "@phosphor-icons/react/ssr";
import { saveSettingsAction } from "@/app/actions/admin";
import { DiscordPreview } from "@/components/team/DiscordPreview";
import { PLACEHOLDERS, renderTemplate } from "@/lib/messages/placeholders";
import type { Settings } from "@/lib/settings";
import { DELIVERY_KINDS } from "@/lib/night";

export type SettingsSection = "uebersicht" | "discord" | "bewerbungen" | "zustellung" | "ki" | "daten";

interface Props {
  /** Nur diesen Bereich zeigen (Admin-Bereich). Ohne Angabe: alles */
  section?: SettingsSection;
  settings: Settings;
  env: Record<"bot" | "guild" | "teamRole" | "adminRole" | "logChannel" | "anthropic", boolean>;
  spend: string;
  spendMicro: number;
}

const SAMPLE = {
  name: "Jonas",
  discord_tag: "@jonas.hh",
  position: "Support",
  bewerbungs_id: "NV-2026-0042",
  datum: "11. November 2026",
  dashboard_link: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://bewerbung.nordverkehr.xyz"}/dashboard`,
};

export function SettingsForm({ section, settings, env, spend, spendMicro }: Props) {
  const show = (sec: SettingsSection) => !section || section === sec;
  const router = useRouter();
  const [s, setS] = useState<Settings>(settings);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Liegt die Changelog-Uhrzeit in der Nachtruhe (und Changelog wird nachts zurückgehalten)?
  const clDuringNight = (() => {
    if (!s["night.enabled"] || !s["night.held"].includes("changelog")) return false;
    const min = (t: string) => Number(t.split(":")[0]) * 60 + Number(t.split(":")[1]);
    const [st, en, at] = [min(s["night.start"]), min(s["night.end"]), min(s["changelog.publishTime"])];
    return st < en ? at >= st && at < en : st !== en && (at >= st || at < en);
  })();
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((x) => ({ ...x, [k]: v }));
  // JSON-Vergleich: Listen (z. B. night.held) sind bei jeder Änderung neue Objekte
  const changed = (Object.keys(s) as (keyof Settings)[]).filter((k) => JSON.stringify(s[k]) !== JSON.stringify(settings[k]));

  function save() {
    setMsg(null);
    const patch = Object.fromEntries(changed.map((k) => [k, s[k]]));
    start(async () => {
      const res = await saveSettingsAction(patch);
      setMsg(res.ok ? { ok: true, text: "Gespeichert." } : { ok: false, text: res.error });
      if (res.ok) router.refresh();
    });
  }

  const num = (k: keyof Settings, label: string, help?: string, step = 1) => (
    <div>
      <label htmlFor={k} className="nv-field-label">
        {label}
      </label>
      <input id={k} type="number" step={step} className="nv-input" value={String(s[k])} onChange={(e) => set(k, Number(e.target.value) as never)} />
      {help && <p className="nv-help mt-1">{help}</p>}
    </div>
  );
  const channelField = (k: keyof Settings, label: string) => (
    <div>
      <label htmlFor={k} className="nv-field-label">
        {label}
      </label>
      <input
        id={k}
        className="nv-input font-mono text-sm"
        inputMode="numeric"
        maxLength={25}
        placeholder="Kanal-ID (leer = aus)"
        value={String(s[k])}
        onChange={(e) => set(k, e.target.value.replace(/\D/g, "") as never)}
      />
    </div>
  );
  const toggle = (k: keyof Settings, label: string, help?: string) => (
    <label className="flex items-start gap-3 cursor-pointer">
      <input type="checkbox" className="nv-check" checked={!!s[k]} onChange={(e) => set(k, e.target.checked as never)} />
      <span>
        <span className="text-sm font-medium">{label}</span>
        {help && <span className="block nv-help">{help}</span>}
      </span>
    </label>
  );
  const budget = s["ai.monthlyBudgetUsd"] * 1_000_000;
  const pct = budget > 0 ? Math.min(100, Math.round((spendMicro / budget) * 100)) : 100;

  return (
    <div className={`space-y-6 ${section === "uebersicht" ? "" : "pb-24"}`}>
      {show("uebersicht") && (
      <Card title="Systemstatus" desc="Wird über die .env konfiguriert (nicht hier änderbar).">
        <ul className="grid gap-2 sm:grid-cols-2 text-sm">
          {[
            ["bot", "Discord-Bot-Token"],
            ["guild", "DISCORD_GUILD_ID"],
            ["teamRole", "TEAM_ROLE_ID"],
            ["adminRole", "ADMIN_ROLE_ID"],
            ["logChannel", "Fallback Bot-Log (DISCORD_LOG_CHANNEL_ID, optional)"],
            ["anthropic", "ANTHROPIC_API_KEY"],
          ].map(([k, l]) => (
            <li key={k} className="flex items-center gap-2">
              {env[k as keyof Props["env"]] ? (
                <CheckCircle size={18} weight="fill" className="text-[var(--tone-success)]" aria-label="gesetzt" />
              ) : (
                <XCircle size={18} weight="fill" className="text-[var(--tone-danger)]" aria-label="fehlt" />
              )}
              {l}
            </li>
          ))}
        </ul>
      </Card>
      )}

      {show("bewerbungen") && (
      <Card title="Bewerbungen" desc="Regeln für alle Stellen. Mindestalter und Sperrfrist lassen sich pro Stelle überschreiben (Positionen & Fragen).">
        <div className="grid gap-4 sm:grid-cols-2">
          {num("applications.minAge", "Mindestalter", "Pro Position überschreibbar.")}
          {num("applications.cooldownDays", "Sperrfrist nach Ablehnung (Tage)", "0 = keine Sperrfrist. Pro Position überschreibbar.")}
          <div>
            <label htmlFor="pt" className="nv-field-label">
              Ungefähre Bearbeitungszeit
            </label>
            <input id="pt" className="nv-input" maxLength={80} value={s["applications.processingTime"]} onChange={(e) => set("applications.processingTime", e.target.value)} />
            <p className="nv-help mt-1">Platzhalter {"{bearbeitungszeit}"}.</p>
          </div>
          {num("applications.minFillSeconds", "Mindest-Ausfüllzeit (Sekunden)", "Spam-Schutz: schnellere Absendungen werden abgewiesen.")}
          {num("applications.minDiscordAccountDays", "Hinweis bei jungen Discord-Accounts (Tage)", "Nur Hinweis für das Team, keine Sperre.")}
        </div>
        <div className="mt-4 space-y-3">
          {toggle("applications.claimNotice", "Bewerber erfahren, wer sie betreut", "Übernimmt ein Teammitglied eine Bewerbung (auch per Discord-Knopf oder automatischer Zuteilung), bekommt der Bewerber eine kurze Nachricht im Portal und per DM mit dem Namen.")}
          {toggle("applications.amendEnabled", "Bewerber dürfen Antworten nachreichen", "Textantworten ergänzen oder korrigieren, solange noch niemand aus dem Team die Bewerbung übernommen hat. Das Team sieht „nachgereicht“, KI-Einordnung und Hinweise werden neu berechnet.")}
          {toggle("applications.queueInfo", "Warteschlange & Bearbeitungszeit für Bewerber", "Im Dashboard: „Du bist Nr. 4 von 9 – erste Sichtung dauert gerade etwa 2 Tage“ (echte Werte der letzten 90 Tage).")}
        </div>
      </Card>
      )}

      {show("discord") && (
      <Card title="Discord" desc="Kanäle und Funktionen des Bots. Kanal leer lassen = diese Posts aus.">
        <div className="space-y-3">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {channelField("discord.jobsChannelId", "Kanal: Stellenaufruf")}
            {channelField("discord.spotlightChannelId", "Kanal: Einzelaufrufe")}
            {channelField("discord.applicationsChannelId", "Kanal: neue Bewerbungen")}
            {channelField("discord.botLogChannelId", "Kanal: Bot-Logs")}
            {channelField("discord.changelogChannelId", "Kanal: Changelog")}
            {channelField("discord.summaryChannelId", "Kanal: Teamchat (Übersicht)")}
            {channelField("discord.leadChannelId", "Kanal: Leitungs-Chat")}
          </div>
          <p className="nv-help">Rechtsklick auf den Kanal in Discord → „Kanal-ID kopieren“ (Entwicklermodus). Der Bot braucht dort „Nachrichten senden“ und „Links einbetten“.</p>
          {toggle("discord.logChannelEnabled", "Neue Bewerbungen im Bewerbungs-Kanal posten")}
          {toggle("discord.botLogEnabled", "Bot-Logs posten", "Statuswechsel, Claims, Team-Nachrichten, Antworten von Bewerbern und Zustellfehler.")}
          {toggle("discord.jobsAutoUpdate", "Stellenaufruf automatisch aktualisieren", "Ändert sich eine Position (Status, Texte), bearbeitet der Bot seine Posts (Gesamt- und Einzelaufrufe) – kein neuer Post.")}
          {toggle("discord.changelogEnabled", "Neue Changelog-Einträge posten", "Jeder Eintrag wird genau einmal gepostet, sobald er veröffentlicht ist.")}
          <div id="changelog" className="grid gap-4 sm:grid-cols-[180px_1fr] items-start">
            <div>
              <label htmlFor="cl-time" className="nv-field-label">
                Changelog veröffentlichen um
              </label>
              <input id="cl-time" type="time" className="nv-input" value={s["changelog.publishTime"]} onChange={(e) => set("changelog.publishTime", e.target.value)} />
            </div>
            <p className="nv-help sm:mt-7">
              Deutsche Zeit. 00:00 = um Mitternacht, wenn der Tag vorbei ist. Andere Uhrzeit (z. B. 20:00) = am selben Tag um diese Uhrzeit. Dann erscheint der Eintrag im
              Team-Bereich und geht mit den Tagesaufgaben in den Changelog-Kanal (erster Aufruf im Team-Bereich ab 8 Uhr). Sofort geht es über „Jetzt veröffentlichen“ in der Admin-Übersicht.
              {clDuringNight && (
                <span className="block mt-1 text-amber-500">
                  Hinweis: {s["changelog.publishTime"]} liegt in der Nachtruhe – der Discord-Post kommt erst um {s["night.end"]} Uhr (im Portal sofort).
                </span>
              )}
            </p>
          </div>
          {toggle(
            "discord.claimButton",
            "Knopf „Übernehmen“ an neuen Bewerbungen",
            "Teammitglieder claimen direkt in Discord. Einmalig oben unter „Discord-Zustellung prüfen“ mit „Knopf ‚Übernehmen‘ einrichten“ freischalten.",
          )}
          {toggle(
            "discord.threadPerApplication",
            "Thread pro Bewerbung im Bewerbungs-Kanal",
            "Der Bot startet an jeder neuen Bewerbung einen Thread („NV-2026-0001 · Support“) zum Diskutieren und archiviert ihn beim Abschluss. Braucht im Kanal „Öffentliche Threads erstellen“.",
          )}
          {s["discord.threadPerApplication"] && toggle("discord.threadMirrorComments", "Interne Kommentare in den Thread spiegeln", "Kommentare aus dem Portal erscheinen zusätzlich im Thread (nur Portal → Discord).")}
          {toggle("discord.autoRoleOnAccept", "Bei Annahme automatisch die Rolle der Position vergeben", "Rolle pro Position unter „Positionen & Fragen“ eintragen. Der Bot braucht „Rollen verwalten“ und muss über der Rolle stehen.")}
          {s["discord.autoRoleOnAccept"] && (
            <div className="grid gap-4 sm:grid-cols-2 pl-1">
              <div>
                <label htmlFor="extra-roles" className="nv-field-label">
                  Zusätzliche Rollen bei Annahme
                </label>
                <input
                  id="extra-roles"
                  className="nv-input font-mono text-sm"
                  inputMode="numeric"
                  placeholder="z. B. allgemeine Team-Rolle"
                  value={s["discord.acceptExtraRoleIds"]}
                  onChange={(e) => set("discord.acceptExtraRoleIds", e.target.value)}
                />
                <p className="nv-help mt-1">Rollen-IDs, durch Komma getrennt. Gilt für alle Stellen. Namens-Präfix (z. B. „[Support]“) pro Stelle.</p>
              </div>
              {toggle("discord.revertOnUnaccept", "Annahme zurückgenommen → Rollen & Präfix entfernen", "Wenn eine angenommene Bewerbung wieder auf „In Prüfung“ oder „Gespräch“ geht.")}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
            {channelField("discord.welcomeChannelId", "Kanal: Willkommensgruß bei Annahme")}
            <div>
              <label htmlFor="welcome" className="nv-field-label">
                Willkommensgruß
              </label>
              <textarea id="welcome" className="nv-input text-sm !min-h-16" rows={2} maxLength={1000} value={s["discord.welcomeMessage"]} onChange={(e) => set("discord.welcomeMessage", e.target.value)} />
              <p className="nv-help mt-1">Platzhalter: {"{mention}"} (pingt nur die neue Person), {"{name}"}, {"{stelle}"}. Kanal leer = kein Gruß.</p>
            </div>
          </div>
        </div>
      </Card>

      )}

      {show("zustellung") && (
      <Card title="Team, Übersicht & Erinnerungen" desc="Was der Bot morgens ans Team schickt, wie neue Bewerbungen verteilt werden und wann er an Liegengebliebenes erinnert.">
        <div className="space-y-3">
          {toggle(
            "discord.dailySummaryEnabled",
            "Tägliche Team-Übersicht im Teamchat",
            "Einmal am Tag beim ersten Aufruf im Team-Bereich ab 8 Uhr: Gespräche heute, unbeantwortete Nachrichten, liegengebliebene Bewerbungen, offene Rückzüge. Ist nichts zu tun, kommt kein Post.",
          )}
          {toggle(
            "team.personalDigestEnabled",
            "Persönliche Morgen-DM an Betreuer",
            "Wer Bewerbungen geclaimt hat, bekommt morgens eine kurze DM mit seinen offenen Punkten (nur wenn etwas ansteht). Jeder kann sie unter „Konto“ abschalten.",
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {num("team.staleDays", "„Liegengeblieben“ ab (Tagen)", "So lange ohne Statuswechsel, Nachricht oder Kommentar vom Team.")}
            {num("team.escalateDays", "Leitung informieren ab (Tagen)", "Dann kommt zusätzlich ein Hinweis in den Leitungs-Chat (leere Kanal-ID = aus).")}
            <div>
              <label htmlFor="junior" className="nv-field-label">
                Junior-Rollen (nur lesen, kommentieren, bewerten)
              </label>
              <input id="junior" className="nv-input font-mono text-sm" inputMode="numeric" placeholder="Rollen-IDs, durch Komma getrennt" value={s["team.juniorRoleIds"]} onChange={(e) => set("team.juniorRoleIds", e.target.value)} />
              <p className="nv-help mt-1">Wer eine dieser Rollen hat (und kein Admin ist), kann keinen Status ändern, nicht claimen und Bewerbern nicht schreiben – auch nicht per Discord-Knopf.</p>
            </div>
            {num("team.claimNudgeDays", "Claim-Erinnerung nach (Tagen)", "Übernommen, aber seitdem nichts passiert? Der Betreuer bekommt einmal eine DM (bearbeiten oder freigeben). 0 = aus.")}
            {num("applications.draftReminderDays", "Erinnerung an Entwürfe nach (Tagen)", "Einmalige DM mit Link zum Weitermachen. 0 = aus.")}
            {num("followup.reminderDays", "Rückfrage: Erinnerung nach (Tagen)", "Hat das Team „Antwort erwartet“ markiert, erinnert der Bot den Bewerber einmal. 0 = aus.")}
            {num("followup.closeDays", "Rückfrage: „schließen?“ nach (Tagen)", "Dann steht die Bewerbung in der Team-Übersicht unter „Keine Antwort – schließen?“.")}
          </div>
          {toggle(
            "team.autoAssign",
            "Neue Bewerbungen automatisch zuteilen",
            "An das aktive Teammitglied (letzte 14 Tage im Team-Bereich) mit den wenigsten offenen Bewerbungen – unter Beachtung der zuständigen Rollen pro Stelle. Die Auslastung steht im Team-Dashboard.",
          )}
        </div>
      </Card>
      )}

      {show("zustellung") && (
      <Card title="Störungs-Alarm & Wochenbericht" desc="Meldungen an die Leitung (Leitungs-Chat, sonst Bot-Log bzw. Teamchat).">
        <div className="space-y-3">
          {toggle("alerts.enabled", "Störungs-Alarm", "Warnt mit den Tagesaufgaben, wenn in den letzten 24 Stunden viele Zustellungen fehlgeschlagen sind. Höchstens einmal pro Tag.")}
          <div className="grid gap-4 sm:grid-cols-2">{num("alerts.failedThreshold", "Alarm ab fehlgeschlagenen Zustellungen (24 h)")}</div>
          {toggle("report.weeklyEnabled", "Wochenbericht montags", "Eingänge, Annahmequote, Bearbeitungszeit, häufigste Absagegründe und Feedback der letzten 7 Tage. Testen: Admin-Bereich → Discord → „Wochenbericht jetzt senden“.")}
        </div>
      </Card>
      )}

      {show("zustellung") && (
      <Card title="Nachtruhe" desc="Wenn das Team schläft (deutsche Zeit). Der Bot antwortet Bewerbern, Unwichtiges wartet bis morgens – Wichtiges geht immer sofort raus.">
        <div className="space-y-4">
          {toggle("night.enabled", "Nachtruhe aktiv")}
          <div className="grid gap-4 grid-cols-2 sm:max-w-sm">
            <div>
              <label htmlFor="night-start" className="nv-field-label">
                Von
              </label>
              <input id="night-start" type="time" className="nv-input" value={s["night.start"]} onChange={(e) => set("night.start", e.target.value)} disabled={!s["night.enabled"]} />
            </div>
            <div>
              <label htmlFor="night-end" className="nv-field-label">
                Bis
              </label>
              <input id="night-end" type="time" className="nv-input" value={s["night.end"]} onChange={(e) => set("night.end", e.target.value)} disabled={!s["night.enabled"]} />
            </div>
          </div>
          {s["night.enabled"] && (
            <>
              {toggle(
                "night.aiReply",
                "KI antwortet nachts auf Bewerber",
                "Auch wenn die Auto-Antwort tagsüber aus ist oder jemand aus dem Team noch als online gilt. Ohne KI (aus/kein Budget) kommt eine feste Antwort.",
              )}
              {toggle("night.portalNotice", "Hinweis für Bewerber im Portal", `„Nachtruhe – das Team antwortet ab ${s["night.end"]} Uhr.“ über dem Antwortfeld im Bewerber-Dashboard.`)}
              <div>
                <p className="nv-field-label">Was passiert nachts mit …</p>
                <div className="nv-scroll-x">
                  <table className="nv-table w-full text-sm min-w-[520px]">
                    <thead>
                      <tr>
                        <th scope="col">Art</th>
                        <th scope="col">An</th>
                        <th scope="col">Nachts</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>
                          <span className="font-medium">Bestätigung, Auto-Antworten, Rollen</span>
                          <span className="block text-xs text-muted">Direkte Reaktion auf den Bewerber – nicht änderbar.</span>
                        </td>
                        <td className="text-muted">Bewerber</td>
                        <td className="text-[var(--tone-success)]">immer sofort</td>
                      </tr>
                      {DELIVERY_KINDS.map((k) => {
                        const held = s["night.held"].includes(k.key);
                        return (
                          <tr key={k.key}>
                            <td>
                              <span className="font-medium">{k.label}</span>
                              <span className="block text-xs text-muted">{k.desc}</span>
                            </td>
                            <td className="text-muted whitespace-nowrap">{k.to === "team" ? "Team" : "Bewerber"}</td>
                            <td>
                              <div className="inline-flex rounded-lg border border-line p-0.5" role="group" aria-label={`${k.label} nachts`}>
                                {[false, true].map((h) => (
                                  <button
                                    key={String(h)}
                                    type="button"
                                    aria-pressed={held === h}
                                    className={`nv-btn nv-btn-sm !py-1 ${held === h ? "bg-red-soft text-fg" : "nv-btn-quiet"}`}
                                    onClick={() => set("night.held", (h ? [...s["night.held"].filter((x) => x !== k.key), k.key] : s["night.held"].filter((x) => x !== k.key)) as never)}
                                  >
                                    {h ? "warten" : "sofort"}
                                  </button>
                                ))}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="nv-help mt-2">
                  „warten“ = geht gesammelt zum Ende der Nachtruhe raus (ab {s["night.end"]} Uhr, sobald danach jemand den Team-Bereich benutzt – es gibt keine Läufe im Hintergrund).
                  Gesprächserinnerungen gehen immer sofort raus, wenn das Gespräch vor Ende der Nachtruhe ist.
                </p>
              </div>
            </>
          )}
        </div>
      </Card>
      )}

      {show("bewerbungen") && (
      <Card title="Einarbeitung" desc="Checkliste und Probezeit für angenommene Bewerbungen.">
        <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
          <div>
            <label htmlFor="onb-items" className="nv-field-label">
              Checkliste (ein Punkt pro Zeile)
            </label>
            <textarea id="onb-items" className="nv-input text-sm !min-h-40" maxLength={2000} value={s["onboarding.items"]} onChange={(e) => set("onboarding.items", e.target.value)} />
            <p className="nv-help mt-1">Häkchen hängen am Text – benennst du einen Punkt um, gilt er bei bestehenden Teammitgliedern als offen.</p>
          </div>
          {num("onboarding.probationDays", "Probezeit (Tage)", "0 = keine Probezeit.")}
        </div>
      </Card>
      )}

      {show("bewerbungen") && (
      <Card title="Gesprächstermine" desc="Was rund um einen festen oder gebuchten Gesprächstermin passiert.">
        <div className="space-y-3">
          {num(
            "interview.minStars",
            "Phase 2 (Gespräch) erst ab … Sternen",
            "Team-Schnitt im Bewertungsbogen. Darunter (oder ohne Bewertung) geht es nicht ins Gespräch – der Status „Gespräch“ und Termine sind dann gesperrt. 0 = keine Hürde.",
            0.5,
          )}
          {toggle(
            "interview.discordEvent",
            "Gespräch als Discord-Server-Event anlegen",
            "Der Bot legt zu jedem Termin ein Event an („Bewerbungsgespräch · Support“, ohne Bewerbernamen), verschiebt es bei Änderungen und löscht es bei Absage/Abschluss. Braucht die Berechtigung „Events verwalten“. Achtung: Events sieht der ganze Server.",
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {channelField("interview.voiceChannelId", "Sprachkanal fürs Gespräch")}
            {channelField("interview.waitingRoomChannelId", "Warteraum-Sprachkanal")}
            {num("interview.teamReminderMinutes", "Erinnerung an den Betreuer (Minuten vorher)", "DM an den Betreuer vor dem Gespräch. 0 = aus. Pünktlich nur mit laufendem Worker, sonst mit den Tagesaufgaben.")}
          </div>
          <p className="nv-help">
            Sprachkanal fürs Gespräch: das Server-Event hängt daran, und mit laufendem Worker sieht das Team, wann der Bewerber im Kanal war (sonst nach 10 Minuten
            „Nicht erschienen?“). Warteraum: Kommt der Bewerber am Gesprächstag dort an, bekommt der Betreuer eine DM.
          </p>
          <p className="nv-help">Gesprächstermine als Kalender-Abo: jedes Teammitglied unter „Konto“ → „Kalender-Link erzeugen“.</p>
          <div>
            <label htmlFor="prep" className="nv-field-label">
              Seite „So läuft dein Gespräch“ (/gespraech)
            </label>
            <textarea id="prep" className="nv-input text-sm !min-h-40" maxLength={4000} value={s["interview.prepText"]} onChange={(e) => set("interview.prepText", e.target.value)} />
            <p className="nv-help mt-1">Discord-Markdown (**fett**, Listen mit „-“). Verlinkt im Dashboard beim Termin und in der Erinnerungs-DM; mit eingetragenem Warteraum gibt es einen Knopf direkt dorthin.</p>
          </div>
        </div>
      </Card>
      )}

      {show("bewerbungen") && (
      <Card title="Gesprächsprotokoll" desc="Fragen zum Abhaken im Bewerbungsgespräch. Pro Stelle eigene Vorlage möglich (Positionen & Fragen).">
        <label htmlFor="iv-q" className="nv-field-label">
          Standard-Fragen (eine pro Zeile)
        </label>
        <textarea id="iv-q" className="nv-input text-sm !min-h-40" maxLength={3000} value={s["interview.defaultQuestions"]} onChange={(e) => set("interview.defaultQuestions", e.target.value)} />
        <p className="nv-help mt-1">Notizen hängen am Fragetext – benennst du eine Frage um, bleiben alte Notizen unter „Weitere Notizen“ sichtbar.</p>
      </Card>
      )}

      {show("bewerbungen") && (
      <Card title="Automatische Bestätigung" desc="Wird direkt nach dem Absenden per DM und im Portal angezeigt.">
        <div className="grid gap-4 xl:grid-cols-2">
          <div>
            <label htmlFor="ct" className="nv-field-label">
              Text
            </label>
            <textarea id="ct" className="nv-input font-mono text-sm !min-h-72" maxLength={3500} value={s["messages.confirmationTemplate"]} onChange={(e) => set("messages.confirmationTemplate", e.target.value)} />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PLACEHOLDERS.filter((p) => ["name", "discord_tag", "position", "bewerbungs_id", "datum", "bearbeitungszeit", "dashboard_link"].includes(p.key)).map((p) => (
                <button key={p.key} type="button" className="nv-kbd hover:text-fg" title={p.label} onClick={() => set("messages.confirmationTemplate", `${s["messages.confirmationTemplate"]}{${p.key}}`)}>
                  {`{${p.key}}`}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="nv-mono mb-2">Vorschau</p>
            <DiscordPreview
              title="Bewerbung eingegangen"
              body={renderTemplate(s["messages.confirmationTemplate"], { ...SAMPLE, bearbeitungszeit: s["applications.processingTime"] }).text}
              publicId={SAMPLE.bewerbungs_id}
            />
          </div>
        </div>
      </Card>

      )}

      {show("daten") && (
      <Card title="Datenschutz & Löschfristen" desc="Der Worker löscht täglich automatisch. Entwürfe ab letzter Änderung, sonst ab Entscheidung.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {num("retention.draftDays", "Entwürfe (Tage)")}
          {num("retention.withdrawnDays", "Zurückgezogene (Tage)")}
          {num("retention.rejectedDays", "Abgelehnte (Tage)")}
          {num("retention.acceptedDays", "Angenommene (Tage)")}
          {num("retention.auditDays", "Audit-Log (Tage)")}
        </div>
      </Card>
      )}

      {show("ki") && (
      <Card title="KI-Unterstützung (Claude)" desc="Optional. Die KI schreibt nur Entwürfe und Hinweise – sie entscheidet und sendet nie selbst.">
        <div className="space-y-4">
          {toggle("ai.enabled", "KI-Funktionen aktivieren", env.anthropic ? undefined : "Achtung: Es ist kein ANTHROPIC_API_KEY gesetzt.")}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="m1" className="nv-field-label">
                Modell (Zusammenfassung, Entwürfe)
              </label>
              <input id="m1" className="nv-input font-mono text-sm" value={s["ai.model"]} onChange={(e) => set("ai.model", e.target.value)} />
            </div>
            <div>
              <label htmlFor="m2" className="nv-field-label">
                Günstiges Modell (Umformulieren, Hinweise)
              </label>
              <input id="m2" className="nv-input font-mono text-sm" value={s["ai.fastModel"]} onChange={(e) => set("ai.fastModel", e.target.value)} />
            </div>
            {num("ai.monthlyBudgetUsd", "Monatsbudget (USD)", undefined, 0.5)}
            {num("ai.requestsPerHour", "Anfragen pro Teammitglied & Stunde")}
            {num("ai.tokensPerUserPerDay", "Tokens pro Nutzer & Tag", "Gilt für Teammitglieder und Bewerber (Auto-Antworten).")}
            {num("ai.maxInputChars", "Max. Zeichen Bewerbungsinhalt pro Anfrage", "Längere Bewerbungen werden für die KI gekürzt.")}
          </div>
          {toggle("ai.autoTagEnabled", "Neue Bewerbungen automatisch einordnen (Kategorien, kein Ranking)")}
          {toggle(
            "ai.autoScoreEnabled",
            "KI-Punkte im Bewertungsbogen automatisch vergeben",
            "Nach dem Absenden bewertet die KI die Kriterien des Bewertungsbogens mit Begründung – getrennt vom Team-Schnitt, nur für Bewerbungen ab dem 12.11.2026.",
          )}
          <div>
            <p className="text-sm">
              Verbrauch diesen Monat: <strong>{spend}</strong> ({pct} % des Budgets)
            </p>
            <div className="mt-2 h-2 rounded-full bg-[var(--nv-border)] overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="KI-Budget verbraucht">
              <div className={`h-full rounded-full ${pct >= 90 ? "bg-[var(--tone-danger)]" : "bg-red"}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div>
            <label htmlFor="sp" className="nv-field-label">
              System-Prompt (Nordverkehr-Tonalität)
            </label>
            <textarea id="sp" className="nv-input text-sm !min-h-56" maxLength={8000} value={s["ai.systemPrompt"]} onChange={(e) => set("ai.systemPrompt", e.target.value)} />
            <p className="nv-help mt-1">An Anthropic werden nur Position und Antworten übermittelt – keine Namen, Discord-IDs oder Kontodaten.</p>
          </div>
        </div>
      </Card>

      )}

      {show("ki") && (
      <Card
        title="KI-Auto-Antwort an Bewerber"
        desc="Schreibt ein Bewerber im Portal und ist gerade niemand vom Team aktiv, antwortet die KI kurz und klar gekennzeichnet. Sie entscheidet nichts und verweist immer aufs Team."
      >
        <div className="space-y-4">
          {toggle("ai.autoReplyEnabled", "Auto-Antwort aktivieren", s["ai.enabled"] ? undefined : "Wirkt nur, wenn die KI-Funktionen oben aktiviert sind – sonst kommt eine feste Standardantwort.")}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {num("ai.autoReplyOfflineMinutes", "Team gilt als offline nach (Minuten)", "Ohne Aktivität im Team-Bereich.")}
            {num("ai.autoReplyMaxInputChars", "Max. Zeichen pro Bewerber-Nachricht", "Längere Nachrichten bekommen die feste Antwort.")}
            {num("ai.autoReplyMaxOutputTokens", "Max. Antwort-Tokens")}
            {num("ai.autoReplyPerUserPerDay", "Auto-Antworten pro Bewerber & Tag")}
            {num("ai.autoReplyCooldownMinutes", "Mindestabstand zwischen Auto-Antworten (Minuten)")}
          </div>
          <div className="rounded-xl border border-line p-4 text-sm text-muted space-y-1.5">
            <p className="font-semibold text-fg">Schutz vor Prompt Injection &amp; Missbrauch</p>
            <p>Nachrichten wie „vergiss alle Anweisungen“, Rollenwechsel, Fragen nach dem Prompt oder Chat-Markup werden erkannt (auch mit Leetspeak oder versteckten Zeichen). Dann antwortet keine KI, sondern ein fester Text – und die Nachricht wird im Team-Bereich markiert.</p>
            <p>Nutzertexte gehen nur in zufällig benannten Datenblöcken an die KI. Antworten werden gefiltert: keine @-Erwähnungen, nur Links auf nordverkehr.xyz, Längenlimit, Prompt-Leck-Prüfung.</p>
          </div>
        </div>
      </Card>
      )}

      {section !== "uebersicht" && (
      <div className="fixed bottom-4 inset-x-4 sm:left-auto sm:right-8 z-30 flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-[var(--nv-shadow)]">
        <span className="text-sm text-muted" aria-live="polite">
          {msg ? <span className={msg.ok ? "text-[var(--tone-success)]" : "text-[var(--tone-danger)]"}>{msg.text}</span> : changed.length ? `${changed.length} Änderung(en)` : "Keine Änderungen"}
        </span>
        <button type="button" className="nv-btn nv-btn-primary nv-btn-sm" disabled={!changed.length || pending} onClick={save}>
          <FloppyDisk size={15} aria-hidden /> {pending ? "Speichert …" : "Speichern"}
        </button>
      </div>
      )}
    </div>
  );
}

function Card({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="nv-card p-5 sm:p-6">
      <h2 className="font-semibold">{title}</h2>
      {desc && <p className="text-sm text-muted mt-1">{desc}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}
