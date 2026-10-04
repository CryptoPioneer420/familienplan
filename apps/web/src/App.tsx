import { useCallback, useEffect, useState } from 'react';
import type { Weekday } from '@familienplan/schema';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TabBar, TABS, type TabId } from './components/TabBar';
import { UpdateBanner, useServiceWorker } from './components/UpdateBanner';
import { weekdayOfDate } from './lib/domain';
import { MeProvider } from './lib/me';
import { store } from './lib/useApp';
import { MoreView } from './views/MoreView';
import { ShopView } from './views/ShopView';
import { TodayView } from './views/TodayView';
import { WeekView } from './views/WeekView';

const isTab = (v: string): v is TabId => TABS.some((t) => t.id === v);
const tabFromHash = (): TabId => {
  const h = window.location.hash.replace(/^#\/?/, '');
  return isTab(h) ? h : 'woche';
};

export function App() {
  const [tab, setTab] = useState<TabId>(tabFromHash);
  const [day, setDay] = useState<Weekday>(() => weekdayOfDate(new Date()));
  const sw = useServiceWorker();

  const go = useCallback((next: TabId) => {
    setTab(next);
    if (window.location.hash !== `#${next}`) window.history.replaceState(null, '', `#${next}`);
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <ErrorBoundary onReset={() => store.resetAll()}>
      <MeProvider>
      <div className="scrim" aria-hidden="true" />
      <main className="page" id="main">
        {tab === 'woche' ? (
          <WeekView
            onOpenDay={(d) => {
              setDay(d);
              go('heute');
            }}
          />
        ) : null}
        {tab === 'heute' ? <TodayView day={day} onSelectDay={setDay} /> : null}
        {tab === 'einkauf' ? <ShopView /> : null}
        {tab === 'mehr' ? <MoreView offlineReady={sw.offlineReady} onCheckUpdate={sw.checkForUpdate} /> : null}
      </main>
      <UpdateBanner visible={sw.needRefresh} onUpdate={sw.update} onDismiss={sw.dismiss} />
      <TabBar active={tab} onSelect={go} />
      </MeProvider>
    </ErrorBoundary>
  );
}
