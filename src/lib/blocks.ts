// Fixed time blocks. Students pick one of these – no custom times.
export const BLOCKS = [
  { start: 9, end: 11 },
  { start: 11, end: 13 },
  { start: 13, end: 15 },
  { start: 15, end: 17 },
  { start: 17, end: 19 },
] as const;

export const CUTOFF_HOUR = 20; // requests for tomorrow close at 8 PM today

const at = (day: Date, hour: number) => {
  const d = new Date(day);
  d.setHours(hour, 0, 0, 0);
  return d;
};

/** Tomorrow's blocks (server local time), each with its 8 PM cutoff the day before. */
export function blocksForTomorrow(now: Date) {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const cutoffAt = at(now, CUTOFF_HOUR);
  return BLOCKS.map((b) => ({
    startsAt: at(tomorrow, b.start),
    endsAt: at(tomorrow, b.end),
    cutoffAt,
  }));
}
