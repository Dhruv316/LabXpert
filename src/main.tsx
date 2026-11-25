import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { DEFAULT_LANGUAGE, t } from './i18n';
import { registerOffline } from './pwa-register';
import './index.css';

// Page title and language come from the language file so no text is hard-coded in index.html.
document.title = t('app.name');
document.documentElement.lang = DEFAULT_LANGUAGE;

const container = document.getElementById('root');
if (container === null) throw new Error('Root element missing from index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Production only: `npm run dev` runs no service worker.
if (import.meta.env.PROD) registerOffline();
