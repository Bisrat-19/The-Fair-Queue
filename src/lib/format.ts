// Display helpers (server local time, 24-hour clock).

const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
const day = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });
const shortDay = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });

export const fmtTime = (d: Date) => time.format(d);
export const fmtDay = (d: Date) => day.format(d);
export const fmtShortDay = (d: Date) => shortDay.format(d);
export const fmtBlock = (start: Date, end: Date) => `${fmtTime(start)}–${fmtTime(end)}`;

/** Group items by calendar day, keeping order. */
export function groupByDay<T>(items: T[], getDate: (t: T) => Date) {
  const groups = new Map<string, { day: Date; items: T[] }>();
  for (const item of items) {
    const d = getDate(item);
    const key = d.toDateString();
    if (!groups.has(key)) groups.set(key, { day: d, items: [] });
    groups.get(key)!.items.push(item);
  }
  return [...groups.values()];
}
