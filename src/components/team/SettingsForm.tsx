"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle, FloppyDisk, XCircle } from "@phosphor-icons/react/ssr";
import { saveSettingsAction } from "@/app/actions/admin";
import { DiscordPreview } from "@/components/team/DiscordPreview";
import { PLACEHOLDERS, renderTemplate } from "@/lib/messages/placeholders";
import type { Settings } from "@/lib/settings";

interface Props {
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
  dashboard_link: "https://bewerbung.nordverkehr.xyz/dashboard",
};

export function SettingsForm({ settings, env, spend, spendMicro }: Props) {
  const router = useRouter();
  const [s, setS] = useState<Settings>(settings);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((x) => ({ ...x, [k]: v }));
  const changed = (Object.keys(s) as (keyof Settings)[]).filter((k) => s[k] !== settings[k]);

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
    <div className="space-y-6 pb-24">
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

      <Card title="Bewerbungen">
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
      </Card>

      <Card title="Discord">
        <div className="space-y-3">
          <div className="grid gap-4 sm:grid-cols-3">
            {channelField("discord.applicationsChannelId", "Kanal: neue Bewerbungen")}
            {channelField("discord.botLogChannelId", "Kanal: Bot-Logs")}
            {channelField("discord.changelogChannelId", "Kanal: Changelog")}
          </div>
          <p className="nv-help">Rechtsklick auf den Kanal in Discord → „Kanal-ID kopieren“ (Entwicklermodus). Der Bot braucht dort „Nachrichten senden“ und „Links einbetten“.</p>
          {toggle("discord.logChannelEnabled", "Neue Bewerbungen im Bewerbungs-Kanal posten")}
          {toggle("discord.botLogEnabled", "Bot-Logs posten", "Statuswechsel, Claims, Team-Nachrichten, Antworten von Bewerbern und Zustellfehler.")}
          {toggle("discord.changelogEnabled", "Neue Changelog-Einträge posten", "Jeder Eintrag wird genau einmal gepostet, sobald er live ist.")}
          {toggle("discord.autoRoleOnAccept", "Bei Annahme automatisch die Rolle der Position vergeben", "Rolle pro Position unter „Positionen & Fragen“ eintragen. Der Bot braucht „Rollen verwalten“ und muss über der Rolle stehen.")}
        </div>
      </Card>

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

      <Card title="Datenschutz & Löschfristen" desc="Der Worker löscht täglich automatisch. Entwürfe ab letzter Änderung, sonst ab Entscheidung.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {num("retention.draftDays", "Entwürfe (Tage)")}
          {num("retention.withdrawnDays", "Zurückgezogene (Tage)")}
          {num("retention.rejectedDays", "Abgelehnte (Tage)")}
          {num("retention.acceptedDays", "Angenommene (Tage)")}
          {num("retention.auditDays", "Audit-Log (Tage)")}
        </div>
      </Card>

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

      <div className="fixed bottom-4 inset-x-4 sm:left-auto sm:right-8 z-30 flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-[var(--nv-shadow)]">
        <span className="text-sm text-muted" aria-live="polite">
          {msg ? <span className={msg.ok ? "text-[var(--tone-success)]" : "text-[var(--tone-danger)]"}>{msg.text}</span> : changed.length ? `${changed.length} Änderung(en)` : "Keine Änderungen"}
        </span>
        <button type="button" className="nv-btn nv-btn-primary nv-btn-sm" disabled={!changed.length || pending} onClick={save}>
          <FloppyDisk size={15} aria-hidden /> {pending ? "Speichert …" : "Speichern"}
        </button>
      </div>
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
