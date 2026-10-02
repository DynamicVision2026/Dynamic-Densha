/**
 * The founder-visible signal a failed/blocked welcome-email send must
 * produce (work order §5: "a customer who paid and got nothing must produce
 * a signal"). Retry and a dead-letter queue are explicitly out of scope at
 * this volume -- this is deliberately the whole mechanism: one plain email
 * to the same monitored support inbox every other failure in this app
 * already points at (src/lib/refund-contact.ts), not a new log line nobody
 * reads. Never throws: if the alert itself can't send (the provider is down
 * entirely), the only thing left to do is log loudly and move on -- there
 * is nothing to alert *that* with.
 */
import { EMAIL_FROM_ADDRESS, EMAIL_REPLY_TO } from "./resend-sender";
import type { EmailSender } from "./sender";

export async function alertFounder(
  sender: EmailSender,
  reasonCode: string,
  context: Record<string, string | null | undefined>,
): Promise<void> {
  const lines = Object.entries(context).map(([k, v]) => `${k}: ${v ?? "(none)"}`);
  const body = [`漢字でんしゃ の購入メール配信で問題が発生しました。`, "", `reason: ${reasonCode}`, ...lines].join("\n");
  try {
    await sender.send({
      to: EMAIL_REPLY_TO,
      subject: `【要確認】漢字でんしゃ 購入メール未送信: ${reasonCode}`,
      text: body,
    });
  } catch (err) {
    console.error(
      `[email] alertFounder itself failed to send (reason=${reasonCode}, to=${EMAIL_FROM_ADDRESS}): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
