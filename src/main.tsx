import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ensureSeeded } from './db/repo';
import './index.css';

registerSW({ immediate: true });

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
