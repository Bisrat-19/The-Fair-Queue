import { describe, expect, it } from "vitest";
import { DAY_MS, levelAfterNoShow, scoreStudent, summarizeHistory, type PastRequest } from "@/lib/fairness";
import { DEMO_STUDENTS } from "@/lib/demo";

const NOW = new Date("2026-11-19T18:00:00Z");

/** Rebuild what loadDemo writes to the database, without a database. */
function demoRecords(s: (typeof DEMO_STUDENTS)[number]) {
  const past: PastRequest[] = s.past.map((p) => ({
    slotStartsAt: new Date(NOW.getTime() - p.daysAgo * DAY_MS),
    requestStatus: p.result === "missed" ? "WAITING" : "APPROVED",
    reservationStatus:
      p.result === "missed" ? null : p.result === "used" ? "CHECKED_IN" : "NO_SHOW",
  }));
  const noShows = s.past.filter((p) => p.result === "no-show").map((p) => p.daysAgo);
  const lastNoShowAt = noShows.length
    ? new Date(NOW.getTime() - Math.min(...noShows) * DAY_MS)
    : null;
  return { past, student: { penaltyLevel: noShows.length, lastNoShowAt } };
}

describe("demo data", () => {
  for (const s of DEMO_STUDENTS.filter((s) => s.expectedScore !== undefined)) {
    it(`${s.name} scores ${s.expectedScore}`, () => {
      const { past, student } = demoRecords(s);
      const history = summarizeHistory(past, student, NOW);
      expect(scoreStudent(history, NOW).total).toBe(s.expectedScore);
    });
  }

  it("stores penalty levels that match replaying the no-shows in order", () => {
    // Hana: no-show 35 days ago, then 10 days ago (only 25 days apart → no recovery).
    const first = levelAfterNoShow(0, null, new Date(NOW.getTime() - 35 * DAY_MS));
    const second = levelAfterNoShow(first, new Date(NOW.getTime() - 35 * DAY_MS), new Date(NOW.getTime() - 10 * DAY_MS));
    expect(second).toBe(2);
  });
});

describe("summarizeHistory", () => {
  const ago = (n: number) => new Date(NOW.getTime() - n * DAY_MS);

  it("does not count a room cancelled in time", () => {
    const h = summarizeHistory(
      [{ slotStartsAt: ago(1), requestStatus: "APPROVED", reservationStatus: "CANCELLED" }],
      { penaltyLevel: 0, lastNoShowAt: null },
      NOW,
    );
    expect(h.bookingsLast30d).toBe(0);
    expect(h.lastBookingAt).toBeNull();
  });

  it("ignores future blocks and rooms older than 30 days", () => {
    const h = summarizeHistory(
      [
        { slotStartsAt: ago(-1), requestStatus: "APPROVED", reservationStatus: "BOOKED" },
        { slotStartsAt: ago(31), requestStatus: "APPROVED", reservationStatus: "CHECKED_IN" },
      ],
      { penaltyLevel: 0, lastNoShowAt: null },
      NOW,
    );
    expect(h.bookingsLast30d).toBe(0);
    expect(h.lastBookingAt).toEqual(ago(31));
  });
});
