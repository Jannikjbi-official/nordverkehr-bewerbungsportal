import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import Credentials from "next-auth/providers/credentials";
import { isDevLoginEnabled } from "@/lib/auth/dev";
import { db } from "@/lib/db";
import { snowflakeToDate } from "@/lib/discord/snowflake";

declare module "next-auth" {
  interface Session {
    uid?: string;
    sv?: number;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    uid?: string;
    sv?: number;
  }
}

interface DiscordProfile {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
}

/**
 * Auth.js (v5) – Login ausschließlich über Discord.
 * Scope nur `identify`: Rollen prüft der Bot serverseitig, wir brauchen
 * keine weiteren Rechte vom Nutzer.
 *
 * Sitzungen sind JWTs mit Nutzer-ID + sessionVersion. Die Version wird bei
 * jedem Request mit der Datenbank verglichen (src/lib/auth/session.ts) –
 * Account-Löschung oder "überall abmelden" invalidiert damit sofort.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Discord({
      authorization: { params: { scope: "identify" } },
    }),
    // NUR lokal: Login als Seed-Nutzer ohne Discord (siehe README)
    ...(isDevLoginEnabled()
      ? [
          Credentials({
            id: "dev-login",
            name: "Dev-Login",
            credentials: { userId: {} },
            async authorize(credentials) {
              if (!isDevLoginEnabled()) return null;
              const id = String(credentials?.userId ?? "");
              const user = await db.user.findUnique({ where: { id } });
              return user ? { id: user.id, name: user.username } : null;
            },
          }),
        ]
      : []),
  ],
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: "/login", error: "/login" },
  trustHost: true,
  callbacks: {
    async jwt({ token, account, profile, user: authUser }) {
      if (account?.provider === "dev-login" && authUser?.id && isDevLoginEnabled()) {
        const u = await db.user.update({ where: { id: authUser.id }, data: { lastLoginAt: new Date(), roleCheckedAt: null } });
        token.uid = u.id;
        token.sv = u.sessionVersion;
        return token;
      }
      if (account?.provider === "discord" && profile) {
        const p = profile as unknown as DiscordProfile;
        const user = await db.user.upsert({
          where: { discordId: p.id },
          create: {
            discordId: p.id,
            username: p.username,
            globalName: p.global_name ?? null,
            avatar: p.avatar ?? null,
            discordCreatedAt: snowflakeToDate(p.id),
            lastLoginAt: new Date(),
            // Rolle beim Login immer frisch prüfen
            roleCheckedAt: null,
          },
          update: {
            username: p.username,
            globalName: p.global_name ?? null,
            avatar: p.avatar ?? null,
            lastLoginAt: new Date(),
            roleCheckedAt: null,
          },
        });
        token.uid = user.id;
        token.sv = user.sessionVersion;
        // Keine personenbezogenen Daten im Token, die wir nicht brauchen
        delete token.email;
        delete token.picture;
      }
      return token;
    },
    async session({ session, token }) {
      session.uid = token.uid;
      session.sv = token.sv;
      return session;
    },
  },
  events: {
    async signIn({ profile }) {
      if (!profile) return;
      const p = profile as unknown as DiscordProfile;
      const user = await db.user.findUnique({ where: { discordId: p.id }, select: { id: true } });
      if (user) {
        await db.auditLog.create({ data: { actorId: user.id, action: "auth.login", targetType: "user", targetId: user.id } });
      }
    },
  },
});
