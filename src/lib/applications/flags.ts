/**
 * Automatische Hinweise für das Team – ausdrücklich KEINE Bewertung und
 * kein Score. Sie sollen nur auf Dinge aufmerksam machen, die man sich
 * genauer ansehen sollte.
 */
import { checkNames } from "@/lib/applications/name-check";

export interface ApplicationFlag {
  code: "short_answers" | "duplicate_answers" | "similar_to_other" | "young_account" | "dm_closed" | "ai_hint" | "inappropriate_name";
  message: string;
}

export interface FlagInput {
  textAnswers: { label: string; value: string; minExpected: number }[];
  discordCreatedAt: Date;
  now: Date;
  minAccountDays: number;
  /** Texte anderer Bewerbungen (bereits normalisiert) zum Ähnlichkeitsvergleich */
  otherApplications: { publicId: string; text: string }[];
  /** Discord-Anzeigename und Benutzername (Namens-Check) */
  names?: (string | null | undefined)[];
}

/** Hinweis bei unpassendem Namen (oder null). */
export function nameFlag(names: (string | null | undefined)[]): ApplicationFlag | null {
  const hit = checkNames(names);
  return hit ? { code: "inappropriate_name", message: `Name möglicherweise unpassend: „${hit.name.slice(0, 60)}“ (${hit.issues.join(", ")}).` } : null;
}

export function normalizeText(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Wort-Shingles (3er) für einen einfachen Ähnlichkeitsvergleich. */
export function shingles(text: string, size = 3): Set<string> {
  const words = normalizeText(text).split(" ").filter(Boolean);
  const set = new Set<string>();
  for (let i = 0; i + size <= words.length; i++) set.add(words.slice(i, i + size).join(" "));
  return set;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export function computeFlags(input: FlagInput): ApplicationFlag[] {
  const flags: ApplicationFlag[] = [];

  const short = input.textAnswers.filter((a) => a.minExpected > 0 && a.value.trim().length < Math.max(40, a.minExpected));
  const longform = input.textAnswers.filter((a) => a.minExpected >= 40);
  if (longform.length && short.length >= Math.ceil(longform.length / 2)) {
    flags.push({ code: "short_answers", message: `Viele sehr kurze Antworten (${short.length} von ${longform.length}).` });
  }

  const seen = new Map<string, string>();
  for (const a of input.textAnswers) {
    const n = normalizeText(a.value);
    if (n.length < 30) continue;
    const other = seen.get(n);
    if (other) {
      flags.push({ code: "duplicate_answers", message: `Identische Antwort bei „${other}“ und „${a.label}“.` });
      break;
    }
    seen.set(n, a.label);
  }

  const mine = shingles(input.textAnswers.map((a) => a.value).join(" \n "));
  if (mine.size >= 20) {
    let best = { id: "", score: 0 };
    for (const o of input.otherApplications) {
      const score = jaccard(mine, shingles(o.text));
      if (score > best.score) best = { id: o.publicId, score };
    }
    if (best.score >= 0.5) {
      flags.push({
        code: "similar_to_other",
        message: `Sehr ähnlich zu Bewerbung ${best.id} (${Math.round(best.score * 100)} % Übereinstimmung) – evtl. kopiert.`,
      });
    }
  }

  const accountDays = (input.now.getTime() - input.discordCreatedAt.getTime()) / 86_400_000;
  if (input.minAccountDays > 0 && accountDays < input.minAccountDays) {
    flags.push({ code: "young_account", message: `Discord-Account ist erst ${Math.max(0, Math.floor(accountDays))} Tage alt.` });
  }

  const name = input.names ? nameFlag(input.names) : null;
  if (name) flags.push(name);

  return flags;
}
