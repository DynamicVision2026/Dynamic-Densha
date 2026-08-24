Kanji Densha — Learning Route P2 (Grade rollover + projected arrival)

**Date:** 2026-08-24  
**Status:** Authoritative — open after P0–P1 GO  
**Audience:** Engineer / Grok Build  
**Prerequisite:** Learning Route P0–P1 accepted (GradeRoute snapshot, start band, 発車標, 点検 flags, parent forward metrics stub)

**Does not change:** five statuses, three lamps, dual 残響, same-session だいたい cap, elementary readings, S1–S3 thick teaching, **green never decays for plan miss / silence**, child UI still has no “behind” language, 出題 deferred.

---

## Goal

1. **Grade rollover** — parent-prompted advance; old route kept as history; new grade becomes the scheduled line.  
2. **Projected arrival** — forward pace copy that may land on the **school calendar as horizon** (e.g. 2月ごろ), never as a completion guarantee or a “weeks behind” deficit.

---

## 1. Grade rollover

### When to surface
- Product signal: approaching or entering **April** school-year boundary (configurable date window), **or** parent opens an explicit “学年をあがる” control on parent page.  
- Do **not** silent-switch `ChildProfile.grade` or `active_grade_route_id`.

### Prompt (parent)
JA example structure:
- つぎの がくねんに すすみますか？  
- Explain: いまの せんろは きろくに のこります。あたらしい がくねんの せんろが ほんせんに なります。  

EN parallel on the same page when language is EN.

Actions:
- **すすむ** → perform rollover  
- **まだ** / dismiss → keep current active route  

### On confirm (すすむ)
1. Archive current `GradeRoute` into **GradeHistoryRoute** (or equivalent): still readable as a travelled line; do not delete station progress tied to those kanji.  
2. Set profile `grade` to next grade (cap at 6; if already 6, show “小学校の せんろは ここまで” — no fake G7).  
3. Create **new** immutable `GradeRoute` for the new grade (full 配当 order).  
4. Default new start band: **はじめ** unless product later adds a smarter default; parent can edit band afterward without wiping progress.  
5. Near-term **new** package comes from the **new** route only.  
6. Unfinished stations on the **old** grade remain **visitable**; they must **not** block the new schedule and must **not** be dumped as multi-week “catch-up debt” into next week’s new slots.  
7. Due 残響 / 点検 for old-grade characters still obey existing caps (returns/inspections only).

### Data
- Progress must remain queryable **per grade/route** (schema already required in P0).  
- `activeGrade` lens follows profile grade after confirmed rollover (user can still manually browse other grades if open-grade policy remains).

### Acceptance
- [ ] No automatic grade change without parent confirm  
- [ ] After rollover: history route visible as past line; new route scheduled  
- [ ] Old unfinished kanji still openable; not forced into “new this week” debt pack  
- [ ] G6 confirm path does not invent grade 7 route  

---

## 2. Projected arrival (parent-facing)

### Input (deterministic v1)
Use existing signals, e.g.:
- Stations remaining on **active** grade route (not yet ≥ だいたい, or not yet visited — pick one clear definition and document it; recommended: **not yet reached だいたい** for “remaining to learn,” plus optional separate “not yet かんぺき”)  
- Ride-days or new-station completion rate over last **28 days** (if near zero, projection is soft / “ペースが みえていません”)  
- Optional: weekly new package size setting  

### Output copy (examples)
- JA: 「いまの ペースだと、2月ごろ 全駅到着」  
- EN: “At this pace, about February for the full line.”  
- If pace unknown: 「もうすこし のると、よそうが できます」  

### School calendar as **horizon**, not origin
- Projection **may** name a school-year month (toward ~March for that grade’s natural horizon).  
- If projection **overshoots** ~March (or configured horizon): parent report shows a **gentle suggestion** to slightly increase weekly new stations — **not** a red deficit on the map, **not** child-facing.  

### Legal / honesty tone
- Frame as **pace estimate**, never “will finish Grade N by March” guarantee (景表法-aware).  
- Optional one-liner retained: railway order may differ from textbook publisher order.

### Forbidden
- “N weeks behind registration / behind April”  
- Streak of weeks completed  
- Child surface projection pressure  

### Acceptance
- [ ] Parent page shows projected arrival or soft empty-pace state  
- [ ] Over-horizon case suggests pace only on parent report  
- [ ] No guarantee wording; no child “behind”  

---

## 3. Out of scope
- Publisher-specific within-year sequences  
- Push-notification escalation for lapsed users  
- Green hard decay  
- AI rewriting the immutable Day-one route  
- 出題しゃしょう  

---

## 4. Implementation order
1. Rollover prompt + archive + new route creation + G6 edge  
2. Projected arrival computation + parent copy + over-horizon suggestion  
3. Light regression on P0–P1 発車標 / start band / 点検  

---

## 5. Acceptance summary
- [ ] April/parent-triggered rollover is explicit and reversible only by not confirming  
- [ ] History + active routes both coherent  
- [ ] Projected arrival forward-only on parent page  
- [ ] State machine and P0–P1 behavior unchanged  

**Stop for product review when both sections pass.**

---

*End of Learning Route P2 Handoff*