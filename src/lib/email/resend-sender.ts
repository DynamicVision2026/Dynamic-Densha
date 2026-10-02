/**
 * Resend, the provider this repo's own commerce-launch-checklist.md names
 * as the chosen one (simpler fit for this TypeScript stack than sharing
 * another brand's Postmark account). Plain `fetch` against Resend's REST
 * API -- no SDK dependency for one HTTP call, matching how this repo
 * already hand-rolls its other third-party integrations (shopify-
 * signature.ts, shopify-checkout.ts).
 *
 * `RESEND_API_KEY` is a server-only, deploy-time secret (Cloud Run env var
 * / Secret Manager, never bundled into client code, never a GitHub Actions
 * secret the way this repo's Shopify vars aren't either -- see
 * docs/commerce-launch-checklist.md's "One-time setup").
 *
 * This account is 漢字でんしゃ's own, separate from ナゼホリ's Postmark account --
 * a different provider entirely, by design, so there is no account,
 * token, or activity log to accidentally share.
 */
import { SUPPORT_EMAIL } from "@/lib/refund-contact";

/**
 * Fixed, not configurable -- the work order gives this exactly, and
 * `info@kanji-ai.jp` is the one live, monitored mailbox this app already
 * points support/refund mail at (src/lib/refund-contact.ts), so replies to
 * the welcome email land in the same inbox a parent already expects.
 */
export const EMAIL_FROM_NAME = "漢字でんしゃ";
export const EMAIL_FROM_ADDRESS = SUPPORT_EMAIL;
export const EMAIL_REPLY_TO = SUPPORT_EMAIL;

import type { EmailMessage, EmailSender } from "./sender";
import { LoggingEmailSender } from "./sender";

export class ResendEmailSender implements EmailSender {
  constructor(private readonly apiKey: string) {}

  async send(message: EmailMessage): Promise<void> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${EMAIL_FROM_NAME} <${EMAIL_FROM_ADDRESS}>`,
        reply_to: EMAIL_REPLY_TO,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      }),
    });
    if (!res.ok) {
      throw new Error(`Resend send failed: ${res.status} ${await res.text()}`);
    }
  }
}

/**
 * The one place that decides which sender a real request uses. Mirrors this
 * repo's existing "missing config degrades, never crashes" convention
 * (shopify-checkout.ts throws only inside the one call that needs the
 * value; this degrades instead, because a missing email key must never
 * block the webhook response -- see the work order's own "silently never
 * sends" warning).
 */
export function buildEmailSender(): EmailSender {
  const apiKey = typeof process !== "undefined" ? process.env.RESEND_API_KEY?.trim() : undefined;
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY is not configured -- emails will only be logged, never actually sent.");
    return new LoggingEmailSender();
  }
  return new ResendEmailSender(apiKey);
}
