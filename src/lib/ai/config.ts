/**
 * KI-Konfiguration (ohne Server-Abhängigkeiten, testbar).
 * Preise in USD pro 1 Mio. Tokens (Stand 11/2026, Anthropic-API).
 * Unbekannte Modelle werden konservativ mit Opus-Preisen gerechnet.
 */
export const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-fable-5-2": { input: 8, output: 40 },
};
const FALLBACK_PRICE = { input: 5, output: 25 };

/** Modelle, die serverseitige Refusal-Fallbacks (`fallbacks: "default"`) unterstützen. */
export const SERVER_FALLBACK_MODELS = new Set(["claude-sonnet-5-5", "claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-fable-5-2"]);

export interface UsageLike {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/** Kosten in Millionstel USD (Ganzzahl). Cache-Schreiben 1,25×, Cache-Lesen 0,1×. */
export function costMicroUsd(model: string, usage: UsageLike): number {
  const p = MODEL_PRICES[model] ?? FALLBACK_PRICE;
  const input =
    usage.input_tokens * p.input +
    (usage.cache_creation_input_tokens ?? 0) * p.input * 1.25 +
    (usage.cache_read_input_tokens ?? 0) * p.input * 0.1;
  const output = usage.output_tokens * p.output;
  // Tokens × USD/1M = µUSD
  return Math.ceil(input + output);
}

export function formatUsd(micro: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(
    micro / 1_000_000,
  );
}

export function isAiConfigured() {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export type AiFeature = "summary" | "questions" | "hints" | "tags" | "autoreply" | "score" | "textcheck";

/** Welche Aufgabe nutzt welches Modell, welchen Aufwand und wie viele Ausgabe-Tokens (hartes Limit). */
export const FEATURE_CONFIG: Record<AiFeature, { tier: "default" | "fast"; effort: "low" | "medium"; maxTokens: number }> = {
  summary: { tier: "default", effort: "medium", maxTokens: 4000 },
  questions: { tier: "default", effort: "medium", maxTokens: 4000 },
  hints: { tier: "fast", effort: "low", maxTokens: 1200 },
  tags: { tier: "fast", effort: "low", maxTokens: 300 },
  autoreply: { tier: "fast", effort: "low", maxTokens: 350 },
  score: { tier: "default", effort: "medium", maxTokens: 2500 },
  textcheck: { tier: "fast", effort: "low", maxTokens: 500 },
};

export function dayStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function monthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
