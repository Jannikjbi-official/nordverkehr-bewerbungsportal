import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { DiscordLogo, LockSimple, Warning } from "@phosphor-icons/react/ssr";
import { devSignInAction, signInAction } from "@/app/actions/auth";
import { connection } from "next/server";
import { isDevLoginEnabled } from "@/lib/auth/dev";
import { db } from "@/lib/db";
import { Container, Notice } from "@/components/ui";

export const metadata: Metadata = { title: "Einloggen" };

const ERRORS: Record<string, string> = {
  AccessDenied: "Der Login wurde abgebrochen oder abgelehnt.",
  Configuration: "Der Login ist gerade nicht richtig eingerichtet. Bitte sag dem Team Bescheid.",
  Verification: "Der Login-Link ist abgelaufen. Versuch es nochmal.",
  Default: "Beim Login ist etwas schiefgelaufen. Versuch es nochmal.",
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <section className="relative min-h-[80dvh] flex items-center pt-28 pb-16">
      <div className="absolute inset-0 nv-hero-glow pointer-events-none" aria-hidden />
      <Container className="relative w-full">
        <div className="mx-auto max-w-md nv-card p-8 sm:p-10 nv-anim bg-surface">
          <Image src="/logo.png" alt="" width={257} height={318} className="h-14 w-auto mx-auto" />
          <p className="nv-label justify-center w-full mt-6">Bewerbungsportal</p>
          <h1 className="nv-headline text-4xl text-center mt-3">
            Moin. <em>Einloggen.</em>
          </h1>
          <p className="text-center text-muted mt-3 text-sm">
            Wir nutzen ausschließlich Discord. Kein Passwort, kein extra Account.
          </p>

          <Suspense fallback={null}>
            <LoginError searchParams={searchParams} />
          </Suspense>

          <Suspense fallback={<LoginButton callbackUrl="/dashboard" />}>
            <LoginForm searchParams={searchParams} />
          </Suspense>

          {isDevLoginEnabled() && (
            <Suspense fallback={null}>
              <DevLogin searchParams={searchParams} />
            </Suspense>
          )}

          <div className="mt-6 flex gap-2.5 text-xs text-muted">
            <LockSimple size={16} className="shrink-0 mt-0.5" aria-hidden />
            <p>
              Wir erhalten nur deinen Discord-Namen, deine ID und deinen Avatar – keine E-Mail, keine Server-Liste.
              Mehr dazu in den{" "}
              <Link href="/datenschutz" className="nv-link">
                Datenschutzhinweisen
              </Link>
              .
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}

async function LoginError({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { error } = await searchParams;
  if (!error) return null;
  const key = Array.isArray(error) ? error[0] : error;
  return (
    <Notice tone="danger" icon={Warning} className="mt-6">
      {ERRORS[key] ?? ERRORS.Default}
    </Notice>
  );
}

async function LoginForm({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { callbackUrl } = await searchParams;
  const cb = typeof callbackUrl === "string" ? callbackUrl : "/dashboard";
  return <LoginButton callbackUrl={cb} />;
}

function LoginButton({ callbackUrl }: { callbackUrl: string }) {
  return (
    <form action={signInAction} className="mt-8">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <button type="submit" className="nv-btn w-full !py-3 text-white" style={{ background: "#5865f2" }}>
        <DiscordLogo size={20} weight="fill" aria-hidden />
        Mit Discord einloggen
      </button>
    </form>
  );
}

async function DevLogin({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  await connection();
  if (!isDevLoginEnabled()) return null;
  const { callbackUrl } = await searchParams;
  const users = await db.user.findMany({ orderBy: [{ isTeam: "desc" }, { createdAt: "asc" }], take: 12 });
  if (!users.length) return null;
  return (
    <div className="mt-6 rounded-xl border border-dashed border-line-strong p-4">
      <p className="nv-mono">Dev-Login (nur lokal)</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {users.map((u) => (
          <form key={u.id} action={devSignInAction}>
            <input type="hidden" name="userId" value={u.id} />
            <input type="hidden" name="callbackUrl" value={typeof callbackUrl === "string" ? callbackUrl : u.isTeam ? "/team" : "/dashboard"} />
            <button type="submit" className="nv-btn nv-btn-ghost nv-btn-sm">
              {u.globalName || u.username}
              {u.isTeam ? " · Team" : ""}
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
