import type { Context } from 'hono';
import type { z } from 'zod';
import { HttpError, type FieldIssue } from './errors';

const JSON_CONTENT_TYPE = /^application\/json\s*(;.*)?$/i;

function toFieldIssues(error: z.ZodError): FieldIssue[] {
  return error.issues.flatMap((issue): FieldIssue[] => {
    const path = issue.path.map(String);
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => ({ path: [...path, key].join('.'), message: 'Unknown field.' }));
    }
    return [{ path: path.join('.') || '(body)', message: issue.message }];
  });
}

/**
 * Liest und validiert einen JSON-Body. Verlangt `Content-Type: application/json`: Das ist der
 * CSRF-Schutz für Cookie-basierte Sitzungen (ein fremdes HTML-Formular kann diesen Typ ohne
 * CORS-Preflight nicht senden, und CORS ist nicht aktiviert).
 */
export async function parseJsonBody<S extends z.ZodType>(c: Context, schema: S): Promise<z.output<S>> {
  if (!JSON_CONTENT_TYPE.test(c.req.header('content-type') ?? '')) {
    throw new HttpError(415, 'unsupported_media_type', 'Content-Type must be application/json.');
  }
  let json: unknown;
  try {
    json = await c.req.json();
  } catch {
    throw new HttpError(400, 'invalid_request', 'Request body must be valid JSON.');
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new HttpError(400, 'invalid_request', 'Request validation failed.', toFieldIssues(parsed.error));
  }
  return parsed.data;
}
