import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { isPartyTheme } from '@party/shared';
import App from './app';
import './styles.css';

try {
  const saved = localStorage.getItem('party.theme');
  if (isPartyTheme(saved)) {
    document.documentElement.dataset.theme = saved;
  }
} catch {
  // Storage can be unavailable. The live theme still arrives over the socket.
}

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element not found');
}

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
