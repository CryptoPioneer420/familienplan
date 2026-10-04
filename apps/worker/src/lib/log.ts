export interface RequestLogLine {
  ts: string;
  requestId: string;
  method: string;
  path: string;
  status: number;
  ms: number;
  memberId?: string;
  /** Stabiler Fehlercode der Antwort (z. B. "forbidden"), falls es ein Fehler war. */
  errorCode?: string;
  /** Kurzer Ablehnungsgrund der Authentifizierung (z. B. "ERR_JWT_EXPIRED:exp"), nie Token/Claims. */
  authReason?: string;
  /** true, wenn dieser Request den Owner-Bootstrap durchgeführt hat. */
  bootstrap?: true;
  /** Nur bei unerwarteten Fehlern (500). */
  error?: { name: string; message: string; stack?: string };
}

const EMAIL_PATTERN = /[^\s@"'<>(),;]+@[^\s@"'<>(),;]+/g;
const JWT_PATTERN = /eyJ[\w-]+\.[\w-]+\.[\w-]*/g;

/** Defense in depth: Fehlertexte dürfen weder E-Mail-Adressen noch Tokens ins Log tragen. */
export function redact(text: string): string {
  return text.replace(JWT_PATTERN, '[token]').replace(EMAIL_PATTERN, '[email]');
}

export function describeError(err: unknown): NonNullable<RequestLogLine['error']> {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: redact(err.message).slice(0, 500),
      ...(err.stack ? { stack: redact(err.stack).slice(0, 2000) } : {}),
    };
  }
  return { name: 'NonError', message: redact(String(err)).slice(0, 500) };
}

export function writeLog(line: RequestLogLine): void {
  console.log(JSON.stringify(line));
}
