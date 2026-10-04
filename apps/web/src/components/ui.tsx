import type { ReactNode } from 'react';

export type Tone = 'mute' | 'brand' | 'warn' | 'bad' | 'ok';

export function Chip({ tone = 'mute', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  const cls = tone === 'mute' ? 'chip' : `chip chip-${tone}`;
  return (
    <span className={cls} title={title}>
      {children}
    </span>
  );
}

export function Masthead({ title, sub, children, action }: { title: string; sub?: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <header className="masthead">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1>{title}</h1>
          {sub ? <p>{sub}</p> : null}
        </div>
        {action}
      </div>
      {children}
      <div className="masthead-rail" aria-hidden="true" />
    </header>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <input type="checkbox" role="switch" className="switch" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const ICON = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

export const Icons = {
  woche: (
    <svg {...ICON}>
      <path d="M4 7h16M4 12h16M4 17h16" />
      <circle cx="8" cy="7" r="1.6" fill="currentColor" />
      <circle cx="15" cy="12" r="1.6" fill="currentColor" />
      <circle cx="11" cy="17" r="1.6" fill="currentColor" />
    </svg>
  ),
  heute: (
    <svg {...ICON}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  ),
  einkauf: (
    <svg {...ICON}>
      <path d="M5 9h14l-1.2 9.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 9Z" />
      <path d="M9 9V7.5a3 3 0 0 1 6 0V9" />
    </svg>
  ),
  mehr: (
    <svg {...ICON}>
      <path d="M4 8h16M4 16h16" />
      <circle cx="9" cy="8" r="2.2" fill="var(--color-surface)" />
      <circle cx="15" cy="16" r="2.2" fill="var(--color-surface)" />
    </svg>
  ),
  share: (
    <svg {...ICON} width={20} height={20}>
      <path d="M12 15V4M8 8l4-4 4 4" />
      <path d="M6 12v6.5A1.5 1.5 0 0 0 7.5 20h9a1.5 1.5 0 0 0 1.5-1.5V12" />
    </svg>
  ),
};
