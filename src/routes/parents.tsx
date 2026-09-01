import { createFileRoute, Link } from "@tanstack/react-router";
import { LanguageSwitcher } from "@/components/language-switcher";

export const Route = createFileRoute("/parents")({ component: Parents });

function Parents() {
  return (
    <main className="paper-wash min-h-dvh px-5 py-10">
      <div className="mx-auto w-full max-w-xl">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] font-medium tracking-[0.22em] text-fg-subtle">保護者の方へ</p>
          <LanguageSwitcher />
        </div>
        <h1 className="mt-3 font-display text-3xl leading-tight">漢字でんしゃ</h1>
        <p className="mt-4 text-sm leading-7 text-fg-muted">
          小学校で習う1026字を、列車の車両として残していく学びです。暗記のためのアプリではなく、乗った駅が景色になって残る、家庭の学習です。
        </p>
        <p className="mt-3 text-sm leading-7 text-fg-muted">
          専用のタブレットは要りません。いまお使いのスマホやタブレットのブラウザで乗れます。
        </p>

        <section className="mt-8">
          <h2 className="font-display text-xl">のりの よっつ</h2>
          <ol className="mt-3 space-y-3 text-sm leading-7 text-fg-muted">
            <li>
              <span className="font-medium text-fg">であう。</span>
              その字に、はじめて会います。
            </li>
            <li>
              <span className="font-medium text-fg">わかる。</span>
              よみと いみを、ゆっくり確かめます。
            </li>
            <li>
              <span className="font-medium text-fg">ためす。</span>
              ことばの中で、その字を使ってみます。
            </li>
            <li>
              <span className="font-medium text-fg">とうちゃく。</span>
              三つの灯が揃うと、だいたいに着きます。かんぺきは、まだ先です。
            </li>
          </ol>
        </section>

        <section className="mt-8">
          <h2 className="font-display text-xl">かんぺきは、いちにちでは つきません</h2>
          <p className="mt-3 text-sm leading-7 text-fg-muted">
            だいたいに着いた列車は、2〜3日あとに もういちど 戻ってきます。かんぺきは、その残響のあとです。一日で全部を終わらせる作りにはしていません。
          </p>
        </section>

        <section className="mt-8">
          <h2 className="font-display text-xl">保護者が みえるもの</h2>
          <p className="mt-3 text-sm leading-7 text-fg-muted">
            いま乗っている駅、だいたいと かんぺきの数、まちがえやすい字。今週の短い見とおし。子どもが見る画面には出しません。
          </p>
        </section>

        <section className="mt-8">
          <h2 className="font-display text-xl">お子さまの データ</h2>
          <p className="mt-3 text-sm leading-7 text-fg-muted">
            学習の記録は、ログインした保護者だけが持てます。お子さまの画面に料金や支払いの表示は出ません。さわってみるあいだは、この端末の中だけに残ります。
          </p>
        </section>

        <p className="mt-8 text-sm leading-7 text-fg">専用タブレットは いりません</p>
        <p className="text-sm leading-7 text-fg">お子さまに 料金の画面は 出ません</p>

        <Link
          to="/demo/kanji/$char"
          params={{ char: "一" }}
          data-door-try
          className="mt-8 inline-flex h-14 w-full items-center justify-center rounded-xl bg-primary px-8 font-display text-xl tracking-wide text-primary-fg"
        >
          さわってみる
        </Link>
        <p className="mt-4 text-center">
          <Link to="/" className="text-xs text-fg-subtle underline-offset-4 hover:underline">
            とびらに もどる
          </Link>
        </p>
      </div>
    </main>
  );
}
