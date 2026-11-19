import { db, withRetry, type Prisma } from "@/database";
import { upcomingBlocks } from "@/lib/blocks";
import {
  allocate,
  cancellationOutcome,
  levelAfterNoShow,
  summarizeHistory,
  type StudentHistory,
} from "@/lib/allocation";

type Tx = Prisma.TransactionClient;
export type Result = { ok: true; message: string } | { ok: false; error: string };

// Neon is remote: give multi-step transactions more than the 5s default,
// and retry the whole transaction if the connection drops.
const transaction = <T>(fn: (tx: Tx) => Promise<T>) =>
  withRetry(() => db.$transaction(fn, { maxWait: 10_000, timeout: 30_000 }));

const ok = (message: string): Result => ({ ok: true, message });
const fail = (error: string): Result => ({ ok: false, error });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Make sure the upcoming fixed blocks exist (so the app works on any day). */
export async function ensureUpcomingSlots(now = new Date()) {
  await db.slot.createMany({ data: upcomingBlocks(now), skipDuplicates: true });
}

/** Score inputs for each student, built from their past requests. */
async function loadHistories(tx: Tx, studentIds: string[], now: Date) {
  const students = await tx.student.findMany({
    where: { studentId: { in: studentIds } },
    include: {
      requests: {
        where: { slot: { startsAt: { lte: now } } },
        include: { slot: true, reservation: true },
      },
    },
  });
  const map = new Map<string, StudentHistory>();
  for (const s of students) {
    const past = s.requests.map((r) => ({
      slotStartsAt: r.slot.startsAt,
      requestStatus: r.status,
      reservationStatus: r.reservation?.status ?? null,
    }));
    map.set(s.studentId, summarizeHistory(past, s, now));
  }
  return map;
}

/** Rooms in this block not held by an active (booked / checked-in) reservation. */
async function freeRoomIds(tx: Tx, slotId: number) {
  const [rooms, held] = await Promise.all([
    tx.room.findMany({ orderBy: { id: "asc" } }),
    tx.reservation.findMany({
      where: { request: { slotId }, status: { in: ["BOOKED", "CHECKED_IN"] } },
      select: { roomId: true },
    }),
  ]);
  const taken = new Set(held.map((h) => h.roomId));
  return rooms.filter((r) => !taken.has(r.id)).map((r) => r.id);
}

/** Close the gap in the waiting line after someone leaves position `pos`. */
async function shiftLineUp(tx: Tx, slotId: number, pos: number) {
  await tx.request.updateMany({
    where: { slotId, status: "WAITING", queuePos: { gt: pos } },
    data: { queuePos: { decrement: 1 } },
  });
}

/** A room was freed: give it to #1 in the waiting line (if anyone is waiting). */
async function offerFreedRoom(tx: Tx, slotId: number, why: string) {
  const next = await tx.request.findFirst({
    where: { slotId, status: "WAITING", queuePos: { not: null } },
    orderBy: { queuePos: "asc" },
    include: { student: true },
  });
  const [roomId] = await freeRoomIds(tx, slotId);
  if (!next || roomId === undefined) return null;

  const room = await tx.room.findUniqueOrThrow({ where: { id: roomId } });
  await tx.request.update({
    where: { id: next.id },
    data: {
      status: "APPROVED",
      queuePos: null,
      reason: `${next.reason ?? ""} Then a room was freed (${why}) and you were #1 in the waiting line, so you got ${room.name}.`.trim(),
      reservation: { create: { roomId } },
    },
  });
  await shiftLineUp(tx, slotId, next.queuePos!);
  return `${next.student.name} moved up from the waiting line and got ${room.name}.`;
}

async function applyNoShowPenalty(tx: Tx, studentId: string, now: Date) {
  const s = await tx.student.findUniqueOrThrow({ where: { studentId } });
  await tx.student.update({
    where: { studentId },
    data: {
      penaltyLevel: levelAfterNoShow(s.penaltyLevel, s.lastNoShowAt, now),
      lastNoShowAt: now,
    },
  });
}

// ---------------------------------------------------------------------------
// The 8 PM decision
// ---------------------------------------------------------------------------

async function decideSlot(tx: Tx, slotId: number, now: Date) {
  const slot = await tx.slot.findUniqueOrThrow({
    where: { id: slotId },
    include: { requests: { where: { status: "PENDING" } } },
  });
  if (slot.allocatedAt) return null;

  const roomIds = (await tx.room.findMany({ orderBy: { id: "asc" } })).map((r) => r.id);
  const histories = await loadHistories(tx, slot.requests.map((r) => r.studentId), now);

  const { mode, results } = allocate(
    roomIds,
    slot.requests.map((r) => ({
      requestId: r.id,
      studentId: r.studentId,
      submittedAt: r.submittedAt,
      history: histories.get(r.studentId)!,
    })),
    now,
  );

  for (const r of results) {
    await tx.request.update({
      where: { id: r.requestId },
      data: {
        status: r.status,
        queuePos: r.queuePos,
        score: r.score?.total ?? null,
        scoreDetail: r.score ?? undefined,
        reason: r.reason,
        ...(r.roomId !== null && { reservation: { create: { roomId: r.roomId } } }),
      },
    });
  }
  await tx.slot.update({ where: { id: slotId }, data: { allocatedAt: now } });
  return mode;
}

