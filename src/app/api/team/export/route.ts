import { accessErrorResponse, assertTeamApi } from "@/lib/auth/session";
import { listApplications, parseFilters, voteSummary } from "@/lib/team/queries";
import { audit } from "@/lib/audit";
import { STATUS_LABEL } from "@/lib/applications/status";
import { toCsv } from "@/lib/csv";

/** CSV-Export der gefilterten Bewerbungen (ohne Antworttexte – Datensparsamkeit). */
export async function GET(req: Request) {
  let ctx;
  try {
    ctx = await assertTeamApi();
  } catch (err) {
    return accessErrorResponse(err);
  }
  const url = new URL(req.url);
  const sp: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const all = url.searchParams.getAll(key);
    sp[key] = all.length > 1 ? all : all[0];
  }
  const filters = parseFilters(sp);
  const { rows } = await listApplications(filters, { all: true });

  const csv = toCsv(
    ["Bewerbungs-ID", "Position", "Status", "Discord-Name", "Anzeigename", "Eingang", "Entschieden", "Pro", "Contra", "Enthaltung"],
    rows.map((r) => {
      const v = voteSummary(r.votes);
      return [
        r.publicId ?? "",
        r.position.title,
        STATUS_LABEL[r.status],
        r.user.username,
        r.user.globalName ?? "",
        r.submittedAt?.toISOString() ?? "",
        r.decidedAt?.toISOString() ?? "",
        v.pro,
        v.contra,
        v.abstain,
      ];
    }),
  );
  await audit("export.csv", { actorId: ctx.user.id, meta: { rows: rows.length } });
  const date = new Date().toISOString().slice(0, 10);
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bewerbungen-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
