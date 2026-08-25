# Kanji Densha — Hero Welcome + Green-Only Running Train v1
**Date:** 2026-08-25
**Status:** Engineering handoff (UI + motion)
**Art direction:** Welcome Overview Art Direction v2.0 (terraces, not drawn rings)
**Does NOT change:** mastery / dual-echo rules, lamps, scoring, workshop unscored, 出題 frozen
**Goal:** Ship a **Hero Welcome / overview** that feels like the ink-wash train product (not a radar chart), where **only かんぺき (green) cars** form a consist that **loops along the near terrace**, and **each new green couples onto that train**. Daily 発車標 + しゅっぱつ remain the learning path (Scheme B: plan front, Welcome back/overview).
---
## 1. Locked product rules
| Rule | Spec |
|------|------|
| Who runs | **Only green (perfect) cars** join the running consist. Blue / other states do **not** appear as running cars on Welcome. |
| 0 green | Engine only (or engine + idle steam), **no looping empty ghost train**. Journey “about to begin.” |
| N green | Engine + **N** kanji cars (demo seed **3–4** greens so the motion is reviewable without full dual-echo grind). |
| Multi-grade | Profile grade + lower grades each may have a consist on their terrace depth; higher grades = empty distant terraces only. |
| Couple | On transition to green: auto-couple (到着 beat already specified); Welcome always reflects DB truth — **no manual hitch state**. |
| Landing | Default URL still **plan front**. Welcome opens via みどり / strip / れっしゃを みる. |
---
## 2. Visual system (replace ring diagram)
### Terrain = grades (no stroked ellipses)
- Receding **terraces / fields** up a valley; nearest = child’s current grade.
- Farther terraces = higher grades (pale, empty if locked).
- Curve of field edge + furrows imply the yearly loop — **do not draw concentric ring strokes**.
### Composition (tablet portrait)
- Top ~40%: mountains, mist, empty paper
- Mid ~35%: receding terraces
- Bottom ~25%: near terrace + train + controls
- Train **off-centre** (about 20–60% width); pine / seal anchor right; asymmetry required
### Assets (production model)
| Layer | Notes |
|-------|--------|
| Landscape plate | Prefer art-direction quality; v1 may ship **1 simplified plate** for current grade if 24 seasonal plates are not ready — **swap plates later without logic change** |
| Engine | Single component; vermilion only saturated accent on scene |
| Car | **One** tokenised component + swappable kanji glyph (not 1026 art files) |
| Steam | Optional 2–3 puffs |
| UI | Hanging sign + two plates (see §4) |
Cars on overview = **wooden crate + large kanji** (toy-real), not coloured status blocks. Status colours live in ride/yard near-zoom if needed; overview consist is green-only by definition.
### Colour (guidance)
Paper warm washi; sumi for type/outlines; mountains cool grey; pine dark green; **vermilion engine + seal only**.
---
## 3. Motion (required)
### Looping run (Welcome visible)
- Entire consist = **one transform group** (never per-car animation).
- Path: along near-terrace curve, **near → far direction** (or along furrow), then **loop** (seamless or soft wrap).
- Pace: slow (order of **one car-length per ~4s**); atmospheric, not arcade.
- **0 green:** no loop of cars; engine stationary (light steam OK).
- **1+ green:** loop with exact car count.
- Multi-grade: each grade’s group may drift independently, still one transform per consist.
- Pause motion when reduced-motion / when leaving overview if needed.
- **prefers-reduced-motion:** static frame, counts still correct.
### Couple (green only)
- Reuse / finish 到着 celebration: ink bloom → rail → couple → plate count tick → CTAs `れっしゃを みる` / `つぎへ`.
- Opening Welcome after couple: camera on new car brief glow, then resume loop.
- Green committed in data **before** animation; skip never loses green.
### Grade complete (nice-to-have in same ticket if cheap)
- Full consist moment once per grade (e.g. full lap) — else defer.
---
## 4. UI chrome on Welcome (only these)
1. **Sign (upper left):** `みどりの くるま` / `Nりょう` — aggregate green count; tap → overview focus / green yard if exists.
2. **Plate (lower left):** `はっしゃひょうへ` — back to plan front.
3. **Plate (lower right, secondary):** `せんを みる` — family radials toggle (default **off**; can be stub if radials not ready).
No login, workshop, demo tiles, settings on this surface.
---
## 5. Demo / preview data
- Ship or seed **demo profile with 3–4 green cars** on G1 so reviewers see a **short moving train** immediately.
- Document how to reset/reseed.
- Plan front still shows しゅっぱつ; do not require green to learn.
---
## 6. Scheme B wiring
| Face | Content |
|------|---------|
| Front | Existing 発車標 three-band + しゅっぱつ; hub **みどり N** opens Welcome |
| Back / overlay | This Hero Welcome scene |
One URL → plan; Welcome is state, not a history trap.
---
## 7. Non-goals
- Real Japan map
- Drawn radar rings
- Manual hitch / unhitch
- Animating non-green cars on the hero consist
- 24 seasonal plates mandatory for first merge (structure + 1 plate + motion first; art swap later)
- Mastery rule changes
---
## 8. Acceptance
- [ ] Welcome is terrace landscape + ink-wash train language, **not** grey concentric rings
- [ ] 0 green → engine idle, no looping fake cars
- [ ] Demo shows **3–4 green cars** looping slowly
- [ ] New green couples; count on sign matches consist length
- [ ] はっしゃひょうへ returns to plan; しゅっぱつ still works in ≤3s path
- [ ] Multi-grade: lower-grade consists possible; higher = empty far terraces
- [ ] Single group transform; no mastery test regressions
- [ ] Parent 2s test: “kanji train app,” not “progress chart”
---
## 9. Build order
1. Replace ring diagram canvas with terrace hero layout + engine/car components
2. Bind consist length to **perfect count per grade**; demo seed 3–4
3. Looping group motion along near terrace
4. Wire みどり / れっしゃを みる / はっしゃひょうへ
5. Confirm 到着 couple → Welcome
6. Push `main`; report SHA + demo steps
---
*End of handoff*
