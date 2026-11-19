import { RULES } from "./rules";
import {
  explainScore,
  scoreStudent,
  type ScoreBreakdown,
  type StudentHistory,
} from "./score";

export type AllocationRequest = {
  requestId: number;
  studentId: string;
  submittedAt: Date;
  history: StudentHistory;
};

export type AllocationResult = {
  requestId: number;
  studentId: string;
  status: "APPROVED" | "WAITING";
  roomId: number | null;
  queuePos: number | null; // 1 = next in line
  rank: number; // 1 = first choice
  score: ScoreBreakdown | null; // null when demand was low (no scoring needed)
  reason: string;
};

export type Allocation = {
  mode: "LOW_DEMAND" | "HIGH_DEMAND";
  results: AllocationResult[];
};

const byEarliest = (a: AllocationRequest, b: AllocationRequest) =>
  a.submittedAt.getTime() - b.submittedAt.getTime() ||
  a.studentId.localeCompare(b.studentId);

/**
 * The 8 PM decision for one time block.
 *
 * - Requests <= rooms: everyone gets a room, first come first served.
 * - Requests >  rooms: rank by priority score; top N get rooms, the rest
 *   join the waiting line in score order. Ties go to the earlier request.
 */
export function allocate(
  roomIds: number[],
  requests: AllocationRequest[],
  now: Date,
): Allocation {
  const rooms = roomIds.length;

  if (requests.length <= rooms) {
    const ordered = [...requests].sort(byEarliest);
    return {
      mode: "LOW_DEMAND",
      results: ordered.map((r, i) => ({
        requestId: r.requestId,
        studentId: r.studentId,
        status: "APPROVED",
        roomId: roomIds[i],
        queuePos: null,
        rank: i + 1,
        score: null,
        reason: `${requests.length} request(s) for ${rooms} room(s) – no competition, first come first served.`,
      })),
    };
  }

  const scored = requests
    .map((r) => ({ r, score: scoreStudent(r.history, now) }))
    .sort((a, b) => b.score.total - a.score.total || byEarliest(a.r, b.r));

  const total = scored.length;
  return {
    mode: "HIGH_DEMAND",
    results: scored.map(({ r, score }, i) => {
      const rank = i + 1;
      const approved = i < rooms;
      const head = `Score ${explainScore(score)}. Rank ${rank} of ${total} for ${rooms} room(s).`;
      return {
        requestId: r.requestId,
        studentId: r.studentId,
        status: approved ? "APPROVED" : "WAITING",
        roomId: approved ? roomIds[i] : null,
        queuePos: approved ? null : i - rooms + 1,
        rank,
        score,
        reason: approved
          ? `${head} Got a room.`
          : `${head} Placed at #${i - rooms + 1} in the waiting line at 8 PM; you move up when a room is freed.`,
      };
    }),
  };
}

/** Who gets a freed room: the lowest waiting-line position, or nobody. */
export function nextInLine<T extends { queuePos: number | null }>(
  waiting: T[],
): T | null {
  const inLine = waiting.filter((w) => w.queuePos !== null);
  if (inLine.length === 0) return null;
  return inLine.reduce((best, w) => (w.queuePos! < best.queuePos! ? w : best));
}

/** Cancel 2+ hours before the block is free; later counts as a no-show. */
export function cancellationOutcome(
  slotStartsAt: Date,
  now: Date,
): "CANCELLED" | "NO_SHOW" {
  const hoursBefore = (slotStartsAt.getTime() - now.getTime()) / 3_600_000;
  return hoursBefore >= RULES.freeCancelHoursBefore ? "CANCELLED" : "NO_SHOW";
}

/** True once the 15-minute check-in window has passed. */
export function checkInWindowPassed(slotStartsAt: Date, now: Date): boolean {
  return (
    now.getTime() >= slotStartsAt.getTime() + RULES.checkInGraceMinutes * 60_000
  );
}
