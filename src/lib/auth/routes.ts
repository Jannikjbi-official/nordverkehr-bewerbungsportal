/**
 * Routen-Klassifizierung für den Proxy. Rein und testbar.
 * Wichtig: Der Proxy ist nur die erste Hürde – jede Seite, jede Server
 * Action und jeder Route-Handler prüft zusätzlich selbst (requireTeam & Co.).
 */
export type RouteKind = "team-page" | "team-api" | "user-page" | "user-api" | "public";

const USER_PAGE_PREFIXES = ["/dashboard", "/bewerben", "/konto"];
const USER_API_PREFIXES = ["/api/me", "/api/uploads"];

function matches(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

export function classifyRoute(pathname: string): RouteKind {
  // Normalisieren: doppelte Slashes, abschließender Slash, Groß/Klein
  const p = ("/" + pathname.split("/").filter(Boolean).join("/")).toLowerCase();
  if (matches(p, "/api/team")) return "team-api";
  if (matches(p, "/team")) return "team-page";
  if (USER_API_PREFIXES.some((x) => matches(p, x))) return "user-api";
  if (USER_PAGE_PREFIXES.some((x) => matches(p, x))) return "user-page";
  return "public";
}

export type ProxyDecision =
  | { action: "next" }
  | { action: "redirect"; to: string }
  | { action: "json"; status: 401 | 403; error: string };

export function decideAccess(
  kind: RouteKind,
  pathWithSearch: string,
  state: { loggedIn: boolean; isTeam: boolean },
): ProxyDecision {
  if (kind === "public") return { action: "next" };
  const isApi = kind === "team-api" || kind === "user-api";

  if (!state.loggedIn) {
    return isApi
      ? { action: "json", status: 401, error: "Nicht eingeloggt." }
      : { action: "redirect", to: `/login?callbackUrl=${encodeURIComponent(pathWithSearch)}` };
  }

  if ((kind === "team-page" || kind === "team-api") && !state.isTeam) {
    return isApi ? { action: "json", status: 403, error: "Kein Zugriff." } : { action: "redirect", to: "/kein-zugriff" };
  }

  return { action: "next" };
}
