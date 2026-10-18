import { CheckCircle2, Info, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type Tone = 'success' | 'info' | 'error';
interface Toast {
  id: number;
  message: string;
  tone: Tone;
}

const Ctx = createContext<(message: string, tone?: Tone) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback((message: string, tone: Tone = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, message, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4 safe-top" aria-live="polite" role="status">
        {toasts.map((t) => (
          <div key={t.id} className="animate-fade-up pointer-events-auto flex max-w-sm items-center gap-2 rounded-2xl border border-line bg-surface-2 px-4 py-3 text-sm font-medium text-ink shadow-2xl shadow-black/40">
            {t.tone === 'success' ? <CheckCircle2 className="size-4 shrink-0 text-up" aria-hidden /> : t.tone === 'error' ? <XCircle className="size-4 shrink-0 text-danger" aria-hidden /> : <Info className="size-4 shrink-0 text-stay" aria-hidden />}
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  return useContext(Ctx);
}
