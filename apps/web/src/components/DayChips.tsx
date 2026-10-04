import type { Weekday } from '@familienplan/schema';
import { WEEKDAYS } from '@familienplan/schema/constants';
import { engine } from '../lib/engine';

/**
 * Siebenerleiste Mo–So. `night`: Auswahl eines Tages im dunklen Kopf (genau einer aktiv).
 * `light`: Mehrfachauswahl auf hellem Grund (Tage der Einkaufsliste).
 */
export function DayChips({
  variant,
  isOn,
  onToggle,
  today,
  label,
}: {
  variant: 'night' | 'light';
  isOn: (d: Weekday) => boolean;
  onToggle: (d: Weekday) => void;
  today?: Weekday;
  label: string;
}) {
  return (
    <div className="flex gap-1.5" role="group" aria-label={label}>
      {WEEKDAYS.map((d) => (
        <button
          key={d}
          type="button"
          className={`daychip ${variant === 'light' ? 'daychip-light' : ''}`}
          aria-pressed={isOn(d)}
          data-today={today === d ? 'true' : undefined}
          aria-label={`${engine.config.dayLong[d]}${today === d ? ' (heute)' : ''}`}
          onClick={() => onToggle(d)}
        >
          {engine.config.dayShort[d]}
        </button>
      ))}
    </div>
  );
}
