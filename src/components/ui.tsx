import type { ReactNode } from "react";
import {
  Camera,
  Code,
  Confetti,
  Cube,
  Headset,
  ShieldCheck,
  UsersThree,
} from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import type { ApplicationStatus, DeliveryStatus } from "@prisma/client";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/applications/status";
import { avatarUrl } from "@/lib/discord/snowflake";

export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Container({ children, className, wide }: { children: ReactNode; className?: string; wide?: boolean }) {
  return <div className={cn("mx-auto px-4 sm:px-6", wide ? "max-w-7xl" : "max-w-6xl", className)}>{children}</div>;
}

/** Seitenkopf im Stil der Hauptseite: Label, große Serif-Headline mit kursivem Teil. */
export function PageHero({
  label,
  title,
  emphasis,
  children,
  aside,
  compact,
}: {
  label: string;
  title: ReactNode;
  emphasis?: ReactNode;
  children?: ReactNode;
  aside?: ReactNode;
  compact?: boolean;
}) {
  return (
    <section className={cn("relative overflow-hidden", compact ? "pt-28 pb-8 sm:pt-32" : "pt-32 pb-12 sm:pt-40 sm:pb-16")}>
      <div className="absolute inset-0 nv-hero-glow pointer-events-none" aria-hidden />
      <div className="absolute inset-0 nv-grid-bg opacity-60 pointer-events-none" aria-hidden />
      <Container className="relative">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="nv-label nv-anim">{label}</p>
            <h1
              className={cn(
                "nv-headline nv-anim mt-5",
                compact ? "text-4xl sm:text-5xl" : "text-5xl sm:text-6xl lg:text-7xl",
              )}
              style={{ "--i": 1 } as React.CSSProperties}
            >
              {title}
              {emphasis && (
                <>
                  {" "}
                  <em>{emphasis}</em>
                </>
              )}
            </h1>
            {children && (
              <div className="nv-anim mt-5 text-base sm:text-lg text-muted max-w-2xl" style={{ "--i": 2 } as React.CSSProperties}>
                {children}
              </div>
            )}
          </div>
          {aside && (
            <div className="nv-anim" style={{ "--i": 3 } as React.CSSProperties}>
              {aside}
            </div>
          )}
        </div>
      </Container>
    </section>
  );
}

export function SectionTitle({ label, title, emphasis, children }: { label: string; title: string; emphasis?: string; children?: ReactNode }) {
  return (
    <div className="mb-8">
      <p className="nv-label">{label}</p>
      <h2 className="nv-headline text-3xl sm:text-4xl mt-4">
        {title} {emphasis && <em>{emphasis}</em>}
      </h2>
      {children && <p className="mt-3 text-muted max-w-2xl">{children}</p>}
    </div>
  );
}

export function StatusBadge({ status, className }: { status: ApplicationStatus; className?: string }) {
  return (
    <span className={cn("nv-pill", `nv-tone-${STATUS_TONE[status]}`, className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

const DELIVERY_LABEL: Record<DeliveryStatus, string> = {
  PENDING: "Wird zugestellt",
  SENT: "Per DM zugestellt",
  FAILED: "DM fehlgeschlagen",
  DM_CLOSED: "DMs deaktiviert",
  NOT_SENT: "Nur im Portal",
};
const DELIVERY_TONE: Record<DeliveryStatus, string> = {
  PENDING: "nv-tone-warn",
  SENT: "nv-tone-success",
  FAILED: "nv-tone-danger",
  DM_CLOSED: "nv-tone-danger",
  NOT_SENT: "nv-tone-muted",
};

export function DeliveryBadge({ status }: { status: DeliveryStatus }) {
  return <span className={cn("nv-pill !text-[0.7rem] !py-0.5", DELIVERY_TONE[status])}>{DELIVERY_LABEL[status]}</span>;
}

export function Avatar({
  discordId,
  avatar,
  size = 40,
  className,
}: {
  discordId: string;
  avatar: string | null;
  size?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarUrl(discordId, avatar, size > 64 ? 256 : 128)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className={cn("rounded-full bg-surface-2 shrink-0", className)}
      style={{ width: size, height: size }}
    />
  );
}

export function EmptyState({ icon: IconC, title, children, action }: { icon?: Icon; title: string; children?: ReactNode; action?: ReactNode }) {
  const I = IconC ?? UsersThree;
  return (
    <div className="nv-card p-10 text-center flex flex-col items-center gap-3">
      <div className="h-12 w-12 rounded-xl grid place-items-center bg-red-soft text-red-text">
        <I size={24} aria-hidden />
      </div>
      <h3 className="font-semibold text-lg">{title}</h3>
      {children && <div className="text-sm text-muted max-w-md">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

const POSITION_ICONS: Record<string, Icon> = {
  headset: Headset,
  shield: ShieldCheck,
  code: Code,
  camera: Camera,
  cube: Cube,
  confetti: Confetti,
  users: UsersThree,
};
export const POSITION_ICON_KEYS = Object.keys(POSITION_ICONS);

export function PositionIcon({ icon, size = 22, className }: { icon: string; size?: number; className?: string }) {
  const I = POSITION_ICONS[icon] ?? UsersThree;
  return <I size={size} weight="duotone" className={className} aria-hidden />;
}

export function IconTile({ icon, className }: { icon: string; className?: string }) {
  return (
    <div
      className={cn(
        "h-12 w-12 shrink-0 rounded-xl grid place-items-center text-red-text border border-red-line bg-red-soft",
        className,
      )}
      style={{ boxShadow: "0 0 24px rgba(196,30,30,0.18)" }}
    >
      <PositionIcon icon={icon} />
    </div>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
  icon: I,
  className,
}: {
  tone?: "info" | "warn" | "danger" | "success" | "accent";
  title?: string;
  children?: ReactNode;
  icon?: Icon;
  className?: string;
}) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-xl border px-4 py-3 flex gap-3", `nv-tone-${tone}`, className)}>
      {I && <I size={20} className="shrink-0 mt-0.5" aria-hidden />}
      <div className="text-sm">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-fg-2 mt-0.5">{children}</div>}
      </div>
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="nv-card p-5">
      <p className="nv-mono">{label}</p>
      <p className="mt-2 text-3xl font-display">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function formatRelative(date: Date | string, now = new Date()) {
  const d = new Date(date);
  const diff = (d.getTime() - now.getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat("de", { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  if (abs < 86400 * 365) return rtf.format(Math.round(diff / (86400 * 30)), "month");
  return rtf.format(Math.round(diff / (86400 * 365)), "year");
}

export function formatDay(d: Date | string | null | undefined) {
  if (!d) return "–";
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: "Europe/Berlin" }).format(new Date(d));
}

export function formatDayTime(d: Date | string | null | undefined) {
  if (!d) return "–";
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(
    new Date(d),
  );
}
