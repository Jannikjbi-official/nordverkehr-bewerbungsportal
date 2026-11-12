/** Kennzeichnung für Testbewerbungen (Admin → Testbewerbungen). */
export function TestPill({ scenario }: { scenario?: string | null }) {
  return (
    <span
      className="nv-pill nv-tone-warn !py-0.5 !px-2 font-mono text-[0.7rem]"
      title={`Testbewerbung${scenario ? ` – Szenario „${scenario}“` : ""} – kein echter Bewerber, DMs werden nicht verschickt`}
    >
      TEST
    </span>
  );
}
