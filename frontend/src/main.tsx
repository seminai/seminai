import '@/lib/init-api-config';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/i18n/config';
import './index.css';
import App from './App';
import { installChunkReloadHandler } from '@/lib/chunk-reload';
import { initAnalytics } from '@/lib/analytics';

installChunkReloadHandler();
initAnalytics();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
