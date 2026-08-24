import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { ANNOUNCEMENTS_G1 } from "../src/data/announcements.ts";
import { KANJI_LINES } from "../src/data/lines.ts";
import { KYOIKU } from "../src/data/kyoiku.ts";
import {
  announceCoverageByGrade,
  announcementAudioClips,
  announcementAudioSrc,
  announcementFor,
  g1AnnounceTemplateGaps,
  shouldAnnounce,
  spokenLineFor,
} from "../src/lib/announcements.ts";
import {
  isOnLine,
  lineStripFor,
  mapLinesFor,
  primaryLineFor,
  withinGradeCap,
} from "../src/lib/lines.ts";

test("木の線 is editorial: 木→林→森, never 校", () => {
  const ki = KANJI_LINES.find((l) => l.id === "line_ki");
  assert.ok(ki);
  assert.equal(ki.type, "semantic");
  assert.deepEqual(
    ki.stations.map((s) => s.kanji),
    ["木", "林", "森"],
  );
  assert.equal(isOnLine("校", "line_ki"), false);
  assert.equal(isOnLine("林", "line_ki"), true);
});

test("せいの線 is phonetic and distinct from 木の線", () => {
  const sei = KANJI_LINES.find((l) => l.id === "line_sei");
  assert.ok(sei);
  assert.equal(sei.type, "phonetic");
  assert.notEqual(sei.type, primaryLineFor("林")?.type);
});

test("G1 林 strip shows prev 木 / current 林 / next 森, all open", () => {
  const view = lineStripFor("林", 1);
  assert.ok(view);
  assert.equal(view.line.label_ja, "木の線");
  assert.equal(view.prev?.kanji, "木");
  assert.equal(view.current.kanji, "林");
  assert.equal(view.next?.kanji, "森");
  assert.equal(view.prev?.unopened, false);
  assert.equal(view.current.unopened, false);
  assert.equal(view.next?.unopened, false);
});

test("G1 生 next is 星 as 未開通; 清 is beyond the grade cap", () => {
  const view = lineStripFor("生", 1);
  assert.ok(view);
  assert.equal(view.line.type, "phonetic");
  assert.equal(view.next?.kanji, "星");
  assert.equal(view.next?.unopened, true);
  assert.equal(withinGradeCap({ kanji: "星", grade: 2 }, 1), true);
  assert.equal(withinGradeCap({ kanji: "清", grade: 4 }, 1), false);
  const fromStar = lineStripFor("星", 1);
  assert.ok(fromStar);
  assert.equal(fromStar.next, null);
});

test("G2 at 星 still shows 清 as 未開通 (+2 cap)", () => {
  const view = lineStripFor("星", 2);
  assert.ok(view);
  assert.equal(view.next?.kanji, "清");
  assert.equal(view.next?.unopened, true);
});

test("kanji with no line returns null strip", () => {
  assert.equal(lineStripFor("王", 1), null);
  assert.equal(lineStripFor("校", 1), null);
});

test("map has 木の線, せいの線, and extra curated lines; 校 never joins 木", () => {
  const ids = KANJI_LINES.map((l) => l.id);
  assert.ok(ids.includes("line_ki"));
  assert.ok(ids.includes("line_sei"));
  assert.ok(ids.includes("line_te"));
  assert.ok(ids.includes("line_hi"));
  assert.ok(ids.includes("line_mizu"));
  assert.ok(ids.includes("line_hito"));
  assert.ok(ids.includes("line_yama"));
  assert.ok(ids.includes("line_kuchi"));
  assert.ok(ids.includes("line_tsuchi"));
  assert.ok(ids.includes("line_ka"));
  assert.ok(ids.includes("line_chu"));
  assert.equal(isOnLine("校", "line_ki"), false);
  assert.equal(isOnLine("石", "line_te"), false);
  assert.equal(isOnLine("星", "line_hi"), false);
  assert.equal(isOnLine("雨", "line_mizu"), false);
  assert.equal(isOnLine("春", "line_hi"), true);
  assert.equal(isOnLine("時", "line_hi"), false);
  assert.equal(isOnLine("池", "line_mizu"), true);
  assert.equal(isOnLine("洋", "line_mizu"), false);
  assert.equal(isOnLine("湖", "line_mizu"), true);
  assert.equal(isOnLine("人", "line_hito"), true);
  assert.equal(isOnLine("何", "line_hito"), false);
  assert.equal(isOnLine("山", "line_yama"), true);
  assert.equal(isOnLine("古", "line_kuchi"), false);
  assert.equal(isOnLine("寺", "line_tsuchi"), false);
  assert.equal(isOnLine("秋", "line_ka"), false);
  assert.equal(isOnLine("虫", "line_chu"), false);
  assert.equal(isOnLine("沖", "line_chu"), false);
  assert.equal(isOnLine("昼", "line_chu"), true);
});

