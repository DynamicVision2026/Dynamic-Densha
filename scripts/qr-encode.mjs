/**
 * Minimal QR encoder — byte mode, ECC level M, versions 1–3, single block.
 *
 * A build-time tool, never shipped in the app bundle: src/lib/ticket-qr.ts
 * carries BAKED matrices (see its own "do not recompute from PII" comment),
 * and this is what bakes them. Keeping the encoder out of the runtime is the
 * point — a matrix computed at render time is a matrix that could be
 * computed from something identifying.
 *
 * Deliberately narrow: it throws rather than guessing whenever the input
 * needs a version, ECC level, or block layout this file doesn't implement.
 * A QR that encodes the wrong bytes still scans — it just goes somewhere
 * else — so a silent fallback here would be worse than a crash.
 *
 * Correctness is not asserted by construction: scripts/ticket-qr.test.ts
 * re-encodes the URL that src/lib/ticket-qr.ts's long-standing matrix was
 * generated from (by a different tool, before this file existed) and
 * requires a byte-for-byte match.
 */

// ---------- GF(256), primitive polynomial 0x11D ----------

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

/** Generator polynomial for `degree` error-correction codewords. */
function generatorPoly(degree) {
  let poly = [1];
  for (let d = 0; d < degree; d++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let i = 0; i < poly.length; i++) {
      next[i] ^= poly[i];
      next[i + 1] ^= gfMul(poly[i], EXP[d]);
    }
    poly = next;
  }
  return poly;
}

function reedSolomon(data, ecLen) {
  const gen = generatorPoly(ecLen);
  const residual = new Array(ecLen).fill(0);
  for (const byte of data) {
    const factor = byte ^ residual[0];
    residual.shift();
    residual.push(0);
    if (factor !== 0) {
      for (let i = 0; i < ecLen; i++) residual[i] ^= gfMul(gen[i + 1], factor);
    }
  }
  return residual;
}

// ---------- Version table (ECC level M, single block only) ----------

/** [total codewords, data codewords] per version, level M. */
const M_CAPACITY = {
  1: [26, 16],
  2: [44, 28],
  3: [70, 44],
};

/** Alignment-pattern centre coordinates per version. */
const ALIGN_CENTERS = {
  1: [],
  2: [6, 18],
  3: [6, 22],
};

const ECC_M_FORMAT_BITS = 0b00;

function pickVersion(byteLength) {
  for (const version of [1, 2, 3]) {
    const [, dataCodewords] = M_CAPACITY[version];
    // 4 bits mode indicator + 8 bits character count (versions 1–9).
    const capacity = Math.floor((dataCodewords * 8 - 12) / 8);
    if (byteLength <= capacity) return version;
  }
  throw new Error(
    `qr-encode: ${byteLength} bytes needs a version above 3, which this encoder does not implement`,
  );
}

// ---------- Bit stream ----------

function buildCodewords(bytes, version) {
  const [total, dataCodewords] = M_CAPACITY[version];
  const bits = [];
  const push = (value, length) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >> i) & 1);
  };

  push(0b0100, 4); // byte mode
  push(bytes.length, 8); // character count, versions 1–9
  for (const b of bytes) push(b, 8);

  const capacityBits = dataCodewords * 8;
  if (bits.length > capacityBits) {
    throw new Error("qr-encode: data does not fit the chosen version");
  }
  // Terminator, then pad to a byte boundary.
  for (let i = 0; i < 4 && bits.length < capacityBits; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const data = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    data.push(byte);
  }
  // Alternating pad codewords until the data block is full.
  const PAD = [0xec, 0x11];
  while (data.length < dataCodewords) data.push(PAD[(data.length - bits.length / 8) % 2]);

  const ec = reedSolomon(data, total - dataCodewords);
  return [...data, ...ec];
}

// ---------- Module placement ----------

function emptyMatrix(size) {
  return Array.from({ length: size }, () => new Array(size).fill(null));
}

function placeFinder(modules, reserved, size, row, col) {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = row + r;
      const cc = col + c;
      if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
      const inRing = r >= 0 && r <= 6 && c >= 0 && c <= 6;
      const dark =
        inRing &&
        ((r === 0 || r === 6 || c === 0 || c === 6) ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4));
      modules[rr][cc] = dark ? 1 : 0;
      reserved[rr][cc] = true;
    }
  }
}

function placeFunctionPatterns(modules, reserved, size, version) {
  placeFinder(modules, reserved, size, 0, 0);
  placeFinder(modules, reserved, size, 0, size - 7);
  placeFinder(modules, reserved, size, size - 7, 0);

  // Timing patterns.
  for (let i = 8; i < size - 8; i++) {
    const dark = i % 2 === 0 ? 1 : 0;
    modules[6][i] = dark;
    reserved[6][i] = true;
    modules[i][6] = dark;
    reserved[i][6] = true;
  }

  // Alignment patterns, skipping the three that would sit on a finder.
  const centers = ALIGN_CENTERS[version];
  for (const r of centers) {
    for (const c of centers) {
      const onFinder =
        (r === centers[0] && c === centers[0]) ||
        (r === centers[0] && c === centers[centers.length - 1]) ||
        (r === centers[centers.length - 1] && c === centers[0]);
      if (onFinder) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1 ? 1 : 0;
          modules[r + dr][c + dc] = dark;
          reserved[r + dr][c + dc] = true;
        }
      }
    }
  }

  // Dark module — always set, always at (4 * version + 9, 8).
  modules[4 * version + 9][8] = 1;
  reserved[4 * version + 9][8] = true;

  // Reserve the format-information areas (written after masking).
  for (let i = 0; i < 9; i++) {
    if (!reserved[8][i]) reserved[8][i] = true;
    if (!reserved[i][8]) reserved[i][8] = true;
  }
  for (let i = 0; i < 8; i++) {
    reserved[8][size - 1 - i] = true;
    reserved[size - 1 - i][8] = true;
  }
}

