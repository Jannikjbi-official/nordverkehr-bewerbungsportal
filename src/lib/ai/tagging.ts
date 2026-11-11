/**
 * KI-Einordnung neuer Bewerbungen: beschreibende Kategorien zum Filtern und
 * Sortieren – ausdrücklich KEIN Ranking und keine Entscheidung.
 */
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { isAiConfigured } from "@/lib/ai/config";
import { budgetLeft, callAi, loadApplicationContext } from "@/lib/ai/service";
import { buildPrompt, parseTags, type TagKey } from "@/lib/ai/prompts";

export async function tagApplication(applicationId: string, opts: { actorId?: string | null; force?: boolean } = {}) {
  const settings = await getSettings();
  if (!settings["ai.enabled"] || !isAiConfigured()) return null;
  if (!opts.force && !settings["ai.autoTagEnabled"]) return null;
  if (!(await budgetLeft(settings))) return null;

  const ctx = await loadApplicationContext(applicationId, settings);
  const res = await callAi({
    feature: "tags",
    userId: opts.actorId ?? null,
    settings,
    system: settings["ai.systemPrompt"],
    prompt: buildPrompt("tags", ctx),
  });
  const tags: TagKey[] = res.refused ? [] : parseTags(res.text);
  // Der Schutzfilter (nicht die KI) markiert Manipulationsversuche
  if (ctx.suspicious.length) tags.push("manipulation");

  await db.application.update({ where: { id: applicationId }, data: { aiTags: tags, aiTaggedAt: new Date() } });
  return tags;
}