test("G1 map greys other-grade stations and does not hide 清; 校 stays off 木", () => {
  const lines = mapLinesFor(1);
  const sei = lines.find((l) => l.line.id === "line_sei");
  assert.ok(sei);
  assert.deepEqual(
    sei.stations.map((s) => s.kanji),
    ["生", "星", "清"],
  );
  assert.equal(sei.stations.find((s) => s.kanji === "生")?.unopened, false);
  assert.equal(sei.stations.find((s) => s.kanji === "星")?.unopened, true);
  assert.equal(sei.stations.find((s) => s.kanji === "清")?.unopened, true);
  const ki = lines.find((l) => l.line.id === "line_ki");
  assert.ok(ki);
  assert.equal(ki.stations.every((s) => !s.unopened), true);
});

test("G5 map lens is not G1-only", () => {
  const g5 = mapLinesFor(5);
  const g1 = mapLinesFor(1);
  const open5 = g5.flatMap((l) => l.stations).filter((s) => !s.unopened);
  const open1 = g1.flatMap((l) => l.stations).filter((s) => !s.unopened);
  assert.ok(open5.every((s) => s.grade === 5));
  assert.ok(open1.every((s) => s.grade === 1));
  const ki5 = g5.find((l) => l.line.id === "line_ki");
  assert.ok(ki5);
  assert.equal(ki5.stations.every((s) => s.unopened), true);
  assert.ok(g5.some((l) => l.stations.some((s) => s.kanji === "清")));
});

test("announcement is a 熟語, zero scoring API", () => {
  const hayashi = announcementFor("林");
  assert.match(hayashi.text, /森林/);
  assert.equal(hayashi.kanji, "林");
  const sei = announcementFor("生");
  assert.match(sei.text, /先生/);
  assert.equal(shouldAnnounce("王", { lookMode: true, echoOn: false }), false);
  assert.equal(shouldAnnounce("王", { lookMode: false, echoOn: true }), false);
  assert.equal(shouldAnnounce("王", { lookMode: false, echoOn: false, echoDue: true }), false);
});

test("announcement quotes the current station, never another kanji", () => {
  const stations = ["川", "水", "日", "人", "円", "木", "林", "青", "池", "春", "火"];
  for (const k of stations) {
    const a = announcementFor(k);
    assert.equal(a.kanji, k);
    assert.match(a.text, new RegExp(`「${k}」`));
    const quoted = a.text.match(/「(.)」/);
    assert.equal(quoted?.[1], k);
  }
  const kawa = announcementFor("川");
  assert.match(kawa.text, /川/);
  assert.doesNotMatch(kawa.text, /円/);
  assert.equal(kawa.reading, "おがわ");
});

test("spoken line is the on-screen sentence, never a rewrite", () => {
  for (const row of ANNOUNCEMENTS_G1) {
    assert.equal(spokenLineFor(row), row.text);
    const src = announcementAudioSrc(row);
    assert.equal(src, `/announce/${row.id}.mp3`);
    assert.ok(existsSync(`public/announce/${row.id}.mp3`), `missing clip for ${row.id}`);
  }
  const hayashi = announcementFor("林");
  assert.equal(spokenLineFor(hayashi), hayashi.text);
  assert.equal(hayashi.text, "次は、森林の「林」です。");
  const kawa = announcementFor("川");
  assert.equal(spokenLineFor(kawa), "次は、小川の「川」です。");
  const hi = announcementFor("火");
  assert.equal(spokenLineFor(hi), hi.text);
  assert.equal(hi.text, "次は、火の元の「火」です。");
  assert.equal(announcementAudioSrc(hi), `/announce/hi.mp3`);
  assert.ok(existsSync(`public/announce/hi.mp3`));
});

test("echo / look / 残響 / 自動演示 never request an announcement slot", () => {
  assert.equal(shouldAnnounce("林", { lookMode: false, echoOn: true }), false);
  assert.equal(shouldAnnounce("林", { lookMode: false, echoOn: false, echoDue: true }), false);
  assert.equal(shouldAnnounce("林", { lookMode: true, echoOn: false }), false);
  assert.equal(shouldAnnounce("林", { lookMode: false, echoOn: false, demoActive: true }), false);
});

