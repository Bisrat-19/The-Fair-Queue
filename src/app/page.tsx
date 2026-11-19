import Link from "next/link";
import { connection } from "next/server";
import { cancelRequestAction, requestRoomAction } from "@/app/actions";
import { ActionButton } from "@/components/action-button";
import { ScoreBar } from "@/components/score-bar";
import { StatusPill, requestStatus } from "@/components/status-pill";
import { scoreStudent, type ScoreBreakdown } from "@/lib/allocation";
import { getStudentView } from "@/lib/booking-service";
import { fmtBlock, fmtDay, fmtShortDay, fmtTime, groupByDay } from "@/lib/format";

// Always live data (bookings change every minute), so don't try to prerender this page.
export const instant = false;

export default async function StudentPage({ searchParams }: PageProps<"/">) {
  await connection(); // always render with fresh data
  const params = await searchParams;
  const id = typeof params.id === "string" ? params.id.trim().toUpperCase() : "";
  const name = typeof params.name === "string" ? params.name.trim() : "";

  const now = new Date();
  const { student, slots, requests } = await getStudentView(id, now);
  const mine = new Map(requests.map((r) => [r.slotId, r]));
  const canRequest = Boolean(id && (student || name));
  const todayScore = student ? scoreStudent(student.history, now) : null;

  return (
    <div className="space-y-10">
      <section className="max-w-2xl">
        <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">Book a study room</h1>
        <p className="mt-3 text-lg text-muted">
          Ask for a block before 8 PM the day before. If more students ask than there are rooms,
          the rooms go to the students who have had the fewest lately.
        </p>
      </section>

      {/* Who are you? */}
      <section className="rounded-lg border border-line bg-surface p-5 sm:p-6">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Student ID
            <input
              name="id"
              defaultValue={id}
              required
              placeholder="e.g. S1001"
              autoComplete="off"
              className="w-40 rounded-md border border-line bg-paper px-3 py-2 font-semibold uppercase tracking-wide placeholder:font-normal placeholder:normal-case"
            />
          </label>
          {id && !student && (
            <label className="flex flex-col gap-1 text-sm font-medium">
              Your name
              <input
                name="name"
                defaultValue={name}
                required
                placeholder="First time here"
                className="w-48 rounded-md border border-line bg-paper px-3 py-2"
              />
            </label>
          )}
          <button className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink/85">
            {id && !student ? "Continue" : "Show my bookings"}
          </button>
        </form>

        {id && !student && !name && (
          <p className="mt-3 text-sm text-muted">
            We don&apos;t have <strong>{id}</strong> yet. Add your name to make your first request.
          </p>
        )}
        {!id && (
          <p className="mt-3 text-sm text-muted">
            No account needed. Try <Link className="font-semibold text-ink underline" href="/?id=S1001">S1001</Link> (Meron)
            or <Link className="font-semibold text-ink underline" href="/?id=S1005">S1005</Link> (Abel) from the demo.
          </p>
        )}

        {student && todayScore && (
          <div className="mt-6 grid gap-6 border-t border-line pt-6 md:grid-cols-[1fr_2fr]">
            <div>
              <p className="font-display text-xl font-bold">Hi, {student.name}</p>
              <p className="mt-1 text-sm text-muted">
                {student.history.bookingsLast30d} room(s) in the last 30 days.
                {student.history.lastBookingAt
                  ? ` Last one on ${fmtShortDay(student.history.lastBookingAt)}.`
                  : " You haven't had a room yet."}
              </p>
              {student.history.penaltyLevel === 1 && (
                <p className="mt-2 text-sm text-wait">You have one no-show. Another one will lower your score.</p>
              )}
              {student.history.penaltyLevel >= 2 && (
                <p className="mt-2 text-sm text-danger">
                  Recent no-shows lower your score. It recovers after 30 days without another one.
                </p>
              )}
            </div>
            <div>
              <p className="mb-2 text-sm text-muted">Your score if a block is full today</p>
              <ScoreBar score={todayScore} />
            </div>
          </div>
        )}
      </section>

      {/* My requests */}
      {requests.length > 0 && (
        <section>
          <h2 className="font-display text-2xl font-bold tracking-tight">My requests</h2>
          <ul className="mt-4 divide-y divide-line rounded-lg border border-line bg-surface">
            {requests.map((r) => {
              const s = requestStatus(r);
              const cancellable = r.status !== "APPROVED" || r.reservation?.status === "BOOKED";
              const lateCancel = r.slot.startsAt.getTime() - now.getTime() < 2 * 3_600_000;
              return (
                <li key={r.id} className="grid gap-4 p-5 md:grid-cols-[11rem_1fr_auto] md:items-start">
                  <div>
                    <p className="font-display text-lg font-bold tabular-nums">{fmtBlock(r.slot.startsAt, r.slot.endsAt)}</p>
                    <p className="text-sm text-muted">{fmtShortDay(r.slot.startsAt)}</p>
                    <div className="mt-2">
                      <StatusPill tone={s.tone}>{s.text}</StatusPill>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {r.scoreDetail && <ScoreBar score={r.scoreDetail as ScoreBreakdown} compact />}
                    <p className="text-sm text-muted">
                      {r.status === "PENDING"
                        ? `Rooms for this block are decided at ${fmtTime(r.slot.cutoffAt)} on ${fmtShortDay(r.slot.cutoffAt)}. If more students ask than there are rooms, your score above decides.`
                        : r.reason}
                    </p>
                  </div>
                  {cancellable && (
                    <ActionButton
                      action={cancelRequestAction}
                      fields={{ requestId: r.id, studentId: student!.studentId }}
                      label={r.status === "APPROVED" ? "Cancel booking" : "Withdraw"}
                      pendingLabel="Cancelling…"
                      variant="danger"
                      confirm={
                        r.status === "APPROVED" && lateCancel
                          ? "Less than 2 hours to go. Cancelling now counts as a no-show. Cancel anyway?"
                          : undefined
                      }
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Blocks */}
      <section>
        <h2 className="font-display text-2xl font-bold tracking-tight">Time blocks</h2>
        {groupByDay(slots, (s) => s.startsAt).map(({ day, items }) => {
          const decided = items[0].decided;
          return (
            <div key={day.toDateString()} className="mt-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-display text-lg font-semibold">{fmtDay(day)}</h3>
                <p className="text-sm text-muted">
                  {decided
                    ? "Decided. Free rooms go to whoever asks first."
                    : `Open until ${fmtTime(items[0].cutoffAt)} on ${fmtShortDay(items[0].cutoffAt)}`}
                </p>
              </div>
              <ul className="mt-2 divide-y divide-line rounded-lg border border-line bg-surface">
                {items.map((slot) => {
                  const r = mine.get(slot.id);
                  const busy = !slot.decided && slot.requests > slot.rooms;
                  return (
                    <li key={slot.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5">
                      <span className="w-28 font-display text-lg font-bold tabular-nums">
                        {fmtBlock(slot.startsAt, slot.endsAt)}
                      </span>
                      <span className="flex-1 text-sm text-muted">
                        {slot.decided ? (
                          slot.freeRooms > 0 ? (
                            <span className="text-room">{slot.freeRooms} of {slot.rooms} rooms free</span>
                          ) : (
                            <>All {slot.rooms} rooms taken</>
                          )
                        ) : (
                          <>
                            {slot.requests} asked for {slot.rooms} rooms
                            {busy && <span className="text-wait">, so it will be ranked by score at 8 PM</span>}
                          </>
                        )}
                      </span>
                      {r ? (
                        <StatusPill tone={requestStatus(r).tone}>{requestStatus(r).text}</StatusPill>
                      ) : (
                        <ActionButton
                          action={requestRoomAction}
                          fields={{ studentId: id, name, slotId: slot.id }}
                          label={slot.decided && slot.freeRooms === 0 ? "Join waiting line" : "Ask for a room"}
                          pendingLabel="Sending…"
                          variant="primary"
                          disabled={!canRequest}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
        {!canRequest && (
          <p className="mt-4 text-sm text-muted">Enter your Student ID above to ask for a room.</p>
        )}
      </section>
    </div>
  );
}
