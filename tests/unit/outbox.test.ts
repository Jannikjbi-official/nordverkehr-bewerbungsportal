import { describe, expect, it, vi } from "vitest";
import { DiscordAPIError } from "@discordjs/rest";
import { classifyDiscordError, DiscordRequestError, type DiscordApi } from "@/lib/discord/client";
import { backoffMs, executeJob, processJob, type OutboxJobLike, type OutboxStore } from "@/lib/discord/outbox";
import { buildApplicantMessage } from "@/lib/messages/embed";

const NOW = new Date("2026-11-11T12:00:00Z");

function apiError(code: number, status: number) {
  return new DiscordAPIError({ code, message: `Fehler ${code}` }, code, status, "POST", "/x", { body: undefined, files: undefined });
}

function fakeApi(over: Partial<DiscordApi> = {}): DiscordApi {
  return {
    getMember: vi.fn(async () => null),
    openDm: vi.fn(async () => "dm-channel-1"),
    postMessage: vi.fn(async () => "msg-1"),
    deleteMessage: vi.fn(async () => {}),
    editMessage: vi.fn(async () => {}),
    addRole: vi.fn(async () => {}),
    startThread: vi.fn(async () => "thread-1"),
    archiveThread: vi.fn(async () => {}),
    ...over,
  };
}

function fakeStore() {
  const calls: string[] = [];
  const store: OutboxStore = {
    complete: vi.fn(async () => void calls.push("complete")),
    reschedule: vi.fn(async () => void calls.push("reschedule")),
    fail: vi.fn(async () => void calls.push("fail")),
  };
  return { store, calls };
}

const message = buildApplicantMessage({ title: "Test", body: "Moin", publicId: "NV-2026-0001", statusUrl: "https://bewerbung.nordverkehr.xyz/dashboard/x" });

function dmJob(over: Partial<OutboxJobLike> = {}): OutboxJobLike {
  return {
    id: "job1",
    type: "DM",
    payload: { type: "DM", discordUserId: "111", purpose: "confirmation", message },
    attempts: 0,
    maxAttempts: 5,
    messageId: "m1",
    applicationId: "a1",
    ...over,
  };
}

describe("classifyDiscordError", () => {
  it("50007 = DMs deaktiviert (nicht wiederholen)", () => {
    const e = classifyDiscordError(apiError(50007, 403));
    expect(e.kind).toBe("dm_closed");
    expect(e.retryable).toBe(false);
  });
  it("Unknown Member = not_found", () => {
    expect(classifyDiscordError(apiError(10007, 404)).kind).toBe("not_found");
  });
  it("fehlende Rechte = forbidden (nicht wiederholen)", () => {
    const e = classifyDiscordError(apiError(50013, 403));
    expect(e.kind).toBe("forbidden");
    expect(e.retryable).toBe(false);
  });
  it("5xx und Netzwerkfehler werden wiederholt", () => {
    expect(classifyDiscordError(apiError(0, 502)).retryable).toBe(true);
    expect(classifyDiscordError(new Error("ECONNRESET")).retryable).toBe(true);
  });
});

describe("executeJob: DM", () => {
  it("öffnet den DM-Kanal und sendet die Nachricht", async () => {
    const api = fakeApi();
    const out = await executeJob(dmJob(), api, () => NOW);
    expect(api.openDm).toHaveBeenCalledWith("111");
    expect(api.postMessage).toHaveBeenCalledWith("dm-channel-1", message);
    expect(out).toEqual({ kind: "done", result: { channelId: "dm-channel-1", messageId: "msg-1" } });
  });

  it("DMs deaktiviert: endgültig fehlgeschlagen, dmClosed", async () => {
    const api = fakeApi({ postMessage: vi.fn(async () => Promise.reject(apiError(50007, 403))) });
    expect(await executeJob(dmJob(), api, () => NOW)).toMatchObject({ kind: "failed", dmClosed: true });
  });

  it("Discord-Ausfall: erneuter Versuch mit Backoff", async () => {
    const api = fakeApi({ openDm: vi.fn(async () => Promise.reject(apiError(0, 503))) });
    const out = await executeJob(dmJob({ attempts: 1 }), api, () => NOW);
    expect(out.kind).toBe("retry");
    if (out.kind === "retry") expect(out.runAt.getTime()).toBe(NOW.getTime() + backoffMs(1));
  });

  it("nach maxAttempts: endgültig fehlgeschlagen", async () => {
    const api = fakeApi({ openDm: vi.fn(async () => Promise.reject(apiError(0, 503))) });
    expect(await executeJob(dmJob({ attempts: 4, maxAttempts: 5 }), api, () => NOW)).toMatchObject({ kind: "failed", dmClosed: false });
  });

  it("fehlende Rechte werden nicht wiederholt", async () => {
    const api = fakeApi({ postMessage: vi.fn(async () => Promise.reject(apiError(50013, 403))) });
    expect(await executeJob(dmJob(), api, () => NOW)).toMatchObject({ kind: "failed", dmClosed: false });
  });
});

