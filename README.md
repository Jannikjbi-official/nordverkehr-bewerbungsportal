# Nordverkehr – Team-Bewerbungsportal

Bewerbungsportal für das Team von **Nordverkehr** (Hamburg-Roleplay, Start auf GTA 5, danach GTA 6).
Design und Tonalität orientieren sich an [nordverkehr.xyz](https://nordverkehr.xyz).

- **Bewerber:** Login mit Discord → Position wählen → mehrstufiges Formular mit Autosave → Bestätigung per Discord-DM und im Portal → Status, Nachrichten und Antworten im Dashboard.
- **Team** (nur Discord-Rolle `TEAM_ROLE_ID`): Tabelle & Kanban, Filter/Suche, Detailansicht mit Discord-Profil, Abstimmung, interne Kommentare, Gesprächstermine, Nachrichtenbausteine mit Discord-Vorschau, Notizen & Sperren, Statistiken, Audit-Log, CSV-Export.
- **Admins** (zusätzlich `ADMIN_ROLE_ID`): Positionen & Formular-Builder, Einstellungen (Sperrfrist, Mindestalter, Bestätigungstext, Löschfristen, KI).
- **KI (optional, Claude):** Zusammenfassung, Rückfrage-Vorschläge, Auffälligkeiten, automatische Einordnung (Kategorien, **kein Ranking**) und Auto-Antworten an Bewerber, wenn niemand vom Team online ist – mit Schutz vor Prompt Injection und Token-Limits.

## Tech-Stack

Next.js 16 (App Router, Cache Components, `proxy.ts`) · TypeScript · Tailwind CSS 4 · **MongoDB** + Prisma 6 · Auth.js v5 (Discord) · Discord REST/Gateway · zod · Anthropic SDK · Vitest · Hosting auf **Vercel** (oder Docker).

---

## Schnellstart (lokal)

```bash
npm install
cp .env.example .env          # Werte eintragen (siehe unten)
npm run db:dev                # lokale MongoDB als Replica Set (eigenes Terminal, läuft weiter)
npm run db:push               # Schema + Indizes
npm run db:seed               # Positionen, Fragen, Bausteine, Demo-Bewerbungen
npm run dev                   # http://localhost:3000
```

**Ohne Discord-App testen:** In der `.env` `DEV_LOGIN="true"` setzen und `DISCORD_GUILD_ID` leer lassen. Auf `/login` erscheint dann ein Dev-Login für die Seed-Nutzer („Demo-Teammitglied“ hat Team- und Admin-Rechte). Der Dev-Login ist in Produktion (`NODE_ENV=production`) immer deaktiviert.

`npm run db:dev` lädt beim ersten Start einmalig ein MongoDB-Binary herunter und speichert Daten in `./.mongo-data`.

---

## 1. Discord-Application & Bot anlegen

1. [Discord Developer Portal](https://discord.com/developers/applications) → **New Application** („Nordverkehr Portal“).
2. **OAuth2**
   - *Client ID* → `AUTH_DISCORD_ID`, *Client Secret* → `AUTH_DISCORD_SECRET`
   - **Redirects** eintragen:
     - `https://bewerbung.nordverkehr.xyz/api/auth/callback/discord`
     - `http://localhost:3000/api/auth/callback/discord` (Entwicklung)
   - Das Portal fragt nur den Scope **`identify`** an (Name, ID, Avatar – keine E-Mail, keine Serverliste). Rollen prüft der Bot.
3. **Bot**
   - *Reset Token* → `DISCORD_BOT_TOKEN`
   - **Privileged Gateway Intents:** **Server Members Intent** aktivieren (für den optionalen Worker, der Rollenänderungen sofort erkennt). Presence- und Message-Content-Intent werden **nicht** benötigt.
4. **Bot einladen:** *OAuth2 → URL Generator* → Scopes `bot`, Bot-Permissions:
   - `View Channels`, `Send Messages`, `Embed Links` (Log-Channel)
   - `Manage Roles` (nur wenn bei Annahme automatisch eine Rolle vergeben werden soll – die Bot-Rolle muss in der Rollenliste **über** den zu vergebenden Rollen stehen)
5. **IDs kopieren** (Discord → Einstellungen → Erweitert → Entwicklermodus): Server-ID → `DISCORD_GUILD_ID`, Log-Channel → `DISCORD_LOG_CHANNEL_ID`.
6. `TEAM_ROLE_ID=1570139752210890833`, `ADMIN_ROLE_ID=1569735822167642123`.

> **DMs:** Der Bot kann nur Nutzern schreiben, die mit ihm einen Server teilen und DMs von Servermitgliedern erlauben. Schlägt eine DM fehl, sieht der Bewerber einen Hinweis im Portal und das Team eine Markierung.

## 2. Datenbank: MongoDB Atlas

Das Portal nutzt Transaktionen → MongoDB muss als **Replica Set** laufen. Atlas erfüllt das immer (auch der Gratis-Cluster M0).

1. [MongoDB Atlas](https://www.mongodb.com/atlas) → Cluster anlegen, **Region in der EU** (z. B. Frankfurt, `eu-central-1`) – wichtig für den Datenschutz.
2. *Database Access* → Nutzer mit Rolle *readWrite* auf die Datenbank `nordverkehr`.
3. *Network Access* → für Vercel `0.0.0.0/0` (Vercel hat keine festen IPs) – Zugriff ist durch Nutzer/Passwort geschützt.

**Am einfachsten:** In Vercel die [MongoDB-Atlas-Integration](https://vercel.com/marketplace/mongodbatlas) installieren (Region Frankfurt). Sie legt den Cluster an und setzt die Variable (z. B. `DATABASE_URL_MONGODB_URI` bei Präfix `DATABASE`). Das Portal akzeptiert `DATABASE_URL`, `DATABASE_URL_MONGODB_URI` und `MONGODB_URI` und ergänzt einen fehlenden Datenbanknamen automatisch (`nordverkehr`).

**Ersteinrichtung auf Vercel:** nichts zu tun. Beim ersten Aufruf der Startseite einer leeren Datenbank legt das Portal Indizes und Basisdaten (Positionen, Fragen, Bausteine – ohne Testbewerbungen) selbst an. Der tägliche Cron `/api/cron/retention` prüft die Indizes zusätzlich (in Vercel unter *Settings → Cron Jobs* auch manuell auslösbar).
4. Connection String → `DATABASE_URL`, z. B.
   `mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/nordverkehr?retryWrites=true&w=majority`
5. Alternativ einmalig von deinem Rechner aus:
   ```bash
   DATABASE_URL="mongodb+srv://…" npm run db:push
   DATABASE_URL="mongodb+srv://…" SEED_DEMO=false npm run db:seed
   ```
   `SEED_DEMO=false` legt Positionen, Fragen und Bausteine an, aber **keine** Testbewerbungen.

`db:push` legt zusätzlich Indizes an, die Prisma nicht abbilden kann – u. a. den partiellen Unique-Index „nur eine offene Bewerbung pro Discord-Account und Position“.

## 3. Anthropic-API-Key (optional)

1. [console.anthropic.com](https://console.anthropic.com) → *API Keys* → Key erstellen → `ANTHROPIC_API_KEY` (nur serverseitig, nie im Client).
2. Im Portal: **Team → Einstellungen → KI** aktivieren, Modell (Standard `claude-sonnet-5-5`, günstig `claude-haiku-5-5`), Monatsbudget, Limits und System-Prompt einstellen.
3. Ohne Key oder mit ausgeschalteter KI funktioniert das Portal vollständig.

**Was die KI darf – und was nicht**
- Darf: Zusammenfassungen, Rückfrage-/Gesprächsfragen-Vorschläge, Auffälligkeiten, beschreibende Kategorien, kurze Auto-Antworten an Bewerber, wenn niemand vom Team online ist (klar gekennzeichnet).
- Darf nicht: Entscheidungen treffen, Punkte/Rankings vergeben, Zusagen machen, Team-Nachrichten verschicken.
- An Anthropic gehen nur Position und Antworttexte – keine Namen, Discord-IDs, Avatare oder Bilder.

**Schutz vor Prompt Injection & Missbrauch** (`src/lib/ai/guard.ts`, getestet in `tests/unit/guard.test.ts`)
- Erkennung von „vergiss/ignoriere alle Anweisungen“, Rollenwechseln („du bist jetzt …“), Prompt-Auslesen, Chat-Markup (`<system>`, `[INST]`) – auch mit Leetspeak, Leer-/Sonderzeichen und unsichtbaren Zeichen. Treffer → **keine KI**, feste Antwort, Markierung im Team-Bereich; in Bewerbungen → Kategorie „Manipulationsversuch“.
- Nutzertexte gehen nur in Datenblöcken mit zufälligem Namen an die KI; feste Regeln stehen vor dem editierbaren Ton.
- Limits: Zeichen/Tokens pro Nachricht (Eingabe), `max_tokens` (Ausgabe), Anfragen pro Stunde, **Tokens pro Nutzer und Tag**, Auto-Antworten pro Bewerber und Tag, Mindestabstand, Monatsbudget.
- Ausgabe-Filter: keine `@everyone`/Erwähnungen, nur Links auf nordverkehr.xyz, Längenlimit, Erkennung von Prompt-Lecks.

## 4. Deployment auf Vercel

1. Repository auf GitHub pushen, in Vercel **Add New → Project** → Repo importieren (Framework: Next.js, Build: `npm run build`).
2. **Environment Variables** (Production) aus `.env.example` setzen – mindestens:
   `DATABASE_URL`, `AUTH_SECRET`, `AUTH_DISCORD_ID`, `AUTH_DISCORD_SECRET`, `AUTH_TRUST_HOST=true`, `NEXT_PUBLIC_APP_URL=https://bewerbung.nordverkehr.xyz`, `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `TEAM_ROLE_ID`, `ADMIN_ROLE_ID`, `CRON_SECRET` (zufällig, ≥ 16 Zeichen); optional `DISCORD_LOG_CHANNEL_ID`, `ANTHROPIC_API_KEY`.
   **Nicht** setzen: `DEV_LOGIN`.
3. **Domain:** *Settings → Domains* → `bewerbung.nordverkehr.xyz` hinzufügen und beim DNS-Anbieter den angezeigten CNAME setzen.
4. **Cron-Jobs** (`vercel.json`): Zustellung ausstehender Discord-Nachrichten und Löschfristen laufen täglich. Auf **Vercel Pro** kannst du `/api/cron/outbox` z. B. auf `*/5 * * * *` stellen. Zusätzlich stellt das Portal Nachrichten **sofort** nach jeder Aktion zu und holt fällige Wiederholungen nach, sobald ein Teammitglied den Team-Bereich öffnet.

### Optional: Worker (sofortige Rollen-Updates)

Vercel hat keinen Dauerprozess. Ohne Worker wird eine entzogene Team-Rolle spätestens nach `ROLE_CACHE_TTL_SECONDS` (Standard 60 s) wirksam. Für sofortige Wirkung den Worker auf einem kleinen Server/Container laufen lassen (gleiche `.env`):

```bash
npm run worker      # Discord-Gateway + Outbox + Löschfristen
```

### Alternative: Selbsthosting mit Docker

```bash
cp .env.example .env              # Werte eintragen
docker compose up -d --build      # mongo (Replica Set) + web + worker
docker compose run --rm setup     # Schema, Indizes, Basisdaten (einmalig)
```

---

## Zugriff & Rollenprüfung

| Schicht | Was passiert |
|---|---|
| Login | Discord-OAuth (`identify`). Sitzung = JWT mit Nutzer-ID + `sessionVersion` (bei jedem Request mit der DB verglichen → „Überall abmelden“/Löschen wirkt sofort). |
| Rolle | Bot fragt `GET /guilds/{id}/members/{user}` ab, Ergebnis 60 s gecacht. Beim Login immer frisch. **Fail closed:** Ist Discord nicht erreichbar und der Cache abgelaufen, gibt es keinen Zugriff. |
| Proxy (`src/proxy.ts`) | Schützt `/team/**`, `/api/team/**`, `/dashboard`, `/bewerben`, `/konto`, `/api/me`, `/api/uploads` – inkl. Rollenprüfung. |
| Seiten & Actions | Jede Team-Seite, jede Server Action und jeder Route-Handler prüft zusätzlich selbst (`requireTeam`, `requireAdmin`, `assertTeamApi`). |
| Admin | Team-Rolle **und** `ADMIN_ROLE_ID`. Ohne gesetzte `ADMIN_ROLE_ID` hat niemand Admin-Rechte. |

## Sicherheit & Datenschutz

- CSRF: Server Actions prüfen Origin; Route-Handler mit Seiteneffekten prüfen Same-Origin; Cron-Routen nur mit `CRON_SECRET`.
- Rate Limits (DB-basiert): Autosave, Absenden, Antworten, Uploads, Exporte, KI.
- Spam-Schutz: Honeypot, Mindest-Ausfüllzeit, Hinweise bei kurzen/kopierten Antworten und jungen Discord-Accounts (nur Hinweise, keine Bewertung).
- Uploads: nur JPG/PNG/WebP, echte Inhaltsprüfung, Neucodierung als WebP **ohne Metadaten**, max. 8 MB, Auslieferung nur an Besitzer/Team.
- DSGVO: Einwilligung mit Version, Datenschutzseite (inkl. Discord, Anthropic, Vercel, MongoDB Atlas), Datenexport (JSON), Account-Löschung, automatische Löschfristen, Audit-Log, Jugendschutz (Mindestalter 18, einstellbar).
- CSV-Export ohne Antworttexte und mit Schutz vor Formel-Injection.

## Projektstruktur

```
src/
  app/                 Seiten (öffentlich, Dashboard, Team) + API-Routen + Server Actions
  components/          UI (apply/, dashboard/, team/, layout/)
  lib/
    auth/              Rollenprüfung (access.ts – rein & getestet), Proxy-Logik, Session
    applications/      Formular-Validierung, Regeln (Sperrfrist, Doppelbewerbung), Hinweise
    discord/           REST-Client, Outbox (Zustellung mit Retry)
    messages/          Platzhalter, Discord-Embeds
    ai/                Claude-Anbindung, Schutzschicht, Einordnung, Auto-Antwort
  proxy.ts             Zugriffsschutz vor jeder geschützten Route
prisma/                Schema (MongoDB), Seed-Daten im Nordverkehr-Ton
scripts/               lokale MongoDB, MongoDB-Indizes
worker/                optionaler Dauerprozess (Gateway, Outbox, Löschfristen)
tests/unit/            Vitest (Rollenprüfung, Routen, Nachrichtenversand, Schutzschicht …)
```

## Skripte

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklung |
| `npm run build` / `start` | Produktion |
| `npm test` | Unit-Tests |
| `npm run lint` / `typecheck` | Qualität |
| `npm run db:dev` | lokale MongoDB (Replica Set) |
| `npm run db:push` | Schema + Indizes übertragen |
| `npm run db:seed` | Basisdaten (+ Demo, außer `SEED_DEMO=false`) |
| `npm run db:migrate-questions` | Fragen-Migration: Probelauf, mit `-- --apply` ausführen (läuft sonst automatisch beim Serverstart) |
| `npm run db:test-workflow` | Claims, Absender, Components V2, Bot-Logs, null-Felder gegen eine Wegwerf-DB testen |
| `npm run db:test-migration` | Migration gegen eine Wegwerf-DB mit Altbestand (Duplikate) testen |
| `npm run worker` | optionaler Worker |

## Fragen-Struktur

- **Allgemeine Fragen** (Über dich, Erfahrung & Motivation, Szenarien) gibt es genau einmal, sie gelten für alle Positionen.
- **Positionen** haben nur fachliche Fragen („Fachfragen“). Heißt ein Abschnitt wie die Position, wird er als „Fachfragen“ angezeigt.
- Jede Frage hat einen **eindeutigen Key** (`about_me`, `support.tickets`). Das Formular entfernt Duplikate per Key bzw. Text; der Builder warnt bei gleichem Key oder ähnlichem Text.
- Antworten auf allgemeine Fragen werden nach dem Absenden im **Bewerberprofil** gemerkt und bei der nächsten Bewerbung vorausgefüllt („Deine Angaben“ – mit „Anpassen“).

## Erweiterbarkeit

Bewerbungsarten sind ein eigenes Modell (`ApplicationType`, heute nur `team`). Für Whitelist- oder Fraktionsbewerbungen neue Typen anlegen; Positionen, Formular-Schritte und Fragen hängen bereits am Typ.
