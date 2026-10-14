/** Formatting shared by the HUD designs. Pure; unit-tested. */

/** 0..1 → "72%" (floored, so 99.6 % never reads "100%" before it is). */
function percent(fraction: number): string {
  return `${Math.floor(Math.max(0, Math.min(1, fraction)) * 100)}%`;
}

/** 1..3999 → "XIV"; 0 → "N" (nulla); anything else → the Arabic digits. */
function roman(value: number): string {
  if (value === 0) return 'N';
  if (!Number.isInteger(value) || value < 0 || value > 3999) return String(value);
  const table: [number, string][] = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let rest = value;
  let out = '';
  for (const [size, letters] of table) {
    while (rest >= size) {
      out += letters;
      rest -= size;
    }
  }
  return out;
}

/** A letter grade for a chapter's progress: – (untouched), C, B, A, S (complete). */
function grade(fraction: number): '–' | 'C' | 'B' | 'A' | 'S' {
  if (fraction >= 1) return 'S';
  if (fraction >= 0.7) return 'A';
  if (fraction >= 0.4) return 'B';
  if (fraction > 0) return 'C';
  return '–';
}

/** A gacha-style rarity tier for a chapter's progress. */
function rarity(fraction: number): 'N' | 'R' | 'SR' | 'SSR' {
  if (fraction >= 1) return 'SSR';
  if (fraction >= 0.5) return 'SR';
  if (fraction > 0) return 'R';
  return 'N';
}

/** Two-digit chapter numbers ("07"), wider numbers as they are. */
function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export { grade, pad2, percent, rarity, roman };
