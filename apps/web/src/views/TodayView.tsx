import { nf0, nf1, nf2, type MealView, type PlanDay, type RangeStatus } from '@familienplan/engine';
import type { RoleId, SupplementSlotId, Weekday } from '@familienplan/schema';
import { ROLE_IDS } from '@familienplan/schema/constants';
import { DayChips } from '../components/DayChips';
import { Chip, Masthead } from '../components/ui';
import { childBox, dateOfWeekday, dayEvents, isoDate, mealBlocks, speedText, stackItems, varomaCombo, weekdayOfDate, type DayEvent } from '../lib/domain';
import { engine } from '../lib/engine';
import { ROLE_LABEL, SLOT_LABEL, SUPP_SLOT_HINT, SUPP_SLOT_LABEL, TAG_LABEL, TM_LABEL } from '../lib/labels';
import { store, useAppState, useComputed } from '../lib/useApp';

const STATUS_WORD: Record<RangeStatus, string> = { low: 'unter Ziel', ok: 'im Ziel', high: 'über Ziel' };
const STATUS_CLASS: Record<RangeStatus, string> = { low: 'text-copper', ok: 'text-ok', high: 'text-danger' };

export function TodayView({ day, onSelectDay }: { day: Weekday; onSelectDay: (d: Weekday) => void }) {
  const { plan } = useComputed();
  const { tracker } = useAppState();
  const now = new Date();
  const today = weekdayOfDate(now);
  const d = plan.days.find((x) => x.weekday === day) ?? plan.days[0];
  if (!d) return null;

  const date = dateOfWeekday(now, d.weekday);
  const iso = isoDate(date);
  const done = tracker[iso] ?? {};
  const cfg = engine.config;
  const e = d.eval;
  const events = dayEvents(engine, d);
  const training = d.dayType === 'training_day';

  return (
    <>
      <Masthead
        title={cfg.dayLong[d.weekday]}
        sub={`${training ? 'Trainingstag' : 'Ruhetag'}, ${date.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' })}`}
      >
        <div className="mt-4">
          <DayChips variant="night" label="Tag wählen" today={today} isOn={(x) => x === d.weekday} onToggle={onSelectDay} />
        </div>
      </Masthead>

      <div className="px-4 pt-5">
        <dl className="tnum m-0 grid grid-cols-4 gap-2">
          {[
            ['kcal', d.totals.father.kcal],
            ['Protein', d.totals.father.p],
            ['Fett', d.totals.father.f],
            ['KH', d.totals.father.c],
          ].map(([label, v]) => (
            <div key={label as string}>
              <dd className="stretch-cond m-0 text-[30px] font-bold leading-none">{nf0.format(v as number)}</dd>
              <dt className="mt-1 text-[13px] text-muted">{label === 'kcal' ? 'kcal' : `${label} g`}</dt>
            </div>
          ))}
        </dl>
        <p className="mb-0 mt-3 text-[14px] text-muted">
          Vater, Portionen × {nf2.format(d.factor)}
          {d.limited ? <b className="text-danger"> (Grenze erreicht, Protein-Ziel nicht exakt)</b> : null}
        </p>
        <p className="mb-0 mt-1 flex flex-wrap gap-x-4 text-[14px]">
          <span className={`whitespace-nowrap ${STATUS_CLASS[e.carbs]}`}>KH {nf1.format(e.ck)} g/kg: {STATUS_WORD[e.carbs]}</span>
          <span className={`whitespace-nowrap ${STATUS_CLASS[e.fat]}`}>Fett {nf1.format(e.fk)} g/kg: {STATUS_WORD[e.fat]}</span>
        </p>
        <p className="tnum mb-0 mt-1 text-[14px] text-muted">
          Mutter {nf0.format(d.totals.mother.kcal)} kcal · Kind {nf0.format(d.totals.child.kcal)} kcal
        </p>
        {d.restDerived || d.assumption ? (
          <p className="mb-0 mt-3 flex flex-wrap gap-2">
            {d.restDerived ? <Chip tone="brand">Training aus: Ruhetag-Variante</Chip> : null}
            {d.assumption ? <Chip tone="warn">Annahme: Ruhetag, von dir nicht vorgegeben</Chip> : null}
          </p>
        ) : null}
      </div>

      <ol className="tl mt-4 px-2" aria-label="Tagesablauf">
        {events.map((ev, i) => (
          <li key={`${ev.kind}-${ev.time}-${i}`} className="tl-item">
            <time className="tl-time" dateTime={ev.time}>{ev.time}</time>
            <span className={`tl-node tl-node-${ev.kind}`} aria-hidden="true" />
            <div className="tl-body">
              <EventBody ev={ev} day={d} iso={iso} done={done} />
            </div>
          </li>
        ))}
      </ol>
      <p className="mx-4 mt-2 text-[13px] text-muted">
        Nährwerte sind Richtwerte aus Allgemeinwissen und noch nicht gegen BLS/USDA geprüft. Mengen in Gramm roh.
      </p>
    </>
  );
}

