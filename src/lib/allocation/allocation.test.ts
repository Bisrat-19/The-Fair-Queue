import { describe, expect, it } from "vitest";
import {
  allocate,
  cancellationOutcome,
  checkInWindowPassed,
  countMissed,
  currentPenaltyLevel,
  levelAfterNoShow,
  nextInLine,
  scoreStudent,
  type AllocationRequest,
  type StudentHistory,
} from ".";

const NOW = new Date("2026-11-19T20:00:00Z"); // 8 PM decision time
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const minsAfterNow = (m: number) => new Date(NOW.getTime() + m * 60_000);

const history = (h: Partial<StudentHistory>): StudentHistory => ({
  bookingsLast30d: 0,
  lastBookingAt: null,
  missedCount: 0,
  penaltyLevel: 0,
  ...h,
});

const req = (
  requestId: number,
  studentId: string,
  submittedMinsAgo: number,
  h: Partial<StudentHistory>,
): AllocationRequest => ({
  requestId,
  studentId,
  submittedAt: new Date(NOW.getTime() - submittedMinsAgo * 60_000),
  history: history(h),
});

// The example from PLAN.md: 2 rooms, 6 students.
const DEMO = [
  req(1, "Abel", 300, { bookingsLast30d: 3, lastBookingAt: daysAgo(2) }), // asked first
  req(2, "Meron", 60, { missedCount: 3 }),
  req(3, "Hana", 120, { bookingsLast30d: 1, lastBookingAt: daysAgo(10), missedCount: 1, penaltyLevel: 2 }),
  req(4, "Sara", 90, { bookingsLast30d: 2, lastBookingAt: daysAgo(5), missedCount: 1 }),
  req(5, "Daniel", 30, { bookingsLast30d: 2, lastBookingAt: daysAgo(3) }),
  req(6, "Lily", 10, { bookingsLast30d: 4, lastBookingAt: daysAgo(1), penaltyLevel: 1 }),
];

describe("scoreStudent", () => {
  it("gives a student who never had a room full rooms + waiting points", () => {
    const s = scoreStudent(history({ missedCount: 3 }), NOW);
    expect(s).toEqual({ reservation: 35, waiting: 35, missed: 18, penalty: 0, total: 88 });
  });

  it("matches the plan example for Hana (penalty level 2 = −10)", () => {
    const s = scoreStudent(DEMO[2].history, NOW);
    expect(s.reservation).toBe(26.3);
    expect(s.waiting).toBe(25);
    expect(s.missed).toBe(6);
    expect(s.penalty).toBe(10);
    expect(s.total).toBe(47.3);
  });

  it("matches the plan example for Abel", () => {
    expect(scoreStudent(DEMO[0].history, NOW).total).toBe(13.8);
  });

  it("caps every part", () => {
    const heavy = scoreStudent(
      history({ bookingsLast30d: 10, lastBookingAt: daysAgo(0), missedCount: 99, penaltyLevel: 9 }),
      NOW,
    );
    expect(heavy.reservation).toBe(0);
    expect(heavy.waiting).toBe(0);
    expect(heavy.missed).toBe(30);
    expect(heavy.penalty).toBe(30);
  });

  it("gives no penalty at level 1 (warning only)", () => {
    expect(scoreStudent(history({ penaltyLevel: 1 }), NOW).penalty).toBe(0);
  });

  it("does not depend on who else applied", () => {
    const alone = allocate([1], [DEMO[2], DEMO[0]], NOW).results.find((r) => r.studentId === "Hana");
    const crowd = allocate([1], DEMO, NOW).results.find((r) => r.studentId === "Hana");
    expect(alone?.score).toEqual(crowd?.score);
  });
});

describe("allocate – low demand", () => {
  it("approves everyone first come first served, without scoring", () => {
    const { mode, results } = allocate([10, 11], [DEMO[1], DEMO[0]], NOW);
    expect(mode).toBe("LOW_DEMAND");
    expect(results.map((r) => [r.studentId, r.status, r.roomId])).toEqual([
      ["Abel", "APPROVED", 10], // asked first, so first room
      ["Meron", "APPROVED", 11],
    ]);
    expect(results.every((r) => r.score === null)).toBe(true);
    expect(results[0].reason).toContain("no competition");
  });
});

