# Kanji Densha — UX IA & Layout System v1 (Engineering handoff)
**Date:** 2026-08-25
**Status:** AUTHORITATIVE for navigation / chrome / layout only
**Source:** Expert IA & Layout System v1.0 (accepted by product)
**Repo target:** DynamicVision2026/Dynamic-Densha `main`
**Does NOT change:** mastery state machine, dual-echo rules, lamps, scoring, workshop unscored policy, content banks, illustrations, 出題 (still frozen).
**Does change:** information architecture, default routes, chrome density, fixed vs scroll regions, multi-device layout (tablet primary).
---
## 0. Governing rules (non-negotiable)
1. **Child surface = app shell, not a scrolling webpage.**
   - Outer page **never** scrolls.
   - Only designated **inner** regions scroll when content overflows.
   - Root height: **`100dvh`** (never `100vh` alone — iOS URL bar / keyboard).
2. **Parent surface = ordinary scrolling document** with **sticky header**.
3. **One vermilion primary action per screen.** Car colors = state only; never on buttons. Vermilion never on cars.
4. **Child labels in kana** on primary/secondary controls. Min touch target **88×88pt**, gap ≥16pt on child surface.
5. **Ride session never scrolls.** Action zone occupies the **same screen region** across all four beats.
---
## 1. Information architecture
```
Kanji Densha
├── CHILD SURFACE (default on every launch)
│ ├── 発車標 (home — the only child “route”)
│ │ ├── line strip (region, not a route) → 路線図 overlay
│ │ └── しゅっぱつ → Ride
│ └── Ride (四拍, full-screen, no main chrome)
│ └── in-session only: workshop, confusable pairs (when character qualifies)
├── 保護者 DOOR (fixed corner, hold ~1.5s)
└── PARENT SURFACE (scroll document)
    ├── Progress / This week / Needs attention / Paper list
    ├── Account (save/login)
    └── Settings, rollover, licences
```
### Demoted (no longer peer destinations)
| Was | Now |
|-----|-----|
| Map / 路線図 | Overlay from line strip |
| Workshop | In-session only |
| Confusable pairs | In-session only |
| Full timetable as home peer | Inside map overlay / browse |
| みてみる tile | State, not a place (see §7) |
| Save / login | Parent surface only |
| Parent | Behind door only |
**No child tab bar.** Six peer entries → two surfaces + one door.
---
## 2. Child home — three fixed bands
### Tablet portrait (primary)
| Band | Behavior | Approx size |
|------|----------|-------------|
| **Top** | FIXED: line strip (H-scroll, snap current center) + 保護者 outside strip scroll | ~88pt + safe-top |
| **Stage** | `flex:1`; **only this band** scrolls vertically; `overscroll-behavior: contain` | remaining |
| **Action** | FIXED: single primary **しゅっぱつ** | ~160pt + safe-bottom |
Card order in stage: **returns → new → inspections** (inspections ≤3/day visible).
### Tablet landscape
- Strip ~64pt; action ~120pt; primary button ~40% width **bottom-center** (not side rail).
- Stage: two-column card grid.
- **Do not** move primary to a side rail.
### Phone
- Same three bands; stage one card full-width; strip ±1 station; action ~132pt + safe.
### Desktop / PC
- Center column **max-width ~900px** on washi field; **same three-band layout inside**. No full-bleed stretch.
---
## 3. Ride (四拍) — never scrolls
```
Top FIXED ~64pt: やめる (low salience) | ●●○○ beat dots | station label
Stage FIXED ~55%: beat content only (shrink type or split beat if overflow — no scroll)
Action FIXED: choices and/or つぎへ — **same region every beat**
```
- 出会う / わかる / 到着: primary in action zone
- ためす: answer choices in action zone
- Landscape: stage split ~55% content left / ~45% action stack right; top band unchanged
- Phone: choices stack full width vertically
Touch: child controls ≥88×88pt.
---
## 4. Line strip → 路線図 overlay
- Open: tap strip or pinch-out.
- Transition: shared-element scale strip → map (relationship legible).
- Content: current grade route, car colors, 未開通 grey, lines, stamps.
- Close: pinch-in / outside / もどる → **same** home state (scroll position preserved).
- **Not a route:** no history push; browser Back must not be required to exit. Use UI state flag.
---
## 5. Parent door
- Default: **hold ~1.5s** with visible fill ring; optional numeric gate in settings (off by default).
- Real `<button aria-label="保護者ページ">`.
- Keyboard / screen reader / Switch Control: **activate immediately** (bypass hold).
- `prefers-reduced-motion`: snap fill, no long animation.
- Parent surface: sticky header; single **もどる** same corner back to child. No deep link maze into child chrome.
---
## 6. Empty / guest states
| State | Child | Parent |
|-------|-------|--------|
| Nothing due | Copy: きょうの えきは ぜんぶ とうちゃく + next arrival; primary stays live as **じゆうに のる** (next free station) — **never disable** primary | Caught up + next return |
| Guest | Identical UI; no wall | Quiet “saved on this device”; promote **Save** once after first かんぺき |
| Day one | First departure ready; no forced explainer | Route + start band |
| Long absence | Capped board only; no catch-up / debt copy | Forward pace only |
| Offline PWA | Board + ride from cache; save affordances quietly absent | Reconnect to sync |
---
## 7. Demo / みてみる
- **Not a home tile.**
- Unauthenticated = real product UI + localStorage.
- Optional guided tour remains a **state** (banner “演示中 · 不计分”), not a destination.
- If tour entry exists, put under parent or one-time first-run — **not** child home peer.
---
## 8. Forbidden on child home (even if requested later)
Percent complete, streaks, total overdue, settings/account, demo tile, workshop tile, notification badges, search, second vermilion, upsell/subscription.
---
## 9. Implementation checklist
- [x] Default launch → child 発車標 three-band shell (`100dvh`)
- [x] Remove/relocate peer nav: map tab, workshop tab, demo tile, login on child chrome
- [x] Line strip + map overlay (no route stack)
- [x] Ride: no page scroll; stable action zone all beats
- [x] Parent door hold + a11y immediate open
- [x] Parent sticky header + sections order as sitemap
- [x] Empty day: primary still live
- [x] Tablet portrait + landscape + phone + 900px desktop
- [x] No mastery / scoring code changes
---
## 10. Acceptance (real iPad preferred)
1. Child cold: primary in <3s; if 保護者 first → door too strong
2. Parent cold: report in <3s; if >10s → door too weak
3. Full four-beat ride both orientations: **no scroll**, action zone fixed
4. Rotate mid-session: no state loss
5. Parent login keyboard: child shell / dvh does not collapse wrongly
6. Empty day: primary still works
7. VoiceOver reaches parent **without** hold
---
*End of UX IA & Layout v1 Handoff*
