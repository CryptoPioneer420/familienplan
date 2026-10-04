import { useCallback, useEffect, useState } from 'react';
import { Chip } from '../components/ui';
import { api, type ApiResult } from '../lib/shared';

interface MemberRow {
  id: string;
  email: string;
  role: 'owner' | 'member';
  displayName: string | null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function errorText(r: Exclude<ApiResult<unknown>, { kind: 'ok' }>): string {
  switch (r.kind) {
    case 'login-required':
      return 'Anmeldung abgelaufen. Neu anmelden und erneut versuchen.';
    case 'forbidden':
      return 'Nur der Owner darf Mitglieder hinzufügen.';
    case 'offline':
      return 'Keine Verbindung zum Server.';
    case 'not-found':
      return 'Nicht gefunden.';
    case 'error':
      return r.status === 409 ? 'Diese E-Mail-Adresse kann nicht hinzugefügt werden (schon vorhanden).' : r.status === 400 ? 'Eingabe ungültig. Prüfe die E-Mail-Adresse.' : `Serverfehler${r.status ? ` (${r.status})` : ''}.`;
  }
}

/** Nur für den Owner. Der Haushalt kommt serverseitig aus der Anmeldung, nie aus diesem Formular. */
export function FamilySection() {
  const [members, setMembers] = useState<MemberRow[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await api<{ members: MemberRow[] }>('/api/members');
    if (r.kind === 'ok') {
      setMembers(r.data.members);
      setLoadError('');
    } else setLoadError(errorText(r));
  }, []);
  useEffect(() => void load(), [load]);

  async function add() {
    const cleaned = email.trim().toLowerCase();
    if (!EMAIL.test(cleaned)) return void setMsg({ ok: false, text: 'Das ist keine gültige E-Mail-Adresse.' });
    setBusy(true);
    setMsg(null);
    try {
      const body: { email: string; displayName?: string } = { email: cleaned };
      if (name.trim()) body.displayName = name.trim();
      const r = await api<{ member: MemberRow }>('/api/members', { method: 'POST', body });
      if (r.kind === 'ok') {
        setMsg({ ok: true, text: `${cleaned} ist jetzt Mitglied. Die Adresse muss außerdem in der Cloudflare-Access-Richtlinie stehen, sonst kommt sie nicht an der Anmeldung vorbei.` });
        setEmail('');
        setName('');
        await load();
      } else setMsg({ ok: false, text: errorText(r) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {loadError ? <p className="note note-warn m-0">{loadError}</p> : null}
      {members ? (
        <ul className="m-0 list-none p-0">
          {members.map((m) => (
            <li key={m.id} className="hairline flex min-h-[56px] items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{m.displayName ?? m.email}</span>
                {m.displayName ? <span className="block truncate text-[13px] text-muted">{m.email}</span> : null}
              </span>
              <Chip tone={m.role === 'owner' ? 'brand' : 'mute'}>{m.role === 'owner' ? 'Owner' : 'Mitglied'}</Chip>
            </li>
          ))}
        </ul>
      ) : loadError ? null : (
        <p className="m-0 text-[13px] text-muted">Lade Mitglieder…</p>
      )}

      <form
        className="mt-4 grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <div>
          <label htmlFor="member-email" className="mb-1 block font-semibold">E-Mail-Adresse</label>
          <input id="member-email" className="field" type="email" inputMode="email" autoComplete="off" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label htmlFor="member-name" className="mb-1 block font-semibold">Anzeigename (optional)</label>
          <input id="member-name" className="field" autoComplete="off" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button type="submit" className="btn" disabled={busy || !email.trim()}>
          {busy ? 'Füge hinzu…' : 'Mitglied hinzufügen'}
        </button>
        <p className={`m-0 text-[13px] ${msg ? (msg.ok ? 'text-brand' : 'text-danger') : 'text-muted'}`} role="status" aria-live="polite">
          {msg?.text ?? 'Mitglieder können die geteilte Liste sehen und abhaken, aber nichts hinzufügen.'}
        </p>
      </form>
    </div>
  );
}
