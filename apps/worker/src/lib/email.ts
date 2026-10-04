const MAX_EMAIL_LENGTH = 254;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+$/;

/** Trimmt, kleinschreibt und prüft die grobe Form. `null` bei ungültigem Wert. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  if (value.length === 0 || value.length > MAX_EMAIL_LENGTH) return null;
  return EMAIL_SHAPE.test(value) ? value : null;
}
