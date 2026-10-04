import { Icons } from './ui';

export type TabId = 'woche' | 'heute' | 'einkauf' | 'mehr';
export const TABS: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: 'woche', label: 'Woche' },
  { id: 'heute', label: 'Heute' },
  { id: 'einkauf', label: 'Einkauf' },
  { id: 'mehr', label: 'Mehr' },
];

export function TabBar({ active, onSelect }: { active: TabId; onSelect: (t: TabId) => void }) {
  return (
    <nav className="tabbar" aria-label="Hauptnavigation">
      {TABS.map((t) => (
        <button key={t.id} type="button" className="tab" aria-current={t.id === active ? 'page' : undefined} onClick={() => onSelect(t.id)}>
          {Icons[t.id]}
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