describe("executeJob: Channel & Rolle", () => {
  it("postet in den Log-Channel", async () => {
    const api = fakeApi();
    const out = await executeJob({ ...dmJob(), type: "CHANNEL_MESSAGE", payload: { type: "CHANNEL_MESSAGE", channelId: "log-1", message } }, api);
    expect(api.postMessage).toHaveBeenCalledWith("log-1", message);
    expect(api.openDm).not.toHaveBeenCalled();
    expect(out.kind).toBe("done");
  });

  it("vergibt die Rolle bei Annahme", async () => {
    const api = fakeApi();
    await executeJob(
      { ...dmJob(), type: "ADD_ROLE", payload: { type: "ADD_ROLE", guildId: "g", discordUserId: "111", roleId: "r", reason: "angenommen" } },
      api,
    );
    expect(api.addRole).toHaveBeenCalledWith("g", "111", "r", "angenommen");
  });
});

describe("processJob → Store", () => {
  it("Erfolg: complete", async () => {
    const { store, calls } = fakeStore();
    await processJob(dmJob(), fakeApi(), store, () => NOW);
    expect(calls).toEqual(["complete"]);
    expect(store.complete).toHaveBeenCalledWith(expect.objectContaining({ id: "job1" }), { channelId: "dm-channel-1", messageId: "msg-1" });
  });

  it("DMs deaktiviert: fail mit dmClosed=true (Portal-Hinweis + Team-Markierung)", async () => {
    const { store } = fakeStore();
    await processJob(dmJob(), fakeApi({ openDm: vi.fn(async () => Promise.reject(apiError(50007, 403))) }), store, () => NOW);
    expect(store.fail).toHaveBeenCalledWith(expect.anything(), expect.any(String), { dmClosed: true });
  });

  it("Ausfall: reschedule", async () => {
    const { store, calls } = fakeStore();
    await processJob(dmJob(), fakeApi({ openDm: vi.fn(async () => Promise.reject(new DiscordRequestError("x", "server"))) }), store, () => NOW);
    expect(calls).toEqual(["reschedule"]);
  });
});

describe("backoffMs", () => {
  it("wächst und ist gedeckelt", () => {
    expect(backoffMs(0)).toBeLessThan(backoffMs(1));
    expect(backoffMs(10)).toBe(backoffMs(4));
  });
});

describe("Thread pro Bewerbung", () => {
  const job = (payload: unknown) => ({ id: "j1", type: "CHANNEL_MESSAGE" as const, payload, attempts: 0, maxAttempts: 5, messageId: null, applicationId: "a1" });
  it("startet nach dem Post einen Thread und liefert die ID", async () => {
    const api = fakeApi();
    const r = await executeJob(job({ type: "CHANNEL_MESSAGE", channelId: "c1", message: { content: "x" }, startThread: "NV-1 · Support" }), api);
    expect(r).toEqual({ kind: "done", result: { messageId: "msg-1", threadId: "thread-1" } });
    expect(api.startThread).toHaveBeenCalledWith("c1", "msg-1", "NV-1 · Support");
  });
  it("fehlende Thread-Rechte lassen die Nachricht trotzdem als zugestellt gelten", async () => {
    const api = fakeApi({ startThread: vi.fn(async () => { throw new DiscordRequestError("Keine Rechte", "forbidden"); }) });
    const r = await executeJob(job({ type: "CHANNEL_MESSAGE", channelId: "c1", message: { content: "x" }, startThread: "NV-1" }), api);
    expect(r.kind).toBe("done");
    expect(r.kind === "done" && r.result.threadError).toBeTruthy();
  });
  it("archiviert den Thread nach dem Abschluss-Hinweis", async () => {
    const api = fakeApi();
    await executeJob(job({ type: "CHANNEL_MESSAGE", channelId: "t1", message: { content: "x" }, archiveThread: true }), api);
    expect(api.archiveThread).toHaveBeenCalledWith("t1");
  });
});
