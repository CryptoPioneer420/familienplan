import { useCallback, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Service-Worker-Zustand für die App. Aktualisiert nur auf Tipp (kein stilles skipWaiting),
 * damit nie alte Seite und neue Assets gemischt laufen.
 */
export function useServiceWorker() {
  const registration = useRef<ServiceWorkerRegistration | undefined>(undefined);
  const [dismissed, setDismissed] = useState(false);
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      registration.current = reg;
    },
    onRegisterError(error) {
      console.warn('Service Worker konnte nicht registriert werden', error);
    },
  });
  const checkForUpdate = useCallback(async () => {
    try {
      await registration.current?.update();
    } catch {
      /* offline: nichts zu prüfen */
    }
  }, []);
  return {
    needRefresh: needRefresh && !dismissed,
    offlineReady,
    update: () => void updateServiceWorker(true),
    dismiss: () => setDismissed(true),
    checkForUpdate,
  };
}

export function UpdateBanner({ visible, onUpdate, onDismiss }: { visible: boolean; onUpdate: () => void; onDismiss: () => void }) {
  if (!visible) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-3 z-[55] flex items-center gap-2 rounded-2xl bg-night px-4 py-3 text-on-night shadow-lg"
      style={{ bottom: 'calc(56px + env(safe-area-inset-bottom) + 10px)' }}
    >
      <span className="flex-1 text-[15px]">Neue Version bereit.</span>
      <button type="button" className="btn !min-h-[40px] !bg-lemon !text-[#10222e]" onClick={onUpdate}>
        Aktualisieren
      </button>
      <button type="button" className="min-h-[40px] px-2 text-[15px] text-on-night-muted" onClick={onDismiss}>
        Später
      </button>
    </div>
  );
}
