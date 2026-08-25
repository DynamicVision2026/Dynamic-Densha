# Kanji Densha — Unified NO-GO Fix Pack (Build contract)
**Date:** 2026-08-25
**Status:** AUTHORITATIVE — P0 + P1 closed in code; ops must still rotate the leaked OAuth secret
**Repo:** https://github.com/DynamicVision2026/Dynamic-Densha (`main`)
**Audience:** Grok Build / engineer
**Sources merged (strict standard):**
1. Security/state-machine code review (hard blockers, reproducible)
2. Interactive QA (Live Preview; desktop + 390×844 / 360×800)
3. Architecture review (structure OK; does **not** clear P0-1 — single writer ≠ trusted inputs)

**Product invariants — do not change:**
- Five statuses / three lamps / same-session max **だいたい**
- **かんぺき** only after **two time-valid 残響**
- Plan miss / silence **never** demotes green
- Workshop **never** scored
- Announcements **not** on 残響 or みてみる; normal teach entry **may** announce
- Parent-confirmed grade rollover only
- 出題 frozen
- One item → one lamp

---

## Build close-out (2026-08-25)

| ID | Result |
|----|--------|
| P0-1 | **Closed in code.** Server `submitPractice` and demo `submitDemoAnswer` set `scoringEcho = echoIsDue(prev, now)` from stored `almost` + `echoDueAt`. Evaluator uses `echoEligible = echoIsDue(prev, nowIso)` and ignores `event.isEcho` / `event.echoBatchDone`. Two instant crafted posts stay **だいたい**. Clock fixture: 1st due echo → almost; 2nd after spacing → perfect. Practice never grants perfect. |
| P0-2 | **Closed in tree.** No client secret in tracked source. Load `GROK_AUTH_CLIENT_SECRET` or `GROK_PREVIEW_CLIENT_SECRET` only. Placeholder in `.env.example`. **Owner must rotate at the OAuth broker** — git history may still contain the old value. Preview OAuth needs env injection. |
| P1-1 | **Closed.** Parent header/nav/body use **profile grade** (`child.grade`), not the child-world browse lens. Explicit single profile-grade model on parent. |
| P1-2 | **Closed.** Auth workshop `onCommit` is UI-only. Demo `applyDemoWorkshop` is `gradeChoice` only — no persist / `submitPractice` / `evaluateProgress`. |
| P1-3 | **Closed.** Bare `updateChildGrade` deleted. Grade writes only via parent-confirmed `performChildRollover` / `confirmGradeRollover`. |
| Announce | `shouldAnnounce = !lookMode && !echoOn && !echoDue && !demoActive`. 残響 / みてみる / scripted auto-demo silent. Normal `/demo` and `/app` teach entry (incl. なおし) may announce. |
| P2-1 | Header wrap + wrap-friendly 保護者ログイン |
| P2-2 | `parseGrade` strips wrapping quotes (`"%221%22"` → 1) |
| P2-4 | Documented KEEP — なおし re-entry may announce |
| P2-6 | `updateStartBand` passes real progress map into `pickWeeklyNew` |
| P2-10 | Dead `nextStatus` deleted |
| P2-5, P2-7, P2-8, P2-9, P2-3, P2-11 | Not in this pack (capacity) |

**Retest P0-1 (clock fixture, no wall-clock wait):**
```
node --experimental-strip-types --test scripts/progress-eval.test.ts
```
Cases: `P0-1 two instant client-echo submits cannot reach perfect`; `P0-1 clock fixture`; `P0-1 client isEcho/echoBatchDone ignored before due`; `P0-1 non-echo practice never grants perfect`; source lock on server/demo.

---

## Verdict

| Area | Result |
|------|--------|
| Ordinary child UI | Mostly solid — many paths PASS, no crash P0 |
| Soft launch | **NO-GO until owner rotates OAuth secret** (code P0-1 + P0-2 tree-clean). Then product GO after P1 (now closed). |
| Then | P2 as capacity allows |

---

## Build order (mandatory)

1. **P0-2** OAuth secret out of source (+ ops rotate)
2. **P0-1** Server-derived echo eligibility + tests
3. **P1-2** Workshop unscored
4. **P1-3** Kill bare `updateChildGrade`
5. **P1-1** Parent page grade lens = child lens
6. P2 (P2-1, P2-2 first if time)

When done: commit + **push** `main` (no force). Report SHA + how P0-1 was retested.

---

## P0 — Release blockers

### P0-1 — Client-trusted echo → early かんぺき

