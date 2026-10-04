const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

/** UUIDv7 (RFC 9562): 48 Bit Unix-ms + Zufall. Als TEXT-ID in D1, zeitlich grob sortierbar. */
export function uuidv7(nowMs: number = Date.now()): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 6; i++) {
    bytes[i] = Math.floor(nowMs / 2 ** (8 * (5 - i))) % 256;
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70; // Version 7
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // Variante 10xx
  const h = (i: number): string => HEX[bytes[i] ?? 0] ?? '00';
  return (
    h(0) + h(1) + h(2) + h(3) + '-' + h(4) + h(5) + '-' + h(6) + h(7) + '-' + h(8) + h(9) + '-' +
    h(10) + h(11) + h(12) + h(13) + h(14) + h(15)
  );
}
