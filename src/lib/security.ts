/**
 * CSRF-Schutz für Route-Handler (Server Actions prüfen Origin bereits selbst).
 * Mutierende Requests müssen vom selben Origin kommen.
 */
export function isSameOrigin(req: Request, appUrl = process.env.NEXT_PUBLIC_APP_URL): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host && originHost === host) return true;
  if (appUrl) {
    try {
      return new URL(appUrl).host === originHost;
    } catch {
      return false;
    }
  }
  return false;
}

export function forbiddenOrigin() {
  return Response.json({ error: "Ungültige Herkunft der Anfrage." }, { status: 403 });
}
