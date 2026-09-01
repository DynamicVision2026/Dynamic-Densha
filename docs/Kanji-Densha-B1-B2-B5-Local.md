# Kanji Densha — B1 / B2 / B5 local record

Local only. Not a GitHub wiki. Branch `ticket/b1-surface-seen`. Do not push until 准许 push.

B3 / B4 deferred. P-Save / P-Migrate locked: no ほぞんする, no guest localStorage import.

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

## Locked, not started

- P-Save / P-Migrate still locked
- B3 / B4 not started
