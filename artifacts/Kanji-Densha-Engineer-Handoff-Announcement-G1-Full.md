Kanji Densha — Engineer Handoff: Announcement G1 Full

**Date:** 2026-08-23  
**Status:** Authoritative — G1 車内アナウンス catalog + rules  
**Audience:** Engineer / Grok Build  
**Source of truth in code:** `src/data/announcements.ts` (`ANNOUNCEMENTS_G1`) + baked files in `public/announce/`

**Does not change:** announcements are **exposure only — never scored**; never play during 残響; never reuse another station's 熟語; 所听即所见 (screen copy == spoken copy).

---

## Rules

1. One row per destination station. Quoted kanji in the line **must equal** the destination.  
2. Template: `次は、{熟語}の「{字}」です。` (particle dropped for verb/adj 交ぜ書き).  
3. Missing baked file → emergency glue only: chime + 「次は、」+ elementary reading + 「です。」 Never borrow another station's clip.  
4. Playback does **not** call `evaluateProgress`.  
5. G1 is editorial 80/80 配当. Extra earlier lines (明 晴 春 池 海 体 岩 島 星 清) are kept and do not replace 配当 rows.  
6. Baked mp3 id = row `id` (e.g. `sensei.mp3`). Generic fallback id = `g-{hex codepoint}`.

## Catalog (editorial G1)

