// Pure TypeScript 1D Linear Barcode Generator (Code-128B & EAN-13) + POS Beep Sound
// Renders crisp, zero-dependency vector SVG barcodes optimized for 40x20mm thermal labels

// Code-128B pattern table (values 0 to 106)
// Each entry represents 6 alternating bar/space widths (total 11 modules, Stop has 13 modules)
const CODE128_PATTERNS: string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312',
  '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131',
  '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321',
  '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112',
  '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412',
  '211214', '211232', '2331112'
];

// EAN-13 encoding tables
const EAN_L_CODES = [
  '0001101', '0011001', '0010011', '0111101', '0100011',
  '0110001', '0101111', '0111011', '0110111', '0001011'
];
const EAN_G_CODES = [
  '0100111', '0110011', '0011011', '0100001', '0011101',
  '0111001', '0000101', '0010001', '0001001', '0010111'
];
const EAN_R_CODES = [
  '1110010', '1100110', '1101100', '1000010', '1011100',
  '1001110', '1010000', '1000100', '1001000', '1110100'
];
const EAN_PARITY_PATTERNS = [
  'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
  'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'
];

/**
 * Computes the standard Modulo-10 check digit for a 12-digit EAN-13 payload.
 */
export function computeEan13CheckDigit(twelveDigits: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(twelveDigits[i], 10) || 0;
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Checks whether a string is a valid 13-digit EAN-13 barcode.
 */
export function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  const expected = computeEan13CheckDigit(code.slice(0, 12));
  return parseInt(code[12], 10) === expected;
}

/**
 * Generates a valid 13-digit EAN-13 barcode (prefix 613 for Algeria / internal store)
 * with a genuine Modulo-10 checksum digit so any laser or camera scanner reads it cleanly.
 */
export function generateValidEan13Barcode(prefix = '613'): string {
  const cleanPrefix = prefix.replace(/\D/g, '').slice(0, 3).padEnd(3, '2');
  let body = cleanPrefix;
  while (body.length < 12) {
    body += Math.floor(Math.random() * 10).toString();
  }
  const checkDigit = computeEan13CheckDigit(body);
  return `${body}${checkDigit}`;
}

/**
 * Encodes a valid 13-digit EAN-13 string into a binary string of '1' (bar) and '0' (space).
 */
function encodeEan13Bits(code: string): string {
  const firstDigit = parseInt(code[0], 10);
  const parityPattern = EAN_PARITY_PATTERNS[firstDigit] || 'LLLLLL';

  let bits = '101'; // Left guard
  for (let i = 1; i <= 6; i++) {
    const digit = parseInt(code[i], 10);
    bits += parityPattern[i - 1] === 'L' ? EAN_L_CODES[digit] : EAN_G_CODES[digit];
  }
  bits += '01010'; // Center guard
  for (let i = 7; i <= 12; i++) {
    const digit = parseInt(code[i], 10);
    bits += EAN_R_CODES[digit];
  }
  bits += '101'; // Right guard
  return bits;
}

/**
 * Encodes any ASCII string into Code-128 (using Subset C for even-length digit pairs when purely numeric,
 * or Subset B for universal alphanumeric codes) as a binary string of '1' (bar) and '0' (space).
 */
function encodeCode128Bits(rawCode: string): string {
  const clean = rawCode.trim() || '000000';

  // If purely numeric with even length >= 4, use Code-128C (ultra-compact high-density bars for thermal labels!)
  const isEvenDigits = /^\d+$/.test(clean) && clean.length >= 4 && clean.length % 2 === 0;

  const codes: number[] = [];
  if (isEvenDigits) {
    codes.push(105); // Start Code C
    for (let i = 0; i < clean.length; i += 2) {
      codes.push(parseInt(clean.slice(i, i + 2), 10));
    }
  } else {
    codes.push(104); // Start Code B
    for (let i = 0; i < clean.length; i++) {
      const charCode = clean.charCodeAt(i);
      // Clamp to printable ASCII 32..126
      const val = charCode >= 32 && charCode <= 126 ? charCode - 32 : 0;
      codes.push(val);
    }
  }

  // Calculate Code-128 checksum
  let checksum = codes[0];
  for (let i = 1; i < codes.length; i++) {
    checksum += codes[i] * i;
  }
  codes.push(checksum % 103);
  codes.push(106); // Stop pattern

  let bits = '';
  for (const c of codes) {
    const pattern = CODE128_PATTERNS[c];
    let isBar = true;
    for (let i = 0; i < pattern.length; i++) {
      const width = parseInt(pattern[i], 10);
      bits += (isBar ? '1' : '0').repeat(width);
      isBar = !isBar;
    }
  }
  return bits;
}

export interface BarcodeSvgOptions {
  height?: number;
  quietZoneModules?: number;
  barColor?: string;
  backgroundColor?: string;
  preferEan13?: boolean;
}

export interface BarcodeRenderData {
  rects: Array<{ x: number; width: number; isGuard?: boolean }>;
  totalModules: number;
  format: 'EAN-13' | 'CODE-128';
  formattedText: string;
}

/**
 * Generates vector bar rectangles for rendering a 1D barcode inside an <svg>.
 */
export function buildBarcodeRenderData(
  code: string,
  options: BarcodeSvgOptions = {}
): BarcodeRenderData {
  const clean = (code || '').trim();
  const quietZone = options.quietZoneModules ?? 8;
  const useEan13 = (options.preferEan13 ?? true) && isValidEan13(clean);

  const bits = useEan13 ? encodeEan13Bits(clean) : encodeCode128Bits(clean || '000000');
  const format: 'EAN-13' | 'CODE-128' = useEan13 ? 'EAN-13' : 'CODE-128';

  const rects: Array<{ x: number; width: number; isGuard?: boolean }> = [];
  let i = 0;
  while (i < bits.length) {
    if (bits[i] === '1') {
      let start = i;
      while (i < bits.length && bits[i] === '1') {
        i++;
      }
      const isGuard =
        useEan13 &&
        (start < 3 || (start >= 45 && start < 50) || start >= 92);
      rects.push({
        x: quietZone + start,
        width: i - start,
        isGuard,
      });
    } else {
      i++;
    }
  }

  const formattedText = useEan13
    ? `${clean[0]} ${clean.slice(1, 7)} ${clean.slice(7, 13)}`
    : clean;

  return {
    rects,
    totalModules: bits.length + quietZone * 2,
    format,
    formattedText,
  };
}

/**
 * Plays a realistic POS barcode scanner sound effect using Web Audio API (no external audio file needed).
 */
export function playScanBeep(type: 'success' | 'error' = 'success'): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      // High-pitched crisp supermarket laser beep (2600Hz)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(2550, ctx.currentTime);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.11);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.11);
    } else {
      // Double low buzz for unknown barcode
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(280, ctx.currentTime);
      osc.frequency.setValueAtTime(220, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.26);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.26);
    }
  } catch {
    // Ignore audio context restrictions
  }
}

