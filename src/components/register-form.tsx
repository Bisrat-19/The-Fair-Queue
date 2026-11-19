"use client";

import { useActionState } from "react";
import { registerStudentAction } from "@/app/actions";

const input = "w-full rounded-md border border-line bg-paper px-3 py-2";

/** "New here?" – save Student ID + name, then open the student's page. */
export function RegisterForm({ defaultId = "" }: { defaultId?: string }) {
  const [state, formAction, pending] = useActionState(registerStudentAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Student ID
        <input
          name="studentId"
          defaultValue={defaultId}
          required
          placeholder="e.g. S3000"
          autoComplete="off"
          className={`${input} font-semibold uppercase tracking-wide placeholder:font-normal placeholder:normal-case`}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Full name
        <input name="name" required placeholder="e.g. Liya Tesfaye" autoComplete="name" className={input} />
      </label>
      <button
        disabled={pending}
        className="self-start rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink/85 disabled:opacity-50"
      >
        {pending ? "Registering…" : "Register"}
      </button>
      {state && !state.ok && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
    </form>
  );
}
