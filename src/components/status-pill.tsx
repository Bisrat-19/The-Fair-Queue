type Tone = "room" | "wait" | "pending" | "off" | "danger";

const tones: Record<Tone, string> = {
  room: "bg-room-soft text-room",
  wait: "bg-wait-soft text-wait",
  pending: "bg-paper text-muted ring-1 ring-line",
  off: "bg-paper text-muted line-through",
  danger: "bg-danger-soft text-danger",
};

export function StatusPill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${tones[tone]}`}>
      {children}
    </span>
  );
}

type RequestLike = {
  status: "PENDING" | "APPROVED" | "WAITING";
  queuePos: number | null;
  reservation: { status: "BOOKED" | "CHECKED_IN" | "CANCELLED" | "NO_SHOW"; room: { name: string } } | null;
};

/** One consistent wording for a request's state, used on both pages. */
export function requestStatus(r: RequestLike): { tone: Tone; text: string } {
  if (r.status === "PENDING") return { tone: "pending", text: "Waiting for 8 PM" };
  if (r.status === "WAITING") return { tone: "wait", text: `Waiting line #${r.queuePos}` };
  const room = r.reservation?.room.name ?? "Room";
  switch (r.reservation?.status) {
    case "CHECKED_IN":
      return { tone: "room", text: `Checked in, ${room}` };
    case "CANCELLED":
      return { tone: "off", text: `Cancelled, ${room}` };
    case "NO_SHOW":
      return { tone: "danger", text: `No-show, ${room}` };
    default:
      return { tone: "room", text: room };
  }
}
