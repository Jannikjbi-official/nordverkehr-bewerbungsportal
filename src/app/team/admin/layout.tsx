import type { Metadata } from "next";
import { AdminNav } from "@/components/team/AdminNav";

export const metadata: Metadata = { title: "Admin-Bereich" };

/** Admin-Bereich: alle Einstellungen, aufgeteilt in Bereiche. Zugriff prüft jede Seite (requireAdmin). */
export default function AdminLayout({ children }: LayoutProps<"/team/admin">) {
  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <div>
          <p className="nv-label">Admin // Bereich</p>
          <h1 className="nv-headline text-4xl mt-2">
            Admin-<em>Bereich.</em>
          </h1>
        </div>
        <AdminNav />
      </header>
      {children}
    </div>
  );
}
