/**
 * The 漢字でんしゃ purchase welcome email, ported from densha-welcome-email.html
 * (the 記念乗車券 ticket design) into a plain TypeScript function -- no
 * templating dependency added for one template, per the work order. Every
 * Handlebars `{{#if}}`/`{{#each}}` in that file becomes a plain conditional
 * / `.map` below; the markup itself (table layout, inline styles) is
 * unchanged.
 *
 * `accessUrl` and `supportEmail` are parameters, never literals in this
 * file -- the one invariant the original template's own comments insisted
 * on, so a cross-brand or stale link can't creep in here even by accident.
 */
import { CORPORATE_NAME } from "../commerce-copy.ts";
import type { Plan } from "../subscription-derive.ts";

export type DenshaWelcomeEmailInput = {
  to: string;
  customerName?: string | null;
  /** e.g. "#1007" -- Shopify's own order name. */
  orderRef: string;
  /** This brand's own line items only. */
  items: { title: string; quantity: number }[];
  /**
   * Derived from variant_id by the caller, never invented here: buyout ->
   * "買い切り・自動更新はありません", annual -> "1年パス・自動更新はありません". The
   * old Shopify template hardcoded 買い切り on every order, including 1年パス
   * purchases -- a false statement about what the customer paid for. This
   * function takes the already-derived string so that mistake can't recur
   * inside the template itself.
   */
  planNote: string;
  accessUrl: string;
  supportEmail: string;
};

const PLAN_NOTES: Record<Plan, string> = {
  buyout: "買い切り・自動更新はありません",
  annual: "1年パス・自動更新はありません",
};

