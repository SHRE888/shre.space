import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useBrilliantMode } from '../context/BrilliantModeContext';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [mounted, setMounted] = useState(false);
  const { brilliant } = useBrilliantMode();

  const isLanding = location.pathname === '/';

  useEffect(() => {
    setMounted(false);
    const t = setTimeout(() => setMounted(true), 30);
    return () => clearTimeout(t);
  }, [location.pathname]);

  return (
    <div className={`min-h-screen flex flex-col font-light layout-root ${brilliant ? 'brilliant-mode' : 'bg-white text-[#1a1a1a]'}`} data-brilliant={brilliant ? 'true' : 'false'}>
      {!isLanding && (
        <header className="fixed top-0 left-0 w-full h-11 border-b border-gray-100/50 bg-white/85 backdrop-blur-xl z-50 px-6 sm:px-8 flex items-center justify-between animate-fade-in-down header-bar">
          <div className="flex items-center gap-4">
            <div
              className="text-[13px] tracking-[0.4em] cursor-pointer font-medium text-black uppercase hover:opacity-60 transition-opacity"
              onClick={() => navigate('/')}
            >
              SHRE · FOUR ELEMENT SYSTEM
            </div>
            <div className="h-3 w-px bg-gray-200/80 hidden sm:block" />
            <nav className="hidden sm:flex gap-5 text-[13px] uppercase tracking-[0.2em]">
              <button
                onClick={() => navigate('/core')}
                className={`py-0.5 transition-all duration-300 ${
                  location.pathname === '/core'
                    ? 'text-black font-medium border-b border-black'
                    : 'text-gray-400 hover:text-black border-b border-transparent'
                }`}
              >
                Workspace
              </button>
              <button
                onClick={() => navigate('/survey')}
                className={`py-0.5 transition-all duration-300 flex items-center gap-1.5 ${
                  location.pathname === '/survey'
                    ? 'text-black font-medium border-b border-black'
                    : 'text-gray-400 hover:text-black border-b border-transparent'
                }`}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" className="opacity-60">
                  <circle cx="12" cy="12" r="8" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="1" />
                  <ellipse cx="12" cy="12" rx="11" ry="3.5" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
                  <circle cx="12" cy="12" r="5" fill="currentColor" fillOpacity="0.08" />
                  <circle cx="10" cy="10" r="1.8" fill="currentColor" fillOpacity="0.15" />
                  <circle cx="14.5" cy="13" r="1.2" fill="currentColor" fillOpacity="0.1" />
                </svg>
                Diagnostic
              </button>
              <button
                onClick={() => navigate('/about')}
                className={`py-0.5 transition-all duration-300 ${
                  location.pathname === '/about'
                    ? 'text-black font-medium border-b border-black'
                    : 'text-gray-400 hover:text-black border-b border-transparent'
                }`}
              >
                About
              </button>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1 text-[13px] uppercase tracking-[0.15em] text-gray-400">
              <button className="px-2 py-1 rounded hover:text-black hover:bg-gray-50 transition-all">GE</button>
              <span className="text-gray-200/60 self-center">|</span>
              <button className="px-2 py-1 rounded text-black font-medium bg-gray-50">EN</button>
            </div>
          </div>
        </header>
      )}

      <main className={`flex-grow ${isLanding ? '' : 'pt-11'}`}>
        <div className={`transition-opacity duration-500 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
          {children}
        </div>
      </main>

      {!isLanding && (
        <footer className="h-7 border-t border-gray-100/40 px-6 sm:px-8 flex items-center justify-between text-[11px] text-gray-400/60 tracking-[0.25em] uppercase bg-white/85 backdrop-blur-sm z-40">
          <div className="font-light flex items-center gap-2">
            <span>SHRE STUDIO</span>
          </div>
          <div className="font-light flex items-center gap-2">
            <span>Four Element System</span>
            <span className="text-gray-200/50">·</span>
            <span>2025</span>
          </div>
        </footer>
      )}
    </div>
  );
};

export default Layout;
