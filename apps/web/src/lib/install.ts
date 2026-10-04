import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // eigenen Button statt Mini-Infobar
    deferred = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

/** Android/Chrome: liefert eine Installationsfunktion, sobald der Browser die App als installierbar meldet (sonst null). */
export function useInstallPrompt(): (() => Promise<void>) | null {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  if (!deferred) return null;
  const ev = deferred;
  return async () => {
    await ev.prompt();
    await ev.userChoice;
    deferred = null;
    listeners.forEach((l) => l());
  };
}

export const isAndroid = (): boolean => typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
