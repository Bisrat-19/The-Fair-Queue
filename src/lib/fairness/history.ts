import { RULES, DAY_MS } from "./rules";
import { countMissed, currentPenaltyLevel, type StudentHistory } from "./score";

/** One past request of a student, as stored in the database. */
export type PastRequest = {
  slotStartsAt: Date;
  requestStatus: "PENDING" | "APPROVED" | "WAITING";
  reservationStatus: "BOOKED" | "CHECKED_IN" | "CANCELLED" | "NO_SHOW" | null;
};

/**
 * Turn a student's raw request history into the numbers the score needs.
 * Only blocks that have already started count.
 *
 * - Used a room   = approved and not cancelled in time (no-shows count as used).
 * - Missed        = still in the waiting line when the block started.
 */
export function summarizeHistory(
  past: PastRequest[],
  student: { penaltyLevel: number; lastNoShowAt: Date | null },
  now: Date,
): StudentHistory {
  const started = past.filter((p) => p.slotStartsAt <= now);

  const used = started
    .filter(
      (p) =>
        p.requestStatus === "APPROVED" &&
        p.reservationStatus !== null &&
        p.reservationStatus !== "CANCELLED",
    )
    .map((p) => p.slotStartsAt);

  const windowStart = now.getTime() - RULES.reservationWindowDays * DAY_MS;
  const lastBookingAt = used.length
    ? new Date(Math.max(...used.map((d) => d.getTime())))
    : null;

  const missedAt = started
    .filter((p) => p.requestStatus === "WAITING")
    .map((p) => p.slotStartsAt);

  return {
    bookingsLast30d: used.filter((d) => d.getTime() > windowStart).length,
    lastBookingAt,
    missedCount: countMissed(missedAt, lastBookingAt, now),
    penaltyLevel: currentPenaltyLevel(student.penaltyLevel, student.lastNoShowAt, now),
  };
}
