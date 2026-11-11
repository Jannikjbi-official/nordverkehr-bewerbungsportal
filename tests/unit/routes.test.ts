import { describe, expect, it } from "vitest";
import { classifyRoute, decideAccess } from "@/lib/auth/routes";

describe("classifyRoute", () => {
  it.each([
    ["/team", "team-page"],
    ["/team/bewerbungen/abc", "team-page"],
    ["/TEAM/", "team-page"],
    ["//team//einstellungen", "team-page"],
    ["/api/team/ai", "team-api"],
    ["/api/team/export", "team-api"],
    ["/dashboard", "user-page"],
    ["/bewerben/support", "user-page"],
    ["/konto", "user-page"],
    ["/api/uploads/x", "user-api"],
    ["/api/me/export", "user-api"],
    ["/", "public"],
    ["/positionen/support", "public"],
    ["/teamspeak", "public"],
    ["/api/auth/callback/discord", "public"],
  ])("%s ist %s", (path, kind) => {
    expect(classifyRoute(path)).toBe(kind);
  });
});

describe("decideAccess", () => {
  it("öffentliche Routen sind frei", () => {
    expect(decideAccess("public", "/", { loggedIn: false, isTeam: false })).toEqual({ action: "next" });
  });
  it("Team-Seite ohne Login: Login mit Rücksprung", () => {
    expect(decideAccess("team-page", "/team?x=1", { loggedIn: false, isTeam: false })).toEqual({
      action: "redirect",
      to: "/login?callbackUrl=%2Fteam%3Fx%3D1",
    });
  });
  it("Team-Seite ohne Rolle: Kein Zugriff", () => {
    expect(decideAccess("team-page", "/team", { loggedIn: true, isTeam: false })).toEqual({ action: "redirect", to: "/kein-zugriff" });
  });
  it("Team-API ohne Login 401, ohne Rolle 403", () => {
    expect(decideAccess("team-api", "/api/team/ai", { loggedIn: false, isTeam: false })).toMatchObject({ action: "json", status: 401 });
    expect(decideAccess("team-api", "/api/team/ai", { loggedIn: true, isTeam: false })).toMatchObject({ action: "json", status: 403 });
  });
  it("Team mit Rolle: weiter", () => {
    expect(decideAccess("team-page", "/team", { loggedIn: true, isTeam: true })).toEqual({ action: "next" });
    expect(decideAccess("team-api", "/api/team/x", { loggedIn: true, isTeam: true })).toEqual({ action: "next" });
  });
  it("Bewerber-Bereich braucht nur Login", () => {
    expect(decideAccess("user-page", "/dashboard", { loggedIn: true, isTeam: false })).toEqual({ action: "next" });
    expect(decideAccess("user-api", "/api/me/export", { loggedIn: false, isTeam: false })).toMatchObject({ status: 401 });
  });
});
