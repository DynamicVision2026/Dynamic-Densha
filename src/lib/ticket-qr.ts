/** One public origin. No query, no child / user identity. */
export const TICKET_QR_HREF = "https://kanji-densha.app/";

/** Version-2 modules for TICKET_QR_HREF. Baked — do not recompute from PII. */
export const TICKET_QR_MATRIX = [
  "1111111001000010101111111",
  "1000001000111101001000001",
  "1011101010100010101011101",
  "1011101011110110001011101",
  "1011101011000100101011101",
  "1000001011111001101000001",
  "1111111010101010101111111",
  "0000000010001001100000000",
  "1011111001101111001111100",
  "0111100010000000100100010",
  "1101011110010001001111011",
  "1010010001100011111010001",
  "0011111111101101011010111",
  "1100010111000100100101010",
  "1001011110011111110111011",
  "1001100110110001100110001",
  "1001011101011110111110100",
  "0000000011101001100011000",
  "1111111001000000101010111",
  "1000001011010011100011011",
  "1011101010011111111110100",
  "1011101011111010011011111",
  "1011101010001001100001101",
  "1000001001001001100111001",
  "1111111011100110000111111",
] as const;

/**
 * The saveable 定期券 (src/lib/ticket-png.ts) points at the app itself, not
 * at the marketing origin above -- a commuter pass exists to get a family
 * back into the app, so it carries the app's own host.
 *
 * A PLAIN URL, and it stays one: no token, no magic link, no session
 * parameter, ever. This image is designed to be saved to a camera roll,
 * shared into a family chat, and printed onto a fridge; anything
 * credential-shaped baked into it could not be revoked without invalidating
 * every printed copy, and anyone who photographs the fridge would hold it.
 * Session persistence is the authentication mechanism; the pass solves
 * *finding the app*, which is the actual retention problem.
 */
export const PASS_QR_HREF = "https://app.kanji-ai.jp/";

/** Version-2 modules for PASS_QR_HREF. Baked by scripts/qr-encode.mjs — never recomputed at render time, and never from PII. */
export const PASS_QR_MATRIX = [
  "1111111011010100001111111",
  "1000001010000000101000001",
  "1011101000001110101011101",
  "1011101010111110001011101",
  "1011101001010011101011101",
  "1000001001100100101000001",
  "1111111010101010101111111",
  "0000000010010001000000000",
  "1011011101010011101001011",
  "0010010001111100110100010",
  "1011111111101010010110000",
  "0110010001011111000101100",
  "0100101010010100011010111",
  "0100110001010111101110001",
  "0111111000101010000010110",
  "1001100100101001001110001",
  "0010001110010100111111111",
  "0000000010101000100010101",
  "1111111011111100101010111",
  "1000001011001011100010010",
  "1011101000110010111111001",
  "1011101011101010101011111",
  "1011101010011010111010110",
  "1000001001011100011010100",
  "1111111010111100000111111",
] as const;

export function drawQrMatrix(
  ctx: CanvasRenderingContext2D,
  matrix: readonly string[],
  x: number,
  y: number,
  size: number,
) {
  const n = matrix.length;
  const quiet = 2;
  const cell = size / (n + quiet * 2);
  ctx.fillStyle = "#fffbf3";
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = "#1c1916";
  for (let r = 0; r < n; r++) {
    const row = matrix[r]!;
    for (let c = 0; c < n; c++) {
      if (row[c] !== "1") continue;
      ctx.fillRect(x + (c + quiet) * cell, y + (r + quiet) * cell, cell, cell);
    }
  }
}

export function drawTicketQr(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
) {
  drawQrMatrix(ctx, TICKET_QR_MATRIX, x, y, size);
}