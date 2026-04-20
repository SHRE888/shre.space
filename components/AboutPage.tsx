import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const ELEMENTS = [
  { key: 'earth', label: 'EARTH', color: '#8B7355', desc: 'Material weight, texture, permanence' },
  { key: 'fire',  label: 'FIRE',  color: '#C17C4E', desc: 'Warmth, contrast, directional energy' },
  { key: 'water', label: 'WATER', color: '#7A9DAF', desc: 'Flow, transparency, spatial continuity' },
  { key: 'air',   label: 'AIR',   color: '#A0A8B0', desc: 'Lightness, openness, atmospheric depth' },
];

export const AboutPage = () => {
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 60);
    return () => clearTimeout(t);
  }, []);

  const delay = (i: number) => ({ transitionDelay: `${100 + i * 80}ms` });
  const fade = `transition-all duration-[900ms] ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`;

  return (
    <div className="min-h-app-main bg-[#fdfdfd] overflow-y-auto overflow-x-hidden custom-scroll pb-[max(2rem,env(safe-area-inset-bottom,0px))]">
      <div className="max-w-[600px] mx-auto px-4 sm:px-6 md:px-8 pt-10 sm:pt-16 md:pt-24 pb-16 sm:pb-20">

        {/* ── Origin ── */}
        <header className={`mb-16 ${fade}`}>
          <p className="text-[13px] uppercase tracking-[0.5em] text-gray-300 font-medium mb-8">
            SHRE Studio · Platform Engine
          </p>
          <h1 className="text-[28px] sm:text-[33px] md:text-[48px] font-extralight tracking-[-0.01em] text-black leading-[1.3] mb-5">
            Four Element<br />Spatial System
          </h1>
          <div className="w-6 h-px bg-gray-200 mb-5" />
          <p className="text-[13px] leading-[1.9] text-gray-400 font-light max-w-[500px]">
            A platform that gives spatial design a shared, measurable language — 
            where mood, material and atmosphere become one calibrated system.
          </p>
        </header>

        {/* ── The idea ── */}
        <section className={`mb-14 ${fade}`} style={delay(1)}>
          <p className="text-[13px] uppercase tracking-[0.5em] text-gray-300 font-medium mb-4">
            The idea
          </p>
          <p className="text-[13px] leading-[1.9] text-gray-500 font-light font-serif mb-4">
            Design conversations rely on references, mood boards and adjectives 
            that carry different meanings for different people. A client says "warm" — 
            the designer hears something else entirely. Direction gets lost. Decisions shift.
          </p>
          <p className="text-[13px] leading-[1.9] text-gray-500 font-light font-serif">
            This system replaces ambiguity with structure. Both designer and client 
            work inside the same calibrated space — seeing how energy distributes, 
            how it maps to material, and what atmosphere emerges from the balance.
          </p>
        </section>

        {/* ── Framework ── */}
        <section className={`mb-14 ${fade}`} style={delay(2)}>
          <p className="text-[13px] uppercase tracking-[0.5em] text-gray-300 font-medium mb-4">
            Framework
          </p>
          <p className="text-[13px] leading-[1.9] text-gray-500 font-light font-serif mb-6">
            Four elements — Earth, Fire, Water and Air — form the structural 
            language. Not symbolic, not decorative. A precise framework through which 
            character, materiality and atmosphere become readable and adjustable.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {ELEMENTS.map((el) => (
              <div key={el.key} className="px-3.5 py-3.5 border border-gray-100/80 rounded-lg hover:border-gray-200 transition-colors">
                <div className="w-2 h-2 rounded-full mb-2.5 opacity-75" style={{ backgroundColor: el.color }} />
                <p className="text-[13px] uppercase tracking-[0.3em] text-black font-medium mb-1">{el.label}</p>
                <p className="text-[13px] sm:text-[16px] leading-[1.55] text-gray-400 font-light">{el.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── How it works ── */}
        <section className={`mb-14 ${fade}`} style={delay(3)}>
          <p className="text-[13px] uppercase tracking-[0.5em] text-gray-300 font-medium mb-4">
            How it works
          </p>
          <p className="text-[13px] leading-[1.9] text-gray-500 font-light font-serif mb-4">
            A single-screen workspace. At its center — a multi-orbit diagram 
            showing the live balance of all four elements. The orbits rotate like a dial; 
            the total always stays at 100%. Every energy shift automatically 
            redistributes materials and atmosphere.
          </p>
          <p className="text-[13px] leading-[1.9] text-gray-500 font-light font-serif">
            Start from any layer. The system recalculates the rest. 
            The result: one coherent spatial narrative — balance, palette, 
            language, diagnostics and visualization — all connected.
          </p>
        </section>

        {/* ── For whom ── */}
        <section className={`mb-14 ${fade}`} style={delay(4)}>
          <p className="text-[13px] uppercase tracking-[0.5em] text-gray-300 font-medium mb-4">
            For
          </p>
          <div className="flex flex-wrap gap-2">
            {['Architects', 'Interior Designers', 'Clients', 'Design Studios', 'Spatial Consultants'].map(who => (
              <span key={who} className="px-3 py-1.5 border border-gray-100 rounded-md text-[13px] uppercase tracking-[0.15em] text-gray-500 font-light hover:border-gray-200 transition-colors">
                {who}
              </span>
            ))}
          </div>
        </section>

        {/* ── CTA ── */}
        <div className={`text-center py-8 border-t border-gray-100/60 ${fade}`} style={delay(5)}>
          <button
            onClick={() => navigate('/core')}
            className="group relative px-10 py-3.5 border border-gray-200 text-[13px] uppercase tracking-[0.45em] font-medium text-gray-500 hover:border-black hover:text-black active:scale-[0.97] transition-all duration-300 rounded-sm"
          >
            <span className="relative z-10">Open workspace</span>
            <div className="absolute inset-0 bg-black scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left rounded-sm" />
            <span className="absolute inset-0 flex items-center justify-center text-[13px] uppercase tracking-[0.45em] font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity duration-500 delay-100 z-20">
              Open workspace
            </span>
          </button>
        </div>

        {/* ── Author ── */}
        <footer className={`mt-2 pt-7 border-t border-gray-100/40 ${fade}`} style={delay(6)}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] text-black font-normal tracking-[0.03em] leading-snug">
                Iva Mazmanishvili
              </p>
              <p className="text-[13px] text-gray-400 font-light tracking-[0.06em] mt-1">
                Co-Founder &middot; Architect
              </p>
            </div>
            <p className="text-[13px] uppercase tracking-[0.4em] text-gray-300 font-light">
              SHRE Studio
            </p>
          </div>
        </footer>

      </div>
    </div>
  );
};

export default AboutPage;