| id | 駅 | アナウンス | よみ |
|----|----|------------|------|
| `sensei` | 生 | 次は、先生の「生」です。 | せんせい |
| `taiboku` | 木 | 次は、大木の「木」です。 | たいぼく |
| `shinrin-hayashi` | 林 | 次は、森林の「林」です。 | しんりん |
| `shinrin-mori` | 森 | 次は、森林の「森」です。 | しんりん |
| `hanabi` | 花 | 次は、花火の「花」です。 | はなび |
| `ouji` | 王 | 次は、王子の「王」です。 | おうじ |
| `migite` | 右 | 次は、右手の「右」です。 | みぎて |
| `hidarite` | 左 | 次は、左手の「左」です。 | ひだりて |
| `ryote` | 手 | 次は、両手の「手」です。 | りょうて |
| `ame` | 雨 | 次は、大雨の「雨」です。 | おおあめ |
| `hyakuen` | 円 | 次は、百円の「円」です。 | ひゃくえん |
| `hitori` | 一 | 次は、一人の「一」です。 | ひとり |
| `gakkou` | 校 | 次は、学校の「校」です。 | がっこう |
| `aozora` | 青 | 次は、青空の「青」です。 | あおぞら |
| `asahi` | 日 | 次は、朝日の「日」です。 | あさひ |
| `ashita` | 明 | 次は、明日の「明」です。 | あした |
| `hare` | 晴 | 次は、晴れの「晴」です。 | はれ |
| `harukaze` | 春 | 次は、春風の「春」です。 | はるかぜ |
| `mizube` | 水 | 次は、水辺の「水」です。 | みずべ |
| `ogawa` | 川 | 次は、小川の「川」です。 | おがわ |
| `ike` | 池 | 次は、小さな池の「池」です。 | ちいさないけ |
| `umibe` | 海 | 次は、海辺の「海」です。 | うみべ |
| `hitobito` | 人 | 次は、人々の「人」です。 | ひとびと |
| `yasumi` | 休 | 次は、休みの「休」です。 | やすみ |
| `karada` | 体 | 次は、体の「体」です。 | からだ |
| `yamamichi` | 山 | 次は、山道の「山」です。 | やまみち |
| `iwa` | 岩 | 次は、大きな岩の「岩」です。 | おおきないわ |
| `shima` | 島 | 次は、小さな島の「島」です。 | ちいさないしま |
| `hoshizora` | 星 | 次は、星空の「星」です。 | ほしぞら |
| `shimizu` | 清 | 次は、清水の「清」です。 | しみず |
| `oto` | 音 | 次は、音の「音」です。 | おと |
| `shita` | 下 | 次は、下の「下」です。 | した |
| `hi` | 火 | 次は、火の元の「火」です。 | ひのもと |
| `kai` | 貝 | 次は、白い貝の「貝」です。 | しろいかい |
| `gakkou-gaku` | 学 | 次は、学校の「学」です。 | がっこう |
| `tenki-ki` | 気 | 次は、天気の「気」です。 | てんき |
| `kokonotsu` | 九 | 次は、九つの「九」です。 | ここのつ |
| `tama` | 玉 | 次は、青い玉の「玉」です。 | あおいたま |
| `okane` | 金 | 次は、お金の「金」です。 | おかね |
| `ozora` | 空 | 次は、大空の「空」です。 | おおぞら |
| `tsukiyo` | 月 | 次は、月夜の「月」です。 | つきよ |
| `koinu` | 犬 | 次は、子犬の「犬」です。 | こいぬ |
| `miru` | 見 | 次は、見る「見」です。 | みる |
| `itsutsu` | 五 | 次は、五つの「五」です。 | いつつ |
| `iriguchi` | 口 | 次は、入り口の「口」です。 | いりぐち |
| `mittsu` | 三 | 次は、三つの「三」です。 | みっつ |
| `kodomo` | 子 | 次は、子どもの「子」です。 | こども |
| `yottsu` | 四 | 次は、四つの「四」です。 | よっつ |
| `ito` | 糸 | 次は、赤い糸の「糸」です。 | あかいいと |
| `moji` | 字 | 次は、文字の「字」です。 | もじ |
| `mimi` | 耳 | 次は、耳の「耳」です。 | みみ |
| `nanatsu` | 七 | 次は、七つの「七」です。 | ななつ |
| `kuruma` | 車 | 次は、車の「車」です。 | くるま |
| `tooka` | 十 | 次は、十日の「十」です。 | とおか |
| `deguchi` | 出 | 次は、出口の「出」です。 | でぐち |
| `onnanoko` | 女 | 次は、女の子の「女」です。 | おんなのこ |
| `chiisai` | 小 | 次は、小さい「小」です。 | ちいさい |
| `ue` | 上 | 次は、上の「上」です。 | うえ |
| `tadashii` | 正 | 次は、正しい「正」です。 | ただしい |
| `yuugata` | 夕 | 次は、夕方の「夕」です。 | ゆうがた |
| `koishi` | 石 | 次は、小石の「石」です。 | こいし |
| `akai` | 赤 | 次は、赤い「赤」です。 | あかい |
| `senen` | 千 | 次は、千円の「千」です。 | せんえん |
| `sengetsu` | 先 | 次は、先月の「先」です。 | せんげつ |
| `hayai` | 早 | 次は、早い「早」です。 | はやい |
| `kusabana` | 草 | 次は、草花の「草」です。 | くさばな |
| `ashioto` | 足 | 次は、足音の「足」です。 | あしおと |
| `mura` | 村 | 次は、村の「村」です。 | むら |
| `ookii` | 大 | 次は、大きい「大」です。 | おおきい |
| `otokonoko` | 男 | 次は、男の子の「男」です。 | おとこのこ |
| `take` | 竹 | 次は、竹の「竹」です。 | たけ |
| `naka` | 中 | 次は、中の「中」です。 | なか |
| `mushi` | 虫 | 次は、虫の「虫」です。 | むし |
| `machi` | 町 | 次は、町の「町」です。 | まち |
| `tenki-ten` | 天 | 次は、天気の「天」です。 | てんき |
| `tambo` | 田 | 次は、田んぼの「田」です。 | たんぼ |
| `tsuchi` | 土 | 次は、土の「土」です。 | つち |
| `futatsu` | 二 | 次は、二つの「二」です。 | ふたつ |
| `hairu` | 入 | 次は、入り口の「入」です。 | いりぐち |
| `ichinen` | 年 | 次は、一年の「年」です。 | いちねん |
| `shiroi` | 白 | 次は、白い「白」です。 | しろい |
| `yattsu` | 八 | 次は、八つの「八」です。 | やっつ |
| `hyaku` | 百 | 次は、百円の「百」です。 | ひゃくえん |
| `moji-bun` | 文 | 次は、文字の「文」です。 | もじ |
| `hon` | 本 | 次は、本の「本」です。 | ほん |
| `namae` | 名 | 次は、名まえの「名」です。 | なまえ |
| `medama` | 目 | 次は、目玉の「目」です。 | めだま |
| `tatsu` | 立 | 次は、立つ「立」です。 | たつ |
| `chikara` | 力 | 次は、力の「力」です。 | ちから |
| `muttsu` | 六 | 次は、六つの「六」です。 | むっつ |

**Rows:** 90

*End of Announcement G1 Full Handoff*