/**
 * Decide every block whose 8 PM cutoff has passed.
 * `force` decides all upcoming blocks right now (the demo "Run 8 PM now" button).
 * Called on page load too, so the real 8 PM works without a background job.
 */
export async function decideDueSlots(now = new Date(), force = false) {
  const due = await withRetry(() => db.slot.findMany({
    where: {
      allocatedAt: null,
      ...(force ? { startsAt: { gt: now } } : { cutoffAt: { lte: now } }),
    },
    orderBy: { startsAt: "asc" },
  }));
  // Blocks nobody asked for: just mark them decided in one query.
  const counts = await withRetry(() =>
    db.request.groupBy({ by: ["slotId"], where: { slotId: { in: due.map((s) => s.id) } }, _count: true }),
  );
  const withRequests = new Set(counts.map((c) => c.slotId));
  const empty = due.filter((s) => !withRequests.has(s.id)).map((s) => s.id);
  if (empty.length)
    await withRetry(() => db.slot.updateMany({ where: { id: { in: empty } }, data: { allocatedAt: now } }));

  let decided = empty.length;
  for (const slot of due.filter((s) => withRequests.has(s.id))) {
    const mode = await transaction((tx) => decideSlot(tx, slot.id, now));
    if (mode) decided++;
  }
  return decided;
}

export async function runCutoffNow(now = new Date()): Promise<Result> {
  await ensureUpcomingSlots(now);
  const n = await decideDueSlots(now, true);
  return n
    ? ok(`Decided ${n} block(s). Results are now visible.`)
    : ok("All upcoming blocks were already decided.");
}

// ---------------------------------------------------------------------------
// Student actions
// ---------------------------------------------------------------------------

export async function requestRoom(
  input: { studentId: string; name?: string; slotId: number },
  now = new Date(),
): Promise<Result> {
  const studentId = input.studentId.trim().toUpperCase();
  const name = input.name?.trim();
  if (!studentId) return fail("Please enter your Student ID.");

  return transaction(async (tx) => {
    const student = await tx.student.findUnique({ where: { studentId } });
    if (!student) {
      if (!name) return fail("New Student ID – please also enter your name.");
      await tx.student.create({ data: { studentId, name } });
    }

    const slot = await tx.slot.findUnique({ where: { id: input.slotId } });
    if (!slot || slot.startsAt <= now) return fail("This block has already started.");

    const existing = await tx.request.findUnique({
      where: { studentId_slotId: { studentId, slotId: slot.id } },
    });
    if (existing) return fail("You already asked for this block.");

    // Before 8 PM: just join the list; the decision happens at the cutoff.
    if (!slot.allocatedAt) {
      await tx.request.create({
        data: {
          studentId,
          slotId: slot.id,
          submittedAt: now,
          reason: "Waiting for the 8 PM decision.",
        },
      });
      return ok("Request received. Rooms are decided at 8 PM.");
    }

    // After 8 PM: first come, first served.
    const [roomId] = await freeRoomIds(tx, slot.id);
    if (roomId !== undefined) {
      const room = await tx.room.findUniqueOrThrow({ where: { id: roomId } });
      await tx.request.create({
        data: {
          studentId,
          slotId: slot.id,
          submittedAt: now,
          status: "APPROVED",
          reason: `Asked after 8 PM and ${room.name} was still free – first come, first served.`,
          reservation: { create: { roomId } },
        },
      });
      return ok(`You got ${room.name}.`);
    }

    const last = await tx.request.aggregate({
      where: { slotId: slot.id, status: "WAITING" },
      _max: { queuePos: true },
    });
    const pos = (last._max.queuePos ?? 0) + 1;
    await tx.request.create({
      data: {
        studentId,
        slotId: slot.id,
        submittedAt: now,
        status: "WAITING",
        queuePos: pos,
        reason: `Asked after 8 PM and all rooms were taken. Added to the end of the waiting line at #${pos}.`,
      },
    });
    return ok(`All rooms are taken. You are #${pos} in the waiting line.`);
  });
}

/**
 * Student cancels their own request.
 *  - Not decided yet / in waiting line → simply removed.
 *  - Has a room → free if 2+ hours before, otherwise counts as a no-show.
 *    Either way the room goes to #1 in the waiting line.
 */
