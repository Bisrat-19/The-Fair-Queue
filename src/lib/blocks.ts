// Fixed time blocks. Students pick one of these – no custom times.
export const BLOCKS = [
  { start: 9, end: 11 },
  { start: 11, end: 13 },
  { start: 13, end: 15 },
  { start: 15, end: 17 },
  { start: 17, end: 19 },
] as const;

export const CUTOFF_HOUR = 20; // requests for a day close at 8 PM the day before

const at = (day: Date, hour: number, addDays = 0) => {
  const d = new Date(day);
  d.setDate(d.getDate() + addDays);
  d.setHours(hour, 0, 0, 0);
  return d;
};

/** The fixed blocks of one day (server local time), each with its 8 PM cutoff the day before. */
export function blocksForDay(day: Date) {
  const cutoffAt = at(day, CUTOFF_HOUR, -1);
  return BLOCKS.map((b) => ({
    startsAt: at(day, b.start),
    endsAt: at(day, b.end),
    cutoffAt,
  }));
}

/**
 * The next day still open for fair requests:
 * tomorrow before 8 PM today, otherwise the day after tomorrow.
 */
export function nextOpenDay(now: Date) {
  return at(now, 0, now < at(now, CUTOFF_HOUR) ? 1 : 2);
}

/** Tomorrow's blocks plus, after 8 PM, the day after (so requests can always open fairly). */
export function upcomingBlocks(now: Date) {
  const tomorrow = at(now, 0, 1);
  const open = nextOpenDay(now);
  return open.getTime() === tomorrow.getTime()
    ? blocksForDay(tomorrow)
    : [...blocksForDay(tomorrow), ...blocksForDay(open)];
}
