import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ensureSeeded } from './db/repo';
import { recordCrash, reloadOnce } from './lib/crashLog';
import './index.css';

registerSW({ immediate: true });

// After a new deploy, an already-open copy can ask for files that no longer exist.
// Vite reports that here; reloading picks up the new version.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  recordCrash((event as Event & { payload?: unknown }).payload ?? new Error('Failed to load part of the app'));
  reloadOnce();
});
window.addEventListener('unhandledrejection', (event) => {
  const msg = String((event.reason as Error | undefined)?.message ?? event.reason ?? '');
  if (/dynamically imported module|Importing a module script failed|error loading dynamically/i.test(msg)) {
    recordCrash(event.reason);
    reloadOnce();
  }
});

// Apply the saved theme before first paint to avoid a flash.
try {
  if (localStorage.getItem('liftlog.theme') === 'light') document.documentElement.classList.add('light');
} catch {
  /* ignore */
}

ensureSeeded()
  .catch((err: unknown) => console.error('Failed to initialize database', err))
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <ErrorBoundary>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ErrorBoundary>
      </StrictMode>,
    );
  });
