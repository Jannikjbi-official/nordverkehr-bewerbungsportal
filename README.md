# Nordverkehr Bewerbungsportal

Ein Bewerbungsportal für Roleplay-Server mit Discord-Anbindung – gebaut für das Team von **Nordverkehr** (Hamburg-Roleplay), als Open Source für alle, die etwas Ähnliches brauchen.

Bewerber loggen sich mit Discord ein, füllen ein Formular in Ruhe aus und verfolgen ihren Stand im Portal und per DM. Das Team liest, bewertet, schreibt und entscheidet – im Portal oder direkt in Discord.

> **Lizenz:** [AGPL-3.0](LICENSE) · **Name und Logo „Nordverkehr“ sind nicht freigegeben** – siehe [Marke & Logo](#marke--logo).

---

## Inhalt

- [Funktionen](#funktionen)
- [Technik](#technik)
- [Schnellstart (lokal)](#schnellstart-lokal)
- [Einrichtung](#einrichtung) – Discord, Datenbank, Umgebungsvariablen, Hosting, KI
- [Für andere Server einrichten](#für-andere-server-einrichten)
- [Betrieb](#betrieb) – Cron-Jobs, Worker, Changelog & Releases
- [Sicherheit & Datenschutz](#sicherheit--datenschutz)
- [Entwicklung](#entwicklung) – Projektstruktur, Skripte, Tests
- [Mitmachen](#mitmachen)
- [Lizenz](#lizenz) · [Marke & Logo](#marke--logo)

---

## Funktionen

### Für Bewerber
- **Login mit Discord** – kein eigener Account, nur der Scope `identify`.
- **Mehrstufiges Formular** mit Autosave, Regel-Quiz und Szenario-Fragen pro Stelle; allgemeine Antworten werden fürs nächste Mal vorausgefüllt.
- **„Welche Stelle passt zu mir?“** – Selbsttest mit fünf Fragen, ohne Speicherung.
- **Dashboard:** Status mit Verlauf, Nachrichten mit dem Team, Warteschlange und Bearbeitungszeit, Antworten nachreichen, Abwesenheit melden.
- **Gespräch:** Termin selbst buchen oder absagen, Vorbereitungsseite, Erinnerung per DM.

### Für das Team
- **Übersicht** als Tabelle und Kanban, Suche in Antworten, Vergleichsansicht.
- **Bewerbung bearbeiten:** claimen, Status ändern, Nachrichten mit Bausteinen und Discord-Vorschau, interne Kommentare, Abstimmung, Bewertungsbogen (1–5 Sterne, pro Stelle anpassbar), Gesprächsprotokoll mit Nachfrage-Vorschlägen.
- **Phase 2 (Gespräch) erst ab 3 Sternen** Team-Schnitt – Grenze einstellbar.
- **Einarbeitung:** Checkliste, Probezeit mit Abschluss, Pate, Team-Verzeichnis.
- **Morgen-Übersicht** im Teamchat, persönliche Morgen-DM, Erinnerungen bei liegengebliebenen Claims, Abwesenheit, Junior-Rolle mit eingeschränkten Rechten.

### Direkt in Discord
- Post pro neuer Bewerbung mit Knöpfen **Übernehmen**, **In Prüfung**, **Zum Gespräch**.
- Bot-Log und DMs mit Knopf **Im Portal antworten** (geschrieben wird nur im Portal – spart Server-Aufrufe).
- Befehle `/bewerbung` (Bewerber), `/offen` und `/claim` (Team).
- Server-Events für Gespräche, Sprachkanal-Erkennung („Nicht erschienen?“) und Warteraum-Ping (mit Worker).
- Annahme-Automatik: Rollen, Namens-Präfix, Willkommensgruß – beim Zurücknehmen wieder entfernt.

### Für Admins
- **Admin-Bereich** mit allen Einstellungen (Discord, Ablauf, Zustellung & Nachtruhe, KI, Daten & Tests) und Systemstatus.
- **Positionen & Formular-Builder**, Kontingent („freie Plätze“), automatisches Öffnen/Schließen, Vier-Augen-Prinzip, Zuständigkeit pro Discord-Rolle.
- Statistiken, Team-Aktivität, Bewerbungsrunden, Audit-Log, Sicherung von Einstellungen und Bewerbungsdaten, Testbewerbungen.

### KI (optional, Claude)
Zusammenfassungen, Fragen-Vorschläge, beschreibende Kategorien, Punkte als Orientierung (getrennt vom Team) und kurze Auto-Antworten, wenn niemand vom Team online ist. **Die KI entscheidet nichts.** Mit Schutz vor Prompt Injection, Token-Limits und Monatsbudget. Ohne API-Key läuft das Portal vollständig.

> Die KI läuft **derzeit nur über die Claude API von Anthropic** und ist **kostenpflichtig** – Einrichtung und empfohlener Plan unter [5. KI (optional)](#5-ki-optional). Weitere KI-Anbieter und Modelle (APIs) kommen noch.

---

## Technik

Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind CSS 4 · MongoDB + Prisma 6 · Auth.js v5 (Discord) · Discord REST & Gateway · zod · Anthropic SDK · Vitest

Läuft auf **Vercel** (Serverless, Cron) mit **MongoDB Atlas** – oder komplett selbst gehostet mit **Docker**. Ein optionaler **Worker** hält die Discord-Gateway-Verbindung.

---

## Schnellstart (lokal)

```bash
npm install
cp .env.example .env          # Werte eintragen (siehe Einrichtung)
npm run db:dev                # lokale MongoDB als Replica Set (eigenes Terminal)
npm run db:push               # Schema + Indizes
npm run db:seed               # Positionen, Fragen, Bausteine, Demo-Bewerbungen
npm run dev                   # http://localhost:3000
```

**Ohne Discord-App ausprobieren:** In der `.env` `DEV_LOGIN="true"` setzen und `DISCORD_GUILD_ID` leer lassen. Auf `/login` gibt es dann einen Dev-Login für die Seed-Nutzer („Demo-Teammitglied“ hat Team- und Admin-Rechte). In Produktion ist der Dev-Login immer aus.

---

## Einrichtung

### 1. Discord-Application & Bot

1. [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**.
2. **OAuth2:** *Client ID* → `AUTH_DISCORD_ID`, *Client Secret* → `AUTH_DISCORD_SECRET`. Redirects:
   - `https://<deine-portal-domain>/api/auth/callback/discord`
   - `http://localhost:3000/api/auth/callback/discord` (Entwicklung)
3. **Bot:** *Reset Token* → `DISCORD_BOT_TOKEN`. Unter *Privileged Gateway Intents* den **Server Members Intent** aktivieren (für den Worker).
4. **Bot einladen** (*OAuth2 → URL Generator*, Scopes `bot` und `applications.commands`) mit den Rechten:
   - `View Channels`, `Send Messages`, `Embed Links`, `Create Public Threads`
   - `Manage Roles` und `Manage Nicknames` (nur für die Annahme-Automatik – die Bot-Rolle muss über den zu vergebenden Rollen stehen)
   - `Manage Events` (nur für Gespräche als Server-Event)
5. **IDs kopieren** (Entwicklermodus an): Server-ID → `DISCORD_GUILD_ID`, Team-Rolle → `TEAM_ROLE_ID`, Admin-Rolle → `ADMIN_ROLE_ID`.
6. **Knöpfe & Befehle:** Im Portal unter *Admin-Bereich → Discord* „Knopf ‚Übernehmen‘ einrichten“ (setzt die Interaktions-URL) und „Befehle registrieren“.

> Der Bot kann nur Nutzern schreiben, die mit ihm einen Server teilen und DMs zulassen. Schlägt eine DM fehl, steht die Nachricht trotzdem im Portal.

### 2. Datenbank (MongoDB Atlas)

Das Portal nutzt Transaktionen – MongoDB muss als **Replica Set** laufen. Atlas erfüllt das immer, auch der Gratis-Cluster.

- Cluster in der **EU** anlegen (z. B. Frankfurt), Nutzer mit `readWrite`, Netzwerkzugriff `0.0.0.0/0` für Vercel.
- Oder in Vercel die [MongoDB-Atlas-Integration](https://vercel.com/marketplace/mongodbatlas) nutzen.
- Das Portal akzeptiert `DATABASE_URL`, `DATABASE_URL_MONGODB_URI` und `MONGODB_URI`; ein fehlender Datenbankname wird ergänzt.
- **Ersteinrichtung:** Beim ersten Aufruf einer leeren Datenbank legt das Portal Indizes und Basisdaten (Positionen, Fragen, Bausteine – ohne Demo-Bewerbungen) selbst an. Alternativ einmalig: `npm run db:push` und `SEED_DEMO=false npm run db:seed`.

### 3. Umgebungsvariablen

Vorlage: [`.env.example`](.env.example). Die wichtigsten:

| Variable | Wofür |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Adresse des Portals (Links in DMs, Logo in Discord-Nachrichten) |
| `NEXT_PUBLIC_MAIN_SITE_URL` | Hauptseite eures Servers (Footer, erlaubte Links für die KI) |
| `NEXT_PUBLIC_DISCORD_INVITE` | Dauerhafter Einladungslink |
| `NEXT_PUBLIC_RULES_URL` | Regelwerk (optional, Standard `<Hauptseite>/regeln`) |
| `DATABASE_URL` | MongoDB-Verbindung |
| `AUTH_SECRET`, `AUTH_DISCORD_ID`, `AUTH_DISCORD_SECRET`, `AUTH_TRUST_HOST` | Login |
| `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `TEAM_ROLE_ID`, `ADMIN_ROLE_ID` | Bot & Rollen |
| `CRON_SECRET` | Schutz der Cron-Routen (zufällig, ≥ 16 Zeichen) |
| `ANTHROPIC_API_KEY` | KI (optional, kostenpflichtig – siehe [5. KI](#5-ki-optional)) |
| `PUBLIC_ID_PREFIX` | Präfix der Bewerbungs-IDs (Standard `NV`) |

Kanäle (Bewerbungen, Bot-Log, Teamchat, Leitung, Changelog …) werden **im Portal** unter *Admin-Bereich → Discord* eingetragen, nicht in der `.env`.

### 4. Hosting

**Vercel:** Repo importieren, Umgebungsvariablen setzen (nicht `DEV_LOGIN`), eigene Domain verbinden. Die Cron-Jobs stehen in [`vercel.json`](vercel.json).

**Docker (selbst gehostet):**

```bash
cp .env.example .env
docker compose up -d --build      # MongoDB (Replica Set) + Portal + Worker
docker compose run --rm setup     # Schema, Indizes, Basisdaten (einmalig)
```

### 5. KI (optional)

Die KI-Funktionen laufen **derzeit ausschließlich über die Claude API von Anthropic**. Weitere KI-Anbieter und Modelle (APIs) sind geplant und kommen noch.

**Die Claude API ist kostenpflichtig.** Abgerechnet wird nach Verbrauch (Tokens), unabhängig davon, wie viele Leute im Team sind.

**Welchen Plan nehmen?**
- **Ein API-Konto in der [Claude Console](https://platform.claude.com)** (Anthropic API, nutzungsbasiert mit **Prepaid-Guthaben**). Das reicht für das Portal völlig – keinen Enterprise-/Firmenvertrag nötig.
- **Nicht** ein Claude.ai-Abo (Pro, Max, Team): Diese Abos gelten nur für die Claude-App und enthalten **keinen API-Zugang**.
- Empfehlung zum Start: **5–10 $ Guthaben** aufladen, **automatisches Nachladen aus** lassen und in der Console ein **Ausgabenlimit** setzen. Für eine normale Bewerbungsphase reicht das meist lange.

**Einrichten:**
1. In der Console ein Konto anlegen, Guthaben aufladen und unter *API Keys* einen Key erstellen.
2. Den Key als `ANTHROPIC_API_KEY` in die Umgebungsvariablen eintragen (nur serverseitig, nie ins Repo).
3. Im Portal unter *Admin-Bereich → KI* einschalten und das **Monatsbudget** prüfen (Standard 20 $). Ist es aufgebraucht, schaltet sich die KI bis zum Monatsende ab – das Portal läuft normal weiter.

**Modelle & Kosten:** Standard ist `claude-sonnet-5-5` (`AI_MODEL_DEFAULT`) für Zusammenfassungen und Einordnung, für kleine, häufige Aufgaben wie Auto-Antworten das günstige `claude-haiku-5-5` (`AI_MODEL_FAST`). Beides lässt sich im Admin-Bereich ändern. Aktuelle Preise stehen auf der [Preisseite von Anthropic](https://www.anthropic.com/pricing) – den Verbrauch des Portals zeigt *Statistiken → KI-Nutzung (dieser Monat)*.

---

## Für andere Server einrichten

Das Portal ist auf Nordverkehr zugeschnitten, lässt sich aber für euren Server anpassen:

1. **Branding ersetzen:** `public/logo.png`, `public/Nord-Verkehr-Wordmark.png`, Farben in `src/app/globals.css`, Texte mit „Nordverkehr“ (Startseite, Footer, Bausteine, Datenschutzseite, KI-Prompts in `src/lib/ai/prompts.ts`). **Impressum:** eigene Angaben in `src/lib/legal.ts` eintragen (Name, Anschrift, Kontakt, Link zum Quellcode). Name und Logo von Nordverkehr dürft ihr nicht weiterverwenden – siehe [Marke & Logo](#marke--logo).
2. **Umgebungsvariablen** mit euren Adressen, Rollen und Schlüsseln setzen (siehe oben).
3. **Positionen, Fragen und Bausteine** im Portal anpassen (*Positionen & Fragen*, *Nachrichtenbausteine*) – die Startdaten in `src/lib/setup/seed-data.ts` sind nur ein Beispiel.
4. **Kanäle und Abläufe** im *Admin-Bereich* einstellen: Kanal-IDs, Nachtruhe, Sperrfristen, Mindestalter, Phase-2-Hürde, KI.
5. **Datenschutzseite** (`src/app/datenschutz/page.tsx`) mit euren Angaben überarbeiten – das ist eure Verantwortung als Betreiber.

> Die AGPL verlangt: Wenn ihr eine **veränderte Version öffentlich betreibt**, müsst ihr den Quellcode eurer Version den Nutzern zugänglich machen (z. B. ein Link im Footer auf euer Repository).

---

## Betrieb

### Cron-Jobs (Vercel)
- `/api/cron/outbox` – Zustellung ausstehender Discord-Nachrichten, Changelog-Post, nachts Stellen-Zeitplan und Prüfungen. Läuft um 0/1 Uhr und stündlich von 5 bis 13 Uhr (deutsche Zeit) – passt zu kleinen Vercel-Plänen.
- `/api/cron/summary` – 8 Uhr: Team-Übersicht, Erinnerungen, Probezeit, Entwürfe.
- `/api/cron/retention` – Löschfristen und Indizes.

Vercel rechnet in UTC; Einträge stehen deshalb für Sommer- und Winterzeit doppelt drin, nur der passende Lauf arbeitet. Nachrichten gehen zusätzlich **sofort** nach jeder Aktion raus.

### Worker (optional)
Vercel hat keinen Dauerprozess. Der Worker (`npm run worker`, im Docker-Setup enthalten) hält die Discord-Verbindung und ermöglicht:
- sofortige Wirkung entzogener Rollen (sonst nach `ROLE_CACHE_TTL_SECONDS`, Standard 60 s),
- Sprachkanal-Erkennung und Warteraum-Ping,
- „online“-Status des Bots, Zustellung mit Wiederholung, Löschfristen.

### Changelog & Releases
- Jede Änderung steht im **Changelog im Portal** (`src/lib/changelog.ts`) – eine Version pro Tag (1.2, 1.3 …), veröffentlicht zur eingestellten Uhrzeit, auf Wunsch auch im Discord-Kanal.
- **GitHub-Releases** gibt es nur für große Versionen (v1, v2, …) und nur auf ausdrückliche Ansage: *Actions → Release → Run workflow* oder `git tag v2 && git push origin v2`. Entfernen über *Actions → Release löschen*.

---

## Sicherheit & Datenschutz

- **Zugriff:** Discord-Login, Rollenprüfung über den Bot (fail closed), Proxy vor allen geschützten Routen und zusätzlich Prüfung in jeder Seite, Server Action und API-Route. Admin = Team-Rolle **und** Admin-Rolle. Zuständigkeit pro Stelle über Discord-Rollen.
- **CSRF & Missbrauch:** Origin-Prüfung, Cron nur mit `CRON_SECRET`, Rate Limits, Honeypot, Mindest-Ausfüllzeit, Namens-Check.
- **Uploads:** nur JPG/PNG/WebP, echte Inhaltsprüfung, Neucodierung ohne Metadaten, max. 8 MB, nur für Besitzer und zuständiges Team.
- **KI:** Nutzertexte nur in zufällig benannten Datenblöcken, Erkennung von Manipulationsversuchen (auch mit Leetspeak/unsichtbaren Zeichen), Ausgabefilter, Limits und Budget. An Anthropic gehen keine Namen, IDs oder Bilder.
- **DSGVO:** versionierte Einwilligung, Datenschutzseite, Datenexport, Konto-Löschung, automatische Löschfristen, Audit-Log, Mindestalter.

Sicherheitslücke gefunden? Bitte **nicht** als öffentliches Issue – siehe [SECURITY.md](SECURITY.md).

---

## Entwicklung

### Projektstruktur

```
src/
  app/            Seiten (öffentlich, Dashboard, Team, Admin), API-Routen, Server Actions
  components/     UI (apply/, dashboard/, team/, layout/)
  lib/
    applications/ Formular, Regeln, Warteschlange, Hinweise, Selbsttest
    team/         Status, Claims, Bewertung, Termine, Probezeit, Übersicht, Rechte
    discord/      REST-Client, Outbox (Zustellung mit Retry), Interaktionen, Rollen
    messages/     Platzhalter, Discord-Nachrichten (Components V2)
    ai/           Claude-Anbindung, Schutzschicht, Einordnung, Auto-Antwort
    setup/        Startdaten, Migrationen, Testbewerbungen
  proxy.ts        Zugriffsschutz vor jeder geschützten Route
prisma/           Schema (MongoDB)
worker/           optionaler Dauerprozess (Gateway, Outbox, Löschfristen)
scripts/          lokale MongoDB, Indizes, Integrationstests
tests/unit/       Vitest
```

### Skripte

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklung |
| `npm run build` / `npm start` | Produktion |
| `npm test` | Unit-Tests |
| `npm run lint` / `npm run typecheck` | Qualität |
| `npm run db:dev` | lokale MongoDB (Replica Set) |
| `npm run db:push` | Schema + Indizes |
| `npm run db:seed` | Basisdaten (+ Demo, außer `SEED_DEMO=false`) |
| `npm run db:test-features` / `db:test-workflow` | Integrationstests gegen eine Wegwerf-Datenbank (`npm run db:dev` vorher starten) |
| `npm run worker` | optionaler Worker |

### Fragen-Struktur
- **Allgemeine Fragen** gibt es einmal für alle Stellen; die Antworten werden fürs nächste Mal gemerkt.
- **Fachfragen, Szenarien und Regel-Quiz** sind pro Stelle.
- Jede Frage hat einen eindeutigen **Key**; der Builder warnt bei Dubletten.
- Bewerbungsarten sind ein eigenes Modell (`ApplicationType`) – Whitelist- oder Fraktionsbewerbungen lassen sich ergänzen.

---

## Mitmachen

Issues und Pull Requests sind willkommen. Bitte vorher kurz ein Issue aufmachen, wenn es um größere Änderungen geht.

- Vor dem PR: `npm run lint`, `npm run typecheck`, `npm test`.
- Texte im Portal sind Deutsch und im Du – bitte so beibehalten.
- Keine echten Zugangsdaten, Discord-IDs eures Servers oder personenbezogenen Daten committen.

Das Projekt ist ein Hobby- und Community-Projekt – Antworten können dauern.

---

## Lizenz

Der Quellcode steht unter der **GNU Affero General Public License v3.0** – siehe [LICENSE](LICENSE).

Kurz gesagt: Ihr dürft den Code nutzen, verändern und weitergeben. Wer eine veränderte Version **öffentlich betreibt oder weitergibt**, muss den Quellcode dieser Version unter derselben Lizenz zugänglich machen.

## Marke & Logo

Der Name **„Nordverkehr“**, das Logo und die Wortmarke (`public/logo.png`, `public/Nord-Verkehr-Wordmark.png`) sind **nicht** Teil der Open-Source-Lizenz. Für eigene Installationen bitte durch euren eigenen Namen und euer eigenes Logo ersetzen. Details: [NOTICE.md](NOTICE.md).

Nordverkehr ist ein Roleplay-Projekt und steht in keiner Verbindung zu Rockstar Games oder Take-Two Interactive.
