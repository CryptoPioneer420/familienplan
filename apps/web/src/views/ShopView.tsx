import { buyHint, buyText, nf0, shortName } from '@familienplan/engine';
import { useState } from 'react';
import { DayChips } from '../components/DayChips';
import { Chip, Icons, Masthead } from '../components/ui';
import { shopItemDays, shoppingText } from '../lib/domain';
import { engine } from '../lib/engine';
import { shareText } from '../lib/platform';
import { store, useAppState, useComputed } from '../lib/useApp';

export function ShopView() {
  const { shop, planState } = useComputed();
  const { shopChecked } = useAppState();
  const [status, setStatus] = useState('');
  const total = shop.items.length;
  const done = shop.items.filter((i) => shopChecked[i.id]).length;
  const cfg = engine.config;
  const anyDay = cfg.days.some((d) => planState.activeDays[d]);
  const tavernaOn = planState.taverna && planState.activeDays[cfg.tavernaDay];

  async function share() {
    const result = await shareText('Einkauf Familienplan', shoppingText(engine, shop, shopChecked, true));
    setStatus(result === 'copied' ? 'Liste in die Zwischenablage kopiert.' : result === 'shared' ? '' : 'Teilen war nicht möglich.');
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
        <p className="mb-2 mt-0 text-[14px] text-muted">Tage in der Liste</p>
        <DayChips variant="light" label="Tage in der Einkaufsliste" isOn={(d) => Boolean(planState.activeDays[d])} onToggle={(d) => store.toggleActiveDay(d)} />
        <p className="mb-0 mt-2 text-[13px] text-muted" role="status" aria-live="polite">
          {status || 'Familie gesamt (Vater, Mutter, Kind), Rohgewichte, aufgerundet.'}
        </p>
        {tavernaOn ? <p className="note mt-3">Samstag Taverne ist aktiv: das Samstags-Dinner wird nicht eingekauft.</p> : null}
        {!anyDay ? <p className="note note-warn mt-3">Kein Tag ausgewählt. Tippe oben mindestens einen Tag an.</p> : null}

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
              Haken gelten nur auf diesem Gerät. Die gemeinsame Live-Liste für deine Frau folgt; bis dahin: „Teilen“ sendet die offenen Artikel als Text ({nf0.format(total - done)} offen).
            </p>
          </div>
        ) : null}
      </div>
    </>
  );
}
