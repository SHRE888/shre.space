import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'shre-brilliant-mode';

type BrilliantModeContextValue = {
  brilliant: boolean;
  toggleBrilliant: () => void;
};

const BrilliantModeContext = createContext<BrilliantModeContextValue | null>(null);

export const BrilliantModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [brilliant, setBrilliant] = useState<boolean>(true);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(brilliant));
      document.documentElement.setAttribute('data-brilliant', brilliant ? 'true' : 'false');
    } catch {
      document.documentElement.setAttribute('data-brilliant', brilliant ? 'true' : 'false');
    }
  }, [brilliant]);

  const toggleBrilliant = useCallback(() => setBrilliant((v) => !v), []);

  return (
    <BrilliantModeContext.Provider value={{ brilliant, toggleBrilliant }}>
      {children}
    </BrilliantModeContext.Provider>
  );
};

export function useBrilliantMode(): BrilliantModeContextValue {
  const ctx = useContext(BrilliantModeContext);
  if (!ctx) {
    throw new Error('useBrilliantMode must be used within BrilliantModeProvider');
  }
  return ctx;
}
