import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  onReset: () => void;
}
interface State {
  failed: boolean;
}

/** Fängt Render-Fehler ab, damit nie ein weißer Bildschirm bleibt. Die lokalen Daten lassen sich von hier aus zurücksetzen. */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Render-Fehler', error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="mx-auto max-w-md p-6" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 32px)' }}>
        <h1 className="sec-title">Die Anzeige ist abgestürzt</h1>
        <p className="mt-3 text-muted">Der Plan selbst ist nicht verloren. Neu laden behebt es meistens. Hilft das nicht, setze die lokalen Einstellungen zurück (Gewicht, Haken, Verfügbarkeit).</p>
        <div className="mt-5 grid gap-3">
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            Neu laden
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              this.props.onReset();
              window.location.reload();
            }}
          >
            Lokale Einstellungen zurücksetzen
          </button>
        </div>
      </main>
    );
  }
}
