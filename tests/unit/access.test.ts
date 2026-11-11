import { describe, expect, it, vi } from "vitest";
import { evaluateRoles, isCacheFresh, resolveAccess, type AccessDeps, type AccessSubject } from "@/lib/auth/access";

const TEAM = "1570139752210890833";
const ADMIN = "1569735822167642123";
const GUILD = "1234567890123456789";
const NOW = new Date("2026-11-11T12:00:00Z");

function deps(over: Partial<AccessDeps> = {}, config: Partial<AccessDeps["config"]> = {}): AccessDeps {
  return {
    config: { guildId: GUILD, teamRoleId: TEAM, adminRoleId: ADMIN, ttlMs: 60_000, ...config },
    now: () => NOW,
    fetchMember: vi.fn(async () => ({ roles: [TEAM], joinedAt: new Date("2026-01-01"), nick: null })),
    persist: vi.fn(async () => {}),
    ...over,
  };
}

function subject(over: Partial<AccessSubject> = {}): AccessSubject {
  return { id: "u1", discordId: "111", inGuild: false, isTeam: false, isAdmin: false, guildJoinedAt: null, roleCheckedAt: null, ...over };
}

describe("evaluateRoles", () => {
  it("erkennt die Team-Rolle", () => {
    expect(evaluateRoles([TEAM], { teamRoleId: TEAM, adminRoleId: ADMIN })).toEqual({ isTeam: true, isAdmin: false });
  });
  it("Admin nur mit Team-Rolle UND Admin-Rolle", () => {
    expect(evaluateRoles([ADMIN], { teamRoleId: TEAM, adminRoleId: ADMIN })).toEqual({ isTeam: false, isAdmin: false });
    expect(evaluateRoles([TEAM, ADMIN], { teamRoleId: TEAM, adminRoleId: ADMIN })).toEqual({ isTeam: true, isAdmin: true });
  });
  it("ohne konfigurierte Admin-Rolle ist niemand Admin", () => {
    expect(evaluateRoles([TEAM, ADMIN], { teamRoleId: TEAM, adminRoleId: undefined }).isAdmin).toBe(false);
  });
  it("ohne konfigurierte Team-Rolle hat niemand Zugriff", () => {
    expect(evaluateRoles([TEAM], { teamRoleId: undefined }).isTeam).toBe(false);
  });
});

describe("isCacheFresh", () => {
  it("frisch innerhalb der TTL, abgelaufen danach", () => {
    expect(isCacheFresh(new Date(NOW.getTime() - 30_000), NOW, 60_000)).toBe(true);
    expect(isCacheFresh(new Date(NOW.getTime() - 60_000), NOW, 60_000)).toBe(false);
    expect(isCacheFresh(null, NOW, 60_000)).toBe(false);
  });
  it("Zeitstempel in der Zukunft gilt nicht als frisch", () => {
    expect(isCacheFresh(new Date(NOW.getTime() + 5_000), NOW, 60_000)).toBe(false);
  });
});

