import { withRetry, type PrismaClient } from "@/database";
import { DAY_MS } from "@/lib/allocation";
import { blocksForDay, nextOpenDay } from "@/lib/blocks";

/**
 * The example from PLAN.md: 2 rooms, 6 students competing for 13:00–15:00
 * on the next day whose 8 PM deadline hasn't passed yet (so the demo always
 * starts "before 8 PM", whatever time it is loaded).
 *
 * History is written as "N days ago" so the scores come out the same
 * whenever the demo is loaded.
 */
type Past = { daysAgo: number; result: "used" | "no-show" | "missed" };

export const DEMO_STUDENTS: {
  studentId: string;
  name: string;
  past: Past[];
  expectedScore?: number; // for the 13:00 block, documented in PLAN.md
}[] = [
  {
    studentId: "S1001",
    name: "Meron",
    past: [
      { daysAgo: 9, result: "missed" },
      { daysAgo: 5, result: "missed" },
      { daysAgo: 2, result: "missed" },
    ],
    expectedScore: 88,
  },
  {
    studentId: "S1002",
    name: "Hana",
    past: [
      { daysAgo: 35, result: "no-show" },
      { daysAgo: 10, result: "no-show" },
      { daysAgo: 4, result: "missed" },
    ],
    expectedScore: 47.3,
  },
  {
    studentId: "S1003",
    name: "Sara",
    past: [
      { daysAgo: 12, result: "used" },
      { daysAgo: 5, result: "used" },
      { daysAgo: 3, result: "missed" },
    ],
    expectedScore: 36,
  },
  {
    studentId: "S1004",
    name: "Daniel",
    past: [
      { daysAgo: 8, result: "used" },
      { daysAgo: 3, result: "used" },
    ],
    expectedScore: 25,
  },
  {
    studentId: "S1005",
    name: "Abel",
    past: [
      { daysAgo: 20, result: "used" },
      { daysAgo: 9, result: "used" },
      { daysAgo: 2, result: "used" },
    ],
    expectedScore: 13.8,
  },
  {
    studentId: "S1006",
    name: "Lily",
    past: [
      { daysAgo: 25, result: "no-show" },
      { daysAgo: 15, result: "used" },
      { daysAgo: 7, result: "used" },
      { daysAgo: 1, result: "used" },
    ],
    expectedScore: 2.5,
  },
  // New students with no history – used for the low-demand block.
  { studentId: "S1007", name: "Yonas", past: [] },
  { studentId: "S1008", name: "Ruth", past: [] },
];

export const DEMO_ROOMS = ["Room A", "Room B"];

/** Wipe everything and load the demo. Safe to run again (also on a dropped connection). */
export function loadDemo(db: PrismaClient, now = new Date()) {
  return withRetry(() => writeDemo(db, now));
}

async function writeDemo(db: PrismaClient, now: Date) {
  const ago = (days: number) => new Date(now.getTime() - days * DAY_MS);
  const hours = (d: Date, h: number) => new Date(d.getTime() + h * 3_600_000);

  // Bulk inserts in one transaction: ~6 round trips instead of ~60,
  // which matters on a remote database.
  return db.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(
        `TRUNCATE "Reservation", "Request", "Slot", "Student", "Room" RESTART IDENTITY CASCADE`,
      );

      const rooms = await tx.room.createManyAndReturn({
        data: DEMO_ROOMS.map((name) => ({ name })),
      });

      // Past blocks (one per "days ago" value) + the open day's fixed blocks.
      const daysAgo = [...new Set(DEMO_STUDENTS.flatMap((s) => s.past.map((p) => p.daysAgo)))];
      const openDayBlocks = blocksForDay(nextOpenDay(now));
      const slots = await tx.slot.createManyAndReturn({
        data: [
          ...daysAgo.map((n) => ({
            startsAt: ago(n),
            endsAt: hours(ago(n), 2),
            cutoffAt: hours(ago(n), -17),
            allocatedAt: hours(ago(n), -17),
          })),
          ...openDayBlocks,
        ],
      });
      const slotAt = new Map(slots.map((s) => [s.startsAt.getTime(), s.id]));
      const pastSlot = (n: number) => slotAt.get(ago(n).getTime())!;
      const block11 = slotAt.get(openDayBlocks[1].startsAt.getTime())!;
      const block13 = slotAt.get(openDayBlocks[2].startsAt.getTime())!;

      await tx.student.createMany({
        data: DEMO_STUDENTS.map((s) => {
          const noShows = s.past.filter((p) => p.result === "no-show").map((p) => p.daysAgo);
          return {
            studentId: s.studentId,
            name: s.name,
            penaltyLevel: noShows.length,
            lastNoShowAt: noShows.length ? ago(Math.min(...noShows)) : null,
          };
        }),
      });

      // Past requests: missed = still waiting when the block started; used / no-show = got a room.
      const history = DEMO_STUDENTS.flatMap((s) =>
        s.past.map((p) => ({ studentId: s.studentId, slotId: pastSlot(p.daysAgo), result: p.result })),
      );

      // 13:00–15:00: 6 students, 2 rooms → HIGH demand. Abel asks first on purpose.
      const order = ["S1005", "S1002", "S1003", "S1001", "S1004", "S1006"];
      // 11:00–13:00: 2 students, 2 rooms → LOW demand, first come first served.
      const low = ["S1007", "S1008"];

      const requests = await tx.request.createManyAndReturn({
        data: [
          ...history.map((h) => ({
            studentId: h.studentId,
            slotId: h.slotId,
            status: h.result === "missed" ? ("WAITING" as const) : ("APPROVED" as const),
            reason: "Demo history",
          })),
          ...order.map((studentId, i) => ({
            studentId,
            slotId: block13,
            submittedAt: new Date(now.getTime() - (order.length - i) * 10 * 60_000),
          })),
          ...low.map((studentId, i) => ({
            studentId,
            slotId: block11,
            submittedAt: new Date(now.getTime() - (low.length - i) * 10 * 60_000),
          })),
        ],
      });
      const requestId = new Map(requests.map((r) => [`${r.studentId}:${r.slotId}`, r.id]));

      // Rooms for past bookings, handing out Room A, Room B, ... per block.
      const roomsUsed = new Map<number, number>();
      await tx.reservation.createMany({
        data: history
          .filter((h) => h.result !== "missed")
          .map((h) => {
            const used = roomsUsed.get(h.slotId) ?? 0;
            roomsUsed.set(h.slotId, used + 1);
            return {
              requestId: requestId.get(`${h.studentId}:${h.slotId}`)!,
              roomId: rooms[used % rooms.length].id,
              status: h.result === "used" ? ("CHECKED_IN" as const) : ("NO_SHOW" as const),
            };
          }),
      });

      return { rooms: rooms.length, students: DEMO_STUDENTS.length, slots: openDayBlocks.length };
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
}
