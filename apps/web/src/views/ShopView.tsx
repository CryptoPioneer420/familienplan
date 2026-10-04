import { buyHint, buyText, nf0, shortName } from '@familienplan/engine';
import { useState, type ReactNode } from 'react';
import { DayChips } from '../components/DayChips';
import { Chip, Icons, Masthead, Segmented } from '../components/ui';
import { AISLE_LABEL, AISLE_ORDER, qtyText, shopItemDays, shoppingText, toPublishItems, weekListId } from '../lib/domain';
import { engine } from '../lib/engine';
import { useMe } from '../lib/me';
import { shareText } from '../lib/platform';
import { effectiveChecked, publishList, uncheckAllRemote, type ApiResult, type SharedItem } from '../lib/shared';
import { store, useAppState, useComputed } from '../lib/useApp';
import { useSharedList, type ListStatus } from '../lib/useSharedList';

const MAX_PUBLISH_ITEMS = 150;
type SharedState = ReturnType<typeof useSharedList>;

const timeText = (ms: number): string => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const dateTimeText = (ms: number): string =>
  new Date(ms).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function failureText(r: Exclude<ApiResult<unknown>, { kind: 'ok' }>): string {
  switch (r.kind) {
    case 'login-required':
      return 'Die Anmeldung ist abgelaufen. Öffne die Adresse in Safari oder Chrome, melde dich an und versuche es erneut.';
    case 'forbidden':
      return 'Dafür fehlt die Berechtigung. Nur der Owner darf die Liste veröffentlichen.';
    case 'offline':
      return 'Keine Verbindung zum Server. Versuche es mit Netz erneut.';
    case 'not-found':
      return 'Die Liste wurde nicht gefunden. Veröffentliche sie neu.';
    case 'error':
      return `Der Server hat nicht wie erwartet geantwortet${r.status ? ` (${r.status})` : ''}. Später erneut versuchen.`;
  }
}

/** Einstieg: ohne Mitgliedschaft die lokale Liste, als Mitglied die gemeinsame, als Owner beides. */
export function ShopView() {
  const { known } = useMe();
  const sl = useSharedList(known !== null);
  const [mode, setMode] = useState<'shared' | 'plan'>('shared');

  if (!known) return <LocalShop />;
  if (known.role === 'member') return <SharedShop sl={sl} />;

  const switcher = (
    <Segmented
      label="Liste wählen"
      value={mode}
      onChange={setMode}
      options={[
        { value: 'shared', label: 'Geteilte Liste' },
        { value: 'plan', label: 'Plan (Vorschau)' },
      ]}
    />
  );
  return mode === 'shared' ? (
    <SharedShop sl={sl} owner switcher={switcher} onPlan={() => setMode('plan')} />
  ) : (
    <LocalShop
      switcher={switcher}
      onPublished={() => {
        setMode('shared');
        void sl.refresh();
      }}
      canPublish
    />
  );
}

/* ---------- Gemeinsame Liste ---------- */

function statusLine(status: ListStatus, queued: number, syncedAt: number | null): { tone: 'quiet' | 'warn' | 'bad'; text: string } {
  const q = queued ? ` ${nf0.format(queued)} Haken warten auf Verbindung.` : '';
  switch (status) {
    case 'loading':
      return { tone: 'quiet', text: 'Liste wird geladen…' };
    case 'ready':
      return { tone: 'quiet', text: `${syncedAt ? `Stand ${timeText(syncedAt)}. ` : ''}Aktualisiert sich selbst.${q}` };
    case 'offline':
      return { tone: 'warn', text: `Keine Verbindung. Du siehst den letzten Stand, Haken werden nachgereicht.${q}` };
    case 'login-required':
      return { tone: 'warn', text: `Die Anmeldung ist abgelaufen. Du siehst den letzten Stand; zum Aktualisieren neu anmelden.${q}` };
    case 'error':
      return { tone: 'bad', text: `Der Server antwortet gerade nicht richtig. Letzter Stand bleibt sichtbar.${q}` };
  }
}

