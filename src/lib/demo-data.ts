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
  await db.$transaction([
    db.reservation.deleteMany(),
    db.request.deleteMany(),
    db.slot.deleteMany(),
    db.student.deleteMany(),
    db.room.deleteMany(),
  ]);

  const rooms = await Promise.all(
    DEMO_ROOMS.map((name) => db.room.create({ data: { name } })),
  );

  // Past blocks: one per "days ago" value, starting exactly N days before now.
  const pastSlotIds = new Map<number, number>();
  const roomUse = new Map<number, number>(); // daysAgo -> rooms handed out so far
  const allDaysAgo = [
    ...new Set(DEMO_STUDENTS.flatMap((s) => s.past.map((p) => p.daysAgo))),
  ];
  for (const n of allDaysAgo) {
    const startsAt = new Date(now.getTime() - n * DAY_MS);
    const slot = await db.slot.create({
      data: {
        startsAt,
        endsAt: new Date(startsAt.getTime() + 2 * 3_600_000),
        cutoffAt: new Date(startsAt.getTime() - 17 * 3_600_000),
        allocatedAt: new Date(startsAt.getTime() - 17 * 3_600_000),
      },
    });
    pastSlotIds.set(n, slot.id);
  }

  for (const s of DEMO_STUDENTS) {
    const noShows = s.past
      .filter((p) => p.result === "no-show")
      .map((p) => p.daysAgo)
      .sort((a, b) => b - a); // oldest first

    await db.student.create({
      data: {
        studentId: s.studentId,
        name: s.name,
        penaltyLevel: noShows.length,
        lastNoShowAt: noShows.length
          ? new Date(now.getTime() - noShows[noShows.length - 1] * DAY_MS)
          : null,
      },
    });

    for (const p of s.past) {
      const slotId = pastSlotIds.get(p.daysAgo)!;
      if (p.result === "missed") {
        await db.request.create({
          data: { studentId: s.studentId, slotId, status: "WAITING", reason: "Demo history" },
        });
        continue;
      }
      const used = roomUse.get(p.daysAgo) ?? 0;
      roomUse.set(p.daysAgo, used + 1);
      await db.request.create({
        data: {
          studentId: s.studentId,
          slotId,
          status: "APPROVED",
          reason: "Demo history",
          reservation: {
            create: {
              roomId: rooms[used % rooms.length].id,
              status: p.result === "used" ? "CHECKED_IN" : "NO_SHOW",
            },
          },
        },
      });
    }
  }

  // The open day's fixed blocks.
  const openDay = await Promise.all(
    blocksForDay(nextOpenDay(now)).map((b) => db.slot.create({ data: b })),
  );
  const [, block11, block13] = openDay;

  // 13:00–15:00: 6 students, 2 rooms → HIGH demand. Abel asks first on purpose.
  const order = ["S1005", "S1002", "S1003", "S1001", "S1004", "S1006"];
  for (const [i, studentId] of order.entries()) {
    await db.request.create({
      data: {
        studentId,
        slotId: block13.id,
        submittedAt: new Date(now.getTime() - (order.length - i) * 10 * 60_000),
      },
    });
  }

  // 11:00–13:00: 2 students, 2 rooms → LOW demand, first come first served.
  for (const [i, studentId] of ["S1007", "S1008"].entries()) {
    await db.request.create({
      data: {
        studentId,
        slotId: block11.id,
        submittedAt: new Date(now.getTime() - (2 - i) * 10 * 60_000),
      },
    });
  }

  return { rooms: rooms.length, students: DEMO_STUDENTS.length, slots: openDay.length };
}
