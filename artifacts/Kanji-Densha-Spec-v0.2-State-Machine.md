# Kanji Densha — Spec v0.2 State Machine

**Date:** 2026-08-23  
**Status:** Authoritative for Grok Build `evaluateProgress`  
**Audience:** Engineer / Grok Build  
**Companion:** `Kanji-Densha-Product-Specification-EN.md` §5  
**Does not change:** published-only child path, elementary 音訓 only, one item → one lamp, 出題 deferred.

All status and lamp transitions go through `evaluateProgress(previous, event, gradeParams)`. UI must not invent a second algorithm. Demo and authenticated modes share this engine.

---

## 1. Five statuses (car colors)

| Code | Japanese | Role |
|------|----------|------|
| `new` | はじめて | Not yet substantially engaged (includes partially-lit cars with no outstanding repair) |
| `lost` | まよい | Consecutive or lifetime wrongs crossed the grade threshold |
| `fix` | なおし | Outstanding repair kind(s) |
| `almost` | だいたい | Required lights on + encounter + understand; **same-session maximum** |
| `perfect` | かんぺき | After `perfect_echo_required` successful spaced 残響 (default 2) |

Five colours, no sixth. A car with one lamp on is still はじめて.

## 2. Three lamps

| Lamp | Japanese | Earned by |
|------|----------|-----------|
| `reading` | よみ | Correct published reading items (小学校 音訓 only) |
| `meaning` | いみ | Correct published meaning items (semantic distractors) |
| `shape` | かたち | Correct published shape items, **if** a published shape surface exists |

`requiredLights` = enabled lamps for the grade ∩ available surfaces. Unpublished shape → shape is not required for だいたい.

## 3. Events

```
open | completeEncounter | completeUnderstand | answer
```

`answer` carries: `kind`, `correct`, `isEcho`, `echoBatchDone`, `shapeAvailable`, optional `surfaceId`, optional `gentle` (乗り間違い / 似た駅名).

Never events (never scored): in-car announcements, 音の家族工房, audio playback, parent-page render, 今週ののぞき.

## 4. Teaching beats

- **Encounter** sets `encounterCompleted`. Nothing else.
- **Understand** sets `understandCompleted`.
- Neither beat lights lamps. Same-session かんぺき is structurally impossible.

Dwell (product, not engine): 乗った / わかった stay disabled until the grade `encounter_min_ms` / `understand_min_ms` elapses.

## 5. Practice answers

- **Correct:** light the lamp, clear that repair, reset consecutive wrongs, record `surfaceId` as seen.
- **Wrong, novel surface** (`surfaceId` never succeeded): unlight + repair, **do not** increment lost counters (U2).
- **Wrong, `gentle`:** same exemption (U10 乗り間違い / soft 似た駅名).
- **Wrong, counted:** unlight + repair, increment consecutive and lifetime.
- After counted wrong: if consecutive ≥ `lost_wrong_threshold` **or** lifetime ≥ `lost_wrong_lifetime_threshold` → **まよい** and echo count resets. Else if repairs outstanding and previous was だいたい → **なおし**.

In-session repair is immediate: a later correct answer in the same session clears the repair (no cooling-off).

## 6. Dual 残響 → かんぺき

§6 is the engine contract.

1. Reach **だいたい**. Set `almostAt`, `echoDueAt = now + echo_delay_hours` (G1–G3 **20h**; G4–G6 **36h**).
2. First successful echo batch (`echoBatchDone` + required lights still on) → stay **だいたい**, `echoSuccessCount = 1`, `echoDueAt = now + echo_second_delay_hours` (**168h**).
3. Second successful echo batch → **かんぺき**. Stamp is write-once.

Failed echo (counted wrong, or batch done without required lights) → **なおし**, echo success count resets to 0. `almostAt` timing for the first delay already elapsed; repair then retry does not invent a new seven-day clock beyond the remaining due.

Same session never grants かんぺき (`perfect_echo_required` default 2, first delay ≥ 20h).

Stale echo (visit later than ~2× scheduled delay) is a copy concern only — **never demotes**.

## 7. Decay

`perfect_decay_enabled` is **off** in shipped grade tables. Calendar silence, missed weekly new stations, and skipped 点検 **never** strip green. 点検 is a freshness **flag** (60 days quiet after green, then 150 days), not an engine event.

## 8. Grade parameters (shipped)

| Grade | first echo | second echo | lost consecutive | echo/day cap |
|-------|------------|-------------|------------------|--------------|
| G1–G2 | 20h | 168h | 3 | 2 |
| G3 | 20h | 168h | 3 | 3 |
| G4 | 36h | 168h | 3 | 3 |
| G5–G6 | 36h | 168h | 4 (G5+) | 5 |

G3–G6 must not silently reuse a G1-only table.

## 9. Beat suggestion (session builder)

`suggestBeat`: encounter → understand → echo-if-due → practice if lamps missing → feedback. Scheduler owns `echo_per_day_cap`; engine owns eligibility of だいたい + due time.

## 10. Invariants

- I1 One published item → exactly one lamp  
- I7 No same-session かんぺき  
- Green never decays for plan miss / silence  
- Child UI has no “behind / 遅れ / overdue” language  
- Parent surfaces are read-only for lamps  

**Related:** Learning Route P0–P2, Thick Teaching S1–S3.

*End of Spec v0.2 State Machine*
