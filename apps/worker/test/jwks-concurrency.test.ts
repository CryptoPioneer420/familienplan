import { SELF } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TEST_TEAM_DOMAIN, createTestKey, signAccessJwt } from './helpers/jwt';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Remote-JWKS über den echten Worker-Einstieg (SELF, getrennte Requests)', () => {
  it('parallele Kaltstart-Requests liefern alle 200; danach kommt der Schlüsselsatz aus dem Cache', async () => {
    const key = await createTestKey();
    const certsUrl = `https://${TEST_TEAM_DOMAIN}/cdn-cgi/access/certs`;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url !== certsUrl) return new Response('unexpected', { status: 500 });
      await new Promise((resolve) => setTimeout(resolve, 25)); // Fenster für Überlappung
      return Response.json({ keys: [key.publicJwk] });
    });

    const token = await signAccessJwt({ key, email: 'owner@example.com' });
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => SELF.fetch('http://localhost/api/me', { headers: { 'Cf-Access-Jwt-Assertion': token } })),
    );

    expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);

    // jose verwirft in Workers bewusst ein laufendes Abruf-Promise anderer Requests (Schutz vor
    // "Cannot perform I/O on behalf of a different request"); beim Kaltstart kann es daher bis zu
    // einen Abruf pro parallelem Request geben, aber nie mehr.
    const afterParallel = fetchSpy.mock.calls.filter(([input]) => String(input) === certsUrl).length;
    expect(afterParallel).toBeGreaterThanOrEqual(1);
    expect(afterParallel).toBeLessThanOrEqual(5);

    // Warmer Isolate: weitere Requests lösen keinen erneuten Abruf aus (Cache, 10 min).
    for (let i = 0; i < 3; i++) {
      const again = await SELF.fetch('http://localhost/api/me', { headers: { 'Cf-Access-Jwt-Assertion': token } });
      expect(again.status).toBe(200);
    }
    expect(fetchSpy.mock.calls.filter(([input]) => String(input) === certsUrl)).toHaveLength(afterParallel);
  });
});
