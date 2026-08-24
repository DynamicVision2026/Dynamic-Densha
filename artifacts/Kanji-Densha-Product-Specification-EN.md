# Kanji Densha (漢字でんしゃ) — Product Specification

**Product name:** 漢字でんしゃ / Kanji Densha (also referred to as Kanji-Kusou)  
**Document type:** Full product specification (features, mastery logic, content system)  
**Language:** English  
**Audience:** Partners, engineers, curriculum reviewers, internal stakeholders  
**Status:** Reflects product as of 2026-08-23 after content scale, W6 thicken, Final Polish, and QA P0/P1 fixes  
**Tagline:** 「1026字を、列車に乗せて」— *1,026 kanji, one train at a time.*

---

## 1. Product identity

### 1.1 What it is
Kanji Densha is a **Web / PWA** product for **Japanese elementary school children** (and families in Japan, including non-native caregivers). It covers the full **MEXT 1,026 kyōiku kanji** (学年別漢字配当表).

It is **not** an App Store / Play native app, not a clearance drill farm, and not a handwriting calligraphy grader.

### 1.2 Positioning
| Axis | Choice |
|------|--------|
| Priority | **Learning first**, not clearance first |
| Bank | **Thin question bank**, **thick teaching** |
| Items | Only **published** items reach the child path |
| Metaphor | One character = one train car; timetable = learning path |
| Visual | Ink-wash / washi picture-book feel (宣紙底, ink, vermilion locomotive cues) |
| Mastery signal | Five status colors so child and parent can see “where we are standing” |

### 1.3 Design principles (locked)
1. **Learning over clearance** — car color and unlock are feedback and path, not the end goal.  
2. **Teach and test separated** — child sessions are teaching-led; item governance lives on the content side.  
3. **Gated bank** — draft → human/auto gate → **published only** on child path.  
4. **Few items per character, high quality** — engineering effort goes to order, feedback, spaced revisit (残響), and parent guidance—not infinite item volume.  
5. **One rule engine** — pure `evaluateProgress` shared by demo and logged-in modes.

### 1.4 Explicit non-goals
- Handwriting stroke recognition or calligraphy scoring  
- Free-form sentence production graded by the app  
- Live LLM-generated graded items on the child path  
- Leaderboards / competitive ranking  
- Replacing school penmanship class  
- **出題しゃしょう** (child-authored quizzes) — designed, **not shipped**  
- YouTube episodes as a **required** teaching gate (video may exist for acquisition; app must stand alone)

---

## 2. Users and modes

| Mode | Who | Persistence |
|------|-----|-------------|
| **Demo / guest** | Child or parent trying without account | `localStorage` (device-local) |
| **Authenticated** | Family with child profiles | Better Auth + DB (PGLite/Neon path) |
| **Parent surfaces** | Caregiver | Same progress model; **read-only** (opening parent pages does not change lamps) |

Demo copy makes locality explicit: progress is on this device unless signed in.

---

## 3. Core metaphor

- **Station / car** = one kanji character  
- **Timetable** = grade-ordered learning path (trains of a few characters)  
- **Ride** = a learning session on one character  
- **Line (路線)** = curated structural or phonetic family (editorial lists, not auto-radical dump)  
- **In-car announcement** = short fixed phrase between stations; **not scored**; not played during 残響  
- **Stamp book** = first time a character reaches かんぺき (perfect)  
- **Colors on cars** = mastery status (see §5)

**Hard editorial rule example:** 校 does **not** join 木の線 merely because it contains 木.

---

## 4. Learning session structure (four beats)

For a character in normal play:

| Beat | Japanese | Role |
|------|----------|------|
| 1 | **出会う** (Encounter) | Large character + ink-wash illustration (custom motif or template) + short child copy. Continue with explicit action (e.g. 乗った). **Not scored.** |
| 2 | **わかる** (Understand) | Elementary **音・訓** only (MEXT 音訓割り振り「小学校」), short meaning, example word(s), **speaker** buttons (fixed audio, replayable). |
| 3 | **ためす** (Practice) | Thin published items for **よみ / いみ / かたち** (see §6). |
| 4 | **到着** (Arrival) | Feedback; same-session status **caps at だいたい (almost)** even if all required lamps are on. |

Order is enforced for first-time / appropriate states (Encounter → Understand → Practice).

---

## 5. Mastery model (state machine)

### 5.1 Five statuses (car colors)

