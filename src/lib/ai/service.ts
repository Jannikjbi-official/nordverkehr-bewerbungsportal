/**
 * Claude-Anbindung (serverseitig). Ohne `server-only`, damit auch Hintergrund-
 * aufgaben (Einordnung, Auto-Antwort) sie nutzen können – nie im Client importieren.
 */
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { kindOf } from "@/lib/kinds";
import { type Settings } from "@/lib/settings";
import { rateLimit } from "@/lib/rate-limit";
import { FEATURE_CONFIG, SERVER_FALLBACK_MODELS, costMicroUsd, dayStart, isAiConfigured, monthStart, type AiFeature } from "@/lib/ai/config";
import { detectInjection, sanitizeInput } from "@/lib/ai/guard";
import type { ApplicationContext } from "@/lib/ai/prompts";
import { formatAnswerForDisplay, type AnswerValue } from "@/lib/applications/form";

export class AiError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

let client: Anthropic | null = null;
function anthropic() {
  // API-Key nur serverseitig aus der Umgebung (ANTHROPIC_API_KEY)
  client ??= new Anthropic({ maxRetries: 2, timeout: 60_000 });
  return client;
}

export async function monthlySpendMicro() {
  const agg = await db.aiUsage.aggregate({ _sum: { costMicroUsd: true }, where: { createdAt: { gte: monthStart() } } });
  return agg._sum.costMicroUsd ?? 0;
}

/** Tokens (Ein + Aus), die ein Nutzer heute verbraucht hat. */
export async function tokensToday(userId: string) {
  const agg = await db.aiUsage.aggregate({
    _sum: { inputTokens: true, outputTokens: true },
    where: { userId, createdAt: { gte: dayStart() } },
  });
  return (agg._sum.inputTokens ?? 0) + (agg._sum.outputTokens ?? 0);
}

export async function budgetLeft(settings: Settings) {
  return (await monthlySpendMicro()) < settings["ai.monthlyBudgetUsd"] * 1_000_000;
}

/** Vorbedingungen für Team-Anfragen: Schalter, Key, Monatsbudget, Rate Limit, Tageslimit. */
export async function assertAiAllowed(userId: string, settings: Settings) {
  if (!settings["ai.enabled"]) throw new AiError("Die KI-Unterstützung ist deaktiviert.", 403);
  if (!isAiConfigured()) throw new AiError("Kein ANTHROPIC_API_KEY hinterlegt.", 503);
  if (!(await budgetLeft(settings))) {
    throw new AiError("Das monatliche KI-Budget ist aufgebraucht. Ein Admin kann es in den Einstellungen erhöhen.", 402);
  }
  if ((await tokensToday(userId)) >= settings["ai.tokensPerUserPerDay"]) {
    throw new AiError("Dein tägliches KI-Token-Limit ist erreicht. Morgen geht's weiter.", 429);
  }
  const rl = await rateLimit(`ai:${userId}`, settings["ai.requestsPerHour"], 3600);
  if (!rl.ok) throw new AiError("Du hast dein stündliches KI-Kontingent erreicht. Später nochmal versuchen.", 429);
}

/**
 * Bewerbungsdaten datensparsam und begrenzt aufbereiten: keine Namen/IDs,
 * jede Antwort gesäubert, Gesamtlänge hart gedeckelt, Manipulationsversuche markiert.
 */
