import { nf0, nf2, type FindingKind } from '@familienplan/engine';
import type { Weekday } from '@familienplan/schema';
import { Chip, Masthead } from '../components/ui';
import { dayEvents, RAIL_TICKS, railPos, weekdayOfDate } from '../lib/domain';
import { engine } from '../lib/engine';
import { isAndroid, useInstallPrompt } from '../lib/install';
import { isIos, isStandalone } from '../lib/platform';
import { store, useAppState, useComputed } from '../lib/useApp';

const NOTE_CLASS: Record<FindingKind, string> = { ok: 'note note-ok', warn: 'note note-warn', bad: 'note note-bad', info: 'note' };
const KIND_WORD: Record<FindingKind, string> = { ok: 'Passt', warn: 'Achtung', bad: 'Problem', info: 'Hinweis' };

export function WeekView({ onOpenDay }: { onOpenDay: (day: Weekday) => void }) {
  const { plan, findings } = useComputed();
  const { installHintDismissed } = useAppState();
  const today = weekdayOfDate(new Date());
  const cfg = engine.config;
  const issues = findings.filter((f) => f.k === 'warn' || f.k === 'bad').length;
  const installPrompt = useInstallPrompt();
  const showInstallHint = !installHintDismissed && !isStandalone() && (isIos() || isAndroid());

  return (
    <>
      <Masthead title="Woche" sub={`Vater ${nf0.format(plan.target)} g Protein am Tag, Portionen Ø × ${nf2.format(plan.avgFactor)}`} />

      <div className="px-4 pt-4">
        {showInstallHint ? (
          <div className="note mb-4 flex items-start gap-3" role="note">
            <p className="m-0 flex-1">
              {isIos() ? 'Als App nutzen: Teilen-Symbol in Safari, dann „Zum Home-Bildschirm“.' : installPrompt ? 'Als App auf dem Startbildschirm nutzen.' : 'Als App nutzen: Chrome-Menü (drei Punkte), dann „App installieren“.'}
            </p>
            {installPrompt ? (
              <button type="button" className="min-h-[44px] px-2 font-semibold text-brand" onClick={() => void installPrompt()}>
                Installieren
              </button>
            ) : null}
            <button type="button" className="min-h-[44px] px-2 font-semibold text-brand" onClick={() => store.dismissInstallHint()}>
              Verstanden
            </button>
          </div>
        ) : null}

        <div className="grid grid-cols-[68px_1fr] items-end pb-1" aria-hidden="true">
          <span />
          <div className="relative mx-[7px] h-5 text-muted">
            {RAIL_TICKS.map((h) => (
              <span key={h} className="stretch-cond absolute -translate-x-1/2 text-[13px] font-semibold" style={{ left: `${railPos(`${String(h).padStart(2, '0')}:00`)}%` }}>
                {h}
              </span>
            ))}
          </div>
        </div>

        <ol className="m-0 list-none p-0">
          {plan.days.map((d) => {
            const evs = dayEvents(engine, d);
            const training = d.dayType === 'training_day';
            const taverna = d.mealViews.some((m) => m.mealId === cfg.tavernaMealId);
            const isToday = d.weekday === today;
            return (
              <li key={d.weekday} className="hairline">
                <button
                  type="button"
                  onClick={() => onOpenDay(d.weekday)}
                  className={`grid min-h-[76px] w-full grid-cols-[68px_1fr] items-center rounded-lg py-2 text-left ${isToday ? 'bg-surface' : ''}`}
                  aria-label={`${cfg.dayLong[d.weekday]}${isToday ? ' (heute)' : ''}, ${training ? 'Trainingstag' : 'Ruhetag'}, ${nf0.format(d.totals.father.p)} g Protein, ${nf0.format(d.totals.father.kcal)} kcal. Tag öffnen`}
                >
                  <span className="pl-2">
                    <span className="block text-[20px] font-bold leading-tight stretch-wide">{cfg.dayShort[d.weekday]}</span>
                    <span className={`block text-[12px] font-semibold leading-tight ${training ? 'text-copper' : 'text-muted'}`}>{training ? 'Training' : 'Ruhe'}</span>
                    {taverna ? <span className="block text-[12px] font-semibold leading-tight text-brand">Taverne</span> : null}
                  </span>
                  <span className="block min-w-0 pr-2">
                    <span className="rail block" aria-hidden="true">
                      <span className="rail-line" />
                      {RAIL_TICKS.map((h) => (
                        <span key={h} className="rail-tick" style={{ left: `${railPos(`${String(h).padStart(2, '0')}:00`)}%` }} />
                      ))}
                      {evs.map((e, i) => (
                        <span
                          key={`${e.kind}-${e.time}-${i}`}
                          className={`node ${e.kind === 'cal' || e.kind === 'str' ? 'node-workout' : e.kind === 'supp' ? 'node-supp' : e.kind === 'snack' ? 'node-snack' : 'node-meal'}`}
                          style={{ left: `${railPos(e.time)}%` }}
                        />
                      ))}
                    </span>
                    <span className="tnum flex flex-wrap items-center gap-x-2 text-[14px] text-muted">
                      <span>
                        <b className="text-ink">{nf0.format(d.totals.father.p)}</b> g Protein
                      </span>
                      <span>
                        <b className="text-ink">{nf0.format(d.totals.father.kcal)}</b> kcal
                      </span>
                      <span className={d.limited ? 'font-bold text-danger' : ''}>× {nf2.format(d.factor)}</span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="hairline mt-1 flex flex-wrap gap-x-5 gap-y-1 py-3 text-[13px] text-muted" aria-label="Legende">
          <span className="inline-flex items-center gap-2"><i className="inline-block h-[10px] w-[10px] rotate-45 bg-copper" /> Training</span>
          <span className="inline-flex items-center gap-2"><i className="inline-block h-[12px] w-[12px] rounded-full bg-brand" /> Mahlzeit</span>
          <span className="inline-flex items-center gap-2"><i className="inline-block h-[10px] w-[10px] rounded-full bg-surface ring-2 ring-brand" /> Spätsnack</span>
          <span className="inline-flex items-center gap-2"><i className="inline-block h-[9px] w-[9px] rounded-full bg-lemon ring-1 ring-ink/50" /> Schlaf-Stack</span>
        </div>

        <details className="hairline">
          <summary className="flex min-h-[56px] cursor-pointer items-center justify-between gap-3">
            <span className="sec-title !text-[18px]">Plan-Check</span>
            <span className="flex items-center gap-2">
              {issues ? <Chip tone="warn">{issues} offen</Chip> : <Chip tone="ok">alles im Rahmen</Chip>}
              <span className="chev" aria-hidden="true" />
            </span>
          </summary>
          <ul className="m-0 mb-3 grid list-none gap-2 p-0">
            {findings.map((f, i) => (
              <li key={i} className={NOTE_CLASS[f.k]}>
                <b>{KIND_WORD[f.k]}: </b>
                {f.t}
              </li>
            ))}
          </ul>
        </details>
      </div>
    </>
  );
}
