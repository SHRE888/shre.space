import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './ErrorBoundary';
import { BrilliantModeProvider } from './context/BrilliantModeContext';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

// Global error hooks to prevent completely silent failures
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    console.error('[Global error]', event.error || event.message || event);
  });
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[Unhandled promise rejection]', event.reason || event);
  });
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrilliantModeProvider>
        <App />
      </BrilliantModeProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
