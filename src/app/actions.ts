"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/database";
import { loadDemo } from "@/lib/demo-data";
import * as service from "@/lib/booking-service";

/** Shape returned to forms (works with React's useActionState). */
export type ActionState = { ok: boolean; message: string } | null;

const toState = (r: service.Result): ActionState =>
  r.ok ? { ok: true, message: r.message } : { ok: false, message: r.error };

async function run(fn: () => Promise<service.Result>): Promise<ActionState> {
  try {
    const result = await fn();
    revalidatePath("/", "layout");
    return toState(result);
  } catch (e) {
    console.error(e);
    return { ok: false, message: "Something went wrong. Please try again." };
  }
}

const num = (f: FormData, k: string) => Number(f.get(k));
const str = (f: FormData, k: string) => String(f.get(k) ?? "");

// Student
export async function registerStudentAction(_: ActionState, f: FormData) {
  const studentId = str(f, "studentId").trim().toUpperCase();
  const state = await run(() => service.registerStudent({ studentId, name: str(f, "name") }));
  // On success, open the new student's page (redirect must happen outside try/catch).
  if (state?.ok) redirect(`/?id=${encodeURIComponent(studentId)}&welcome=1`);
  return state;
}

export async function requestRoomAction(_: ActionState, f: FormData) {
  return run(() => service.requestRoom({ studentId: str(f, "studentId"), slotId: num(f, "slotId") }));
}

export async function cancelRequestAction(_: ActionState, f: FormData) {
  return run(() =>
    service.cancelRequest({ requestId: num(f, "requestId"), studentId: str(f, "studentId") }),
  );
}

// Staff
export async function runCutoffAction() {
  return run(() => service.runCutoffNow());
}

export async function checkInAction(_: ActionState, f: FormData) {
  return run(() => service.checkIn(num(f, "reservationId")));
}

export async function markNoShowAction(_: ActionState, f: FormData) {
  return run(() => service.markNoShow(num(f, "reservationId")));
}

export async function loadDemoAction() {
  return run(async () => {
    await loadDemo(db);
    return { ok: true, message: "Demo loaded: 2 rooms, 8 students, 6 requests for 13:00–15:00." };
  });
}
