/**
 * Regel-Quiz pro Stelle: sechs Fragen mit genau einer richtigen Antwort – passend
 * zu den Aufgaben der Stelle plus Grundbegriffe aus dem RP. Lösungen bleiben auf dem
 * Server (Question.correctOption). Im Formularbaukasten frei änderbar.
 */
import type { SeedQuestion, SeedSection } from "@/lib/setup/questions";

/** Einfacher, fester Hash: richtige Antwort steht pro Frage an einer anderen Stelle (nicht immer zuerst). */
function slot(key: string, n: number) {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % n;
}

export function quiz(key: string, label: string, correct: string, wrong: string[]): SeedQuestion {
  const options = [...wrong];
  options.splice(slot(key, wrong.length + 1), 0, correct);
  return { key, label, type: "QUIZ", options, correctOption: correct };
}

const section = (slug: string, questions: SeedQuestion[]): SeedSection => ({
  key: `${slug}.quiz`,
  title: "Regel-Quiz",
  description: "Pro Frage ist genau eine Antwort richtig. Das Team sieht nur, wie viele du richtig hast.",
  questions,
});

export const POSITION_QUIZ: Record<string, SeedSection> = {
  support: section("support", [
    quiz("support.quiz_metagaming", "Was bedeutet „Metagaming“?", "Wissen von außerhalb des Spiels (z. B. aus Discord oder einem Stream) im RP nutzen", [
      "Mehrere Charaktere gleichzeitig spielen",
      "Ingame-Geld gegen Echtgeld tauschen",
      "Eine Situation besonders lange ausspielen",
    ]),
    quiz("support.quiz_powergaming", "Was ist „Powergaming“?", "Aktionen erzwingen, auf die das Gegenüber keine faire Chance hat zu reagieren", [
      "Sehr viele Stunden am Stück spielen",
      "Im Team schnell aufsteigen",
      "Das eigene Fahrzeug voll tunen",
    ]),
    quiz("support.quiz_unknown_ticket", "Ein Ticket, das du nicht selbst lösen kannst – was tust du?", "Ehrlich sagen und an die zuständige Stelle weitergeben", [
      "Das Ticket schließen, damit die Liste leer ist",
      "Irgendeine Antwort geben, damit Ruhe ist",
      "Den Spieler vertrösten, ohne es weiterzugeben",
    ]),
    quiz("support.quiz_insult", "Ein Spieler beleidigt dich im Ticket. Wie reagierst du zuerst?", "Ruhig bleiben, auf den Ton hinweisen und sachlich weiterhelfen", [
      "Im gleichen Ton zurückschreiben",
      "Ihn sofort dauerhaft bannen",
      "Das Ticket unbeantwortet liegen lassen",
    ]),
    quiz("support.quiz_friends", "Ein Freund bittet dich, eine Regel für ihn „mal kurz zu ignorieren“.", "Ablehnen – Regeln gelten für alle gleich", [
      "Für Freunde ist das in Ordnung",
      "Machen, solange es niemand merkt",
      "Erst die Leitung fragen und es dann trotzdem tun",
    ]),
    quiz("support.quiz_internal", "Wo besprichst du interne Team-Themen?", "Nur in den internen Team-Kanälen", [
      "Im öffentlichen Chat, damit alle Bescheid wissen",
      "In privaten Gruppen mit Spielern",
      "Über den Ingame-Funk",
    ]),
  ]),
  moderator: section("moderator", [
    quiz("moderator.quiz_rdm", "Was ist „RDM“ (Random Deathmatch)?", "Jemanden ohne RP-Grund angreifen oder töten", [
      "Ein angekündigtes Kampf-Event",
      "Ein Rennen ohne Regeln",
      "Das Löschen eines Charakters",
    ]),
    quiz("moderator.quiz_vdm", "Was ist „VDM“?", "Jemanden absichtlich und ohne RP-Grund mit einem Fahrzeug anfahren oder rammen", [
      "Ein Fahrzeug ohne Führerschein fahren",
      "Ein Rennen auf der Autobahn",
      "Ein Fahrzeug stehlen",
    ]),
    quiz("moderator.quiz_nlr", "Was besagt die „New Life Rule“ (NLR) in der Regel?", "Nach einem RP-Tod erinnert sich der Charakter nicht an die Umstände seines Todes", [
      "Nach einem Tod wird der Charakter gelöscht",
      "Man darf sich sofort am Täter rächen",
      "Nach einem Tod gibt es neues Startgeld",
    ]),
    quiz("moderator.quiz_evidence", "Bevor du eine Strafe verhängst …", "… prüfst du Belege (Clips, Logs) und hörst beide Seiten an", [
      "… entscheidest du nach Bauchgefühl",
      "… fragst du nur die Person, die gemeldet hat",
      "… wartest du ab, bis es noch einmal passiert",
    ]),
    quiz("moderator.quiz_bias", "Ein guter Freund verstößt gegen eine Regel, du bist allein online.", "Neutral nach Regelwerk handeln, dokumentieren und bei Befangenheit abgeben, sobald jemand da ist", [
      "Es dieses eine Mal durchgehen lassen",
      "Besonders hart bestrafen, damit niemand etwas sagt",
      "Die Meldung löschen",
    ]),
    quiz("moderator.quiz_docs", "Was gehört in die Dokumentation einer Strafe?", "Was passiert ist, welche Regel, die Belege, die Strafe und wer entschieden hat", [
      "Nur der Name des Spielers",
      "Nichts – mündlich reicht",
      "Nur die Höhe der Strafe",
    ]),
  ]),
  entwickler: section("entwickler", [
    quiz("entwickler.quiz_testserver", "Wo testest du neue Skripte zuerst?", "Auf einem Test- bzw. Entwicklungsserver, nicht auf dem Live-Server", [
      "Direkt auf dem Live-Server",
      "Gar nicht – wenn es kompiliert, passt es",
      "Die Spieler testen das schon",
    ]),
    quiz("entwickler.quiz_client_trust", "Ein Skript übernimmt Geldbeträge, die der Client schickt. Wo ist das Problem?", "Client-Daten sind manipulierbar – Werte müssen serverseitig geprüft werden", [
      "Es gibt keins, der Client ist vertrauenswürdig",
      "Es ist nur etwas langsamer",
      "Es fehlen nur Kommentare im Code",
    ]),
    quiz("entwickler.quiz_secrets", "Wohin gehören API-Schlüssel und Passwörter?", "In Konfiguration bzw. Umgebungsvariablen – nie ins Repository", [
      "Direkt in den Code, dann geht nichts verloren",
      "In einen öffentlichen Discord-Kanal",
      "In die README",
    ]),
    quiz("entwickler.quiz_review", "Ein Teamkollege kritisiert deinen Code im Review.", "Sachlich prüfen, nachfragen und bei Bedarf anpassen", [
      "Das Review ignorieren und trotzdem einspielen",
      "Die Kritik persönlich nehmen",
      "Den Code löschen und neu anfangen",
    ]),
    quiz("entwickler.quiz_update", "Was tust du vor einem größeren Update auf dem Live-Server?", "Backup machen, Update ankündigen und einen Weg zurück planen", [
      "Einfach einspielen, wird schon klappen",
      "Zur Hauptspielzeit einspielen, dann testen viele mit",
      "Vorher die Datenbank leeren",
    ]),
    quiz("entwickler.quiz_git", "Wozu dient Versionsverwaltung wie Git?", "Änderungen nachvollziehen, gemeinsam arbeiten und zurückrollen können", [
      "Damit der Server schneller läuft",
      "Das braucht man nur in großen Firmen",
      "Um Spieler zu bannen",
    ]),
  ]),
  media: section("media", [
    quiz("media.quiz_consent", "Darfst du Spieler ungefragt groß in einem Trailer zeigen?", "Nur mit ihrem Einverständnis bzw. nach den Regeln des Servers", [
      "Ja, auf dem Server ist alles frei verwendbar",
      "Ja, wenn man die Namen weglässt",
      "Ja, solange das Video kurz ist",
    ]),
    quiz("media.quiz_music", "Welche Musik darf in unsere Videos?", "Nur Musik, für die wir die Rechte haben (z. B. lizenzfrei)", [
      "Jeder Song aus den Charts",
      "Egal, Hauptsache sie passt",
      "Jeder Song, wenn er unter 30 Sekunden läuft",
    ]),
    quiz("media.quiz_violation", "Dein Clip zeigt zufällig einen Regelverstoß. Was machst du?", "Nicht veröffentlichen, sondern dem Team bzw. der Moderation geben", [
      "Als Lacher posten",
      "Den Spieler öffentlich bloßstellen",
      "Löschen und vergessen",
    ]),
    quiz("media.quiz_release", "Bevor ein Video öffentlich online geht …", "… gibt die zuständige Person bzw. Leitung es frei", [
      "… reicht es, wenn es dir gefällt",
      "… fragst du die Spieler im öffentlichen Chat",
      "… braucht es keine Freigabe",
    ]),
    quiz("media.quiz_internal", "Was gehört nicht in öffentliche Posts?", "Interne Team-Infos und noch nicht angekündigte Features", [
      "Screenshots aus dem Spiel",
      "Event-Ankündigungen",
      "Das Server-Logo",
    ]),
    quiz("media.quiz_remove", "Ein Spieler bittet dich, einen Clip mit ihm zu entfernen.", "Ernst nehmen und den Clip entfernen bzw. mit dem Team klären", [
      "Ignorieren – öffentlich ist öffentlich",
      "Den Clip jetzt erst recht teilen",
      "Den Spieler blockieren",
    ]),
  ]),
  mapper: section("mapper", [
    quiz("mapper.quiz_performance", "Deine neue Map ruckelt bei Spielern. Was prüfst du zuerst?", "Performance: Polygone, Texturgrößen und die Anzahl der Props", [
      "Die Grafikkarten der Spieler",
      "Die Farben der Wände",
      "Gar nichts – sieht doch gut aus",
    ]),
    quiz("mapper.quiz_assets", "Woher dürfen Assets für unsere Maps kommen?", "Nur eigene oder mit passender Lizenz bzw. Erlaubnis", [
      "Von jedem anderen Server kopiert",
      "Aus geleakten Packs",
      "Egal, Hauptsache es sieht gut aus",
    ]),
    quiz("mapper.quiz_testing", "Bevor ein Mapping live geht …", "… prüfst du es auf dem Testserver (Kollisionen, Löcher, Performance) und lässt es freigeben", [
      "… spielst du es direkt live ein",
      "… reicht ein Screenshot",
      "… testen das die Spieler nach dem Release",
    ]),
    quiz("mapper.quiz_collision", "Spieler fallen in deinem Interior durch eine Wand.", "Kollisionen prüfen und die fehlende Collision ergänzen", [
      "Ein Schild „Nicht berühren“ aufstellen",
      "Die Wand entfernen",
      "Den Spielern sagen, sie sollen aufpassen",
    ]),
    quiz("mapper.quiz_location", "Du willst einen Ort umbauen, den andere viel nutzen.", "Vorher mit dem Team und betroffenen Gruppen abstimmen", [
      "Einfach machen, die gewöhnen sich",
      "Heimlich nachts umbauen",
      "Den Ort komplett sperren",
    ]),
    quiz("mapper.quiz_docs", "Warum Dateien sauber benennen und Änderungen dokumentieren?", "Damit andere im Team sie finden und nachvollziehen können", [
      "Damit die Map schneller lädt",
      "Das ist nur Zeitverschwendung",
      "Damit niemand anderes daran arbeiten kann",
    ]),
  ]),
  eventteam: section("eventteam", [
    quiz("eventteam.quiz_planning", "Was gehört in eine Event-Planung?", "Ablauf, Zeiten, Verantwortliche, ein Plan B und Absprache mit dem Team", [
      "Nur die Uhrzeit",
      "Ein schönes Banner reicht",
      "Planung ist unnötig – spontan wird es besser",
    ]),
    quiz("eventteam.quiz_conflict", "Während deines Events eskaliert ein Streit zwischen Teilnehmern.", "Ruhig eingreifen, trennen und bei Regelverstößen die Moderation holen", [
      "Weitermachen und hoffen, dass es aufhört",
      "Das Event sofort ersatzlos beenden",
      "Mitstreiten",
    ]),
    quiz("eventteam.quiz_overlap", "Dein Event überschneidet sich mit einem großen RP-Szenario.", "Vorher abstimmen und Termin oder Ort anpassen", [
      "Trotzdem machen, wer zuerst kommt",
      "Das andere Szenario absagen lassen",
      "Nichts sagen und abwarten",
    ]),
    quiz("eventteam.quiz_prizes", "Wie vergibst du Preise?", "Fair und nach vorher bekannten Regeln", [
      "An Freunde",
      "Nach Lust und Laune",
      "An die, die am lautesten fragen",
    ]),
    quiz("eventteam.quiz_invite", "Wie lädst du zu einem Event ein?", "Rechtzeitig, mit Zeit, Ort und Regeln", [
      "Fünf Minuten vorher im Chat",
      "Gar nicht – wer da ist, ist da",
      "Nur per Privatnachricht an einzelne",
    ]),
    quiz("eventteam.quiz_after", "Was machst du nach einem Event?", "Feedback sammeln und für das nächste Event auswerten", [
      "Nichts mehr – vorbei ist vorbei",
      "Nur die Teilnehmerzahl posten",
      "Sofort das nächste Event starten",
    ]),
  ]),
};