describe("allocate – high demand (the plan example)", () => {
  const { mode, results } = allocate([10, 11], DEMO, NOW);

  it("uses the score", () => {
    expect(mode).toBe("HIGH_DEMAND");
  });

  it("gives the 2 rooms to the 2 highest scores", () => {
    const approved = results.filter((r) => r.status === "APPROVED");
    expect(approved.map((r) => [r.studentId, r.roomId])).toEqual([
      ["Meron", 10],
      ["Hana", 11],
    ]);
  });

  it("puts everyone else in the waiting line in score order", () => {
    const waiting = results.filter((r) => r.status === "WAITING");
    expect(waiting.map((r) => [r.studentId, r.queuePos])).toEqual([
      ["Sara", 1],
      ["Daniel", 2],
      ["Abel", 3],
      ["Lily", 4],
    ]);
  });

  it("does not reward asking first when demand is high", () => {
    const abel = results.find((r) => r.studentId === "Abel")!;
    expect(abel.status).toBe("WAITING"); // asked first, but had 3 rooms this month
  });

  it("explains every decision with the score breakdown", () => {
    const meron = results.find((r) => r.studentId === "Meron")!;
    expect(meron.reason).toBe(
      "Score 35 (rooms) + 35 (waiting) + 18 (missed) − 0 (no-shows) = 88. Rank 1 of 6 for 2 room(s). Got a room.",
    );
    const sara = results.find((r) => r.studentId === "Sara")!;
    expect(sara.reason).toContain("waiting line at #1");
  });

  it("breaks ties by who asked first", () => {
    const same = { bookingsLast30d: 1, lastBookingAt: daysAgo(3) };
    const { results } = allocate([1], [req(1, "Late", 5, same), req(2, "Early", 50, same)], NOW);
    expect(results[0].studentId).toBe("Early");
  });

  it("puts everyone in the waiting line if there are no rooms", () => {
    const { results } = allocate([], DEMO.slice(0, 2), NOW);
    expect(results.every((r) => r.status === "WAITING")).toBe(true);
  });
});

describe("freed rooms", () => {
  it("go to #1 in the waiting line", () => {
    const line = [
      { id: "a", queuePos: 2 },
      { id: "b", queuePos: 1 },
      { id: "c", queuePos: null },
    ];
    expect(nextInLine(line)?.id).toBe("b");
  });

  it("go to nobody if the line is empty", () => {
    expect(nextInLine([{ queuePos: null }])).toBeNull();
  });
});

describe("cancel and no-show timing", () => {
  it("cancel 2+ hours before is free", () => {
    expect(cancellationOutcome(minsAfterNow(120), NOW)).toBe("CANCELLED");
  });

  it("cancel later than that counts as a no-show", () => {
    expect(cancellationOutcome(minsAfterNow(119), NOW)).toBe("NO_SHOW");
  });

  it("check-in window closes 15 minutes after the start", () => {
    expect(checkInWindowPassed(minsAfterNow(-14), NOW)).toBe(false);
    expect(checkInWindowPassed(minsAfterNow(-15), NOW)).toBe(true);
  });
});

describe("no-show penalty", () => {
  it("drops one level per 30 days without a no-show", () => {
    expect(currentPenaltyLevel(3, daysAgo(29), NOW)).toBe(3);
    expect(currentPenaltyLevel(3, daysAgo(30), NOW)).toBe(2);
    expect(currentPenaltyLevel(3, daysAgo(65), NOW)).toBe(1);
    expect(currentPenaltyLevel(3, daysAgo(400), NOW)).toBe(0);
  });

  it("goes up by one per new no-show, after recovery, max 4", () => {
    expect(levelAfterNoShow(0, null, NOW)).toBe(1);
    expect(levelAfterNoShow(2, daysAgo(31), NOW)).toBe(2); // 2 → recovered to 1 → +1
    expect(levelAfterNoShow(4, daysAgo(1), NOW)).toBe(4);
  });
});

describe("countMissed (anti-gaming)", () => {
  it("counts at most one miss per day", () => {
    const sameDay = [daysAgo(2), new Date(daysAgo(2).getTime() + 3_600_000)];
    expect(countMissed(sameDay, null, NOW)).toBe(1);
  });

  it("ignores misses older than 14 days", () => {
    expect(countMissed([daysAgo(1), daysAgo(14), daysAgo(20)], null, NOW)).toBe(1);
  });

  it("resets after the student gets a room", () => {
    expect(countMissed([daysAgo(6), daysAgo(5), daysAgo(1)], daysAgo(3), NOW)).toBe(1);
  });
});
