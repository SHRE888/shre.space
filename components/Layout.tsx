import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useBrilliantMode } from '../context/BrilliantModeContext';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { brilliant } = useBrilliantMode();

  const isLanding = location.pathname === '/';

  useEffect(() => {
    setMounted(false);
    const t = setTimeout(() => setMounted(true), 30);
    return () => clearTimeout(t);
  }, [location.pathname]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const navTo = (path: string) => {
    navigate(path);
    setMobileMenuOpen(false);
  };

  return (
    <div className={`min-h-screen min-h-[100dvh] flex flex-col font-light layout-root ${brilliant ? 'brilliant-mode' : 'bg-white text-[#1a1a1a]'}`} data-brilliant={brilliant ? 'true' : 'false'}>
      {!isLanding && (
        <header className="fixed top-0 left-0 w-full h-11 border-b border-gray-100/50 bg-white/85 backdrop-blur-xl z-50 px-3 sm:px-6 md:px-8 flex items-center justify-between animate-fade-in-down header-bar safe-top safe-x">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <div
              className="text-[11px] sm:text-[13px] tracking-[0.2em] sm:tracking-[0.4em] cursor-pointer font-medium text-black uppercase hover:opacity-60 transition-opacity truncate"
              onClick={() => navTo('/')}
            >
              SHRE
            </div>
            <div className="h-3 w-px bg-gray-200/80 hidden sm:block" />
            <nav className="hidden sm:flex gap-3 md:gap-5 text-[13px] uppercase tracking-[0.2em]">
              <button
                onClick={() => navTo('/core')}
                className={`py-0.5 transition-all duration-300 touch-target-auto ${
                  location.pathname === '/core'
                    ? 'text-black font-medium border-b border-black'
                    : 'text-gray-400 hover:text-black border-b border-transparent'
                }`}
              >
                Workspace
              </button>
              <button
                onClick={() => navTo('/survey')}
                className={`py-0.5 transition-all duration-300 flex items-center gap-1.5 touch-target-auto ${
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
                onClick={() => navTo('/about')}
                className={`py-0.5 transition-all duration-300 touch-target-auto ${
                  location.pathname === '/about'
                    ? 'text-black font-medium border-b border-black'
                    : 'text-gray-400 hover:text-black border-b border-transparent'
                }`}
              >
                About
              </button>
            </nav>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden sm:flex gap-1 text-[13px] uppercase tracking-[0.15em] text-gray-400">
              <button className="px-2 py-1 rounded hover:text-black hover:bg-gray-50 transition-all touch-target-auto">GE</button>
              <span className="text-gray-200/60 self-center">|</span>
              <button className="px-2 py-1 rounded text-black font-medium bg-gray-50 touch-target-auto">EN</button>
            </div>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="sm:hidden w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-50 transition-colors touch-target-auto"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="1.5" strokeLinecap="round">
                  <line x1="4" y1="7" x2="20" y2="7" />
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <line x1="4" y1="17" x2="20" y2="17" />
                </svg>
              )}
            </button>
          </div>
        </header>
      )}

      {/* Mobile dropdown menu */}
      {!isLanding && mobileMenuOpen && (
        <div className="fixed top-11 left-0 right-0 z-[49] sm:hidden animate-fade-in-down safe-top">
          <div className="bg-white/95 backdrop-blur-xl border-b border-gray-100 shadow-lg">
            <nav className="flex flex-col py-2">
              <button
                onClick={() => navTo('/core')}
                className={`px-6 py-3.5 text-left text-[14px] uppercase tracking-[0.2em] transition-colors ${
                  location.pathname === '/core' ? 'text-black font-medium bg-gray-50' : 'text-gray-500 hover:text-black hover:bg-gray-50'
                }`}
              >
                Workspace
              </button>
              <button
                onClick={() => navTo('/survey')}
                className={`px-6 py-3.5 text-left text-[14px] uppercase tracking-[0.2em] transition-colors flex items-center gap-2 ${
                  location.pathname === '/survey' ? 'text-black font-medium bg-gray-50' : 'text-gray-500 hover:text-black hover:bg-gray-50'
                }`}
              >
                Diagnostic
              </button>
              <button
                onClick={() => navTo('/about')}
                className={`px-6 py-3.5 text-left text-[14px] uppercase tracking-[0.2em] transition-colors ${
                  location.pathname === '/about' ? 'text-black font-medium bg-gray-50' : 'text-gray-500 hover:text-black hover:bg-gray-50'
                }`}
              >
                About
              </button>
              <div className="mx-6 my-2 h-px bg-gray-100" />
              <div className="flex gap-2 px-6 py-2">
                <button className="px-3 py-1.5 rounded text-[13px] uppercase tracking-[0.15em] text-gray-400 hover:text-black transition-all">GE</button>
                <button className="px-3 py-1.5 rounded text-[13px] uppercase tracking-[0.15em] text-black font-medium bg-gray-50">EN</button>
              </div>
            </nav>
          </div>
          <div className="h-screen bg-black/10" onClick={() => setMobileMenuOpen(false)} />
        </div>
      )}

      <main
        className={`${isLanding ? 'flex-grow' : 'flex flex-1 flex-col min-h-0 overflow-y-auto overflow-x-hidden pt-11 safe-x'}`}
      >
        <div
          className={`transition-opacity duration-500 ${isLanding ? '' : 'flex-1 flex flex-col min-h-0'} ${mounted ? 'opacity-100' : 'opacity-0'}`}
        >
          {children}
        </div>
      </main>

      {!isLanding && (
        <footer className="h-7 border-t border-gray-100/40 px-3 sm:px-6 md:px-8 flex items-center justify-between text-[10px] sm:text-[11px] text-gray-400/60 tracking-[0.15em] sm:tracking-[0.25em] uppercase bg-white/85 backdrop-blur-sm z-40 safe-bottom">
          <div className="font-light flex items-center gap-2">
            <span>SHRE STUDIO</span>
          </div>
          <div className="font-light flex items-center gap-1 sm:gap-2">
            <span className="hidden sm:inline">Four Element System</span>
            <span className="sm:hidden">4E System</span>
            <span className="text-gray-200/50">·</span>
            <span>2026</span>
          </div>
        </footer>
      )}
    </div>
  );
};

export default Layout;