function SharedShop({ sl, owner = false, switcher, onPlan }: { sl: SharedState; owner?: boolean; switcher?: ReactNode; onPlan?: () => void }) {
  const { list, status, pending, syncedAt, setChecked, refresh } = sl;
  const [actionMsg, setActionMsg] = useState('');
  const items = list?.items ?? [];
  const checkedOf = (it: SharedItem): boolean => (list ? effectiveChecked(list, it, pending) : false);
  const done = items.filter(checkedOf).length;
  const line = statusLine(status, Object.keys(pending).length, syncedAt);

  async function resetChecks() {
    if (!list) return;
    const r = await uncheckAllRemote(list.id);
    setActionMsg(r.kind === 'ok' ? '' : failureText(r));
    await refresh();
  }

  const groups = AISLE_ORDER.map((aisle) => ({ aisle, rows: items.filter((i) => i.aisle === aisle) })).filter((g) => g.rows.length);

  return (
    <>
      <Masthead title="Einkauf" sub={list ? `${done} von ${items.length} erledigt · veröffentlicht ${dateTimeText(list.updatedAt)}` : 'Gemeinsame Liste'} />
      <div className="px-4 pt-4">
        {switcher ? <div className="mb-4">{switcher}</div> : null}
        <p className={`m-0 text-[13px] ${line.tone === 'quiet' ? 'text-muted' : line.tone === 'warn' ? 'text-copper' : 'text-danger'}`} role="status" aria-live="polite">
          {line.text}
        </p>

        {!list ? (
          <div className="note mt-4">
            {owner ? (
              <>
                Noch keine Liste veröffentlicht. Wähle oben „Plan (Vorschau)“ und veröffentliche sie, dann sieht deine Frau sie hier.
                {onPlan ? (
                  <button type="button" className="btn btn-quiet mt-3 w-full" onClick={onPlan}>
                    Zum Plan
                  </button>
                ) : null}
              </>
            ) : (
              'Noch keine Liste da. Sobald sie veröffentlicht wird, erscheint sie hier von selbst.'
            )}
          </div>
        ) : null}

        {groups.map(({ aisle, rows }) => (
          <section key={aisle} className="mt-6" aria-labelledby={`aisle-${aisle}`}>
            <h2 id={`aisle-${aisle}`} className="sec-title !text-[18px]">
              {AISLE_LABEL[aisle]} <span className="text-[14px] font-normal text-muted">{rows.length}</span>
            </h2>
            <ul className="m-0 mt-1 list-none p-0">
              {rows.map((it) => {
                const checked = checkedOf(it);
                const qty = qtyText(it.qty, it.unit);
                const by = checked && it.checked && it.checkedByName ? `abgehakt von ${it.checkedByName}` : '';
                return (
                  <li key={it.id} className="hairline">
                    <label className="flex min-h-[60px] cursor-pointer items-start gap-3 py-2.5">
                      <input type="checkbox" className="check mt-0.5" checked={checked} onChange={() => setChecked(it.id, !checked)} />
                      <span className="min-w-0 flex-1">
                        <span className={`font-semibold ${checked ? 'text-muted line-through' : ''}`}>{it.label}</span>
                        {by ? <span className="block text-[13px] text-muted">{by}</span> : null}
                      </span>
                      <span className={`tnum shrink-0 text-right font-bold ${checked ? 'text-muted' : ''}`}>
                        {qty}
                        {it.note ? <span className="block text-[13px] font-normal text-muted">{it.note}</span> : null}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        {owner && list ? (
          <div className="mt-8 grid gap-3">
            <button type="button" className="btn btn-quiet" disabled={done === 0} onClick={() => void resetChecks()}>
              Haken für alle zurücksetzen
            </button>
            {actionMsg ? <p className="note note-warn m-0">{actionMsg}</p> : null}
          </div>
        ) : null}
        {list && !owner ? <p className="mb-0 mt-8 text-[13px] text-muted">Hier hakst du nur ab. Die Liste kommt aus dem Wochenplan.</p> : null}
      </div>
    </>
  );
}

/* ---------- Lokale Liste aus dem Plan (ohne Anmeldung oder als Vorschau für den Owner) ---------- */

function LocalShop({ switcher, canPublish = false, onPublished }: { switcher?: ReactNode; canPublish?: boolean; onPublished?: () => void }) {
  const { shop, planState } = useComputed();
  const { shopChecked } = useAppState();
  const [status, setStatus] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState('');
  const total = shop.items.length;
  const done = shop.items.filter((i) => shopChecked[i.id]).length;
  const cfg = engine.config;
  const anyDay = cfg.days.some((d) => planState.activeDays[d]);
  const tavernaOn = planState.taverna && planState.activeDays[cfg.tavernaDay];

  async function share() {
    const result = await shareText('Einkauf Familienplan', shoppingText(engine, shop, shopChecked, true));
    setStatus(result === 'copied' ? 'Liste in die Zwischenablage kopiert.' : result === 'shared' ? '' : 'Teilen war nicht möglich.');
  }

  async function publish() {
    if (total > MAX_PUBLISH_ITEMS) return void setPublishMsg(`Die Liste hat ${total} Artikel, erlaubt sind ${MAX_PUBLISH_ITEMS}.`);
    setPublishing(true);
    setPublishMsg('');
    try {
      const r = await publishList(weekListId(new Date()), toPublishItems(engine, shop));
      if (r.kind === 'ok') onPublished?.();
      else setPublishMsg(failureText(r));
    } finally {
      setPublishing(false);
    }
  }

  return (
    <>
      <Masthead
        title="Einkauf"
        sub={total ? `${done} von ${total} erledigt` : 'Keine Artikel'}
        action={
          <button type="button" className="btn btn-night mt-1 shrink-0" onClick={() => void share()} disabled={!total}>
            {Icons.share}
            <span>Teilen</span>
          </button>
        }
      />

      <div className="px-4 pt-4">
        {switcher ? <div className="mb-4">{switcher}</div> : null}
        <p className="mb-2 mt-0 text-[14px] text-muted">Tage in der Liste</p>
        <DayChips variant="light" label="Tage in der Einkaufsliste" isOn={(d) => Boolean(planState.activeDays[d])} onToggle={(d) => store.toggleActiveDay(d)} />
        <p className="mb-0 mt-2 text-[13px] text-muted" role="status" aria-live="polite">
          {status || 'Familie gesamt (Vater, Mutter, Kind), Rohgewichte, aufgerundet.'}
        </p>
        {tavernaOn ? <p className="note mt-3">Samstag Taverne ist aktiv: das Samstags-Dinner wird nicht eingekauft.</p> : null}
        {!anyDay ? <p className="note note-warn mt-3">Kein Tag ausgewählt. Tippe oben mindestens einen Tag an.</p> : null}

        {canPublish ? (
          <div className="mt-4 grid gap-2">
            <button type="button" className="btn" disabled={!total || publishing} onClick={() => void publish()}>
              {publishing ? 'Veröffentliche…' : 'Für die Familie veröffentlichen'}
            </button>
            <p className="m-0 text-[13px] text-muted">Ersetzt die geteilte Liste dieser Woche. Bereits gesetzte Haken bleiben bei gleichen Artikeln erhalten.</p>
            {publishMsg ? <p className="note note-warn m-0" role="alert">{publishMsg}</p> : null}
          </div>
        ) : null}

        {shop.cats.map(({ cat, items }) =>
          items.length ? (
            <section key={cat.id} className="mt-6" aria-labelledby={`cat-${cat.id}`}>
              <h2 id={`cat-${cat.id}`} className="sec-title !text-[18px]">
                {cat.label} <span className="text-[14px] font-normal text-muted">{items.length}</span>
              </h2>
              <ul className="m-0 mt-1 list-none p-0">
                {items.map((it) => {
                  const checked = Boolean(shopChecked[it.id]);
                  const hint = buyHint(it);
                  return (
                    <li key={it.id} className="hairline">
                      <label className="flex min-h-[60px] cursor-pointer items-start gap-3 py-2.5">
                        <input type="checkbox" className="check mt-0.5" checked={checked} onChange={() => store.toggleShop(it.id)} />
                        <span className="min-w-0 flex-1">
                          <span className={`font-semibold ${checked ? 'text-muted line-through' : ''}`}>{shortName(engine.ingredient(it.id).nameDe)}</span>
                          {it.missing ? <> <Chip tone="bad">nicht im Inventar</Chip></> : null}
                          <span className="tnum block text-[13px] text-muted">{shopItemDays(engine, it)}</span>
                        </span>
                        <span className={`tnum shrink-0 text-right font-bold ${checked ? 'text-muted' : ''}`}>
                          {buyText(it)}
                          {hint ? <span className="block text-[13px] font-normal text-muted">{hint}</span> : null}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null,
        )}

        {total ? (
          <div className="mt-8 grid gap-3">
            <button type="button" className="btn btn-quiet" disabled={done === 0} onClick={() => store.clearShopChecks()}>
              Haken zurücksetzen
            </button>
            <p className="m-0 text-[13px] text-muted">
              {canPublish
                ? `Diese Haken gelten nur auf diesem Gerät (${nf0.format(total - done)} offen). Die geteilte Liste hat eigene Haken.`
                : `Haken gelten nur auf diesem Gerät. Mit Anmeldung gibt es eine gemeinsame Liste für die Familie; bis dahin sendet „Teilen“ die offenen Artikel als Text (${nf0.format(total - done)} offen).`}
            </p>
          </div>
        ) : null}
      </div>
    </>
  );
}
