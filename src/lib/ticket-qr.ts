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

export function drawTicketQr(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
) {
  const n = TICKET_QR_MATRIX.length;
  const quiet = 2;
  const cell = size / (n + quiet * 2);
  ctx.fillStyle = "#fffbf3";
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = "#1c1916";
  for (let r = 0; r < n; r++) {
    const row = TICKET_QR_MATRIX[r]!;
    for (let c = 0; c < n; c++) {
      if (row[c] !== "1") continue;
      ctx.fillRect(x + (c + quiet) * cell, y + (r + quiet) * cell, cell, cell);
    }
  }
}