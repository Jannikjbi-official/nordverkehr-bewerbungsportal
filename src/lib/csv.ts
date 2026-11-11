/**
 * CSV (Semikolon, Excel-freundlich für DE). Schützt vor CSV-Injection:
 * Zellen, die mit = + - @ Tab oder CR beginnen, werden mit ' entschärft.
 */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[";\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n");
}
