import { ArrowDown, ArrowUp, Info, Minus, Plus, RotateCcw, Sparkles, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { DAY_LABEL } from '../lib/schedule';
import type { DayType, RecAction } from '../types';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg' | 'xl';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-accent-hover font-semibold shadow-[0_0_0_1px_rgb(0_0_0/0.05)]',
  secondary: 'bg-surface-2 text-ink hover:bg-surface-3 border border-line',
  outline: 'border border-line text-ink hover:bg-surface-2',
  ghost: 'text-ink-2 hover:text-ink hover:bg-surface-2',
  danger: 'bg-danger-soft text-danger hover:brightness-110 border border-danger/30',
};
const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm rounded-xl gap-1.5',
  md: 'h-11 px-4 text-[15px] rounded-xl gap-2',
  lg: 'h-12 px-5 text-base rounded-2xl gap-2',
  xl: 'h-14 px-6 text-lg rounded-2xl gap-2.5',
};

export function Button({ variant = 'secondary', size = 'md', className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      type="button"
      className={cx('inline-flex select-none items-center justify-center font-medium transition-[background,color,transform,filter] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45', VARIANTS[variant], SIZES[size], className)}
      {...rest}
    >
      {children}
    </button>
  );
}

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx('inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink active:scale-95 disabled:opacity-40', className)}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Card({ className, children, as: As = 'div', ...rest }: { className?: string; children: ReactNode; as?: 'div' | 'section' | 'article' | 'li' | 'ul' } & Record<string, unknown>) {
  return (
    <As className={cx('rounded-2xl border border-line bg-surface', className)} {...rest}>
      {children}
    </As>
  );
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('mb-3 flex items-center justify-between gap-3', className)}>
      <h2 className="text-[13px] font-semibold uppercase tracking-wider text-ink-3">{children}</h2>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, action, back }: { title: string; subtitle?: ReactNode; action?: ReactNode; back?: ReactNode }) {
  return (
    <header className="mb-5 flex items-start justify-between gap-3 pt-2">
      <div className="min-w-0 flex-1">
        {back}
        <h1 className="truncate text-[28px] font-bold leading-tight tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-ink-2">{subtitle}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-1">{action}</div>}
    </header>
  );
}

const DAY_DOT: Record<DayType, string> = { push: 'bg-push', pull: 'bg-pull', legs: 'bg-legs' };
const DAY_TEXT: Record<DayType, string> = { push: 'text-push', pull: 'text-pull', legs: 'text-legs' };
const DAY_SOFT: Record<DayType, string> = { push: 'bg-push-soft', pull: 'bg-pull-soft', legs: 'bg-legs-soft' };
export const dayStyles = { dot: DAY_DOT, text: DAY_TEXT, soft: DAY_SOFT };

export function DayBadge({ day, className, size = 'md' }: { day: DayType; className?: string; size?: 'sm' | 'md' }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full font-semibold', DAY_SOFT[day], DAY_TEXT[day], size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-[13px]', className)}>
      <span className={cx('size-1.5 rounded-full', DAY_DOT[day])} aria-hidden />
      {DAY_LABEL[day]}
    </span>
  );
}

const REC: Record<RecAction, { label: string; cls: string; Icon: typeof ArrowUp }> = {
  up: { label: 'Go Up', cls: 'bg-up-soft text-up', Icon: ArrowUp },
  stay: { label: 'Stay', cls: 'bg-stay-soft text-stay', Icon: Minus },
  down: { label: 'Go Down', cls: 'bg-down-soft text-down', Icon: ArrowDown },
  deload: { label: 'Deload', cls: 'bg-down-soft text-down', Icon: RotateCcw },
  start: { label: 'New', cls: 'bg-accent-soft text-accent', Icon: Sparkles },
};

