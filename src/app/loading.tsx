/** Shown while a page loads its live data. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-6">
      <span className="sr-only">Loading…</span>
      <div className="h-12 w-2/3 max-w-md animate-pulse rounded-md bg-line/70" />
      <div className="h-5 w-full max-w-xl animate-pulse rounded bg-line/60" />
      <div className="h-40 animate-pulse rounded-lg border border-line bg-surface" />
      <div className="h-64 animate-pulse rounded-lg border border-line bg-surface" />
    </div>
  );
}
