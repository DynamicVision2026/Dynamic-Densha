Kanji Densha — Learning Route P0–P1 (GradeRoute snapshot + 発車標)

**Date:** 2026-08-24  
**Status:** Authoritative — GO before P2  
**Audience:** Engineer / Grok Build  
**Prerequisite:** Spec v0.2 state machine; S1–S3 thick teaching accepted

**Does not change:** five statuses, three lamps, dual 残響, same-session だいたい cap, elementary readings, S1–S3 thick teaching, **green never decays for plan miss / silence**, child UI still has no “behind” language, 出題 deferred.

---

## Goal

Give each child an **immutable Day-one grade line** and a **child-safe 発車標**, so weekly new stations come from a snapshot instead of a live “catch-up debt” list.

1. **P0 — GradeRoute snapshot + start band**  
2. **P1 — 発車標 + 点検 flags + parent forward metrics stub**

---

## 1. P0 GradeRoute

On first open of a grade (demo or profile), freeze:

| Field | Rule |
|-------|------|
| `orderedKanji` | Full 配当 order for that grade (G1 = 80, starts 一) |
| `startBand` | Parent: はじめ / なか / おわり |
| `startIndex` | Cuts **0 / ~⅓ / ~⅔** of the grade list (G1: 0 / 26 / 53) |
| `createdAt` | Day-one. **Never rewritten** after create |

Parent control **乗りはじめ** edits the band **before** progress is dumped. Changing band later must not wipe lamps.

### Weekly new package

- Cap default **5** new stations / Tokyo week (Monday `Asia/Tokyo`).  
- `pickWeeklyNew` walks from `cursor`, **skips already だいたい/かんぺき**, never dumps extra missed weeks into this week.  
- Missed weeks **advance the cursor** by `cap × weeksElapsed` — they are not packed as shame catch-up.

### Acceptance

- [ ] G1 start cuts 0 / 26 / 53  
- [ ] はじめ first week includes 一; なか is not forced to 一  
- [ ] Already-blue/green cars skipped in the first package  
- [ ] Missed weeks move cursor; this week’s pack stays ≤ cap  
- [ ] Child UI has no 遅れ / behind / 追いつき  

---

## 2. P1 発車標 (child)

Timetable shows a **発車標**, not a deficit total.

| Slot | Content |
|------|---------|
| きょう | Due 残響 (きょう) + 点検 (cap 3/day) |
| あした / あさって | Next 残響 using calendar copy only |
| あたらしい えき | This week’s frozen `newKanji` |
| きょうの残響 | Echo queue already in product |

Copy is **きょう / あした / あさって / N日後**. Never “overdue”, never “N weeks behind”.

### 点検 (flag only)

- First flag: **60 days quiet after green**  
- After a passed 点検: **150 days**  
- Timeout / calendar silence **never** strips かんぺき  
- Does **not** call `evaluateProgress`  
- Child きょう cap = 3  

### Parent forward stub

Parent page (read-only lamps):

- 乗りはじめ (start band)  
- この学年の路線 (full snapshot strip)  
- これからの見とおし (remaining stations, ride-days, green count — **forward only**)  
- 今週の乗車記録  

Forbidden on child **and** as shame on parent: streak of weeks completed, peer comparison, “behind April / registration”.

### Acceptance

- [ ] 発車標 on timetable with あたらしい えき + きょうの残響  
- [ ] 点検 due does not demote green  
- [ ] Parent shows 乗りはじめ + 見とおし + 今週の乗車記録 + この学年の路線  
- [ ] Switching なか does not wipe existing lamps  

---

## 3. Out of scope (P2)

- Grade rollover (学年をあがる)  
- Projected arrival month copy (2月ごろ)  
- Publisher-specific within-year sequences  

---

## 4. Implementation order

1. `GradeRoute` + start band + weekly cursor  
2. 発車標 + 点検 flags  
3. Parent forward metrics stub  
4. Walkthrough: demo timetable + parent band switch  

**Stop for product review when P0 and P1 pass.** P2 (rollover + projected arrival) opens only after this GO.

*End of Learning Route P0–P1 Handoff*
