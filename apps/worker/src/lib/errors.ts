import type { ContentfulStatusCode } from 'hono/utils/http-status';

export interface FieldIssue {
  path: string;
  message: string;
}

/** Erwarteter Fehler mit stabilem Code; wird zu `{ error: { code, message, fields? } }`. */
export class HttpError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
    readonly fields?: FieldIssue[],
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const unauthenticated = (): HttpError =>
  new HttpError(401, 'unauthenticated', 'Authentication required.');

/** Bewusst identisch für "unbekannter Nutzer" und "kein Zugriff": keine Existenz-Informationen. */
export const forbidden = (message = 'Access denied.'): HttpError => new HttpError(403, 'forbidden', message);