test("G1 new cars have their own baked announce, never another station", () => {
  const weeklyNew = ["音", "下", "火", "子", "四", "糸", "字", "耳"];
  const hayashi = announcementFor("林");
  for (const k of weeklyNew) {
    const a = announcementFor(k);
    assert.equal(a.kanji, k);
    assert.match(a.text, new RegExp(`「${k}」`));
    assert.notEqual(a.text, hayashi.text);
    assert.notEqual(a.id, hayashi.id);
    const src = announcementAudioSrc(a);
    assert.ok(src, `${k} silent`);
    assert.equal(src, `/announce/${a.id}.mp3`);
    assert.ok(existsSync(`public${src}`), `missing ${src}`);
    const clips = announcementAudioClips(a);
    assert.deepEqual(clips, [src]);
  }
});

test("every G1 station has a dedicated 熟語 clip, never a template gap", () => {
  const g1 = KYOIKU.filter((k) => k.grade === 1).map((k) => k.char);
  assert.equal(g1.length, 80);
  assert.deepEqual(g1AnnounceTemplateGaps(), []);
  const seen = new Set<string>();
  for (const k of g1) {
    const a = announcementFor(k);
    assert.equal(a.kanji, k);
    assert.match(a.text, new RegExp(`「${k}」`));
    assert.doesNotMatch(a.id, /^generic:/);
    assert.equal(seen.has(a.id), false, `duplicate id ${a.id}`);
    seen.add(a.id);
    const clips = announcementAudioClips(a);
    assert.ok(clips.length >= 1, k);
    for (const src of clips) {
      assert.ok(existsSync(`public${src}`), `${k} ${src}`);
    }
    const src = announcementAudioSrc(a);
    assert.ok(src, `${k} missing dedicated clip`);
  }
  const ko = announcementFor("子");
  const hayashi = announcementFor("林");
  const ou = announcementFor("王");
  const migi = announcementFor("右");
  assert.match(ko.text, /子ども/);
  assert.match(hayashi.text, /森林/);
  assert.match(ou.text, /王子/);
  assert.match(migi.text, /右手/);
  assert.notEqual(ko.text, hayashi.text);
  assert.notEqual(ou.text, migi.text);
});

test("G2–G6 every 配当 station has its own line and baked clip", () => {
  const coverage = announceCoverageByGrade();
  const expected = { 1: 80, 2: 160, 3: 200, 4: 202, 5: 193, 6: 191 };
  const seenIds = new Set<string>();
  const seenText = new Set<string>();
  for (const row of coverage) {
    assert.equal(row.total, expected[row.grade], `grade ${row.grade} count`);
    assert.equal(row.gaps.length, 0, `grade ${row.grade} gaps ${row.gaps.slice(0, 8).join("")}`);
    assert.equal(row.dedicated, row.total);
  }
  for (const k of KYOIKU.filter((x) => x.grade >= 1 && x.grade <= 6)) {
    const a = announcementFor(k.char);
    assert.equal(a.kanji, k.char);
    assert.doesNotMatch(a.id, /^generic:/);
    assert.equal(seenIds.has(a.id), false, `duplicate id ${a.id}`);
    seenIds.add(a.id);
    assert.equal(seenText.has(a.text), false, `duplicate text ${a.text}`);
    seenText.add(a.text);
    const quoted = a.text.match(/「(.)」/);
    if (quoted) assert.equal(quoted[1], k.char, a.text);
    const src = announcementAudioSrc(a);
    assert.ok(src, `${k.char} silent`);
    assert.ok(existsSync(`public${src}`), `missing ${src}`);
  }
});

test("spot-check 星 海 雲 漢 are station-owned, 子 林 still distinct", () => {
  const hoshi = announcementFor("星");
  const umi = announcementFor("海");
  const kumo = announcementFor("雲");
  const kan = announcementFor("漢");
  assert.match(hoshi.text, /星空/);
  assert.match(umi.text, /海辺/);
  assert.match(kumo.text, /雨雲/);
  assert.match(kan.text, /漢字/);
  assert.notEqual(hoshi.text, umi.text);
  assert.notEqual(kumo.text, hoshi.text);
  const ko = announcementFor("子");
  const hayashi = announcementFor("林");
  assert.match(ko.text, /子ども/);
  assert.match(hayashi.text, /森林/);
  assert.notEqual(ko.text, hayashi.text);
  for (const a of [hoshi, umi, kumo, kan, ko, hayashi]) {
    const src = announcementAudioSrc(a);
    assert.ok(src);
    assert.ok(existsSync(`public${src}`), src);
  }
});


