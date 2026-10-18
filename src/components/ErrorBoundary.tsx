import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Shows what went wrong instead of a blank screen, with a way to recover. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('LiftLog crashed', error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    // Navigating to another page clears the error.
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const details = `${error.name}: ${error.message}\n${(error.stack ?? '').split('\n').slice(0, 6).join('\n')}\n\n${navigator.userAgent}`;
    return (
      <div className="mx-auto max-w-md px-5 py-10 text-center" role="alert">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-down-soft">
          <AlertTriangle className="size-7 text-down" aria-hidden />
        </div>
        <h1 className="text-xl font-bold text-ink">Something went wrong on this screen</h1>
        <p className="mt-2 text-[15px] text-ink-2">Your logged data is safe. Try reloading. If it keeps happening, copy the details below and send them over.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 inline-flex h-12 items-center gap-2 rounded-2xl bg-accent px-5 font-semibold text-accent-ink"
        >
          <RotateCcw className="size-5" aria-hidden /> Reload
        </button>
        <pre className="mt-6 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-surface-2 p-3 text-left text-[12px] text-ink-2 select-all">{details}</pre>
      </div>
    );
  }
}
