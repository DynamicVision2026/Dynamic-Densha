/** Draw the だいたい stub to PNG. Call only from a user tap. Fridge-safe: no identity. */

import { drawQrMatrix, drawTicketQr, PASS_QR_HREF, PASS_QR_MATRIX, TICKET_QR_HREF } from "./ticket-qr.ts";
import { CORPORATE_NAME } from "./commerce-copy.ts";

export type TicketPngInput = {
  glyphs: string[];
  returnLabel: string;
  serial: string;
  issueDay: string;
  domain: string;
  title?: string;
};

/** Fridge-safe dump of what the PNG/QR may contain. No identity fields. */
export function ticketExportPlainText(input: TicketPngInput): string {
  return [
    ...(input.glyphs ?? []),
    input.title ?? "だいたい",
    input.returnLabel,
    input.serial,
    input.domain,
    input.issueDay,
    TICKET_QR_HREF,
  ].join("\n");
}

function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  ctx.fill();
}

export function drawTicketCanvas(input: TicketPngInput): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 420;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.fillStyle = "#f4efe4";
  ctx.fillRect(0, 0, 720, 420);

  ctx.fillStyle = "#d7ebe0";
  fillRoundRect(ctx, 40, 30, 640, 360, 18);

  ctx.fillStyle = "#c45c48";
  ctx.fillRect(40, 30, 640, 72);

  ctx.fillStyle = "#fffbf3";
  ctx.font = "700 28px 'Zen Kaku Gothic New', sans-serif";
  ctx.fillText(input.title ?? "だいたい", 64, 76);
  ctx.font = "600 18px 'Zen Kaku Gothic New', sans-serif";
  ctx.fillText(input.serial, 420, 76);

  ctx.fillStyle = "#1c1916";
  ctx.font = "700 56px 'Shippori Mincho', serif";
  ctx.fillText(input.glyphs.join(" "), 64, 180);

  ctx.font = "700 64px 'Shippori Mincho', serif";
  ctx.fillText(input.returnLabel, 64, 270);

  ctx.fillStyle = "#5c574e";
  ctx.font = "600 18px 'Zen Kaku Gothic New', sans-serif";
  ctx.fillText(`${input.domain}  ${input.issueDay}`, 64, 350);

  drawTicketQr(ctx, 560, 250, 96);

  ctx.fillStyle = "#f4efe4";
  ctx.beginPath();
  ctx.arc(40, 210, 22, 0, Math.PI * 2);
  ctx.arc(680, 210, 22, 0, Math.PI * 2);
  ctx.fill();

  return canvas;
}

/**
 * The saveable 定期券 (spec §2.3). Same canvas → PNG → share-sheet-or-
 * download path as the stub above: no server round trip, nothing uploaded,
 * and never generated or downloaded on its own — only from a real tap on
 * the save button, because an image that appears in a parent's camera roll
 * unasked is an annoyance rather than a gift.
 *
 * `passenger` is the TRAIN name, never the child's name. This image is
 * built to leave the device — camera roll, iCloud, a family chat, a printer
 * — so the parity rule that a shareable ticket carries no PII applies to
 * every pixel of it. The route that calls this passes
 * trainNameOrDefault(...) (src/lib/commerce-copy.ts); the guarantee is
 * re-checked against what actually reaches the canvas, not against this
 * comment, by scripts/pass-png-pixels.test.mjs.
 *
 * The QR is PASS_QR_HREF — a plain URL, no token, no magic link. See
 * ticket-qr.ts for why that is not negotiable.
 */
export type CommuterPassInput = {
  /** Train name, e.g. わたしのれっしゃ号. Never a child's name. */
  passenger: string;
  /** Localised plan title, e.g. ご家庭ライセンス. */
  planLabel: string;
  /** Localised validity, e.g. なし（永年）or 2027年9月20日. */
  validityLabel: string;
  /** Localised 定期券 heading. */
  title: string;
  /** Localised 有効期限 label. */
  validityCaption: string;
};

/** Everything the pass PNG may contain, as plain text — the same fridge-safe declaration ticketExportPlainText makes for the stub. */
export function commuterPassPlainText(input: CommuterPassInput): string {
  return [
    input.title,
    input.passenger,
    input.planLabel,
    input.validityCaption,
    input.validityLabel,
    "漢字でんしゃ",
    CORPORATE_NAME,
    PASS_QR_HREF,
  ].join("\n");
}

export function drawCommuterPassCanvas(input: CommuterPassInput): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 420;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.fillStyle = "#f4efe4";
  ctx.fillRect(0, 0, 720, 420);

  // Ticket body: square corners, matching <ArrivalPass> on screen.
  ctx.fillStyle = "#f0e0b8";
  ctx.fillRect(40, 30, 640, 360);
  ctx.strokeStyle = "#c45c48";
  ctx.lineWidth = 4;
  ctx.strokeRect(42, 32, 636, 356);

  ctx.fillStyle = "#1c1916";
  ctx.font = "600 22px 'Zen Kaku Gothic New', sans-serif";
  ctx.fillText(input.title, 72, 80);

  ctx.font = "700 46px 'Shippori Mincho', serif";
  ctx.fillText(input.passenger, 72, 165);

  ctx.fillStyle = "#5c574e";
  ctx.font = "500 20px 'Zen Kaku Gothic New', sans-serif";
  ctx.fillText(input.planLabel, 72, 225);

  ctx.fillText(input.validityCaption, 72, 275);
  ctx.fillStyle = "#1c1916";
  ctx.font = "600 26px 'Shippori Mincho', serif";
  ctx.fillText(input.validityLabel, 72, 310);

  ctx.fillStyle = "#5c574e";
  ctx.font = "500 16px 'Zen Kaku Gothic New', sans-serif";
  ctx.fillText(`漢字でんしゃ ・ ${CORPORATE_NAME}`, 72, 360);

  drawQrMatrix(ctx, PASS_QR_MATRIX, 540, 220, 120);

  // Punch notches, bitten out in the page colour like the on-screen ticket.
  ctx.fillStyle = "#f4efe4";
  ctx.beginPath();
  ctx.arc(40, 210, 22, 0, Math.PI * 2);
  ctx.arc(680, 210, 22, 0, Math.PI * 2);
  ctx.fill();

  return canvas;
}

async function shareOrDownload(canvas: HTMLCanvasElement, fileName: string, title: string): Promise<void> {
  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png"),
  );
  if (!blob) return;
  const file = new File([blob], fileName, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (typeof navigator.share === "function" && nav.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Call only from a user tap. */
export async function saveCommuterPassPng(input: CommuterPassInput): Promise<void> {
  await shareOrDownload(drawCommuterPassCanvas(input), "teikiken.png", input.title);
}

export async function claimTicketPng(input: TicketPngInput): Promise<void> {
  const canvas = drawTicketCanvas(input);
  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png"),
  );
  if (!blob) return;
  const file = new File([blob], "kippu.png", { type: "image/png" });
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
  };
  if (typeof navigator.share === "function" && nav.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: input.title ?? "きっぷ" });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "kippu.png";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}