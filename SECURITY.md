# Sicherheit

## Sicherheitslücke melden

Bitte meldet Sicherheitslücken **nicht** als öffentliches Issue, sondern vertraulich über GitHub:

**Repository → Security → Report a vulnerability**

Beschreibt kurz, was betroffen ist, wie man es nachstellt und welche Auswirkung ihr seht. Wir melden uns, sobald wir können – das Projekt ist ein Hobby- und Community-Projekt.

## Was dazugehört

- Zugriff auf Team- oder Admin-Bereiche ohne passende Discord-Rolle
- Zugriff auf Bewerbungen, Nachrichten oder Uploads anderer Personen
- Umgehen von Rate Limits, Sperren, CSRF- oder Cron-Schutz
- Prompt Injection, die die KI-Schutzschicht umgeht oder interne Daten preisgibt
- Ausführen von Code oder Einschleusen von Inhalten (XSS, Formel-Injection im CSV-Export …)

## Was nicht dazugehört

- Fehler in eurer eigenen Installation durch falsche Einstellungen (z. B. öffentlich erreichbare Datenbank)
- Schwächen in Discord, Vercel, MongoDB Atlas oder Anthropic selbst – bitte direkt dort melden

## Unterstützte Versionen

Sicherheitskorrekturen gibt es für den aktuellen Stand von `main`.