function EventBody({ ev, day, iso, done }: { ev: DayEvent; day: PlanDay; iso: string; done: Record<string, boolean> }) {
  const mv = ev.mealIndex != null ? day.mealViews[ev.mealIndex] : undefined;
  const slot = ev.suppSlot;
  const { planState } = useComputed();

  if (!mv && !slot) {
    return (
      <div className="min-h-[44px] pt-[2px]">
        <div className="font-bold">{ev.title}</div>
        <div className="text-[14px] text-muted">{ev.detail}</div>
      </div>
    );
  }

  const stack = slot ? stackItems(engine, planState, slot) : [];
  const nDone = stack.filter((s) => done[s.key]).length;

  return (
    <details>
      <summary>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">{ev.title}</span>
          <span className="block text-[15px]">{ev.detail}</span>
          {mv ? <MealSummaryLine mv={mv} /> : null}
          {slot && !mv ? <span className="block text-[13px] text-muted">{nDone}/{stack.length} genommen</span> : null}
        </span>
        <span className="chev" aria-hidden="true" />
      </summary>
      <div className="grid gap-4 pb-4 pt-1">
        {mv ? <MealDetail mv={mv} day={day} /> : null}
        {slot ? <StackChecklist slot={slot} items={stack} iso={iso} done={done} /> : null}
      </div>
    </details>
  );
}

function MealSummaryLine({ mv }: { mv: MealView }) {
  let kcal = 0;
  let p = 0;
  for (const row of mv.rows) {
    kcal += row.calc.father?.n.kcal ?? 0;
    p += row.calc.father?.n.p ?? 0;
  }
  return (
    <span className="tnum block text-[13px] text-muted">
      Vater {nf0.format(p)} g Protein · {nf0.format(kcal)} kcal
    </span>
  );
}

