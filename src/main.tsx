import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/fonts';
import './styles/tokens.css';
import './styles/app.css';
import { App } from './App';
import { BRAND } from './brand';
import { LocaleProvider } from './i18n/LocaleContext';

document.title = BRAND.name;

// Keeps downloaded map tiles on the device (not in development, where it would cache stale code
// paths and confuse hot reload)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocaleProvider>
      <App />
    </LocaleProvider>
  </StrictMode>,
);
