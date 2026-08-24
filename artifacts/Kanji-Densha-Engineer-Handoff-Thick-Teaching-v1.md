Kanji Densha — Thick Teaching S1 (teach-before-test, dwell, next-arrival)

**Date:** 2026-08-23  
**Status:** Authoritative — S1 of S1–S3  
**Audience:** Engineer / Grok Build  
**Prerequisite:** Spec v0.2; published G1–G6 content

**Does not change:** five statuses, three lamps, dual 残響, same-session だいたい cap, elementary readings, **green never decays**, 出題 deferred.

---

## Goal

Sessions **teach first**. Items stay thin. Engineering effort goes to order, dwell, 残響 re-teach, and parent “what we taught” — not more quiz volume.

---

## 1. Four beats (locked)

| Beat | Japanese | Scored? |
|------|----------|---------|
| 1 | 出会う | No. Large character + motif + 乗った |
| 2 | わかる | No. Elementary 音・訓, meaning, 掛け軸, speaker |
| 3 | ためす | Yes. Thin published items, one lamp each |
| 4 | 到着 | Feedback. Same-session cap = だいたい |

Order enforced for first-time states: Encounter → Understand → Practice.

## 2. Dwell (T1)

- **乗った** disabled until `encounter_min_ms` (G1 default 2000ms).  
- **わかった** disabled until listen/ack + `understand_min_ms` (G1 default 1000ms).  
- 残響 teach-strip **つぎへ** also dwells (~1000ms).  

Skip flags exist only for QA / demo scripts, not child defaults.

## 3. Understand thickness

Child must:

1. See the character large  
2. Open **よみを見る** (elementary readings only)  
3. **聞く** when audio exists (hide speaker if file missing — never speak a different reading)  
4. Place the character on the **掛け軸**  
5. Then わかった  

所听即所见: spoken string matches on-screen reading.

## 4. 残響 re-teach (before the echo item)

Before the scored 残響 item, show `EchoTeachStrip`:

- Word platform + kana + meaning + same elementary reading  
- Prefer a **different word surface**; else same word + new frame  
- Does **not** auto-play 車内アナウンス  
- Does **not** open 音の家族工房  
- Playback does not call `evaluateProgress`  

Once per UTC day per character (`densha.echo-taught.v1`).

## 5. Next-arrival copy (T4)

Timetable 残響 uses **きょう / あした / あさって / N日後** (`Asia/Tokyo`).  

Forbidden: 遅れ, overdue, behind, 追いつき.

Stale echo (later than ~2× delay) may soften copy; **never demotes**.

## 6. Parent “今週おしえたこと” (T5)

- Built from **this Tokyo week’s actual rides**, not a fake seed list  
- Empty week → empty list (do not invent rides)  
- Unique kanji, most recent first, max 6  
- Each row: word surface + structure line when known + editorial 線 label when known  
  Example: 林 → 森林 / 木と木で 林 / 木の線  

Parent is **read-only** for lamps.

## 7. Acceptance

- [ ] 乗った starts disabled during dwell  
- [ ] Understand requires よみ + listen/ack + 掛け軸 before わかった  
- [ ] Echo opens with teach-strip; announcement does not auto-play  
- [ ] Timetable next-arrival has no lateness copy  
- [ ] Empty week parent list is empty  
- [ ] One item still lights exactly one lamp  

**S2** (if scheduled) stays inside this contract. **S3** adds 今週ののぞき + parent EN/JA thickness without writing lamps.

*End of Thick Teaching S1 Handoff*
