// All the numbers that drive decisions live here, so they are easy to find and change.

export const RULES = {
  // Priority score parts (max 100 in total)
  reservationPoints: 35, // fewer recent rooms = more points
  reservationWindowDays: 30, // "recent" = last 30 days
  reservationCap: 4, // 4+ rooms in the window = 0 points

  waitingPoints: 35, // longer since last room = more points
  waitingCapDays: 14, // 14+ days (or never) = full points

  missedPoints: 30, // more missed requests = more points
  missedWindowDays: 14, // only misses in the last 14 days count
  missedCap: 5, // 5+ misses = full points

  // No-show penalty by level (index = level)
  penaltyByLevel: [0, 0, 10, 20, 30],
  maxPenaltyLevel: 4,
  penaltyRecoveryDays: 30, // level drops by 1 after 30 days with no no-show

  // Timing
  freeCancelHoursBefore: 2, // cancel 2+ hours before = no penalty
  checkInGraceMinutes: 15, // no check-in within 15 min = no-show
} as const;

export const DAY_MS = 24 * 60 * 60 * 1000;

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}
