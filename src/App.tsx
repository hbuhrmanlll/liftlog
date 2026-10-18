import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { RestTimerProvider } from './hooks/restTimer';
import { ToastProvider } from './hooks/toast';
import { useSettingsLoaded } from './hooks/useData';
import { HistoryPage } from './pages/HistoryPage';
import { HomePage } from './pages/HomePage';
import { OnboardingPage } from './pages/OnboardingPage';
import { SummaryPage } from './pages/SummaryPage';
import { WorkoutDetailPage } from './pages/WorkoutDetailPage';
import { WorkoutPage } from './pages/WorkoutPage';

const CoachPage = lazy(() => import('./pages/CoachPage').then((m) => ({ default: m.CoachPage })));
const ExerciseDetailPage = lazy(() => import('./pages/ExerciseDetailPage').then((m) => ({ default: m.ExerciseDetailPage })));
const ProgressPage = lazy(() => import('./pages/ProgressPage').then((m) => ({ default: m.ProgressPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const ProgramPage = lazy(() => import('./pages/ProgramPage').then((m) => ({ default: m.ProgramPage })));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  return null;
}

export default function App() {
  const settings = useSettingsLoaded();
  const { pathname } = useLocation();

  useEffect(() => {
    if (!settings) return;
    document.documentElement.classList.toggle('light', settings.theme === 'light');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', settings.theme === 'light' ? '#f3f4f6' : '#0a0b0d');
    try {
      localStorage.setItem('liftlog.theme', settings.theme);
    } catch {
      /* ignore */
    }
  }, [settings]);

  if (!settings) return <div className="min-h-dvh bg-bg" aria-busy="true" />;

  if (!settings.onboarded && pathname !== '/welcome') return <Navigate to="/welcome" replace />;
  if (settings.onboarded && pathname === '/welcome') return <Navigate to="/" replace />;

  return (
    <ToastProvider>
      <RestTimerProvider sound={settings.timerSound} vibrate={settings.timerVibrate}>
        <ScrollToTop />
        {pathname === '/welcome' ? (
          <OnboardingPage />
        ) : (
          <AppShell>
            <Suspense fallback={<div className="min-h-[50dvh]" aria-busy="true" />}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/workout" element={<WorkoutPage />} />
                <Route path="/workout/summary/:id" element={<SummaryPage />} />
                <Route path="/coach" element={<CoachPage />} />
                <Route path="/history" element={<HistoryPage />} />
                <Route path="/history/:id" element={<WorkoutDetailPage />} />
                <Route path="/progress" element={<ProgressPage />} />
                <Route path="/exercise/:id" element={<ExerciseDetailPage />} />
                <Route path="/program" element={<ProgramPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </AppShell>
        )}
      </RestTimerProvider>
    </ToastProvider>
  );
}
