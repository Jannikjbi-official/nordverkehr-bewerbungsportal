import { describe, expect, it } from "vitest";
import { handleDiscordIss } from "@/lib/auth/callback";

const base = "https://bewerbung.nordverkehr.xyz/api/auth/callback/discord";

describe("handleDiscordIss", () => {
  it("entfernt den iss-Parameter von Discord und behält code/state", () => {
    const r = handleDiscordIss(new URL(`${base}?code=abc&state=xyz&iss=https%3A%2F%2Fdiscord.com`));
    expect(r.action).toBe("strip");
    if (r.action === "strip") {
      expect(r.url.searchParams.has("iss")).toBe(false);
      expect(r.url.searchParams.get("code")).toBe("abc");
      expect(r.url.searchParams.get("state")).toBe("xyz");
    }
  });
  it("akzeptiert Discord-Varianten", () => {
    for (const iss of ["https://discord.com/", "https://discordapp.com", "https://ptb.discord.com"]) {
      expect(handleDiscordIss(new URL(`${base}?code=a&iss=${encodeURIComponent(iss)}`)).action).toBe("strip");
    }
  });
  it("lehnt fremde Issuer ab", () => {
    for (const iss of ["https://evil.example", "https://discord.com.evil.example", "http://discord.com"]) {
      expect(handleDiscordIss(new URL(`${base}?code=a&iss=${encodeURIComponent(iss)}`)).action).toBe("reject");
    }
  });
  it("lässt andere Routen und Callbacks ohne iss unverändert", () => {
    expect(handleDiscordIss(new URL(`${base}?code=a`)).action).toBe("keep");
    expect(handleDiscordIss(new URL("https://bewerbung.nordverkehr.xyz/api/auth/session?iss=x")).action).toBe("keep");
  });
});
