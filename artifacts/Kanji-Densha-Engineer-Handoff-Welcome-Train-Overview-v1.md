# Kanji Densha — Welcome / Train Overview + Green Couple Beat v1
**Date:** 2026-08-25
**Status:** Engineering handoff — UI first slice
**Does NOT change:** mastery state machine, dual-echo rules/timing, lamps, scoring, workshop unscored, content banks, 出題 (frozen)
**Goal:** Ship a **returnable, atmospheric Welcome/overview** where grade progress is a **growing train**, plus a **green-only celebration at 到着** that invites the child to see the train. Daily plan (発車標 + しゅっぱつ) stays the fast path to learn.
---
## 1. Product decisions locked for this slice
1. **Scheme B (表と裏)**
   - **Front:** today’s 発車標 (cards + しゅっぱつ) — keep three-band shell / 100dvh behaviour already shipped.
   - **Back / Welcome overview:** bird’s-eye **railway status** — trains, rings, motion.
   - **One URL** still lands on front (plan). Flip is UI state, not a separate route that strands history.
2. **Growing consist (automatic)**
   - When a car becomes **かんぺき (green)**, it is **already coupled** in data/view.
   - **No** “earned but not hitched” state. **No** un-hitch, reorder, decorate.
3. **Achievement prompt (required)**
   - On green only: 到着 becomes the couple beat + copy + CTAs.
   - Primary: **れっしゃを みる** → overview focused on new car.
   - Secondary: **つぎへ** → today’s board.
   - Skip/tap-through never loses green.
4. **Grade trains**
   - Profile grade + **all lower grades** open (review + full consists).
   - **Higher grades** = dotted survey rings only (未開通), not empty 200-slot debt trains.
   - Downward grade focus must **not hide** higher completed rings.
5. **Culture frame (light)**
   - Rings = school-year laps; optional radials (家族線) **default off**, toggle 「せんを みる」.
   - **No real Japan prefecture map.** Invented / ink-wash ring geometry is enough for v1.
   - Atmospheric motion > geography accuracy.
---
## 2. Front face (plan) — small additions only
| Element | Spec |
|---------|------|
| Hub plate on strip (left) | `みどり N` and optionally `のった M` — **aggregates only**, no scan of 1026 rows on home load |
| Tap hub / みどり | Flip to overview (prefer filter or camera on green consist) |
| Ribbon (optional v1) | Short arc of current-grade ring + train head position |
| しゅっぱつ | Unchanged; never blocked by overview animation |
---
## 3. Back face — Welcome / overview (must ship)
### Look and feel
- **Atmospheric, grand, playful** ink-wash railway — not a spreadsheet.
- **Six concentric rings** (G1 innermost → G6 outer).
- Current grade = outermost **active** filling ring; completed lower grades = inner rings still “running.”
- Locked higher grades = **dotted survey** rings only.
- Cars on rings: green / blue / outline per existing five-colour policy as needed; v1 may prioritise **green consist + arc progress** for clarity.
- Slow ring rotation **or** locomotive emphasis; **one transform**, not 80 independently animated cars.
- Stop motion when reduced-motion or when focusing departure elsewhere.
- Zoom levels: far = coloured arc segments; mid = silhouettes; near = kanji (never 1026 glyphs at once).
- Virtualise; target open **< 400ms** on mid-age iPad.
### Chrome
- **発車標へ** — one tap back to plan front, same corner pattern as parent もどる.
- Optional: 「せんを みる」 toggles family radials (default off).
- Child: **no denominators / %** on hub; arc length is the proportion.
- Parent overlay later may add denominators — not required for this slice if time-boxed.
### Multi-grade
- G3 child: up to three live rings.
- Tap inner ring to focus that grade’s consist (review).
- Focus ≠ delete higher rings.
---
## 4. 到着 couple beat (green only)
**Fire only when status becomes perfect/green** (second successful echo path). Never on blue, never on first echo.
Suggested timeline (cuttable by any tap → end state):
| t | Motion |
|---|--------|
| 0 | 到着; body fills green (ink bloom) |
| +400ms | Rail draws under car |
| +700ms | Tail of grade consist slides in |
| +1100ms | New car couples (short recoil + sumi puff) |
| +1400ms | Train advances one car-length; plate 33→34 (split-flap) |
| +1900ms | CTAs |
**Copy (G1 kana direction):**
`つながった！`
`34りょうめ` (use real count)
Buttons: **`れっしゃを みる`** | **`つぎへ`**
**れっしゃを みる:** flip/open overview, camera on new car, brief glow, then slow ring.
**つぎへ:** plan front.
**Rules:**
- Green committed **before** pixels (server/demo eval already true).
- Ink aesthetic; optional soft 発車ベル / couple clack, muteable.
- `prefers-reduced-motion`: ≤200ms cross-fade to end state, same CTAs.
- Two greens same session → **one** beat, +2 cars.
- **Grade-complete (e.g. 80th G1):** special once — full consist, ring closes, one full lap.
- If user never opened overview after green: next overview open may play **one** short composite “new cars glow” (~1s), **no** “you missed N” backlog.
**Must not:** confetti/stars/mascot; block しゅっぱつ; queue badges “3 cars waiting”; uncouple.
---
## 5. Explicit non-goals (this ticket)
- Changing echo delays / 辩律 timing
- Manual hitch state machine
- Real geographic Japan map
- Feature wall on Welcome (login, workshop, demo tiles)
- Percent-complete debt on child overview
- 出題しゃしょう
---
## 6. Implementation order
1. Overview surface (rings + hub counts + 発車標へ) + flip from strip/みどり
2. Wire consist length to **perfect count per grade** (aggregate)
3. 到着 green couple beat + CTAs
4. Multi-ring lower grades + locked outer dots
5. Polish motion / reduced-motion / grade-complete lap
6. Push `main`, report SHA + preview notes
---
## 7. Acceptance (preview)
- [ ] Plan front still 3s to しゅっぱつ; overview does not steal default landing
- [ ] みどり / strip opens overview; 発車標へ returns cleanly
- [ ] Green → 到着 celebration → れっしゃを みる shows longer train
- [ ] Skip つぎへ: still green; overview later consistent
- [ ] G2+ profile: lower grade rings visible; higher = dotted only
- [ ] No mastery rule changes; progress-eval tests still pass
- [ ] Feels **map-like and alive** (train/rings in motion), not a static card list only
---
*End of handoff*
