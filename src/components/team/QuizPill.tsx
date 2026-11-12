/** Ergebnis des Regel-Quiz als kleine Pille („Quiz 8/10“), rot unter der Mindestpunktzahl der Stelle. */
export function QuizPill({ correct, total, min }: { correct: number | null; total: number | null; min?: number | null }) {
  if (correct === null || !total) return null;
  const low = min !== null && min !== undefined && correct < min;
  return (
    <span
      className={`nv-pill !py-0.5 !px-2 tabular-nums ${low ? "nv-tone-danger" : correct === total ? "nv-tone-success" : "nv-tone-info"}`}
      title={`Regel-Quiz: ${correct} von ${total} richtig${low ? ` – unter der Mindestpunktzahl (${min})` : ""}`}
    >
      Quiz {correct}/{total}
    </span>
  );
}
