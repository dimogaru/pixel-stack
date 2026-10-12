import { createRoot } from 'react-dom/client';
import { setBaseUrl } from '@workspace/api-client-react';

import App from './App';
import { API_BASE_URL } from '@/lib/api';
import { ErrorBoundary } from '@/components/error-boundary';

import './index.css';

setBaseUrl(API_BASE_URL);

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((error) => {
      console.error('Service worker registration failed', error);
    });
  });
}