**Problem**
`submitPractice` accepts client `isEcho` / `echoBatchDone`. Evaluator can advance echo count **without** proving `echoDueAt` / ordinal / spacing. Two immediate crafted submits → **perfect** in one moment. Destroys “honest mastery.”

**Fix shipped**
1. Server and demo entry derive echo eligibility from **stored progress only**:
   - status already `almost` (だいたい)
   - `echoDueAt` ≤ now
   - ordinal + delays (~20h first / ~168h second)
2. Client `isEcho` / `echoBatchDone` are **not authority**.
3. Sequential duplicate submit at the same timestamp does not double-count (due date moves on first success).
4. Tests as listed in close-out.

### P0-2 — Hard-coded OAuth client secret in repo

**Problem**
Secret committed (e.g. `src/lib/auth/preview.ts`). Public repo = exposed history.

**Fix shipped**
1. **Ops:** rotate/revoke secret at OAuth provider **immediately** (product/owner).
2. Code: env only; placeholder in `.env.example`.
3. Not imported from client. No secret string in tracked source.
4. History still may contain old value → **rotation is the real fix**.

---

## P1 — Before soft-launch GO

### P1-1 — Parent page vs child `activeGrade` split brain

**QA repro**
Child timetable → grade 5 → parent page: header/nav say 5年生, body / rollover / route still **grade 1**.

**Fix shipped**
Explicit **profile-grade model on parent**: header 「いま」, WorldNav, rollover, route, report all use `child.grade`. Browse lens is child-world only.

### P1-2 — 音の家族工房 scores mastery

**Fix shipped**
Workshop = UI-only feedback (当たり / 半分当たり). No `ProgressEvent`, `submitPractice`, or `evaluateProgress`.

### P1-3 — `updateChildGrade` bypasses rollover

**Fix shipped**
Deleted. Only `performChildRollover` mutates `children.grade` together with route archive + new GradeRoute.

---

## P2 — Should fix (after P0/P1 or parallel if capacity)

| ID | Issue | Action |
|----|--------|--------|
| P2-1 | 390/360px 「保護者ログイン」 clipped | **Done** — header wrap / wrap-friendly login |
| P2-2 | `grade=%221%22` double-encoded | **Done** — numeric grade into router once |
| P2-3 | G5 map empty lines copy | Honest empty or add line data — product OK either — **not this pack** |
| P2-4 | なおし re-entry announces | **KEEP** — documented in `shouldAnnounce` |
| P2-5 | Rollover not transactional | **Open** — single transaction + active-route uniqueness if possible |
| P2-6 | `updateStartBand` empty progress map | **Done** — real progress so blue/green not “new” |
| P2-7 | Demo/auth `open`/`seenAt` asymmetry | **Open** |
| P2-8 | typecheck/lint/template tests blocking product tests | **Open** |
| P2-9 | Large main chunk / public audio | Grade-split later OK |
| P2-10 | Dead `nextStatus` in `mastery.ts` | **Done** — deleted |
| P2-11 | Child i18n 遅れ / behind / overdue | Grep; none on child surface — not re-audited this pack |

---

## Do not regress (interactive QA already passed)

- 出会う→わかる→ためす→到着 + dwell
- Same session: 王 → blue only; one item one lamp; 王 strokes / 林 components
- 残響 teach strip; no announce on 残響 / みてみる
- Repair: reteach + surface/option rotation
- 発車標; no streak / behind-total / lateness demotion copy
- Parent 今週おしえたこと; start band keeps mastery; rollover UI まだ stays grade
- 子/林/星/海 distinct announcements; きく current station
- Timetable G5 → map G5 lens
- No handwriting scoring

---

## Announcement product lock (explicit)

```text
shouldAnnounce = !isEcho && !isAutoDemoTour
```

- 残響: silent
- みてみる / scripted tour: silent
- Normal `/demo` and `/app` station teach entry: **may** auto-announce + きく
- Do **not** mute all `/demo/*` unless product changes this lock later

---

## Post-fix gate (before anyone says GO)

1. P0-1 minimal bypass **fails** (documented test — see close-out)
2. Secret gone from tree; rotation noted (**ops still required**)
3. Workshop unscored
4. Parent grade lens consistent
5. No bare grade update
6. Push to GitHub `main`; SHA reported

**Dual-echo full wall-clock wait is optional in UI** — rely on **clock-fixture tests** for P0-1.

---

## Out of scope

- 出題しゃしょう
- New pedagogy / state-machine redesign
- Force-push / history rewrite unless owner explicitly requests

---

*End of Unified NO-GO Fix Pack — 2026-08-25*