export async function cancelRequest(
  input: { requestId: number; studentId: string },
  now = new Date(),
): Promise<Result> {
  const studentId = input.studentId.trim().toUpperCase();

  return transaction(async (tx) => {
    const req = await tx.request.findUnique({
      where: { id: input.requestId },
      include: { slot: true, reservation: true },
    });
    if (!req || req.studentId !== studentId) return fail("Request not found.");
    if (req.slot.startsAt <= now && req.status !== "APPROVED")
      return fail("This block has already started.");

    if (req.status === "PENDING" || req.status === "WAITING") {
      await tx.request.delete({ where: { id: req.id } });
      if (req.status === "WAITING" && req.queuePos) await shiftLineUp(tx, req.slotId, req.queuePos);
      return ok("Request withdrawn.");
    }

    if (req.reservation?.status !== "BOOKED") return fail("Nothing to cancel.");

    const outcome = cancellationOutcome(req.slot.startsAt, now);
    await tx.reservation.update({ where: { id: req.reservation.id }, data: { status: outcome } });
    if (outcome === "NO_SHOW") await applyNoShowPenalty(tx, studentId, now);

    const moved = await offerFreedRoom(tx, req.slotId, "someone cancelled");
    const base =
      outcome === "CANCELLED"
        ? "Cancelled with no penalty."
        : "Cancelled less than 2 hours before – this counts as a no-show.";
    return ok(moved ? `${base} ${moved}` : base);
  });
}

// ---------------------------------------------------------------------------
// Staff actions
// ---------------------------------------------------------------------------

export async function checkIn(reservationId: number): Promise<Result> {
  return transaction(async (tx) => {
    const r = await tx.reservation.findUnique({ where: { id: reservationId } });
    if (r?.status !== "BOOKED") return fail("This reservation can't be checked in.");
    await tx.reservation.update({ where: { id: reservationId }, data: { status: "CHECKED_IN" } });
    return ok("Checked in.");
  });
}

/** Student didn't check in within 15 minutes: penalty + room goes to the waiting line. */
export async function markNoShow(reservationId: number, now = new Date()): Promise<Result> {
  return transaction(async (tx) => {
    const r = await tx.reservation.findUnique({
      where: { id: reservationId },
      include: { request: { include: { student: true } } },
    });
    if (r?.status !== "BOOKED") return fail("Only booked rooms can be marked as no-show.");

    await tx.reservation.update({ where: { id: r.id }, data: { status: "NO_SHOW" } });
    await applyNoShowPenalty(tx, r.request.studentId, now);
    const moved = await offerFreedRoom(tx, r.request.slotId, "no-show");
    const base = `${r.request.student.name} marked as no-show.`;
    return ok(moved ? `${base} ${moved}` : `${base} Nobody was waiting, so the room is free.`);
  });
}

// ---------------------------------------------------------------------------
// Reads for the pages
// ---------------------------------------------------------------------------

/** Keep the data fresh before showing a page. */
async function prepare(now: Date) {
  await withRetry(() => ensureUpcomingSlots(now));
  await decideDueSlots(now);
}

export async function getUpcomingSlots(now = new Date()) {
  await prepare(now);
  const [rooms, slots] = await withRetry(() =>
    Promise.all([
      db.room.count(),
      db.slot.findMany({
        where: { startsAt: { gt: now } },
        orderBy: { startsAt: "asc" },
        include: { requests: { select: { reservation: { select: { status: true } } } } },
      }),
    ]),
  );
  return slots.map((s) => {
    const held = s.requests.filter(
      (r) => r.reservation?.status === "BOOKED" || r.reservation?.status === "CHECKED_IN",
    ).length;
    return {
      id: s.id,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      cutoffAt: s.cutoffAt,
      decided: s.allocatedAt !== null,
      rooms,
      freeRooms: Math.max(0, rooms - held),
      requests: s.requests.length,
    };
  });
}

export async function getStudentView(rawStudentId: string, now = new Date()) {
  const studentId = rawStudentId.trim().toUpperCase();
  const slots = await getUpcomingSlots(now);
  const student = await withRetry(() =>
    db.student.findUnique({
      where: { studentId },
      include: {
        requests: {
          where: { slot: { startsAt: { gt: now } } },
          include: { slot: true, reservation: { include: { room: true } } },
          orderBy: { slot: { startsAt: "asc" } },
        },
      },
    }),
  );
  if (!student) return { student: null, slots, requests: [] };

  const history = (await withRetry(() => loadHistories(db, [studentId], now))).get(studentId)!;
  return { student: { ...student, history }, slots, requests: student.requests };
}

export async function getAdminView(now = new Date()) {
  await prepare(now);
  const [rooms, slots] = await withRetry(() =>
    Promise.all([
      db.room.findMany({ orderBy: { id: "asc" } }),
      db.slot.findMany({
        where: { startsAt: { gt: now } },
        orderBy: { startsAt: "asc" },
        include: {
          requests: {
            include: { student: true, reservation: { include: { room: true } } },
          },
        },
      }),
    ]),
  );

  const order = { APPROVED: 0, WAITING: 1, PENDING: 2 } as const;
  return {
    rooms,
    slots: slots.map((s) => ({
      ...s,
      decided: s.allocatedAt !== null,
      highDemand: s.requests.some((r) => r.score !== null) ||
        (!s.allocatedAt && s.requests.length > rooms.length),
      requests: [...s.requests].sort(
        (a, b) =>
          order[a.status] - order[b.status] ||
          (a.reservation?.roomId ?? 0) - (b.reservation?.roomId ?? 0) ||
          (a.queuePos ?? 0) - (b.queuePos ?? 0) ||
          a.submittedAt.getTime() - b.submittedAt.getTime(),
      ),
    })),
  };
}
