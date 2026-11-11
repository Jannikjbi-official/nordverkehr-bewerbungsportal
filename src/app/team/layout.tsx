import type { Metadata } from "next";
import { Suspense } from "react";
import { Container } from "@/components/ui";
import { TeamNav } from "@/components/team/TeamNav";
import { getCurrentAccess } from "@/lib/auth/session";

export const metadata: Metadata = { title: { default: "Team-Bereich", template: "%s · Team | Nordverkehr" }, robots: { index: false } };

export default function TeamLayout({ children }: LayoutProps<"/team">) {
  return (
    <div className="pt-24 sm:pt-28 pb-10">
      <Container wide>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
          <Suspense fallback={<div className="hidden lg:block nv-skeleton h-96" />}>
            <NavWithAccess />
          </Suspense>
          <div className="min-w-0">{children}</div>
        </div>
      </Container>
    </div>
  );
}

async function NavWithAccess() {
  const { access } = await getCurrentAccess();
  return <TeamNav isAdmin={!!access?.isAdmin} />;
}
