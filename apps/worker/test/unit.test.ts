import { describe, expect, it } from 'vitest';
import { normalizeTeamDomain } from '../src/auth/access-jwt';
import { normalizeEmail } from '../src/lib/email';
import { uuidv7 } from '../src/lib/id';
import { redact } from '../src/lib/log';

describe('uuidv7', () => {
  it('hat Version 7, Variante 10xx und kodiert die Zeit in den ersten 48 Bit', () => {
    const now = 1_760_000_000_123;
    const id = uuidv7(now);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(id.replace(/-/g, '').slice(0, 12)).toBe(now.toString(16).padStart(12, '0'));
  });

  it('ist eindeutig und nach Zeit sortierbar', () => {
    const ids = new Set(Array.from({ length: 500 }, () => uuidv7(1_760_000_000_000)));
    expect(ids.size).toBe(500);
    expect(uuidv7(1_760_000_000_000) < uuidv7(1_760_000_001_000)).toBe(true);
  });
});

describe('normalizeEmail', () => {
  it.each([
    ['  Foo@Example.COM ', 'foo@example.com'],
    ['a@b.c', 'a@b.c'],
  ])('%j => %j', (input, expected) => expect(normalizeEmail(input)).toBe(expected));

  it.each(['', '   ', 'no-at-sign', 'two@@example.com', 'sp ace@example.com', 'a@b c', `${'x'.repeat(250)}@example.com`, 42, null, undefined])(
    'lehnt %j ab',
    (input) => expect(normalizeEmail(input)).toBeNull(),
  );
});

describe('normalizeTeamDomain', () => {
  it.each([
    ['team.cloudflareaccess.com', 'team.cloudflareaccess.com'],
    ['  Team.CloudflareAccess.com ', 'team.cloudflareaccess.com'],
    ['https://team.cloudflareaccess.com/', 'team.cloudflareaccess.com'],
  ])('%j => %j', (input, expected) => expect(normalizeTeamDomain(input)).toBe(expected));

  it.each(['', '   ', undefined, 'localhost', 'http://team.cloudflareaccess.com', 'team.cloudflareaccess.com/path', 'team.cloudflareaccess.com:8443', 'a b.example.com', 'evil.com?x=y'])(
    'lehnt %j ab',
    (input) => expect(normalizeTeamDomain(input)).toBeNull(),
  );
});

describe('redact', () => {
  it('schwärzt E-Mail-Adressen und JWT-artige Tokens', () => {
    const out = redact('user a.b+c@example.com sent eyJhbGciOiJSUzI1NiJ9.eyJlbWFpbCI6IngifQ.c2lnbmF0dXJl');
    expect(out).toBe('user [email] sent [token]');
  });
});
