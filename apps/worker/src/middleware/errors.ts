import type { Context, ErrorHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { AuthConfigError, AuthUnavailableError } from '../auth';
import { HttpError, type FieldIssue } from '../lib/errors';
import { describeError } from '../lib/log';
import type { AppEnv } from '../types';

/** Einheitliches Fehlerformat: `{ error: { code, message, fields? } }`. */
export function errorResponse(
  c: Context<AppEnv>,
  status: ContentfulStatusCode,
  code: string,
  message: string,
  fields?: FieldIssue[],
): Response {
  c.set('errorCode', code);
  return c.json({ error: { code, message, ...(fields ? { fields } : {}) } }, status);
}

export const onError: ErrorHandler<AppEnv> = (err, c) => {
  if (err instanceof HttpError) {
    return errorResponse(c, err.status, err.code, err.message, err.fields);
  }
  if (err instanceof AuthConfigError) {
    // Fail-closed: lieber 503 mit klarer Meldung als ein offener Zugang.
    return errorResponse(c, 503, 'auth_not_configured', err.message);
  }
  if (err instanceof AuthUnavailableError) {
    c.set('errorInfo', describeError(err));
    return errorResponse(c, 503, 'auth_unavailable', 'Authentication is temporarily unavailable. Try again shortly.');
  }
  if (err instanceof HTTPException) {
    return errorResponse(c, err.status as ContentfulStatusCode, 'http_error', 'Request could not be processed.');
  }
  // Unerwartet: Details nur ins Log, nie in die Antwort.
  c.set('errorInfo', describeError(err));
  return errorResponse(c, 500, 'internal_error', 'Internal server error.');
};

export const notFound: NotFoundHandler<AppEnv> = (c) =>
  errorResponse(c, 404, 'not_found', 'Resource not found.');
