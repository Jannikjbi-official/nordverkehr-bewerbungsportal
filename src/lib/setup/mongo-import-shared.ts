/** Gemeinsam für Route und Oberfläche (ohne Server-Abhängigkeiten). */
export const IMPORT_CONFIRM_PHRASE = "ÜBERNEHMEN";
/** Setting-Schlüssel: Übernahme erledigt { at, by, inserted } */
export const IMPORT_MARKER = "import:mongo";

const isMongo = (url: string) => /^mongodb(\+srv)?:\/\//i.test(url);

/** Variablen, unter denen die alte MongoDB stehen kann (Vercel-Atlas-Integration zuerst). */
export const MONGO_URL_KEYS = ["DATABASE_URL_MONGODB_URI", "MONGODB_URI", "DATABASE_URL"] as const;

export function resolveMongoUrl(env: Record<string, string | undefined> = process.env): string | null {
  for (const k of MONGO_URL_KEYS) {
    const v = env[k]?.trim();
    if (v && isMongo(v)) return v;
  }
  return null;
}