function placeData(modules, reserved, size, codewords) {
  const bits = [];
  for (const byte of codewords) {
    for (let i = 7; i >= 0; i--) bits.push((byte >> i) & 1);
  }
  let bitIndex = 0;
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--; // the vertical timing pattern is not a data column
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i;
      for (let c = 0; c < 2; c++) {
        const cc = col - c;
        if (reserved[row][cc]) continue;
        // Past the end of the bit stream the remainder bits are all light.
        modules[row][cc] = bitIndex < bits.length ? bits[bitIndex] : 0;
        bitIndex++;
      }
    }
    upward = !upward;
  }
}

const MASKS = [
  (i, j) => (i + j) % 2 === 0,
  (i) => i % 2 === 0,
  (i, j) => j % 3 === 0,
  (i, j) => (i + j) % 3 === 0,
  (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
  (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
  (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
  (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0,
];

function penalty(grid) {
  const size = grid.length;
  let score = 0;

  // Rule 1: runs of five or more same-coloured modules.
  for (let i = 0; i < size; i++) {
    for (const readRow of [true, false]) {
      let run = 1;
      for (let j = 1; j < size; j++) {
        const prev = readRow ? grid[i][j - 1] : grid[j - 1][i];
        const cur = readRow ? grid[i][j] : grid[j][i];
        if (cur === prev) {
          run++;
        } else {
          if (run >= 5) score += 3 + (run - 5);
          run = 1;
        }
      }
      if (run >= 5) score += 3 + (run - 5);
    }
  }

  // Rule 2: 2x2 blocks of one colour.
  for (let i = 0; i < size - 1; i++) {
    for (let j = 0; j < size - 1; j++) {
      const v = grid[i][j];
      if (v === grid[i][j + 1] && v === grid[i + 1][j] && v === grid[i + 1][j + 1]) score += 3;
    }
  }

  // Rule 3: the finder-like 1:1:3:1:1 pattern with four light modules either side.
  const A = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const B = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  const matches = (line, pattern, start) => {
    for (let k = 0; k < pattern.length; k++) if (line[start + k] !== pattern[k]) return false;
    return true;
  };
  for (let i = 0; i < size; i++) {
    const row = grid[i];
    const col = grid.map((r) => r[i]);
    for (const line of [row, col]) {
      for (let j = 0; j + 11 <= size; j++) {
        if (matches(line, A, j)) score += 40;
        if (matches(line, B, j)) score += 40;
      }
    }
  }

  // Rule 4: overall dark/light balance.
  let dark = 0;
  for (const row of grid) for (const v of row) dark += v;
  const percent = (dark * 100) / (size * size);
  score += 10 * Math.floor(Math.abs(percent - 50) / 5);

  return score;
}

function formatBits(maskIndex) {
  const data = (ECC_M_FORMAT_BITS << 3) | maskIndex;
  let rem = data;
  for (let i = 0; i < 10; i++) {
    rem = (rem << 1) ^ ((rem >> 9) * 0x537);
  }
  return ((data << 10) | rem) ^ 0x5412;
}

function placeFormat(grid, size, maskIndex) {
  const bits = formatBits(maskIndex);
  // Bit 0 of the placement order is the MSB of the 15-bit format string, not
  // its LSB -- the whole string goes in backwards otherwise, which still
  // produces a plausible-looking symbol that no reader can decode.
  const bit = (i) => (bits >> (14 - i)) & 1;
  for (let i = 0; i <= 5; i++) grid[8][i] = bit(i);
  grid[8][7] = bit(6);
  grid[8][8] = bit(7);
  grid[7][8] = bit(8);
  for (let i = 9; i <= 14; i++) grid[14 - i][8] = bit(i);

  // Second copy: seven bits up the left column, eight along the top-right
  // row. The split is 7/8, not 8/7 -- the module at (size - 8, 8) is the
  // always-dark module, not a format bit, and writing a format bit over it
  // both corrupts the format string and leaves (8, size - 8) unwritten.
  for (let i = 0; i <= 6; i++) grid[size - 1 - i][8] = bit(i);
  for (let i = 0; i <= 7; i++) grid[8][size - 1 - i] = bit(14 - i);
}

/**
 * Encode `text` (UTF-8, byte mode, ECC level M) as an array of "0"/"1" row
 * strings — the exact shape src/lib/ticket-qr.ts bakes.
 */
export function encodeQrMatrix(text) {
  const bytes = [...new TextEncoder().encode(text)];
  const version = pickVersion(bytes.length);
  const size = version * 4 + 17;
  const codewords = buildCodewords(bytes, version);

  const modules = emptyMatrix(size);
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false));
  placeFunctionPatterns(modules, reserved, size, version);
  placeData(modules, reserved, size, codewords);

  let best = null;
  for (let maskIndex = 0; maskIndex < 8; maskIndex++) {
    const grid = modules.map((row, i) =>
      row.map((v, j) => (reserved[i][j] ? v : v ^ (MASKS[maskIndex](i, j) ? 1 : 0))),
    );
    placeFormat(grid, size, maskIndex);
    const score = penalty(grid);
    if (!best || score < best.score) best = { score, grid };
  }

  return best.grid.map((row) => row.join(""));
}

// CLI: node scripts/qr-encode.mjs "https://example.com/"
if (process.argv[1] && process.argv[1].endsWith("qr-encode.mjs")) {
  const text = process.argv[2];
  if (!text) {
    console.error('usage: node scripts/qr-encode.mjs "<text to encode>"');
    process.exit(1);
  }
  for (const row of encodeQrMatrix(text)) console.log(`  "${row}",`);
}