export function RecBadge({ action, className }: { action: RecAction; className?: string }) {
  const r = REC[action];
  return (
    <span className={cx('inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide', r.cls, className)}>
      <r.Icon className="size-3.5" strokeWidth={2.75} aria-hidden />
      {r.label}
    </span>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-surface-2 text-ink-3">{icon}</div>
      <p className="text-[17px] font-semibold text-ink">{title}</p>
      {children && <p className="mt-1.5 max-w-xs text-[15px] text-ink-2">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Small (i) button that reveals an explanation. Works with tap and keyboard. */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  return (
    <span ref={ref} className="relative inline-flex">
      <button type="button" aria-label={label} aria-expanded={open} aria-describedby={open ? id : undefined} onClick={() => setOpen((o) => !o)} className="inline-flex size-6 items-center justify-center rounded-full text-ink-3 hover:text-ink">
        <Info className="size-4" aria-hidden />
      </button>
      {open && (
        <span id={id} role="tooltip" className="animate-fade-up absolute left-1/2 top-7 z-40 w-64 -translate-x-1/2 rounded-xl border border-line bg-surface-3 p-3 text-left text-[13px] font-normal normal-case leading-relaxed tracking-normal text-ink shadow-2xl shadow-black/40">
          {children}
        </span>
      )}
    </span>
  );
}

/** Big +/- number input for weight and reps. */
export function Stepper({
  value,
  onChange,
  step,
  min = 0,
  label,
  placeholder,
  decimals = false,
  className,
  compact,
  start,
}: {
  /** Value the first +/- tap fills in when the box is blank. */
  start?: number;
  value: number | null;
  onChange: (v: number | null) => void;
  step: number;
  min?: number;
  label: string;
  placeholder?: string;
  decimals?: boolean;
  className?: string;
  compact?: boolean;
}) {
  const [text, setText] = useState(value === null ? '' : String(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value === null ? '' : String(value));
  }, [value]);
  const commit = (raw: string) => {
    if (raw.trim() === '') return onChange(null);
    const n = Number(raw.replace(',', '.'));
    if (Number.isFinite(n)) onChange(Math.max(min, decimals ? Math.round(n * 100) / 100 : Math.round(n)));
  };
  const bump = (d: number) => {
    // From a blank box, the first tap fills in the hinted target.
    if (value === null && start !== undefined) return onChange(start);
    const base = value ?? 0;
    const next = Math.max(min, Math.round((base + d) * 100) / 100);
    onChange(next);
  };
  return (
    <div className={cx('flex h-12 items-center rounded-xl border border-line bg-surface-2 focus-within:border-accent/60', className)}>
      <button type="button" aria-label={`Decrease ${label}`} onClick={() => bump(-step)} className={cx('flex h-full shrink-0 items-center justify-center rounded-l-xl text-ink-2 hover:text-ink active:bg-surface-3', compact ? 'w-8' : 'w-10')}>
        <Minus className="size-4" strokeWidth={2.5} aria-hidden />
      </button>
      <input
        aria-label={label}
        inputMode={decimals ? 'decimal' : 'numeric'}
        type="text"
        pattern={decimals ? '[0-9]*[.,]?[0-9]*' : '[0-9]*'}
        value={text}
        placeholder={placeholder}
        onFocus={(e) => {
          focused.current = true;
          e.currentTarget.select();
        }}
        onBlur={(e) => {
          focused.current = false;
          commit(e.currentTarget.value);
        }}
        onChange={(e) => {
          setText(e.target.value);
          if (e.target.value.trim() !== '' && Number.isFinite(Number(e.target.value.replace(',', '.')))) commit(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className="tnum h-full w-full min-w-0 bg-transparent text-center text-lg font-semibold text-ink outline-none placeholder:text-ink-3 placeholder:font-normal"
      />
      <button type="button" aria-label={`Increase ${label}`} onClick={() => bump(step)} className={cx('flex h-full shrink-0 items-center justify-center rounded-r-xl text-ink-2 hover:text-ink active:bg-surface-3', compact ? 'w-8' : 'w-10')}>
        <Plus className="size-4" strokeWidth={2.5} aria-hidden />
      </button>
    </div>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, label, className }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label: string; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cx('flex rounded-xl bg-surface-2 p-1', className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx('h-9 flex-1 rounded-lg px-3 text-sm font-semibold transition-colors', o.value === value ? 'bg-seg text-ink shadow-md shadow-black/20' : 'text-ink-3 hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: ReactNode }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <label htmlFor={id} className="text-[15px] font-medium text-ink">
          {label}
        </label>
        {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx('relative h-7 w-12 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-surface-3')}
      >
        <span className={cx('absolute top-0.5 size-6 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}

export function TextField({ label, hint, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-ink-2">
        {label}
      </label>
      <input id={id} className="h-12 w-full rounded-xl border border-line bg-surface-2 px-3.5 text-[15px] text-ink outline-none placeholder:text-ink-3 focus:border-accent/60" {...rest} />
      {hint && <p className="mt-1.5 text-[12px] text-ink-3">{hint}</p>}
    </div>
  );
}

/** Bottom sheet on mobile, centered dialog on desktop. */
export function Sheet({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => {
      const focusable = ref.current?.querySelector<HTMLElement>('input, textarea, select, [data-autofocus]');
      (focusable ?? ref.current)?.focus();
    }, 30);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cx('animate-sheet relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl border border-line bg-surface shadow-2xl outline-none sm:rounded-3xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
          <IconButton label="Close" onClick={onClose} className="-mr-2">
            <X className="size-5" aria-hidden />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-line px-5 py-4 safe-bottom">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
  requireText,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
  requireText?: string;
}) {
  const [typed, setTyped] = useState('');
  useEffect(() => {
    if (open) setTyped('');
  }, [open]);
  const blocked = requireText !== undefined && typed.trim().toUpperCase() !== requireText.toUpperCase();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex gap-3">
          <Button className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            variant={danger ? 'danger' : 'primary'}
            disabled={blocked}
            onClick={async () => {
              await onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="text-[15px] leading-relaxed text-ink-2">{message}</div>
      {requireText !== undefined && <TextField className="mt-4" label={`Type ${requireText} to confirm`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="characters" />}
    </Sheet>
  );
}

export function Stat({ label, value, sub, className }: { label: string; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cx('min-w-0', className)}>
      <div className="text-[12px] font-medium uppercase tracking-wider text-ink-3">{label}</div>
      <div className="tnum mt-1 truncate text-[22px] font-bold leading-tight text-ink">{value}</div>
      {sub && <div className="mt-0.5 truncate text-[12px] text-ink-3">{sub}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cx('inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent', className)} aria-hidden />;
}

export function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-label="Coach is typing" role="status">
      {[0, 1, 2].map((i) => (
        <span key={i} className="typing-dot size-1.5 rounded-full bg-ink-2" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  );
}
