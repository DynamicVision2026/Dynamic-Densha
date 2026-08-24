Kanji Densha — Thick Teaching S3 (今週ののぞき + parent thickness)

**Date:** 2026-08-24  
**Status:** Authoritative — open after S1 GO  
**Audience:** Engineer / Grok Build  
**Prerequisite:** S1 dwell / echo teach-strip / T4 next-arrival / T5 week-taught

**Does not change:** five statuses, three lamps, dual 残響, same-session だいたい cap, S1 dwell, elementary readings, Learning Route P0–P2 contracts, **green never decays**, child UI still has no “behind” language, 出題 deferred.

---

## Goal

1. **今週ののぞき** — one look-ahead card on the child timetable. Opening it is **sightseeing**, not a scored ride.  
2. **Parent thickness** — JA + EN copy that explains what the app taught this week, without pressure language.

---

## 1. 今週ののぞき (T6)

Exactly **one** peek card on the timetable (`data-week-peek`).

### Pick order

1. Prefer an editorial **線** the child has already boarded (most recent non-new station).  
2. Else a **音の家族**.  
3. Else the first editorial line that has a station in the active grade.

Card shows: line/family label + short なぜ copy. Example: 木の線 after 林.

### On open

- Navigate to **map** (line focus) **or** **workshop** (family).  
- `data-line-focus="true"` when on map.  
- **Must not write** `evaluateProgress`. Lamps and status before/after peek are identical.  
- Must not auto-play 車内アナウンス as a scored event.

### Forbidden

- Multiple peek cards  
- Peek that starts ためす / lights a lamp  
- “You should catch up this line” copy  

### Acceptance

- [ ] Single peek card on timetable  
- [ ] Open → map or workshop  
- [ ] Snapshot lamps unchanged after peek + return  

---

## 2. Parent thickness

Parent page remains read-only for child lamps.

Must keep (from S1 / P0–P1):

- 今週おしえたこと (real rides only)  
- 乗りはじめ / この学年の路線 / これからの見とおし  

S3 adds:

- JA and EN parallel for the parent-critical strings (language switcher).  
- Workshop / map are visitable from peek without changing 今週 counts.  
- Paper list still **≤5**; app still does **not** score handwriting.

### Forbidden parent copy

- N weeks behind registration / behind April  
- Streak of weeks completed  
- Guarantee of school-exam scores  

---

## 3. Out of scope

- New item types  
- Changing echo delays  
- Grade rollover (P2)  
- 出題しゃしょう  

---

## 4. Implementation order

1. `pickWeekPeek` + timetable card  
2. Peek navigation with lamp snapshot test  
3. Parent JA/EN pass  
4. Walkthrough: home peek → map/workshop → parent  

**Stop for product review when T6 and parent thickness pass.**

*End of Thick Teaching S3 Handoff*
