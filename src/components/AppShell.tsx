import { BarChart3, Dumbbell, History, Home, ListChecks, MessageCircle, Settings as SettingsIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useRestTimer } from '../hooks/restTimer';
import { useActiveWorkout } from '../hooks/useData';
import { Logo } from './Logo';
import { RestTimerBar } from './RestTimerBar';
import { cx } from './ui';

const TABS = [
  { to: '/', label: 'Home', Icon: Home, end: true },
  { to: '/workout', label: 'Workout', Icon: Dumbbell },
  { to: '/coach', label: 'Coach', Icon: MessageCircle },
  { to: '/history', label: 'History', Icon: History },
  { to: '/progress', label: 'Progress', Icon: BarChart3 },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon },
];

const SIDEBAR = [...TABS.slice(0, 5), { to: '/program', label: 'Program', Icon: ListChecks }, TABS[5]];

export function AppShell({ children }: { children: ReactNode }) {
  const active = useActiveWorkout();
  const { pathname } = useLocation();
  const live = Boolean(active);
  const timer = useRestTimer();

  return (
    <div className="min-h-dvh bg-bg lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-ink">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-surface/60 px-4 py-6 lg:flex" aria-label="Main">
        <div className="mb-8 px-2">
          <Logo />
        </div>
        <nav className="flex flex-col gap-1">
          {SIDEBAR.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => cx('flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors', isActive ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink')}
            >
              {({ isActive }) => (
                <>
                  <Icon className={cx('size-5', isActive && 'text-accent')} aria-hidden />
                  {label}
                  {to === '/workout' && live && <span className="ml-auto size-2 rounded-full bg-accent" aria-label="Workout in progress" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <p className="mt-auto px-3 text-xs text-ink-3">Your data stays on this device.</p>
      </aside>

      <main
        id="main"
        className={cx(
          'mx-auto w-full max-w-3xl px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:px-6 lg:pt-8',
          // Leave room for the floating rest timer while it is showing.
          timer.active ? 'pb-[calc(env(safe-area-inset-bottom)+11rem)] lg:pb-32' : 'pb-[calc(env(safe-area-inset-bottom)+6.5rem)] lg:pb-16',
        )}
      >
        {children}
      </main>

      <RestTimerBar />

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 backdrop-blur-xl safe-bottom lg:hidden" aria-label="Main">
        <ul className="mx-auto grid max-w-xl grid-cols-6">
          {TABS.map(({ to, label, Icon, end }) => {
            const isActive = end ? pathname === to : pathname.startsWith(to);
            return (
              <li key={to}>
                <NavLink to={to} end={end} className={cx('relative flex h-16 flex-col items-center justify-center gap-1 text-[10.5px] font-medium transition-colors', isActive ? 'text-ink' : 'text-ink-3')}>
                  <Icon className={cx('size-[22px]', isActive && 'text-accent')} strokeWidth={isActive ? 2.4 : 2} aria-hidden />
                  {label}
                  {to === '/workout' && live && <span className="absolute right-[calc(50%-16px)] top-3 size-2 rounded-full bg-accent ring-2 ring-surface" aria-label="Workout in progress" />}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
