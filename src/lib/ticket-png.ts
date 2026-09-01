/** Draw the だいたい stub to PNG. Call only from a user tap. Fridge-safe: no identity. */

import { drawTicketQr, TICKET_QR_HREF } from "./ticket-qr.ts";

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