| Code key | Japanese | Role |
|----------|----------|------|
| `new` | はじめて | Not yet substantially engaged |
| `lost` | まよい | Too many mistakes of a kind / lifetime threshold |
| `fix` | なおし | Needs repair on specific lamp(s) |
| `almost` | だいたい | Required lights on + session rules met; **same-session maximum** |
| `perfect` | かんぺき | **Only** after spaced **残響** success (see §5.4) |

### 5.2 Three lamps

| Lamp | Japanese | Earned by |
|------|----------|-----------|
| Reading | よみ | Correct **reading** items (elementary on/kun only) |
| Meaning | いみ | Correct **meaning** items (semantic, not re-testing reading) |
| Shape | かたち | Correct **shape** items: stroke order (primitives), component assembly (compounds), or form-in-context 選字填空 |

**Rule (QA-fixed):** **One published item → exactly one primary lamp.** A sentence-fill / form item must not light all three lamps.

`required_lights` depends on grade params and whether a published shape surface exists. If shape is not published, shape is not required for almost.

### 5.3 Promotion to だいたい (almost)

Roughly: encounter + understand done, all **required** lamps true, no outstanding repair kinds.  
**Same session never grants かんぺき.**

### 5.4 Promotion to かんぺき (perfect) — dual 残響

1. Reach **almost**.  
2. **First** 残響 after delay (typically **20h** G1–G3; **36h** G4–G6 for first echo—per grade params). Success → still **almost**.  
3. **Second** 残響 after **≈168 hours (7 days)**. Success on required lights → **perfect**.  

Echo uses **same elementary reading**; prefers a **different word surface**, or **same word + new sentence frame** when a second word does not exist.  
Echo does **not** auto-play in-car announcements or open the phonetic workshop.

### 5.5 Failure / repair

- Consecutive wrongs of a kind ≥ `lost_wrong_threshold` (grade table; e.g. G1 default 3) or high lifetime wrongs → **lost**  
- Otherwise with repair needed → **fix**  
- **Novel word surface** first failure: repair lamp without treating as full character demotion into まよい (U2 rule)  
- Known successful surface wrong again: normal なおし / まよい counting (U2.4)

### 5.6 Engine

Pure function:

`evaluateProgress(previousProgress, event, gradeParams) → nextProgress`

Shared by demo and authenticated clients. UI must not invent a second status algorithm.

---

## 6. Practice item types (child path)

| Type | Lamp | Notes |
|------|------|--------|
| Reading choice / listen-supported よみ | Reading | Elementary readings only; every choice should expose listen when audio exists |
| Meaning choice | Meaning | **Semantic** distractors (gloss / category), not competing kana readings |
| 選字填空 (cloze select kanji into phrase) | Shape (primary) | Form in context; **no** handwriting score |
| Stroke-order (primitive) | Shape | Tap-to-select strokes in order; next-stroke hint; unique a11y names when strokes share type (e.g. multiple よこ) |
| Component assembly (compound) | Shape | e.g. 林 = 木 + 木; **never** free 8-stroke split for compounds |
| 似た駅名 (confusable stations) | Shape-oriented soft practice | Wrong choice repairs shape path; not full まよい counting in the designed soft rule |
| 音の家族工房 (phonetic family workshop) | Teaching / optional practice | Drop phonetic “stone” into semantic “house”; 当たり / 半分当たり; **not** required for perfect; **not** in 残響 |

**Published-only:** unpublished shape → no shape item (honest omission).

---

## 7. Audio

- **Fixed pre-rendered files** (not live random TTS drift).  
- **所听即所见:** spoken string matches on-screen reading.  
- Replayable; switching lines stops previous.  
- Missing file → **hide** speaker; never speak a different reading.  
- Playback does **not** call `evaluateProgress`.  
- Parent/license page credits fixed TTS pipeline (and KanjiVG where applicable).

---

## 8. Content system

### 8.1 teach_ready
A character counts in the **honest grade denominator** only when the minimum teaching checklist passes, including typically:

- Grade assignment  
- Elementary readings  
- Fixed audio for those readings  
- Meaning content  
- Word surfaces / echo capability  
- Shape published **or** shape not required  
- Encounter (illustration or template + short JA copy)

**Parent grade progress uses teach_ready counts — not a fake “all 1,026 are fully taught” claim on a Grade-1 view.**

### 8.2 Coverage (as of freeze)
| Grade | Official-scale count in product data | teach_ready |
|-------|--------------------------------------|-------------|
| G1 | 80 | 80/80 |
| G2 | 160 | 160/160 |
| G3 | 200 | 200/200 |
| G4 | 202 | 202/202 |
| G5 | 193 | 193/193 |
| G6 | 191 | 191/191 |
| **Total** | **1,026** | **1,026/1,026** |

