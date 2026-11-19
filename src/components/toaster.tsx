"use client";

import { useEffect, useState } from "react";

type Toast = { id: number; ok: boolean; message: string };
const EVENT = "fair-queue:toast";

/** Show a short notice at the bottom of the screen (survives the page refreshing). */
export function showToast(ok: boolean, message: string) {
  window.dispatchEvent(new CustomEvent<Omit<Toast, "id">>(EVENT, { detail: { ok, message } }));
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    let next = 0;
    const onToast = (e: Event) => {
      const t = { id: ++next, ...(e as CustomEvent<Omit<Toast, "id">>).detail };
      setToasts((list) => [...list.slice(-2), t]);
      setTimeout(() => setToasts((list) => list.filter((x) => x.id !== t.id)), 7000);
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto flex max-w-lg items-start gap-3 rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
            t.ok ? "bg-ink text-white" : "bg-danger text-white"
          }`}
        >
          <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${t.ok ? "bg-signal" : "bg-white"}`} />
          <span>{t.message}</span>
          <button
            type="button"
            onClick={() => setToasts((list) => list.filter((x) => x.id !== t.id))}
            className="ml-2 text-white/70 hover:text-white"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
