/**
 * The pluggable sender interface every outbound email in this app goes
 * through. `FakeEmailSender` is what every test uses; `LoggingEmailSender`
 * is what a deploy with no RESEND_API_KEY configured falls back to -- never
 * a thrown error, so a missing key degrades to "logged, not sent" rather
 * than crashing the webhook that triggered it. The real HTTP client is
 * `src/lib/email/resend-sender.ts`.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  /** Always sent alongside `html` -- no HTML-only email, so a client that strips HTML still shows something. */
  text: string;
  html?: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/** Records every message instead of sending it -- every unit test uses this. */
export class FakeEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}

/** RESEND_API_KEY not configured -- logs instead of sending, so local/dev never crashes for lack of a key. */
export class LoggingEmailSender implements EmailSender {
  async send(message: EmailMessage): Promise<void> {
    console.warn(`[email] RESEND_API_KEY not configured -- would have sent "${message.subject}" to ${message.to}`);
  }
}
