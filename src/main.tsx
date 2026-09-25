import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initAutoUpdater } from './utils/autoUpdater';

// Initialize full auto-updater system (PWA SW lifecycle, tab focus check, dynamic chunk error recovery)
initAutoUpdater();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
