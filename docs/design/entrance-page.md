# Entrance page — designer decisions

**Date:** 2026-08-26
**Status:** Q1–Q18 answered. Implemented on `release/entrance-page` (PR #6). Do **not** QA this rewrite on `release/welcome-ui-polish` / `6eb129e`.
**Preview tag:** `entrance-page` (Cloud Run). Some sandboxes block `*.run.app` with 403 CONNECT — check out the branch locally instead.
**Open PR:** https://github.com/DynamicVision2026/Dynamic-Densha/pull/6
**Older polish PR (not this work):** https://github.com/DynamicVision2026/Dynamic-Densha/pull/2

This ticket’s questions below are the frozen brief. Implementation follows the numbered answers, not this file’s “current product facts” table (that table described the polish branch).

---

## Locked from your 2026-08-26 note

Engineering will not relitigate these:

1. Counter is `4りょう`, never `4/1026`. 1026 belongs only in the tagline as aspiration (`1026字を、列車に乗せて。`), never as a measurement.
2. One URL, two audiences, by state:
   - no local progress and no session → door page
   - any progress at all → child’s home, marketing copy gone
3. Three doors, sized by likelihood:
   - Primary: `さわってみる` (no account, guest, localStorage)
   - Equal secondary: `保護者の方へ` and `ログイン`
4. Registration is asked at 到着 of the first free ride, not before. Natural sentence: `つづきを ほぞんしますか`.
5. Two trust lines on the door page, unexaggerated:
   - `専用タブレットは いりません`
   - `お子さまに 料金の画面は 出ません`
6. Three rendering defects to fix before anyone else sees this:
   - cars collide at the switchback (火 / 下 overlap)
   - kanji are white on green; spec is dark ink on pale green
   - landscape is sparse/pale (no bridge, no tunnel, few trees, low contrast) — reads as a diagram, not a diorama

---

## Current product facts (please read before answering)

These are implementation constraints, not proposals.

| Topic | What is in the code today |
|---|---|
| `/` when logged in | Redirects to `/app`. |
| `/` when logged out | Always the door/landing, even if demo progress exists. |
| Primary CTA | `つぎの駅へ` (or `でんしゃに のる` if no consist). Goes to `/demo` (child home), not into a ride. |
| Parent control | Grey text link `保護者ではじめる` → `/login`. Reads as a caption. |
| Demo progress store | `localStorage` key `densha.demo.progress.v3`. **On first read it auto-seeds** 一 + 音 + 下 + 火 as かんぺき. Every visitor who loads `/` or `/demo` already “has progress.” The routing rule cannot use this store as-is. |
| Seeded train | Decorative 4-car consist for reviewers (handoff: “demo profile with 3–4 green cars”). Not a real child’s record. |
| Child home | `/demo` via `ChildHome`. Separate from `/`. |
| Parent on child home | 1.5s hold `ParentDoor` → `/demo/parent`. |
| Save prompt | `guestSavePromote` exists only on `/demo/parent`. 到着 does not ask to save. |
| 到着 | Already shows だいたい / かんぺき copy and “the train comes back in a few days” (echo due). `つぎへ` is the action. |
| G1 first train | 一 右 雨 円 王 (はるのえき). **山 is G1 but not the first station.** Current CTA does not open 山. |
| Car motion | Cars **translate only**. No rotation to the path tangent. Hairpin radius ≈ 33px; car box 52×45; gap 54px. Collision at the 180° turn is geometric, not a timing bug. |
| Car colour | Fill `#6b8763`, glyph `#fffbf3` (white on green). |
| Landscape | 2 mist ridges, 5 terrace fills, 8 triangle trees, 1 thin bar, 1 vermilion square. No bridge, no tunnel. |
| Locales | ja / en / zh-Hans / zh-Hant. |

---

## Questions

### Routing

**Q1. What counts as “any progress”?**
Seeded greens must not count, or every visitor skips the door.

- A. First tap of `さわってみる` (even if they bounce before finishing a ride)
- B. First completed 到着 (だいたい or かんぺき)
- C. A dedicated flag, set only when the child actually rides, ignoring seeded demo greens
- D. Other (write the rule)

**Q2. After that flag is set, what does `/` do?**

- A. Redirect `/` → `/demo` (child home). Door is gone at this URL.
- B. `/` itself re-renders as child home (no marketing column). `/demo` stays as now.
- C. Other

Also confirm: logged-in parent/child still `/` → `/app`. Yes / No.

**Q3. How does a parent see the door again after the child has progress?**
Otherwise the parent is locked on the child’s home.

- A. `保護者の方へ` stays available on the child’s home
- B. Secret/query door (`/?door=1`) plus the hold-door already on child home
- C. No return. After first ride, door is gone; parent uses the 1.5s hold to `/demo/parent`
- D. Other

**Q4. Door-page train: real progress or picture-book?**
Your screenshot keeps `4りょう` with four cars. The older welcome handoff said 0 green = engine only.

- A. Door page is **decorative**: always the 4-car sample (一 音 下 火), counter `4りょう`, not the child’s record
- B. Door page is **honest empty**: engine only, no cars, no `4りょう` (journey about to begin)
- C. Other

---

### Three doors

**Q5. Where does `さわってみる` land?**
You wrote: “drops straight into the 山 ride you already built in M3, guest mode, localStorage.”

- A. `/demo` child home (current). Child then taps しゅっぱつ.
- B. Straight into a ride session. If B, **which kanji?** 山 is not the first G1 station. Confirm the exact char / URL (e.g. `/demo/kanji/山` vs `/demo/kanji/一`).
- C. Other

**Q6. Where does `保護者の方へ` land?**

- A. `/login`
- B. `/onboard`
- C. `/demo/parent`
- D. A new parent-explainer page (if D: paste the page outline / copy)
- E. Other

**Q7. If `ログイン` also goes to `/login`, why two parent doors?**
Write one sentence each: what `保護者の方へ` is for, what `ログイン` is for. If they are the same destination, pick one label and delete the other.

**Q8. Door layout (need enough to build, not a full mock)**

Reply with:

- Mobile stack (assume: primary full-width on top, two equal buttons under it — yes/no)
- Desktop: doors in the **left copy column**, or overlaid on the **train scene** (current CTA is overlaid)
- Primary colour: keep current vermilion/brown fill, white type — yes/no
- Secondary: outline buttons, equal width — yes/no
- Drop `つぎの駅へ` / `でんしゃに のる` / `保護者ではじめる` on the door — yes/no

**Q9. Trust lines placement**

- A. Under the title, above the doors
- B. Directly under the three doors
- C. Footer, smallest type
- D. Other

JA is locked as given. Ship EN / zh-Hans / zh-Hant in the same PR? Yes / No.
If Yes, paste EN (and ZH if you care); otherwise engineering will draft and you can redline.

**Q10. Door-page marketing paragraph**
Current `heroLead`: `暗記ではなく、景色として漢字を残す。一文字が一両。五色の到達度で、子どもの「いま」が見える小学漢字の学び。`

On the **door page** (parent’s first visit):

- A. Keep as-is
- B. Replace (paste new JA)
- C. Delete. Title + trust lines + three doors only

---

### Registration at 到着

**Q11. Trigger**

- A. First time a guest reaches 到着 at だいたい
- B. First time a guest reaches 到着 at any status
- C. First time a guest reaches かんぺき (your parent-page copy today talks about かんぺき)
- D. Other

**Q12. If they decline**

- A. Stay guest. Never ask again on this device
- B. Stay guest. Ask again at every later 到着 until they save
- C. Stay guest. Ask once per session
- D. Other

**Q13. UI + copy lock**

Paste:

- Headline (is it exactly `つづきを ほぞんしますか`)
- One-line reason (かんぺき / だいたい / 残響 — which story?)
- Confirm button
- Decline button
- Does this **replace** `つぎへ`, sit **above** it, or open as a **modal**?

Engineering will not invent a paywall or a hard gate. Decline must continue the ride.

---

### Rendering defects

**Q14. Switchback collision — preferred fix**

- A. Engineer rotates each car to the path tangent. Path shape stays.
- B. You supply a new path whose corner radius **exceeds one car length** (~52px). Cars may stay upright.
- C. Both: new wider path **and** tangent rotation
- D. Shorten the consist on the door (e.g. engine + 2 cars) so the turn is less crowded, plus A or C

If B or C: attach path / frame, or say “engineer may redraw the hairpin to radius ≥ 60px without a new mock.”

**Q15. Dark ink on pale green**

- Welcome scene cars only, or **every** kanji car in the product (ride, yard, map)?
- Paste hex if you have them. If not, engineering will use pale body ≈ `#c5d4b8` / ink ≈ `#1c1916` and you redline off the preview.

**Q16. Landscape / diorama**

- A. Designer delivers one landscape plate SVG this sprint (bridge, tunnel, trees, contrast). Engineering drops it in as a background plate; train path stays code.
- B. Engineering approximates in SVG this sprint (more trees, a bridge, a tunnel mouth, stronger terrace contrast). You redline the preview. Art plate can replace it later.
- C. Defer landscape. Ship routing + doors + ink + collision first.

If A: attach the SVG / frame. If B: any placement notes (bridge on which terrace, tunnel on which hairpin)?

---

### Process

**Q17. Copy language for this issue**

- A. Japanese only in the UI this issue; other locales follow
- B. All four locales in the same PR

**Q18. Branching**

Engineering plan unless you object:

1. On PR #2: revert `4/1026` → `4りょう` now. No other entrance rewrite on that branch.
2. New issue + branch `release/entrance-page` for routing, doors, trust lines, 到着 save, rendering.
3. Do not merge entrance work to `main` until you have signed the preview.

Yes / No / amend.

---

## What engineering will not do without answers

- Guess the 山 destination if G1’s first station is 一
- Treat seeded demo greens as real progress
- Point both parent doors at `/login` without a distinction
- Invent 保護者 explainer copy
- Hard-gate 到着 behind an account
- Redraw the valley as a diorama without A or B on Q16

## What engineering can do the same day you answer

Routing flag, three doors, trust lines, 到着 save prompt, car rotation, colour token swap. Landscape only if Q16 = B.

Reply in-thread by number. Short answers are enough.
