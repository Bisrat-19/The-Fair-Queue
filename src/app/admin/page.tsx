import { connection } from "next/server";
import { checkInAction, loadDemoAction, markNoShowAction, runCutoffAction } from "@/app/actions";
import { ActionButton } from "@/components/action-button";
import { ScoreBar } from "@/components/score-bar";
import { StatusPill, requestStatus } from "@/components/status-pill";
import { currentPenaltyLevel, type ScoreBreakdown } from "@/lib/allocation";
import { getAdminView } from "@/lib/booking-service";
import { fmtBlock, fmtDay, groupByDay } from "@/lib/format";

// Always live data (bookings change every minute), so don't try to prerender this page.
export const instant = false;

export default async function AdminPage() {
  await connection(); // always render with fresh data
  const now = new Date();
  const { rooms, slots } = await getAdminView(now);
  const busy = slots.filter((s) => s.requests.length > 0);
  const pending = slots.some((s) => !s.decided && s.requests.length > 0);

  return (
    <div className="space-y-10">
      <section className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">Staff view</h1>
          <p className="mt-3 text-lg text-muted">
            {rooms.length} rooms. Each block is decided at 8 PM the day before: first come, first served
            when there are enough rooms, ranked by score when there aren&apos;t.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <ActionButton
            action={loadDemoAction}
            label="Load demo"
            pendingLabel="Loading…"
            confirm="This deletes all current data and loads the demo. Continue?"
          />
          <ActionButton
            action={runCutoffAction}
            label="Run 8 PM decision now"
            pendingLabel="Deciding…"
            variant="primary"
            disabled={!pending}
          />
        </div>
      </section>

      {busy.length === 0 && (
        <p className="rounded-lg border border-dashed border-line bg-surface p-8 text-center text-muted">
          No requests yet. Load the demo, or ask for a room on the Students page.
        </p>
      )}

      {groupByDay(busy, (s) => s.startsAt).map(({ day, items }) => (
        <section key={day.toDateString()} className="space-y-6">
          <h2 className="font-display text-2xl font-bold tracking-tight">{fmtDay(day)}</h2>

          {items.map((slot) => {
            const scored = slot.requests.some((r) => r.scoreDetail);
            return (
              <article key={slot.id} className="overflow-hidden rounded-lg border border-line bg-surface">
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
                  <div className="flex items-baseline gap-4">
                    <h3 className="font-display text-xl font-bold tabular-nums">{fmtBlock(slot.startsAt, slot.endsAt)}</h3>
                    <span className="text-sm text-muted">
                      {slot.requests.length} asked for {rooms.length} rooms
                    </span>
                  </div>
                  <DemandNote decided={slot.decided} high={slot.highDemand} />
                </header>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="text-xs text-muted">
                      <tr className="border-b border-line">
                        <th className="px-5 py-2 font-medium">Student</th>
                        {scored && <th className="px-5 py-2 font-medium">Score</th>}
                        <th className="px-5 py-2 font-medium">Result</th>
                        <th className="px-5 py-2 font-medium">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {slot.requests.map((r) => {
                        const s = requestStatus(r);
                        const level = currentPenaltyLevel(r.student.penaltyLevel, r.student.lastNoShowAt, now);
                        return (
                          <tr key={r.id} className="align-top">
                            <td className="px-5 py-3.5">
                              <p className="font-semibold">{r.student.name}</p>
                              <p className="text-xs text-muted">
                                {r.student.studentId}
                                {level > 0 && (
                                  <span className={level >= 2 ? "text-danger" : "text-wait"}>
                                    {" "}
                                    {level === 1 ? "one no-show (warning)" : `no-show level ${level}`}
                                  </span>
                                )}
                              </p>
                            </td>
                            {scored && (
                              <td className="w-64 px-5 py-3.5">
                                {r.scoreDetail ? (
                                  <ScoreBar score={r.scoreDetail as ScoreBreakdown} compact />
                                ) : (
                                  <span className="text-xs text-muted">Asked after 8 PM</span>
                                )}
                              </td>
                            )}
                            <td className="px-5 py-3.5">
                              <StatusPill tone={s.tone}>{s.text}</StatusPill>
                            </td>
                            <td className="px-5 py-3.5">
                              {r.reservation?.status === "BOOKED" && (
                                <div className="flex flex-wrap justify-end gap-2">
                                  <ActionButton
                                    action={checkInAction}
                                    fields={{ reservationId: r.reservation.id }}
                                    label="Check in"
                                    pendingLabel="Saving…"
                                  />
                                  <ActionButton
                                    action={markNoShowAction}
                                    fields={{ reservationId: r.reservation.id }}
                                    label="No-show"
                                    pendingLabel="Saving…"
                                    variant="danger"
                                    confirm={`Mark ${r.student.name} as a no-show? Their room goes to the next person in the waiting line.`}
                                  />
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </article>
            );
          })}
        </section>
      ))}

      <ScoreKey />
    </div>
  );
}

function DemandNote({ decided, high }: { decided: boolean; high: boolean }) {
  if (!decided)
    return (
      <StatusPill tone="pending">
        {high ? "More requests than rooms: will rank by score" : "Enough rooms: first come, first served"}
      </StatusPill>
    );
  return high ? (
    <StatusPill tone="wait">Ranked by score</StatusPill>
  ) : (
    <StatusPill tone="room">First come, first served</StatusPill>
  );
}

function ScoreKey() {
  return (
    <aside className="rounded-lg border border-line bg-surface p-5 text-sm text-muted sm:p-6">
      <h2 className="font-display text-lg font-bold text-ink">How the score works</h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        <li className="flex gap-2">
          <span aria-hidden className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-[2px] bg-part-rooms" />
          Up to 35 for few rooms in the last 30 days (no-shows count as rooms used).
        </li>
        <li className="flex gap-2">
          <span aria-hidden className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-[2px] bg-part-waiting" />
          Up to 35 for days since their last room (14 days or never = full).
        </li>
        <li className="flex gap-2">
          <span aria-hidden className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-[2px] bg-part-missed" />
          Up to 30 for requests that didn&apos;t get a room in the last 14 days (one per day, reset after a room).
        </li>
        <li className="flex gap-2">
          <span aria-hidden className="penalty-hatch mt-1.5 h-2.5 w-2.5 shrink-0 rounded-[2px]" />
          Minus 10, 20 or 30 for repeated no-shows. Drops one step after 30 days without one.
        </li>
      </ul>
    </aside>
  );
}
