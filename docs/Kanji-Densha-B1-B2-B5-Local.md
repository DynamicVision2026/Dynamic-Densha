# Kanji Densha — B1 / B2 / B5 local record

Local only. Not a GitHub wiki. Branch `ticket/b1-surface-seen`. Do not push until 准许 push.

B1 / B2 / B5 already accepted (34 tests). B3 + B4 on this branch.

---

## Colour map (README)

| status | colour | JA |
|--------|--------|----|
| new | grey | はじめて |
| fix | yellow | なおし |
| lost | red | まよい |
| almost | blue | だいたい |
| perfect | green | かんぺき |

---

## B1 pass — `surface_seen`

- `migrations/0008_surface_seen.sql`: table `surface_seen` PK `(child_id, surface_id)`; `inspections.due_at`; `echo_success_count IF NOT EXISTS`.
- `saveProgress` dual-write: JSON `kanji_progress.surfaces_seen_success` kept; missing `surface_seen` rows insert-only (no delete).
- `loadProgress` hydrates `surfacesSeenSuccess` = table ∪ JSON; JSON-only rows backfill via `parseStringList`.
- Empty PGLite applies 0008. Logged-in meaning success on surface S: row in `surface_seen` and JSON still has S after reload.
- ER: **SURFACE_SEEN** exists. **No WOOD_CAR_TOKEN table.**

## B2 pass — U2 scope

`scripts/progress-eval.test.ts`: TAP **25 pass / 0 fail** (19 old + 6 B2).

- U2 protects **only** `almost` and `perfect`.
- `new` miss (novel or known) → `fix`.
- Novel miss on blue/green: lamp may go dark; status stays; lost counters do not increment.
- Dual echo unchanged: count 1 stays almost; count 2 → perfect.

## B5 — `nextArrival` rides the engine

UI does **zero** date arithmetic for this copy. Never print 遅れ / overdue / late.

```
Engine-->>Demo: { progress, nextArrival }
Engine-->>Server: { progress, nextArrival }
```

`nextArrivalFrom(state, nowIso, t)` reuses `echoArrival` / `echoArrivalWhen` / `ymdInZone` (Asia/Tokyo).

- new / fix / lost / perfect → `null`
- almost + `echoDueAt` → `{ label, days, dueLocalDate, dueIso }`
- overdue Tokyo day → label `きょう`, days 0

React / RideShell / board read `nextArrival.label` only.

## State machine (delta)

```
new --scored miss--> fix
almost --novel miss (U2)--> almost (lamp may dark)
almost --known miss--> fix
perfect --novel miss (U2)--> perfect
almost --echo 1 pass--> almost (count 1)
almost --echo 2 pass--> perfect
```

Dual echo. U2 loops on almost/perfect. New miss → fix.

---

## B3 pass — child ride has no ほぞんする

`rg` on `src/components` for `ほぞんする` is empty. 到着 is two kana lines + **ボードへ** / **れっしゃを みる** only (fix/lost still れんしゅうへ). No child save modal, no あとで.

Parent-side save prompt is **not** built here (later, `/parents`). `guestSavePromote` copy stays on demo parent page only — that is login/parent copy, not the child ride.

This branch was cut from `main` `f0f976d`. The child ほぞんする prompt lives on `release/entrance-page` (PR #6), **not** on this branch. Do **not** merge PR #6 guest-ride / child save modal onto this branch. `src/lib/guest-ride.ts` must stay absent.

## B4 pass — option 3 import

After login, when the parent first has a child id, `importGuestProgress` runs once (`densha.guest.migrated.v1`). Guest localStorage is **not** deleted.

- KEEP: status, lights, encounter/understand, surfacesSeenSuccess, repair kinds, wrong counters, echoSuccessCount
- DROP guest timestamps (echoDueAt, almostAt, perfectAt, seenAt, lastPracticeAt, inspection due)
- REBUILD from **serverNow** (never the device clock)
  - almost → `echoDueAt = serverNow + echo_delay_hours` (or `echo_second_delay_hours` if echoSuccessCount ≥ 1)
  - perfect kept only if echoSuccessCount ≥ 2; else clamp to almost and schedule echo from serverNow
  - inspections.due_at = serverNow + existing 点検 cadence (60d first)
- Writes via `saveProgress` + `surface_seen` dual-write
- Does **not** call `evaluateProgress`
- Skips decorative door cars (`音` `下` `火`) and seed-only rows (`attempts === 0`)

## Locked, waiting

- P-Save child modal must not return (PR #6)
- Parent `/parents` save prompt not built
- Still waiting **准许 push**

---

## U1 / U2 / U3 (frontend)

- Child home: `DepartureTicket` is the only primary. Occupied = board glyphs + ▶ のる. Empty = `data-ticket-empty` きょうは おやすみ + nextArrival.label, tap still 自由乗車 (catalog). Same component for guest and account.
- 到着 at first だいたい: `SessionStub` (mint, never かんぺき) + きっぷを もらう / あとで. ボードへ / れっしゃを みる stay. PNG only after tap. No ほぞんする.
- Ticket cars stay blue for だいたい. No gold かんぺき ticket.

P1–P5: QR is `https://kanji-densha.app/` only. No packages tree. T3 path-guard check is in `npm test`. See `docs/ticket-mechanism.md`.