(Product data G4–G6 counts follow the app’s 配当 table; totals match the familiar 1,026 education-kanji set.)

### 8.3 Surfaces (words)
- Character is the object; **word is the platform sign**.  
- 再訪: same reading; prefer alternate word; else same word new frame.  
- W6.1 thickened multi-word rates especially on G1–G2.

### 8.4 National alignment
- Readings judged against **音訓の小・中・高等学校段階別割り振り表** elementary marks.  
- Middle/high school readings must **not** light the reading lamp on the child path.  
- Grade totals align with current 学年別漢字配当表 (80/160/200/… pattern).

### 8.5 Shape data gate
- `published_shape` only after gate.  
- Primitive → strokes; compound → components.  
- No runtime AI decomposition on child path.  
- KanjiVG used as logic/reference with product redraw; license line on parent page.

---

## 9. Map, lines, workshop, stamps

### 9.1 Route map & line strips
- Editorial lines (examples): 木の線, みずの線, 口の線, 土の線, 火の線, ちゅうの線, せいの線, etc.  
- Semantic lines solid; phonetic lines dashed (product visual language).  
- Future stations: **未開通**, non-navigating.  
- Line membership does not change mastery state.

### 9.2 音の家族 (examples shipped)
- セイ (青): 晴 / 清 / 静 / 情 (情 may be half-match on reading)  
- コウ (工): 功・紅・空  
- シュ (主): 住・注・柱  
Families without reliable elementary readings are **not** forced into the workshop (e.g. 中 handled as curated line instead where appropriate).

### 9.3 Stamp book
- First **perfect** → one stamp; not revoked on later blue regression if decay off.  
- No leaderboard.

---

## 10. Parent product

| Element | Behavior |
|---------|----------|
| Status counts | Five statuses; should reconcile to grade teach-ready set |
| Weekly activity | Rides / echoes / new arrivals |
| Attention list | e.g. まよい → なおし → waiting second echo (~7 days) |
| Paper list | **≤5** characters; app **does not** score handwriting |
| Role copy (JA+EN) | App = reading, meaning, form (selection); paper & school = writing / stroke order |
| Honesty | Denominator = teach-ready for the grade view |
| Licenses | KanjiVG / fixed audio credits |
| Optional AI note | Gated; must not auto-consume quota silently |

Parent view is **read-only** regarding child lamps.

---

## 11. Grade parameters (illustrative)

Configurable per grade (not one hard-coded G1 table for all):

- Session item caps  
- Echo first delay / **second delay (~168h)**  
- Echo per-day cap  
- `lost_wrong_threshold` and related (stricter/looser by band as specified)  
- Force reteach on wrong where configured  

G3–G6 must not silently reuse G1 thresholds where the grade table differs.

---

## 12. Technology summary

| Layer | Choice |
|-------|--------|
| Client | TanStack Start + React + Tailwind |
| Progress | Pure `evaluateProgress` |
| Guest | localStorage |
| Auth / cloud | Better Auth + PGLite/Neon direction |
| i18n | JA primary; EN parent-critical strings; 简/繁 toggles exist |
| Content | Published flags; no draft on child path |

---

## 13. Quality bar (post-QA fixes)

Addressed for GO consideration:

- Shape task completable (tap strokes, distinct labels, no false error before input)  
- One item → one lamp  
- Speakers replayable; listen on all reading choices  
- Meaning items semantic  
- Default UI Japanese  
- Echo surface variation where content allows  
- Mobile header no longer 1px-truncates brand destructively  

Still recommended for ongoing QA: confusable pairs, workshop deep pass, G2–G6 sample loops, stamp duplicate rule, timed dual-echo with fixtures.

---

## 14. What “done” means for a character

A child can:

1. Meet it (encounter art + copy),  
2. Hear and see elementary readings,  
3. Practice meaning and form with published items,  
4. Reach **almost** in a session,  
5. Confirm via **two spaced 残響** with same-reading surfaces,  
6. Show **perfect** on timetable and optionally a stamp,  

…while the parent sees the same status model and a modest paper list—without the app pretending to grade handwriting or guarantee school exam scores.

---

## 15. Document control

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-08-23 | Full product specification from shipped mechanism, 1026 teach_ready content, W6 thicken, Final Polish, QA P0/P1 fixes |

**Related engineering contracts (internal):** Spec v0.2 state machine; shape gate; speaker audio; content batches 1–5; scale 1026; W6; Final Polish; QA Fix Final.

---

*End of Product Specification*
