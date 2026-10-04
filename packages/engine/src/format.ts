/** Deutsche Zahlenformate (wie v2). Intl mit de-DE benötigt Full-ICU (Node ≥ 13, alle aktuellen Browser). */
export const nf0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
export const nf1 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const nf2 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const nfR = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });

export const rngTxt = (r: { min: number; max: number }): string => `${nfR.format(r.min)}–${nfR.format(r.max)}`;
export const g0 = (g: number): string => `${nf0.format(Math.round(g))} g`;
export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
export const mean = (a: readonly number[]): number => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
export const toMin = (t: string): number => {
  const [h = 0, m = 0] = t.split(':').map(Number);
  return h * 60 + m;
};
/** „Anari, frisch, ungesalzen" → „Anari"; „Kolokasi (Taro)" → „Kolokasi" */
export const shortName = (n: string): string => String(n).split(',')[0]!.split('(')[0]!.trim();
