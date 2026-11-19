"use client";

import { useActionState } from "react";
import { showToast } from "@/components/toaster";
import type { ActionState } from "@/app/actions";

type Props = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  label: string;
  pendingLabel?: string;
  fields?: Record<string, string | number>;
  variant?: "primary" | "quiet" | "danger";
  confirm?: string;
  disabled?: boolean;
};

const styles = {
  primary: "bg-ink text-white hover:bg-ink/85",
  quiet: "border border-line bg-surface text-ink hover:border-ink",
  danger: "border border-line bg-surface text-danger hover:border-danger",
};

/** A one-button form that calls a server action and reports what happened. */
export function ActionButton({
  action,
  label,
  pendingLabel,
  fields = {},
  variant = "quiet",
  confirm,
  disabled,
}: Props) {
  // Report the result as a page-level notice, raised as soon as the action returns:
  // the button itself may disappear once the page refreshes
  // (e.g. a "No-show" button after the room moves on).
  const [, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await action(prev, formData);
    if (result) showToast(result.ok, result.message);
    return result;
  }, null);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className="inline-flex"
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button
        type="submit"
        disabled={disabled || pending}
        className={`rounded-md px-3 py-1.5 text-sm font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]}`}
      >
        {pending ? (pendingLabel ?? "Working…") : label}
      </button>
    </form>
  );
}
