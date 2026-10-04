import { createMiddleware } from 'hono/factory';
import { writeLog, type RequestLogLine } from '../lib/log';
import type { AppEnv, Runtime } from '../types';
import { onError } from './errors';

/**
 * Äußerste Middleware: Request-ID, Sicherheits-Header auf JEDER Antwort des Workers
 * (`_headers` greift für Worker-Antworten nicht) und genau eine JSON-Logzeile pro Request.
 */
export function requestContext(rt: Runtime) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const startedAt = rt.now();
    const requestId = crypto.randomUUID();
    c.set('requestId', requestId);

    try {
      await next();
    } catch (err) {
      // Hono fängt `Error`-Instanzen selbst ab; das hier sichert Nicht-Error-Würfe ab.
      c.res = await onError(err instanceof Error ? err : new Error(String(err)), c);
    }

    const isApi = c.req.path === '/api' || c.req.path.startsWith('/api/');
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('X-Frame-Options', 'DENY');
    // API-Antworten nie cachen. Weitergereichte Asset-Antworten behalten ihr eigenes Cache-Control
    // (Assets-Konfiguration/_headers), sonst würde die PWA-Auslieferung unnötig ausgebremst.
    if (isApi || !c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store');
    c.header('X-Request-Id', requestId);

    const member = c.get('member');
    const line: RequestLogLine = {
      ts: new Date(startedAt).toISOString(),
      requestId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Math.max(0, rt.now() - startedAt),
      ...(member ? { memberId: member.id } : {}),
      ...(c.get('errorCode') ? { errorCode: c.get('errorCode') } : {}),
      ...(c.get('authReason') ? { authReason: c.get('authReason') } : {}),
      ...(c.get('bootstrapped') ? { bootstrap: true as const } : {}),
      ...(c.get('errorInfo') ? { error: c.get('errorInfo') } : {}),
    };
    writeLog(line);
  });
}
