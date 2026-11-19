import { describe, expect, it } from "vitest";
import { blocksForDay, nextOpenDay, upcomingBlocks } from "@/lib/blocks";

const local = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m); // Nov 2026, local time

describe("time blocks", () => {
  it("has 5 fixed blocks with the cutoff at 8 PM the day before", () => {
    const blocks = blocksForDay(local(20, 0));
    expect(blocks.map((b) => [b.startsAt.getHours(), b.endsAt.getHours()])).toEqual([
      [9, 11], [11, 13], [13, 15], [15, 17], [17, 19],
    ]);
    expect(blocks[0].cutoffAt).toEqual(local(19, 20));
  });

  it("before 8 PM, tomorrow is still open", () => {
    expect(nextOpenDay(local(19, 19, 59))).toEqual(local(20, 0));
    expect(upcomingBlocks(local(19, 10))).toHaveLength(5);
  });

  it("after 8 PM, the day after tomorrow opens too", () => {
    expect(nextOpenDay(local(19, 20))).toEqual(local(21, 0));
    expect(upcomingBlocks(local(19, 21))).toHaveLength(10);
  });
});