describe("resolveAccess", () => {
  it("fragt Discord ab, wenn kein Cache existiert, und speichert das Ergebnis", async () => {
    const d = deps();
    const a = await resolveAccess(subject(), d);
    expect(a).toMatchObject({ isTeam: true, isAdmin: false, inGuild: true, source: "discord" });
    expect(d.fetchMember).toHaveBeenCalledWith(GUILD, "111");
    expect(d.persist).toHaveBeenCalledWith("u1", expect.objectContaining({ isTeam: true, roleCheckedAt: NOW }));
  });

  it("nutzt den frischen Cache ohne Discord-Abfrage", async () => {
    const d = deps();
    const a = await resolveAccess(subject({ isTeam: true, inGuild: true, roleCheckedAt: new Date(NOW.getTime() - 10_000) }), d);
    expect(a).toMatchObject({ isTeam: true, source: "cache" });
    expect(d.fetchMember).not.toHaveBeenCalled();
  });

  it("entzogene Rolle: nach Ablauf des Caches kein Zugriff mehr", async () => {
    const d = deps({ fetchMember: vi.fn(async () => ({ roles: [], joinedAt: null, nick: null })) });
    const stale = subject({ isTeam: true, isAdmin: true, inGuild: true, roleCheckedAt: new Date(NOW.getTime() - 61_000) });
    const a = await resolveAccess(stale, d);
    expect(a).toMatchObject({ isTeam: false, isAdmin: false, source: "discord" });
    expect(d.persist).toHaveBeenCalledWith("u1", expect.objectContaining({ isTeam: false, isAdmin: false }));
  });

  it("invalidierter Cache (Worker setzt roleCheckedAt=null) erzwingt sofort neue Prüfung", async () => {
    const d = deps({ fetchMember: vi.fn(async () => ({ roles: [], joinedAt: null, nick: null })) });
    const a = await resolveAccess(subject({ isTeam: true, roleCheckedAt: null }), d);
    expect(d.fetchMember).toHaveBeenCalledTimes(1);
    expect(a.isTeam).toBe(false);
  });

  it("force=true umgeht den Cache (z. B. beim Login)", async () => {
    const d = deps({ fetchMember: vi.fn(async () => ({ roles: [], joinedAt: null, nick: null })) });
    const fresh = subject({ isTeam: true, roleCheckedAt: new Date(NOW.getTime() - 1_000) });
    const a = await resolveAccess(fresh, d, { force: true });
    expect(a.isTeam).toBe(false);
    expect(d.fetchMember).toHaveBeenCalled();
  });

  it("Nutzer nicht (mehr) auf dem Server: kein Zugriff, Ergebnis gespeichert", async () => {
    const d = deps({ fetchMember: vi.fn(async () => null) });
    const a = await resolveAccess(subject({ isTeam: true }), d);
    expect(a).toMatchObject({ inGuild: false, isTeam: false, isAdmin: false });
    expect(d.persist).toHaveBeenCalledWith("u1", expect.objectContaining({ inGuild: false, isTeam: false }));
  });

  it("Fail closed: Discord-Fehler ergibt keinen Zugriff, Cache wird NICHT überschrieben", async () => {
    const d = deps({ fetchMember: vi.fn(async () => Promise.reject(new Error("503"))) });
    const stale = subject({ isTeam: true, roleCheckedAt: new Date(NOW.getTime() - 120_000) });
    const a = await resolveAccess(stale, d);
    expect(a).toMatchObject({ isTeam: false, isAdmin: false, source: "error" });
    expect(d.persist).not.toHaveBeenCalled();
  });

  it("ohne Guild/Team-Rolle in der Konfiguration hat niemand Zugriff", async () => {
    const d = deps({}, { guildId: undefined });
    const a = await resolveAccess(subject({ isTeam: true, roleCheckedAt: NOW }), d);
    expect(a).toMatchObject({ isTeam: false, source: "unconfigured" });
    expect(d.fetchMember).not.toHaveBeenCalled();
  });

  it("gecachter Admin verliert Admin-Rechte, wenn ADMIN_ROLE_ID entfernt wird", async () => {
    const d = deps({}, { adminRoleId: undefined });
    const a = await resolveAccess(subject({ isTeam: true, isAdmin: true, roleCheckedAt: new Date(NOW.getTime() - 1_000) }), d);
    expect(a).toMatchObject({ isTeam: true, isAdmin: false, source: "cache" });
  });

  it("übernimmt Admin-Rolle und Beitrittsdatum vom Server", async () => {
    const joined = new Date("2025-05-05T10:00:00Z");
    const d = deps({ fetchMember: vi.fn(async () => ({ roles: [TEAM, ADMIN], joinedAt: joined, nick: null })) });
    const a = await resolveAccess(subject(), d);
    expect(a).toMatchObject({ isAdmin: true, guildJoinedAt: joined });
  });
});
