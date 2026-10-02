import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { io } from 'socket.io-client';
import { isPartyTheme, type PartyTheme } from '@party/shared';

const ThemeContext = createContext<PartyTheme>('standard');

export function usePartyTheme(): PartyTheme {
  return useContext(ThemeContext);
}

function readSavedTheme(): PartyTheme {
  try {
    const saved = localStorage.getItem('party.theme');
    return isPartyTheme(saved) ? saved : 'standard';
  } catch {
    return 'standard';
  }
}

function applyTheme(theme: PartyTheme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem('party.theme', theme);
  } catch {
    // The document theme still updates for this visit.
  }
}

export function PartyThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<PartyTheme>(readSavedTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const socket = io({
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });
    socket.on('party:theme', (payload: { theme?: unknown }) => {
      if (isPartyTheme(payload?.theme)) {
        setTheme(payload.theme);
      }
    });
    return () => {
      socket.disconnect();
    };
  }, []);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}