function MealDetail({ mv, day }: { mv: MealView; day: PlanDay }) {
  const blocks = mealBlocks(engine, mv);
  const cb = childBox(engine, mv);
  const isTaverna = mv.mealId === engine.config.tavernaMealId;
  const combo = varomaCombo(mv);
  const tmBlocks = blocks.filter((b) => b.hasThermomix);
  const totals = ROLE_IDS.map((r) => {
    let kcal = 0, p = 0, f = 0, c = 0, g = 0;
    for (const row of mv.rows) {
      const calc = row.calc[r];
      if (!calc) continue;
      kcal += calc.n.kcal; p += calc.n.p; f += calc.n.f; c += calc.n.c; g += calc.grams;
    }
    return { role: r, kcal, p, f, c, g };
  });
  const factor = mv.slot === 'optional_snack' ? 1 : day.factor;

  return (
    <>
      <section aria-label="Zutaten">
        <div className="grid grid-cols-[1fr_repeat(3,50px)] items-end gap-x-1 pb-1 text-[12px] font-semibold text-muted">
          <span>Gramm, roh</span>
          {ROLE_IDS.map((r) => (
            <span key={r} className="text-right">{ROLE_LABEL[r]}</span>
          ))}
        </div>
        <p className="m-0 pb-2 text-[12px] text-muted">Vater × {nf2.format(factor)}</p>
        {blocks.map((b) => (
          <div key={b.comp.id} className="hairline py-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold">{b.comp.nameDe}</span>
              {b.tags.map((t) => (<Chip key={t}>{TAG_LABEL[t]}</Chip>))}
              {b.hasThermomix ? <Chip tone="brand">TM {TM_LABEL[b.comp.thermomix.useCase]}</Chip> : null}
            </div>
            <ul className="m-0 mt-1 list-none p-0">
              {b.lines.map((l, i) => (
                <li key={i} className="grid grid-cols-[1fr_repeat(3,50px)] items-baseline gap-x-1 py-[3px] text-[15px]">
                  <span className="min-w-0 pl-3">
                    {l.name}
                    {l.substituteFor ? <> <Chip tone="brand" title="Original nicht verfügbar">Ersatz für {l.substituteFor}</Chip></> : null}
                    {l.missing ? <> <Chip tone="bad">nicht im Inventar</Chip></> : null}
                    {l.yieldNote ? <span className="block text-[12px] text-muted">{l.yieldNote}</span> : null}
                  </span>
                  {ROLE_IDS.map((r: RoleId) => (
                    <span key={r} className={`tnum text-right ${l.grams[r] == null ? 'text-line' : ''}`}>
                      {l.grams[r] == null ? '–' : nf0.format(Math.round(l.grams[r] as number))}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <table className="tnum w-full border-collapse text-[14px]">
        <caption className="pb-1 text-left text-[12px] font-semibold text-muted">Summe der Mahlzeit</caption>
        <thead>
          <tr className="text-right text-[12px] text-muted">
            <th scope="col" className="text-left font-semibold"><span className="sr-only">Person</span></th>
            {['kcal', 'P', 'F', 'KH'].map((h) => (<th key={h} scope="col" className="font-semibold">{h}</th>))}
          </tr>
        </thead>
        <tbody>
          {totals.map((t) => (
            <tr key={t.role} className="hairline text-right">
              <th scope="row" className="py-1.5 text-left font-semibold">{ROLE_LABEL[t.role]}</th>
              {t.g > 0 ? (
                [t.kcal, t.p, t.f, t.c].map((v, i) => (<td key={i}>{nf0.format(v)}</td>))
              ) : (
                <td colSpan={4} className="text-muted">nicht vorgesehen</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {mv.meal.notes.length ? (
        <div className={isTaverna ? 'note note-warn' : ''}>
          {isTaverna ? <b>Restaurant-Leitfaden Taverne</b> : null}
          <ul className="m-0 mt-1 list-disc pl-5 text-[15px]">
            {mv.meal.notes.map((n) => (<li key={n}>{n}</li>))}
          </ul>
          {isTaverna ? <p className="mb-0 mt-2 text-[13px]">Gramm = Rohgewicht, Gar- und Knochenverluste sind Richtwerte [Vermutung]. Hauptgang für alle: umschaltbar unter „Mehr“.</p> : null}
        </div>
      ) : null}

      <div className="note">
        <b>Kind (4 Jahre): Baukasten-Trennung</b>
        <ul className="m-0 mt-1 list-disc pl-5">
          {cb.separateBeforeSeasoning.length ? <li>Vor Salz, Pfeffer, Schärfe und Säure abnehmen: {cb.separateBeforeSeasoning.join(', ')}.</li> : null}
          {cb.nutsGroundOnly ? <li>Nüsse nur gemahlen oder als Mus, nie ganz.</li> : null}
          {cb.notes.map((n) => (<li key={n}>{n}</li>))}
          {cb.notForChild.length && !cb.adultsOnly ? <li>Nicht für das Kind vorgesehen: {cb.notForChild.join(', ')}.</li> : null}
          {cb.adultsOnly ? <li>Diese Mahlzeit ist nur für Erwachsene vorgesehen.</li> : null}
          <li>Supplemente: keine.</li>
        </ul>
      </div>

      {tmBlocks.length ? (
        <section aria-label="Thermomix" className="grid gap-2">
          <h3 className="m-0 text-[15px] font-bold">Thermomix</h3>
          {combo ? (
            <div className="note note-ok">
              <b>Varoma-Kombi: alles gleichzeitig fertig nach {nf0.format(combo.totalMin)} Minuten</b>
              <ol className="m-0 mt-1 list-decimal pl-5">
                <li>700–800 g Wasser im Mixtopf aufkochen (ca. 8 min, Stufe 1), dann Varoma-Timer starten.</li>
                {combo.steps.map((s) => (
                  <li key={s.name}>
                    <b>{nf0.format(s.startMinute)}. Minute:</b> {s.name} ({nf0.format(s.minutes)} min) {s.tier === 'varoma' ? 'in den Varoma-Behälter (unten)' : 'in den Einlegeboden (oben)'}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          {tmBlocks.map((b) => (
            <details key={b.comp.id} className="rounded-xl bg-surface px-3">
              <summary className="flex min-h-[48px] cursor-pointer items-center justify-between gap-2">
                <span className="font-semibold">{b.comp.nameDe.split(',')[0]?.split('(')[0]?.trim()}</span>
                <span className="flex items-center gap-2"><Chip tone="brand">{TM_LABEL[b.comp.thermomix.useCase]}</Chip><span className="chev" aria-hidden="true" /></span>
              </summary>
              <ol className="m-0 grid list-none gap-2 p-0 pb-2">
                {b.comp.thermomix.steps.map((s) => {
                  const meta = [s.temperatureC != null ? `${s.temperatureC} °C` : null, s.timeMin != null ? `${nf0.format(s.timeMin)} min` : null, speedText(s.speed)].filter(Boolean).join(' · ');
                  return (
                    <li key={s.order} className="grid grid-cols-[24px_1fr] gap-x-1">
                      <span className="tnum font-bold text-muted">{s.order}</span>
                      <span>
                        {s.action}
                        {meta ? <span className="tnum block text-[13px] text-muted">{meta}</span> : null}
                      </span>
                    </li>
                  );
                })}
              </ol>
              {b.comp.thermomix.tips.length ? (
                <ul className="m-0 list-disc pl-5 pb-3 text-[14px] text-muted">
                  {b.comp.thermomix.tips.map((t) => (<li key={t}>{t}</li>))}
                </ul>
              ) : null}
            </details>
          ))}
          <p className="m-0 text-[12px] text-muted">Zeiten und Stufen sind Richtwerte [Wahrscheinlich]. Varoma = 120 °C. An Gerät, Füllmenge und Schnittgröße kalibrieren.</p>
        </section>
      ) : null}
    </>
  );
}

function StackChecklist({ slot, items, iso, done }: { slot: SupplementSlotId; items: ReturnType<typeof stackItems>; iso: string; done: Record<string, boolean> }) {
  if (!items.length) return null;
  return (
    <section aria-label={SUPP_SLOT_LABEL[slot]}>
      <h3 className="m-0 text-[15px] font-bold">
        {SUPP_SLOT_LABEL[slot]} <span className="font-normal text-muted">({SUPP_SLOT_HINT[slot]})</span>
      </h3>
      <ul className="m-0 mt-1 list-none p-0">
        {items.map((it) => (
          <li key={it.key} className="hairline">
            <label className="flex min-h-[52px] cursor-pointer items-start gap-3 py-2">
              <input type="checkbox" className="check mt-0.5" checked={Boolean(done[it.key])} onChange={() => store.toggleTracker(iso, it.key)} />
              <span className="min-w-0 flex-1">
                <span className={`font-semibold ${done[it.key] ? 'text-muted line-through' : ''}`}>{it.nameDe}</span>{' '}
                <span className="tnum">{it.dose}</span>
                <span className="mt-0.5 flex flex-wrap gap-1">
                  {it.labGuided ? <Chip tone="warn" title="Dosis erst nach Laborwert festlegen">nach Laborwert</Chip> : null}
                  {it.withFat ? <Chip tone="brand">mit Fett</Chip> : null}
                </span>
                {it.note ? <span className="block text-[13px] text-muted">{it.note}</span> : null}
                {it.upper ? <span className="block text-[12px] text-muted">{it.upper}</span> : null}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