export async function loadApplicationContext(applicationId: string, settings: Settings): Promise<ApplicationContext> {
  const app = await db.application.findUnique({
    where: { id: applicationId },
    include: { position: { include: { type: { select: { key: true } } } }, answers: { orderBy: { sortOrder: "asc" } } },
  });
  if (!app || app.status === "DRAFT") throw new AiError("Bewerbung nicht gefunden.", 404);

  let budget = settings["ai.maxInputChars"];
  const suspicious: string[] = [];
  const answers: ApplicationContext["answers"] = [];
  for (const a of app.answers) {
    const raw =
      a.type === "FILE"
        ? `(${Array.isArray(a.value) ? a.value.length : 0} Bild(er) hochgeladen – nicht übermittelt)`
        : formatAnswerForDisplay(a.type, a.value as AnswerValue);
    if (detectInjection(raw).suspicious) suspicious.push(a.label);
    const perAnswer = Math.min(3000, Math.max(0, budget));
    const { text, truncated } = sanitizeInput(raw, perAnswer);
    budget -= text.length;
    answers.push({ section: a.sectionTitle, label: a.label, value: truncated ? `${text} […gekürzt]` : text });
    if (budget <= 0) break;
  }
  return {
    position: { title: app.position.title, tasks: app.position.tasks, requirements: app.position.requirements, kind: kindOf(app.position.type.key).noun },
    answers,
    suspicious,
  };
}

interface CallOptions {
  feature: AiFeature;
  /** Wem der Verbrauch zugerechnet wird (Teammitglied oder Bewerber); null = System */
  userId: string | null;
  settings: Settings;
  system: string;
  prompt: string;
  maxTokens?: number;
  onText?: (delta: string) => void;
  signal?: AbortSignal;
}

export interface CallResult {
  text: string;
  refused: boolean;
}

/** Ein Aufruf (gestreamt), protokolliert Tokens & Kosten – auch bei Fehlern. */
export async function callAi({ feature, userId, settings, system, prompt, maxTokens, onText, signal }: CallOptions): Promise<CallResult> {
  const cfg = FEATURE_CONFIG[feature];
  const model = cfg.tier === "fast" ? settings["ai.fastModel"] : settings["ai.model"];
  const useFallbacks = SERVER_FALLBACK_MODELS.has(model);
  // Günstige Aufgaben auf Haiku: ohne Denkphase, damit das Ausgabe-Limit voll für den Text gilt
  // (Haiku 5.5 erlaubt "disabled" bei effort ≤ high; Sonnet/Opus 5.5 nicht – dort bleibt adaptiv).
  const noThinking = cfg.tier === "fast" && model.startsWith("claude-haiku-5");

  let text = "";
  let usage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  let success = false;
  try {
    const stream = anthropic().beta.messages.stream(
      {
        model,
        // Hartes Ausgabe-Limit pro Anfrage
        max_tokens: Math.min(maxTokens ?? cfg.maxTokens, cfg.maxTokens),
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: prompt }],
        output_config: { effort: cfg.effort },
        ...(noThinking ? { thinking: { type: "disabled" as const } } : {}),
        ...(useFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      },
      { signal },
    );
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        text += event.delta.text;
        onText?.(event.delta.text);
      }
    }
    const final = await stream.finalMessage();
    usage = {
      input_tokens: final.usage.input_tokens,
      output_tokens: final.usage.output_tokens,
      cache_creation_input_tokens: final.usage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: final.usage.cache_read_input_tokens ?? 0,
    };
    success = final.stop_reason !== "refusal";
    return { text, refused: final.stop_reason === "refusal" };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      throw new AiError("Der hinterlegte API-Key wird von Anthropic nicht akzeptiert.", 502);
    }
    if (err instanceof Anthropic.RateLimitError) throw new AiError("Die KI ist gerade ausgelastet. Gleich nochmal versuchen.", 503);
    if (err instanceof Anthropic.APIConnectionError) throw new AiError("Keine Verbindung zur KI. Gleich nochmal versuchen.", 503);
    if (err instanceof Anthropic.APIError) throw new AiError(`KI-Dienst nicht verfügbar (${err.status ?? "?"}).`, 503);
    if (signal?.aborted) throw new AiError("Abgebrochen.", 499);
    throw err;
  } finally {
    await db.aiUsage
      .create({
        data: {
          userId,
          feature,
          model,
          inputTokens: usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens,
          outputTokens: usage.output_tokens,
          costMicroUsd: costMicroUsd(model, usage),
          success,
        },
      })
      .catch((e) => console.error("[ai] usage log failed", e));
  }
}
