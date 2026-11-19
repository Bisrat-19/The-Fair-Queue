import { RULES, daysBetween } from "./rules";

/** What we need to know about a student's past to score them. */
export type StudentHistory = {
  /** Rooms used in the last 30 days. No-shows count as used. */
  bookingsLast30d: number;
  /** Start time of their most recent room, or null if they never had one. */
  lastBookingAt: Date | null;
  /** Missed requests that still count (see countMissed). */
  missedCount: number;
  /** Penalty level after recovery has been applied (see currentPenaltyLevel). */
  penaltyLevel: number;
};

export type ScoreBreakdown = {
  reservation: number;
  waiting: number;
  missed: number;
  penalty: number; // positive number that gets subtracted
  total: number;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export function scoreStudent(h: StudentHistory, now: Date): ScoreBreakdown {
  const reservation =
    RULES.reservationPoints *
    Math.max(0, 1 - h.bookingsLast30d / RULES.reservationCap);

  const daysWaiting =
    h.lastBookingAt === null
      ? RULES.waitingCapDays
      : Math.max(0, daysBetween(h.lastBookingAt, now));
  const waiting =
    (RULES.waitingPoints * Math.min(daysWaiting, RULES.waitingCapDays)) /
    RULES.waitingCapDays;

  const missed =
    (RULES.missedPoints * Math.min(h.missedCount, RULES.missedCap)) /
    RULES.missedCap;

  const level = Math.min(Math.max(h.penaltyLevel, 0), RULES.maxPenaltyLevel);
  const penalty = RULES.penaltyByLevel[level];

  return {
    reservation: round1(reservation),
    waiting: round1(waiting),
    missed: round1(missed),
    penalty,
    total: round1(reservation + waiting + missed - penalty),
  };
}

/** "35 (rooms) + 35 (waiting) + 18 (missed) − 0 (no-shows) = 88" */
export function explainScore(b: ScoreBreakdown): string {
  return (
    `${b.reservation} (rooms) + ${b.waiting} (waiting) + ${b.missed} (missed) ` +
    `− ${b.penalty} (no-shows) = ${b.total}`
  );
}

// ---------- Helpers that turn raw history into a StudentHistory ----------

/**
 * Penalty level goes down by 1 for every full 30 days since the last no-show.
 * Computed on the fly, so no background job is needed.
 */
export function currentPenaltyLevel(
  storedLevel: number,
  lastNoShowAt: Date | null,
  now: Date,
): number {
  if (storedLevel <= 0 || lastNoShowAt === null) return Math.max(storedLevel, 0);
  const recovered = Math.floor(
    daysBetween(lastNoShowAt, now) / RULES.penaltyRecoveryDays,
  );
  return Math.max(0, storedLevel - recovered);
}

/** New level after another no-show: recover first, then add 1. */
export function levelAfterNoShow(
  storedLevel: number,
  lastNoShowAt: Date | null,
  now: Date,
): number {
  return Math.min(
    currentPenaltyLevel(storedLevel, lastNoShowAt, now) + 1,
    RULES.maxPenaltyLevel,
  );
}

/**
 * Missed requests that count:
 *  - only in the last 14 days
 *  - only after their last room (a win resets the count)
 *  - at most one per day (stops people spamming requests to farm points)
 */
export function countMissed(
  missedAt: Date[],
  lastBookingAt: Date | null,
  now: Date,
): number {
  const days = new Set<string>();
  for (const d of missedAt) {
    if (daysBetween(d, now) >= RULES.missedWindowDays) continue;
    if (d > now) continue;
    if (lastBookingAt && d <= lastBookingAt) continue;
    days.add(d.toISOString().slice(0, 10));
  }
  return days.size;
}
