import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { trainsForGrade, type Grade } from "@/data/kyoiku";
import { STATUS_META, type MasteryStatus } from "@/lib/mastery";

export const requestInsight = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((childId: string) => childId)
  .handler(async ({ context, data: childId }) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "AI所見はこの環境では使えません。" };
    }

    const sql = await getSql();
    const childRows = await sql<{ name: string; grade: number }>`
      select name, grade from children
      where id = ${childId} and user_id = ${context.userId}
    `;
    const child = childRows[0];
    if (!child) throw new Error("こどもが見つかりません");

    const rows = await sql<{ kanji: string; status: string }>`
      select kanji, status from kanji_progress
      where child_id = ${childId} and user_id = ${context.userId}
    `;
    const counts: Record<MasteryStatus, number> = {
      new: 0,
      lost: 0,
      fix: 0,
      almost: 0,
      perfect: 0,
    };
    const map = new Map(rows.map((r) => [r.kanji, r.status]));
    const trains = trainsForGrade(child.grade as Grade);
    let total = 0;
    for (const t of trains) {
      for (const ch of t.chars) {
        total += 1;
        const s = (map.get(ch) ?? "new") as MasteryStatus;
        if (s in counts) counts[s] += 1;
      }
    }

    const summary = [
      `なまえ: ${child.name}`,
      `学年: ${child.grade}年`,
      `配当字数: ${total}`,
      `記録あり: ${rows.length}`,
      ...Object.entries(counts).map(
        ([k, n]) => `${STATUS_META[k as MasteryStatus].ja}: ${n}`,
      ),
    ].join("\n");

    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        max_tokens: 420,
        messages: [
          {
            role: "system",
            content:
              "あなたは日本の小学校漢字学習に精通した家庭教師です。保護者向けに敬体で短く具体的に助言します。文部科学省の学年別漢字配当表を前提にします。絵文字は使わない。",
          },
          {
            role: "user",
            content: `次の子どもの漢字学習状況を見て、(1)いまの到達 (2)つまずき (3)今週の具体的な3手 を日本語で書いてください。\n\n${summary}`,
          },
        ],
      }),
    });
    if (!res.ok) {
      return { ok: false as const, error: "AI所見を取得できませんでした。" };
    }
    const body = (await res.json()) as {
      choices: { message: { content: string } }[];
    };
    const text = body.choices[0]?.message.content?.trim() ?? "";
    if (!text) return { ok: false as const, error: "AI所見を取得できませんでした。" };
    return { ok: true as const, text };
  });
