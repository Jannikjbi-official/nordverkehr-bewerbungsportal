"use client";

export type AiFeature = "summary" | "questions" | "hints";

/**
 * Ruft den KI-Endpunkt auf und streamt Text. Gibt den vollständigen Text zurück.
 * Fehler werden als Error mit deutscher Meldung geworfen.
 */
export async function streamAi(
  body: { feature: AiFeature; applicationId?: string } & Record<string, unknown>,
  onText: (full: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch("/api/team/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error ?? `KI-Anfrage fehlgeschlagen (${res.status}).`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    full += decoder.decode(value, { stream: true });
    // Fehlermarker aus dem Stream (Abbruch mitten in der Antwort)
    const marker = full.indexOf("\u0000ERROR:");
    if (marker >= 0) throw new Error(full.slice(marker + 7).trim() || "KI-Antwort abgebrochen.");
    onText(full);
  }
  return full;
}
