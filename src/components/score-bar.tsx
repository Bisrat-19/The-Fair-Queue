import type { ScoreBreakdown } from "@/lib/allocation";

const PARTS = [
  { key: "reservation", label: "Fewer rooms", color: "bg-part-rooms", max: 35 },
  { key: "waiting", label: "Days waiting", color: "bg-part-waiting", max: 35 },
  { key: "missed", label: "Missed", color: "bg-part-missed", max: 30 },
] as const;

/**
 * The score drawn as its parts on a 0–100 track.
 * The no-show penalty is hatched over the end of the bar: it is taken away.
 */
export function ScoreBar({ score, compact = false }: { score: ScoreBreakdown; compact?: boolean }) {
  const positive = score.reservation + score.waiting + score.missed;
  const label = `Score ${score.total} out of 100: ${score.reservation} for few recent rooms, ${score.waiting} for days waiting, ${score.missed} for missed requests, minus ${score.penalty} for no-shows.`;

  return (
    <div className={compact ? "w-full min-w-40" : "w-full"}>
      <div className="flex items-baseline justify-between gap-3">
        <span className={`font-display font-bold tabular-nums ${compact ? "text-base" : "text-3xl"}`}>
          {score.total}
          <span className="ml-1 text-xs font-normal text-muted">/ 100</span>
        </span>
      </div>

      <div
        role="img"
        aria-label={label}
        className={`relative mt-1 flex overflow-hidden rounded-sm bg-paper ring-1 ring-line ${compact ? "h-2.5" : "h-4"}`}
      >
        <div className="bar-grow flex h-full" style={{ width: `${positive}%` }}>
          {PARTS.map((p) => (
            <div
              key={p.key}
              className={`h-full ${p.color}`}
              style={{ width: `${(score[p.key] / Math.max(positive, 1)) * 100}%` }}
            />
          ))}
        </div>
        {score.penalty > 0 && (
          <div
            className="penalty-hatch absolute top-0 h-full"
            style={{ left: `${Math.max(positive - score.penalty, 0)}%`, width: `${Math.min(score.penalty, positive)}%` }}
          />
        )}
      </div>

      {!compact && (
        <dl className="mt-3 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
          {PARTS.map((p) => (
            <div key={p.key} className="flex items-center gap-2">
              <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-[2px] ${p.color}`} />
              <dt className="whitespace-nowrap text-muted">{p.label}</dt>
              <dd className="ml-auto font-semibold tabular-nums">
                {score[p.key]}
                <span className="font-normal text-muted">/{p.max}</span>
              </dd>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <span aria-hidden className="penalty-hatch h-2.5 w-2.5 shrink-0 rounded-[2px]" />
            <dt className="text-muted">No-shows</dt>
            <dd className={`ml-auto font-semibold tabular-nums ${score.penalty ? "text-danger" : ""}`}>
              −{score.penalty}
            </dd>
          </div>
        </dl>
      )}
      {compact && (
        <p className="mt-1 text-xs text-muted tabular-nums">
          {score.reservation} + {score.waiting} + {score.missed}
          {score.penalty > 0 && <span className="text-danger"> − {score.penalty}</span>}
        </p>
      )}
    </div>
  );
}