/** The only place `Plan -> planNote` is derived -- callers pass this straight through as `planNote`, never writing the string themselves. */
export function planNoteFor(plan: Plan): string {
  return PLAN_NOTES[plan];
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeHtmlAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

export function buildDenshaWelcomeEmail(input: DenshaWelcomeEmailInput): { to: string; subject: string; text: string; html: string } {
  const passengerLine = input.customerName ? `${input.customerName} 様の列車` : "わたしのれっしゃ号";
  const itemLines = input.items.map((i) => i.title);

  const text = [
    "ご乗車ありがとうございます。",
    "",
    passengerLine,
    ...itemLines,
    input.planNote,
    "",
    `ご注文番号: ${input.orderRef}`,
    "お支払いの明細は、別途お送りしている「ご注文の控え」をご確認ください。",
    "",
    "ご利用はすでに開始いただけます。",
    `でんしゃに乗る: ${input.accessUrl}`,
    "",
    "このメールは、いつでも戻ってこられるように保存しておいてください。",
    "",
    `漢字でんしゃ`,
    `運営：${CORPORATE_NAME}`,
    `お問い合わせ：${input.supportEmail}`,
  ].join("\n");

  const itemsHtml = itemLines.map((title) => `${escapeHtml(title)}<br>`).join("");

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>ご乗車ありがとうございます — 漢字でんしゃ</title>
</head>
<body style="margin:0;padding:0;background-color:#EFE7D8;">
<div style="display:none;font-size:1px;color:#EFE7D8;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
  ご乗車ありがとうございます。ここから学習をはじめられます。
</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#EFE7D8" style="background-color:#EFE7D8;">
<tr>
<td align="center" style="padding:28px 16px 40px 16px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;">
    <tr>
      <td align="center" style="padding:8px 0 24px 0;font-family:'Hiragino Mincho ProN','Yu Mincho',serif;font-size:20px;letter-spacing:0.14em;color:#2E2B26;">
        漢字でんしゃ
      </td>
    </tr>
    <tr>
      <td>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F7F1E4" style="background-color:#F7F1E4;border:2px solid #5E564B;">
          <tr>
            <td style="padding:20px 24px 0 24px;font-family:-apple-system,'Hiragino Kaku Gothic ProN','Yu Gothic',Meiryo,sans-serif;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="left" style="font-size:12px;letter-spacing:0.18em;color:#8E836C;">記念乗車券</td>
                  <td align="right">
                    <span style="display:inline-block;width:11px;height:11px;background-color:#5E564B;border-radius:11px;">&nbsp;</span>
                    <span style="display:inline-block;width:11px;height:11px;background-color:#5E564B;border-radius:11px;margin-left:7px;">&nbsp;</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 24px 0 24px;font-family:'Hiragino Mincho ProN','Yu Mincho',serif;font-size:23px;line-height:1.4;color:#2E2B26;">
              ${escapeHtml(passengerLine)}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px 0 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="left" valign="top" style="font-family:-apple-system,'Hiragino Kaku Gothic ProN','Yu Gothic',Meiryo,sans-serif;font-size:15px;line-height:1.9;color:#2E2B26;">
                    ${itemsHtml}
                    <span style="font-size:13px;color:#6B6157;">${escapeHtml(input.planNote)}</span>
                  </td>
                  <td align="right" valign="top" width="76">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="right">
                      <tr>
                        <td align="center" width="58" height="58" style="width:58px;height:58px;border:2px solid #BE3B2C;border-radius:6px;font-family:'Hiragino Mincho ProN','Yu Mincho',serif;font-size:26px;color:#BE3B2C;line-height:58px;">済</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 24px 0 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td height="1" bgcolor="#D5CAB4" style="height:1px;line-height:1px;font-size:0;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 24px 22px 24px;font-family:-apple-system,'Hiragino Kaku Gothic ProN','Yu Gothic',Meiryo,sans-serif;font-size:13px;line-height:2.0;color:#6B6157;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:13px;line-height:2.0;color:#6B6157;">
                <tr>
                  <td align="left">ご注文番号</td>
                  <td align="right" style="color:#2E2B26;">${escapeHtml(input.orderRef)}</td>
                </tr>
              </table>
              <span style="font-size:12px;color:#8E836C;">
                お支払いの明細は、別途お送りしている「ご注文の控え」をご確認ください。
              </span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding:30px 0 0 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td align="center" bgcolor="#BE3B2C" style="background-color:#BE3B2C;">
              <a href="${escapeHtmlAttr(input.accessUrl)}" style="display:block;padding:17px 34px;font-family:-apple-system,'Hiragino Kaku Gothic ProN','Yu Gothic',Meiryo,sans-serif;font-size:16px;font-weight:bold;letter-spacing:0.04em;color:#FBF7EE;text-decoration:none;">
                でんしゃに乗る！（金の定期券を確認）
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding:14px 20px 0 20px;font-family:-apple-system,'Hiragino Kaku Gothic ProN','Yu Gothic',Meiryo,sans-serif;font-size:13px;line-height:1.9;color:#6B6157;">
        ご利用はすでに開始いただけます。<br>
        このメールは、いつでも戻ってこられるように保存しておいてください。
      </td>
    </tr>
    <tr>
      <td style="padding:26px 0 0 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F7F1E4" style="background-color:#F7F1E4;border:1px solid #D5CAB4;">
          <tr>
            <td style="padding:16px 20px;font-family:-apple-system,'Hiragino Kaku Gothic ProN','Yu Gothic',Meiryo,sans-serif;font-size:13px;line-height:1.9;color:#6B6157;">
              <span style="color:#2E2B26;">ホーム画面に追加すると、次からすぐ出発できます。</span><br>
              iPhone・iPad：ブラウザの共有ボタン →「ホーム画面に追加」
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:28px 4px 0 4px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td height="1" bgcolor="#D5CAB4" style="height:1px;line-height:1px;font-size:0;">&nbsp;</td></tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:18px 4px 0 4px;font-family:-apple-system,'Hiragino Kaku Gothic ProN','Yu Gothic',Meiryo,sans-serif;font-size:12px;line-height:2.0;color:#8E836C;">
        漢字でんしゃ<br>
        運営：${escapeHtml(CORPORATE_NAME)}<br>
        お問い合わせ：<a href="mailto:${escapeHtmlAttr(input.supportEmail)}" style="color:#6B6157;text-decoration:underline;">${escapeHtml(input.supportEmail)}</a><br>
        <a href="https://kanji-ai.jp/tokushoho.html" style="color:#6B6157;text-decoration:underline;">特定商取引法に基づく表記</a>
        ・
        <a href="https://kanji-ai.jp/terms.html" style="color:#6B6157;text-decoration:underline;">利用規約</a>
        ・
        <a href="https://kanji-ai.jp/privacy.html" style="color:#6B6157;text-decoration:underline;">プライバシーポリシー</a>
      </td>
    </tr>
  </table>
</td>
</tr>
</table>
</body>
</html>`;

  return { to: input.to, subject: "ご乗車ありがとうございます — 漢字でんしゃ", text, html };
}
