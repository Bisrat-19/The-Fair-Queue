# The Fair Queue – Plan

## What we are building

A small web app that shares a few study rooms fairly between students.

- Students who got fewer rooms lately get priority.
- Rooms should never stay empty when someone is waiting.
- Every decision shows a simple reason.

## Main rules

- Students use their **Student ID**. No login.
- **1 room = 1 student.**
- The day is split into **time blocks** (e.g. 9–11, 11–1, 1–3, 3–5, 5–7).
- A student asks for a room in one block.

## How it works

1. Students send requests for tomorrow's blocks **until 8 PM today**.
2. At **8 PM** the system looks at each block:
   - **Not many requests** (e.g. 2 rooms, 2 students) → everyone gets a room. First come, first served.
   - **Too many requests** (e.g. 2 rooms, 6 students) → students get a **priority score**. Highest scores get the rooms. Everyone else goes into the **waiting line** in score order.
3. After 8 PM, any free room goes to whoever asks first.

Why the 8 PM deadline? So being fastest doesn't matter. Everyone who asks before 8 PM gets the same fair chance.

## Priority score (0–100)

| What we look at | Points | Rule |
|---|---:|---|
| Rooms used in the last 30 days | up to 35 | Fewer rooms = more points |
| Days since last room | up to 35 | Longer wait = more points (never had a room = full 35) |
| Times they asked and didn't get a room | up to 30 | More misses = more points |
| No-show penalty | 0 to −30 | Missed rooms lower the score |

If two students have the same score, the one who asked first wins.

## Cancel and no-show

- Cancel **2+ hours before** the block → no penalty. The room goes to the next person in the waiting line.
- Cancel **later than that**, or **don't check in within 15 minutes** → counts as a **no-show**. The room goes to the next person in the waiting line.

No-show penalty:

| No-shows | 1 | 2 | 3 | 4+ |
|---|---|---|---|---|
| Penalty | warning only | −10 | −20 | −30 |

After **30 days with no no-shows**, the penalty goes down one step. Nobody is punished forever.

## Example

2 rooms, 6 students asked. Three of them:

| Student | History | Score | Result |
|---|---|---:|---|
| Meron | Never had a room, missed 3 times | 88 | ✅ Gets a room |
| Hana | 1 room 10 days ago, 2 no-shows | 47 | ✅ Gets a room |
| Abel | 3 rooms this month, last one 2 days ago | 14 | ⏳ Waiting line #1 |

Abel already had 3 rooms this month, and Meron had none, so Meron goes first. If someone cancels, Abel gets the room.

## Tech

- **Next.js** (frontend + backend in one app) with TypeScript
- **PostgreSQL + Prisma** for the database
- **Tailwind** for styling
- **Vitest** to test the scoring

## Pages

1. **Student page** – enter Student ID, pick a block, request a room, see your status and the reason.
2. **Admin page** – see all requests, run the 8 PM decision (with a "run now" button for demo), mark check-in / no-show / cancel.
3. **Demo button** – loads the example (2 rooms, 6 students) in one click.

## Not building

- Login
- Notifications
- Different room sizes
- Recurring bookings

## Could improve later

- Real university login
- Notify students when a room frees up
- Tune the points using real data
- Let staff make special exceptions
