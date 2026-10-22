import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/fonts';
import './styles/tokens.css';
import './styles/app.css';
import { App } from './App';
import { BRAND } from './brand';
import { LocaleProvider } from './i18n/LocaleContext';

document.title = BRAND.name;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocaleProvider>
      <App />
    </LocaleProvider>
  </StrictMode>,
);
