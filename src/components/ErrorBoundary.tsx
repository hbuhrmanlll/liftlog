import { AlertTriangle, Copy, RotateCcw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { describeError, recordCrash, reloadOnce } from '../lib/crashLog';

interface State {
  error: Error | null;
  reloading: boolean;
  copied: boolean;
}

/** Shows what went wrong instead of a blank screen, and recovers by reloading once. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  state: State = { error: null, reloading: false, copied: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('LiftLog crashed', error, info.componentStack);
    recordCrash(error);
    // A fresh load always works, so try that first (at most once every 15s).
    if (reloadOnce()) this.setState({ reloading: true });
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    // Navigating to another page clears the error.
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null, copied: false });
  }

  render() {
    const { error, reloading, copied } = this.state;
    if (!error) return this.props.children;
    if (reloading) return <div className="min-h-[50dvh]" aria-busy="true" />;
    const details = describeError(error);
    return (
      <div className="mx-auto max-w-md px-5 py-10 text-center" role="alert">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-down-soft">
          <AlertTriangle className="size-7 text-down" aria-hidden />
        </div>
        <h1 className="text-xl font-bold text-ink">Something went wrong on this screen</h1>
        <p className="mt-2 text-[15px] text-ink-2">Your logged data is safe. Try reloading. If it keeps happening, copy the details and send them over.</p>
        <div className="mt-5 flex justify-center gap-2">
          <button type="button" onClick={() => window.location.reload()} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-accent px-5 font-semibold text-accent-ink">
            <RotateCcw className="size-5" aria-hidden /> Reload
          </button>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(details).then(() => this.setState({ copied: true }));
            }}
            className="inline-flex h-12 items-center gap-2 rounded-2xl border border-line bg-surface-2 px-5 font-semibold text-ink"
          >
            <Copy className="size-5" aria-hidden /> {copied ? 'Copied' : 'Copy details'}
          </button>
        </div>
        <pre className="mt-6 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-surface-2 p-3 text-left text-[12px] text-ink-2 select-all">{details}</pre>
      </div>
    );
  }
}
