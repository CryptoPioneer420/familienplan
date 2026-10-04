import { nf0, nf1, shortName } from '@familienplan/engine';
import { useState, type ReactNode } from 'react';
import { Chip, Masthead, Segmented, Switch } from '../components/ui';
import { fetchMe, type MeResult } from '../lib/api';
import { engine, seed } from '../lib/engine';
import { SEVERITY_LABEL } from '../lib/labels';
import { isStandalone } from '../lib/platform';
import { store, useAppState } from '../lib/useApp';

interface Props {
  offlineReady: boolean;
  onCheckUpdate: () => Promise<void>;
}

function Section({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <section className="mt-8" aria-label={title}>
      <h2 className="sec-title !text-[18px]">{title}</h2>
      {hint ? <p className="mb-0 mt-1 text-[13px] text-muted">{hint}</p> : null}
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Row({ label, sub, children }: { label: string; sub?: string; children: ReactNode }) {
  return (
    <div className="hairline flex min-h-[56px] items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <div className="font-semibold">{label}</div>
        {sub ? <div className="text-[13px] text-muted">{sub}</div> : null}
      </div>
      {children}
    </div>
  );
}

const CONNECTION_TEXT: Record<Exclude<MeResult['kind'], 'ok'>, { tone: 'warn' | 'bad'; text: string }> = {
  'login-required': { tone: 'warn', text: 'Nicht angemeldet oder die Sitzung ist abgelaufen. Öffne die Adresse einmal in Safari, melde dich an und prüfe dann erneut.' },
  'not-a-member': { tone: 'bad', text: 'Die Anmeldung hat geklappt, aber diese E-Mail-Adresse gehört nicht zum Haushalt.' },
  'server-not-ready': { tone: 'warn', text: 'Der Server ist noch nicht für die Anmeldung eingerichtet (Zugangsdaten fehlen). Der Plan funktioniert trotzdem.' },
  offline: { tone: 'warn', text: 'Keine Verbindung zum Server. Plan und Einkaufsliste funktionieren offline weiter.' },
  error: { tone: 'bad', text: 'Der Server hat unerwartet geantwortet. Später erneut versuchen.' },
};

export function MoreView({ offlineReady, onCheckUpdate }: Props) {
  const app = useAppState();
  const p = app.plan;
  const cfg = engine.config;
  const [conn, setConn] = useState<MeResult | 'checking' | null>(null);
  const [updateMsg, setUpdateMsg] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [tdeeText, setTdeeText] = useState(p.tdee == null ? '' : String(p.tdee));
  const mg = engine.mgTotal(p);

  async function check() {
    setConn('checking');
    setConn(await fetchMe());
  }
  async function checkUpdate() {
    setUpdateMsg('Suche läuft. Gibt es eine neue Version, erscheint unten ein Hinweis.');
    await onCheckUpdate();
  }
  function commitTdee(text: string) {
    setTdeeText(text);
    const n = Number(text.replace(',', '.'));
    if (text.trim() === '') store.setPlan({ tdee: null });
    else if (Number.isFinite(n) && n >= 1000 && n <= 8000) store.setPlan({ tdee: Math.round(n) });
  }

  return (
    <>
      <Masthead title="Mehr" sub="Werte, Inventar und Verbindung" />
      <div className="px-4 pb-4">
        <Section title="Verbindung" hint="Prüft die Anmeldung beim Server. Für Plan und Einkaufsliste ist sie nicht nötig.">
          <button type="button" className="btn btn-quiet w-full" onClick={() => void check()} disabled={conn === 'checking'}>
            {conn === 'checking' ? 'Prüfe…' : 'Verbindung prüfen'}
          </button>
          <div role="status" aria-live="polite" className="mt-3">
            {conn && conn !== 'checking' ? (
              conn.kind === 'ok' ? (
                <p className="note note-ok m-0">
                  Angemeldet{conn.me.displayName ? ` als ${conn.me.displayName}` : ''}, Rolle: {conn.me.role === 'owner' ? 'Owner' : 'Mitglied'}.
                </p>
              ) : (
                <p className={`note m-0 ${CONNECTION_TEXT[conn.kind].tone === 'bad' ? 'note-bad' : 'note-warn'}`}>{CONNECTION_TEXT[conn.kind].text}</p>
              )
            ) : null}
          </div>
        </Section>

        <Section title="Meine Werte" hint="Bleiben auf diesem Gerät und werden nie an den Server gesendet.">
          <div className="hairline py-3">
            <div className="flex items-baseline justify-between">
              <label htmlFor="weight" className="font-semibold">Körpergewicht</label>
              <span className="tnum stretch-cond text-[26px] font-bold">{nf0.format(p.weightKg)} kg</span>
            </div>
            <input
              id="weight"
              type="range"
              className="mt-1 h-11 w-full accent-brand"
              min={cfg.weight.min}
              max={cfg.weight.max}
              step={1}
              value={p.weightKg}
              onChange={(e) => store.setPlan({ weightKg: Number(e.target.value) })}
            />
            <p className="m-0 text-[13px] text-muted">Protein-Ziel {nf0.format(p.weightKg * cfg.proteinPerKg)} g am Tag ({nf1.format(cfg.proteinPerKg)} g/kg).</p>
          </div>
          <Row label="Krafttraining diese Woche" sub="Aus: Trainingstage werden zu Ruhetagen">
            <Switch label="Krafttraining diese Woche" checked={p.training} onChange={(v) => store.setPlan({ training: v })} />
          </Row>
          <Row label="Spätsnack" sub="20:45 Uhr">
            <Switch label="Spätsnack" checked={p.snack} onChange={(v) => store.setPlan({ snack: v })} />
          </Row>
          <Row label="Samstag in der Taverne" sub="Dinner wird nicht eingekauft">
            <Switch label="Samstag in der Taverne" checked={p.taverna} onChange={(v) => store.setPlan({ taverna: v })} />
          </Row>
          {p.taverna ? (
            <div className="hairline py-3">
              <div className="mb-2 font-semibold">Hauptgang in der Taverne (für alle)</div>
              <Segmented
                label="Hauptgang"
                value={p.tavernaMain}
                onChange={(v) => store.setPlan({ tavernaMain: v })}
                options={[
                  { value: 'lavraki', label: 'Lavraki' },
                  { value: 'lamm', label: 'Lamm' },
                ]}
              />
            </div>
          ) : null}
          <div className="hairline py-3">
            <div className="mb-2 font-semibold">Portionen Vater</div>
            <Segmented
              label="Portionsmodus"
              value={p.factorMode}
              onChange={(v) => store.setPlan({ factorMode: v })}
              options={[
                { value: 'auto', label: 'Täglich exakt' },
                { value: 'fixed', label: 'Fix für die Woche' },
              ]}
            />
          </div>
          <div className="hairline py-3">
            <div className="mb-2 font-semibold">Magnesium je Slot (elementar)</div>
            <Segmented
              label="Magnesium je Slot"
              value={String(p.mgPerSlot) as '125' | '150'}
              onChange={(v) => store.setPlan({ mgPerSlot: Number(v) })}
              options={[
                { value: '125', label: '125 mg' },
                { value: '150', label: '150 mg' },
              ]}
            />
            <p className={`mb-0 mt-2 text-[13px] ${mg > cfg.mgEfsaMg ? 'text-copper' : 'text-muted'}`}>
              Gesamt {nf0.format(mg)} mg am Tag. EFSA-Orientierung für Supplemente: {cfg.mgEfsaMg} mg.
            </p>
          </div>
          <div className="hairline py-3">
            <label htmlFor="tdee" className="mb-2 block font-semibold">Erhaltungsbedarf in kcal (optional)</label>
            <input
              id="tdee"
              className="field tnum"
              inputMode="numeric"
              autoComplete="off"
              placeholder="z. B. 3200"
              value={tdeeText}
              onChange={(e) => commitTdee(e.target.value)}
            />
            <p className="mb-0 mt-1 text-[13px] text-muted">Mit Wert zeigt der Plan-Check die Energiebilanz (1000–8000).</p>
          </div>
        </Section>

        <Section title="Inventar Paphos" hint="Nicht verfügbare Zutaten werden im Plan automatisch ersetzt (gleiches Protein bzw. gleiche Menge).">
          {cfg.inventory.map((g) => (
            <div key={g.group} className="mt-3">
              <h3 className="m-0 text-[15px] font-bold text-muted">{g.group}</h3>
              {g.ids.map((id) => (
                <Row key={id} label={shortName(engine.ingredient(id).nameDe)} sub={p.unavailable[id] ? 'nicht verfügbar' : undefined}>
                  <Switch label={`${shortName(engine.ingredient(id).nameDe)} verfügbar`} checked={!p.unavailable[id]} onChange={() => store.toggleUnavailable(id)} />
                </Row>
              ))}
            </div>
          ))}
        </Section>

        <Section title="Sicherheit und offene Fragen">
          <details className="hairline">
            <summary className="flex min-h-[56px] cursor-pointer items-center justify-between gap-3">
              <span className="font-semibold">Sicherheitsregeln ({seed.safetyRules.length})</span>
              <span className="chev" aria-hidden="true" />
            </summary>
            <ul className="m-0 mb-3 grid list-none gap-2 p-0">
              {seed.safetyRules.map((r) => (
                <li key={r.id} className={`note ${r.severity === 'critical' ? 'note-bad' : r.severity === 'caution' ? 'note-warn' : ''}`}>
                  <b>{SEVERITY_LABEL[r.severity]}: </b>
                  {r.text} <span className="text-[12px] text-muted">[{r.confidence}]</span>
                </li>
              ))}
            </ul>
          </details>
          <details className="hairline">
            <summary className="flex min-h-[56px] cursor-pointer items-center justify-between gap-3">
              <span className="font-semibold">Offene Entscheidungen ({seed.openDecisions.filter((d) => d.status === 'open').length})</span>
              <span className="chev" aria-hidden="true" />
            </summary>
            <ul className="m-0 mb-3 grid list-none gap-3 p-0">
              {seed.openDecisions.map((d) => (
                <li key={d.id} className="text-[15px]">
                  <Chip tone={d.status === 'open' ? 'warn' : 'ok'}>{d.status === 'open' ? 'offen' : 'entschieden'}</Chip> <b>{d.question}</b>
                  <span className="block text-[13px] text-muted">Aktuell: {d.seedDefault}</span>
                </li>
              ))}
            </ul>
          </details>
        </Section>

        <Section title="App">
          <Row label="Version" sub={`Inhalte: Schema ${seed.schemaVersion}`}>
            <span className="tnum font-semibold">{__APP_VERSION__}</span>
          </Row>
          <Row label="Als App installiert" sub={isStandalone() ? undefined : 'Safari: Teilen-Symbol, „Zum Home-Bildschirm“'}>
            <Chip tone={isStandalone() ? 'ok' : 'warn'}>{isStandalone() ? 'ja' : 'nein'}</Chip>
          </Row>
          <Row label="Offline verfügbar" sub={offlineReady ? undefined : 'Wird beim ersten Start mit Verbindung vorbereitet'}>
            <Chip tone={offlineReady || 'serviceWorker' in navigator ? 'ok' : 'warn'}>{offlineReady ? 'bereit' : 'serviceWorker' in navigator ? 'aktiv' : 'nicht unterstützt'}</Chip>
          </Row>
          <Row label="Einstellungen speichern" sub={store.isPersistent() ? undefined : 'Der Speicher dieses Browsers ist blockiert; Werte gehen beim Schließen verloren.'}>
            <Chip tone={store.isPersistent() ? 'ok' : 'bad'}>{store.isPersistent() ? 'ok' : 'nicht möglich'}</Chip>
          </Row>
          <Row label="Nährwertdaten" sub="Richtwerte aus Allgemeinwissen, noch nicht gegen BLS/USDA geprüft">
            <Chip tone={seed.meta.nutritionDataStatus === 'approximate_unverified' ? 'warn' : 'ok'}>{seed.meta.nutritionDataStatus === 'approximate_unverified' ? 'ungeprüft' : 'geprüft'}</Chip>
          </Row>
          <div className="hairline grid gap-3 pt-4">
            <button type="button" className="btn btn-quiet" onClick={() => void checkUpdate()}>Nach Update suchen</button>
            <p className="m-0 text-[13px]" role="status" aria-live="polite">{updateMsg}</p>
            {confirmReset ? (
              <div className="note note-bad grid gap-3">
                <span>Gewicht, Haken, Verfügbarkeit und Tracker auf diesem Gerät werden gelöscht.</span>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" className="btn btn-quiet" onClick={() => setConfirmReset(false)}>Abbrechen</button>
                  <button
                    type="button"
                    className="btn !bg-danger"
                    onClick={() => {
                      store.resetAll();
                      setTdeeText('');
                      setConfirmReset(false);
                    }}
                  >
                    Zurücksetzen
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn btn-danger" onClick={() => setConfirmReset(true)}>Lokale Einstellungen zurücksetzen</button>
            )}
          </div>
        </Section>
      </div>
    </>
  );
}

