import { NextRequest } from "next/server";
import { handlers } from "@/auth";
import { handleDiscordIss } from "@/lib/auth/callback";

export const { POST } = handlers;

export async function GET(req: NextRequest) {
  const result = handleDiscordIss(new URL(req.url));
  if (result.action === "reject") {
    return Response.redirect(new URL("/login?error=AccessDenied", req.url), 302);
  }
  if (result.action === "strip") {
    // Gleicher Request (Cookies, Header) – nur ohne den von Discord angehängten `iss`
    return handlers.GET(new NextRequest(result.url, { method: "GET", headers: req.headers }));
  }
  return handlers.GET(req);
}
