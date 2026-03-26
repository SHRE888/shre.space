import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import { whoosh, chime, materialize } from './services/soundService';
import { Layout } from './components/Layout';
import { WorkspacePage } from './components/WorkspacePage';
import { AboutPage } from './components/AboutPage';
import { SpaceGuide } from './components/SpaceGuide';
import { UserState, Element, MaterialDef, GenerationHistoryEntry } from './types';
import { loadState, saveState, clearState } from './services/storageService';
import { calculateAnalysis, buildUniversalPrompt } from './services/promptEngine';
import { generateImageFromPrompt } from './services/geminiService';
import { interpretRefinementFeedback } from './services/refinementFeedback';
import { getInitialSelection, getSelectionFromPercentages } from './services/refinementLogic';
import { SHORT_QUESTIONS, ELEMENT_COLORS, CANONICAL_MATERIALS, MATERIAL_SPHERE_IMAGES, generateSurveyQuestions } from './constants';

// --- LANDING PAGE ---
const Landing = () => {
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="h-screen bg-[#fafafa] select-none overflow-hidden relative flex flex-col items-center justify-center">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-gradient-to-br from-gray-100/30 via-transparent to-transparent blur-3xl" />
      </div>

      {/* Top — SHRE branding, centered */}
      <div className={`absolute top-8 left-1/2 -translate-x-1/2 z-10 text-center transition-all duration-700 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}`}>
        <p className="text-[13px] uppercase tracking-[0.6em] font-medium" style={{ color: '#b0b0b0' }}>
          SHRE ENGINE
        </p>
        <p className="text-[11px] uppercase tracking-[0.35em] font-light mt-1" style={{ color: '#c0c0c0' }}>
          Spatial Calibration Platform
        </p>
      </div>

      {/* Top-right — About link */}
      <div className={`absolute top-8 right-10 z-10 transition-all duration-700 ease-out ${mounted ? 'opacity-100' : 'opacity-0'}`} style={{ transitionDelay: '400ms' }}>
        <button
          onClick={() => navigate('/about')}
          className="text-[13px] uppercase tracking-[0.3em] font-light hover:text-gray-700 transition-colors duration-300"
          style={{ color: '#b0b0b0' }}
        >
          About
        </button>
      </div>

      {/* Center — Hero text, full width centered */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center w-full px-6">
        <h1
          className={`uppercase leading-[1.05] transition-all duration-[1.2s] ease-out text-center ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
          style={{
            fontSize: 'clamp(34px, 6.5vw, 82px)',
            fontWeight: 300,
            letterSpacing: '0.32em',
            fontFamily: "'IBM Plex Sans', 'Inter', system-ui, sans-serif",
            color: '#2A2A2A',
            transitionDelay: '100ms',
          }}
        >
          CREATE YOUR<br/>ATMOSPHERE
        </h1>

        <div
          className={`mt-8 flex items-center justify-center gap-6 transition-all duration-700 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}
          style={{ transitionDelay: '350ms' }}
        >
          <div className="w-10 h-px" style={{ background: '#d0d0d0' }} />
          <p className="text-[13px] tracking-[0.25em] font-light uppercase" style={{ color: '#a0a0a0' }}>
            Four elements · One spatial language
          </p>
          <div className="w-10 h-px" style={{ background: '#d0d0d0' }} />
        </div>

        <div
          className={`mt-12 transition-all duration-700 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}
          style={{ transitionDelay: '500ms' }}
        >
          <button
            onClick={() => { whoosh(); clearState(); sessionStorage.removeItem('shre_welcome_shown'); navigate('/survey'); }}
            className="px-16 py-5 text-[16px] uppercase tracking-[0.5em] font-medium transition-all duration-500 ease-out hover:tracking-[0.6em] active:scale-[0.97] rounded-full"
            style={{
              background: '#1a1a1a',
              color: '#fafafa',
              boxShadow: '0 4px 20px rgba(0,0,0,0.15), 0 0 40px rgba(0,0,0,0.04)',
              border: 'none',
            }}
          >
            Start
          </button>
        </div>
      </div>

      {/* Bottom center — Studio credit */}
      <div className={`absolute bottom-8 left-1/2 -translate-x-1/2 z-10 text-center transition-all duration-700 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`} style={{ transitionDelay: '600ms' }}>
        <p className="text-[11px] uppercase tracking-[0.3em] font-light" style={{ color: '#c0c0c0' }}>
          SHRE Studio · 2025
        </p>
      </div>
    </div>
  );
};

// --- SURVEY PAGE (Visual Calibration) ---
const Survey = ({ state, setState }: { state: UserState; setState: (s: UserState) => void }) => {
  const [questions] = useState(() => generateSurveyQuestions());
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [transitioning, setTransitioning] = useState(false);
  const [hoveredOption, setHoveredOption] = useState<number | null>(null);
  const [imagesLoaded, setImagesLoaded] = useState<Record<string, boolean>>({});
  const [showResult, setShowResult] = useState(false);
  const [completedState, setCompletedState] = useState<UserState | null>(null);
  const navigate = useNavigate();

  // Preload next question's images
  useEffect(() => {
    const nextQ = questions[qIndex + 1];
    if (!nextQ) return;
    nextQ.options.forEach(opt => {
      if (opt.image) {
        const img = new Image();
        img.src = opt.image;
      }
    });
  }, [qIndex, questions]);

  const finalizeSurvey = (surveyAnswers: Record<string, number>) => {
    const updatedState: UserState = {
      ...state,
      shortSurveyAnswers: surveyAnswers,
      shortSurveySkipped: false,
    };
    const analysis = calculateAnalysis(updatedState);
    const proportionalItems = getSelectionFromPercentages(analysis.percentages);
    const finalState: UserState = {
      ...updatedState,
      analysis,
      refinement: {
        isActive: true,
        hasUserRefined: false,
        refinedPercentages: analysis.percentages,
        selectedAdjectives: proportionalItems.adjectives,
        selectedMaterials: proportionalItems.materials,
      },
    };
    setState(finalState);
    saveState(finalState);
    return finalState;
  };

  const handleAnswer = (answerIdx: number) => {
    chime();
    const qId = questions[qIndex].id;
    const newAnswers = { ...answers, [qId]: answerIdx };
    setAnswers(newAnswers);

    if (qIndex < questions.length - 1) {
      setTransitioning(true);
      setTimeout(() => {
        setQIndex(qIndex + 1);
        setHoveredOption(null);
        setTransitioning(false);
      }, 400);
    } else {
      const fs = finalizeSurvey(newAnswers);
      setCompletedState(fs);
      setShowResult(true);
    }
  };

  const q = questions[qIndex];
  const progress = ((qIndex + 1) / questions.length) * 100;
  const lastQ = questions[3];
  const isSeasonsQ = lastQ?.text?.toLowerCase().includes('season') || lastQ?.text?.toLowerCase().includes('time of year');
  const stepLabels = ['Landscape', 'Material', 'Interior', isSeasonsQ ? 'Season' : 'Architecture'];

  const ENERGY_HEADLINES: Record<Element, string[]> = {
    earth: ['Grounded Raw Warmth', 'Rooted Natural Craft', 'Textured Earth Living'],
    fire: ['Oxidized Warmth Drama', 'Moody Cinematic Luxury', 'Dark Material Intensity'],
    water: ['Liquid Chrome Immersion', 'Reflective Fluid Luxury', 'Sculptural Metal Flow'],
    air: ['Futuristic Ethereal Light', 'Iridescent Forward Vision', 'Cosmic Translucent Clarity'],
  };

  useEffect(() => {
    if (!showResult) return;
    const t = setTimeout(() => { whoosh(); navigate('/core'); }, 2800);
    return () => clearTimeout(t);
  }, [showResult, navigate]);

  if (showResult) {
    const dist = completedState?.analysis?.percentages || { earth: 25, fire: 25, water: 25, air: 25 };
    const sorted = (Object.entries(dist) as [Element, number][]).sort((a, b) => b[1] - a[1]);
    const domEl = sorted[0][0];
    const domColor = ELEMENT_COLORS[domEl];
    const headline = ENERGY_HEADLINES[domEl][Math.floor(Math.random() * 3)];
    const total = sorted.reduce((s, [, v]) => s + v, 0);
    return (
      <div className="min-h-[calc(100vh-92px)] flex flex-col items-center justify-center bg-[#fafafa] px-6">
        <style>{`
          @keyframes resultFadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
          @keyframes barGrow{from{width:0}to{width:var(--bar-w)}}
          @keyframes ringPulse{0%,100%{box-shadow:0 0 0 0 var(--ring-c)}50%{box-shadow:0 0 0 12px transparent}}
          @keyframes dotScale{from{transform:scale(0)}to{transform:scale(1)}}
        `}</style>
        <div className="max-w-sm w-full text-center" style={{ animation: 'resultFadeIn 0.6s ease-out' }}>
          {/* Dominant element ring */}
          <div className="w-20 h-20 rounded-full mx-auto mb-5 flex items-center justify-center"
            style={{
              background: `conic-gradient(${sorted.map(([el, val], i) => {
                const start = sorted.slice(0, i).reduce((s, [, v]) => s + (v / total) * 360, 0);
                const end = start + (val / total) * 360;
                return `${ELEMENT_COLORS[el]} ${start}deg ${end}deg`;
              }).join(', ')})`,
              boxShadow: `0 0 30px ${domColor}30`,
              animation: 'ringPulse 2s ease-in-out infinite',
              ['--ring-c' as string]: `${domColor}25`,
            }}>
            <div className="w-14 h-14 rounded-full bg-[#fafafa] flex items-center justify-center">
              <span className="text-[22px] font-light tracking-wide" style={{ color: domColor }}>
                {Math.round(sorted[0][1])}%
              </span>
            </div>
          </div>

          {/* 3-word headline */}
          <h2 className="text-[20px] font-light tracking-[0.12em] mb-1" style={{ color: domColor, animation: 'resultFadeIn 0.6s ease-out 0.15s both' }}>
            {headline}
          </h2>
          <p className="text-[11px] uppercase tracking-[0.35em] text-gray-400 font-light mb-6" style={{ animation: 'resultFadeIn 0.6s ease-out 0.25s both' }}>
            Your Energy Profile
          </p>

          {/* Percentage bars */}
          <div className="space-y-2.5 mb-6 text-left" style={{ animation: 'resultFadeIn 0.5s ease-out 0.35s both' }}>
            {sorted.map(([el, val], i) => {
              const pct = (val / total) * 100;
              return (
                <div key={el} className="flex items-center gap-3">
                  <span className="text-[11px] uppercase tracking-[0.15em] w-12 text-right font-medium" style={{ color: ELEMENT_COLORS[el], opacity: i === 0 ? 1 : 0.6 }}>
                    {el.slice(0, 5)}
                  </span>
                  <div className="flex-1 h-[6px] rounded-full overflow-hidden" style={{ background: `${ELEMENT_COLORS[el]}10` }}>
                    <div className="h-full rounded-full" style={{
                      ['--bar-w' as string]: `${pct}%`,
                      width: `${pct}%`,
                      background: `linear-gradient(90deg, ${ELEMENT_COLORS[el]}${i === 0 ? 'cc' : '55'}, ${ELEMENT_COLORS[el]}${i === 0 ? '' : '88'})`,
                      animation: `barGrow 0.8s ease-out ${0.5 + i * 0.12}s both`,
                    }} />
                  </div>
                  <span className="text-[12px] font-mono tabular-nums w-9 text-right" style={{ color: ELEMENT_COLORS[el], fontWeight: i === 0 ? 700 : 400, opacity: i === 0 ? 1 : 0.55 }}>
                    {Math.round(val)}%
                  </span>
                </div>
              );
            })}
          </div>

          {/* Auto-redirect indicator */}
          <div className="flex items-center justify-center gap-2" style={{ animation: 'resultFadeIn 0.4s ease-out 0.8s both' }}>
            <div className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: domColor }} />
            <span className="text-[10px] uppercase tracking-[0.3em] text-gray-400 font-light">entering workspace</span>
            <div className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: domColor, animationDelay: '0.3s' }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-92px)] flex flex-col bg-[#fafafa]">
      {/* Numbered step progress */}
      <div className="pt-6 pb-4 px-4">
        <div className="max-w-md mx-auto flex items-center justify-between">
          {stepLabels.map((label, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5 relative" style={{ flex: 1 }}>
              {i > 0 && (
                <div className="absolute top-[14px] right-1/2 w-full h-[1.5px]"
                  style={{ background: qIndex > i - 1 ? '#1a1a1a' : '#e5e5e5', transition: 'background 0.4s ease' }} />
              )}
              <div className="relative z-10 flex items-center justify-center rounded-full transition-all duration-400"
                style={{
                  width: 28, height: 28,
                  background: qIndex > i ? '#1a1a1a' : qIndex === i ? '#1a1a1a' : '#fff',
                  border: qIndex >= i ? '2px solid #1a1a1a' : '2px solid #d4d4d4',
                  color: qIndex >= i ? '#fff' : '#aaa',
                  fontSize: '12px', fontWeight: 600,
                }}>
                {qIndex > i ? (
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 8.5 L6.5 12 L13 4" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span className="text-[10px] uppercase tracking-[0.15em] font-medium transition-colors duration-300"
                style={{ color: qIndex >= i ? '#1a1a1a' : '#b0b0b0' }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Question + visual grid — full page */}
      <div className="flex-grow flex items-center justify-center px-4 sm:px-8 py-4">
        <div className="max-w-5xl w-full">
          <div className={`transition-all duration-400 ease-out ${transitioning ? 'opacity-0 translate-y-3 scale-[0.98]' : 'opacity-100 translate-y-0 scale-100'}`}>
            {/* Question text */}
            <div className="text-center mb-8">
              <h2 className="text-2xl sm:text-3xl font-light tracking-tight text-black leading-snug">
                {q.text}
              </h2>
              {q.subtitle && (
                <p className="mt-3 text-[16px] uppercase tracking-[0.35em] text-gray-300 font-light">
                  {q.subtitle}
                </p>
              )}
            </div>

            {/* Visual image grid — 2×2, compact */}
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3 max-w-2xl mx-auto">
              {q.options.map((opt, i) => {
                const isSelected = answers[q.id] === i;
                const isHovered = hoveredOption === i;
                const imgKey = `${q.id}-${i}`;
                const loaded = imagesLoaded[imgKey];

                return (
                  <button
                    key={i}
                    onClick={() => handleAnswer(i)}
                    onMouseEnter={() => setHoveredOption(i)}
                    onMouseLeave={() => setHoveredOption(null)}
                    className="group relative overflow-hidden rounded-xl focus:outline-none"
                    style={{
                      aspectRatio: '4/3',
                      border: isSelected ? '3px solid #1a1a1a' : '1px solid rgba(0,0,0,0.06)',
                      boxShadow: isSelected
                        ? '0 8px 30px rgba(0,0,0,0.2)'
                        : isHovered
                        ? '0 12px 40px rgba(0,0,0,0.12)'
                        : '0 2px 12px rgba(0,0,0,0.04)',
                      transform: isSelected
                        ? 'scale(1.02)'
                        : isHovered
                        ? 'scale(1.015) translateY(-2px)'
                        : 'scale(1)',
                      transition: 'all 0.35s cubic-bezier(0.22,0.61,0.36,1)',
                    }}
                  >
                    {/* Skeleton loader */}
                    {!loaded && (
                      <div className="absolute inset-0 bg-gray-100 animate-pulse" />
                    )}

                    {/* Image */}
                    {opt.image && (
                      <img
                        src={opt.image}
                        alt={opt.text}
                        loading={qIndex === 0 ? 'eager' : 'lazy'}
                        onLoad={() => setImagesLoaded(prev => ({ ...prev, [imgKey]: true }))}
                        className="absolute inset-0 w-full h-full object-cover"
                        style={{
                          opacity: loaded ? 1 : 0,
                          transition: 'opacity 0.5s ease, filter 0.4s ease',
                          filter: isSelected ? 'brightness(0.7)' : isHovered ? 'brightness(0.85)' : 'brightness(0.95)',
                        }}
                      />
                    )}

                    {/* Gradient overlay */}
                    <div
                      className="absolute inset-0"
                      style={{
                        background: isSelected
                          ? 'linear-gradient(180deg, transparent 30%, rgba(0,0,0,0.65) 100%)'
                          : 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.45) 100%)',
                        transition: 'background 0.3s ease',
                      }}
                    />

                    {/* Selection indicator */}
                    {isSelected && (
                      <div className="absolute top-2.5 right-2.5 w-6 h-6 rounded-full bg-white flex items-center justify-center"
                        style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                          <path d="M5 13l4 4L19 7" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    )}

                    {/* Label */}
                    <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4">
                      <span
                        className="block text-white font-medium tracking-wide"
                        style={{
                          fontSize: isSelected ? '13px' : '11px',
                          letterSpacing: '0.1em',
                          textShadow: '0 1px 6px rgba(0,0,0,0.5)',
                          transition: 'font-size 0.3s ease',
                          textTransform: 'uppercase',
                        }}
                      >
                        {opt.text}
                      </span>
                    </div>

                    {/* Hover ring */}
                    {isHovered && !isSelected && (
                      <div
                        className="absolute inset-0 rounded-xl"
                        style={{
                          border: '2px solid rgba(255,255,255,0.4)',
                          pointerEvents: 'none',
                        }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bottom actions */}
          <div className="mt-6 flex flex-col items-center gap-3">
            <button
              onClick={() => { chime(); navigate('/core'); setTimeout(() => window.dispatchEvent(new Event('toggle-deep-dive')), 500); }}
              className="flex items-center gap-2.5 px-6 py-2.5 rounded-full transition-all duration-300 hover:bg-gray-100 active:scale-[0.97] group"
              style={{ border: '1.5px solid rgba(0,0,0,0.12)' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5" strokeLinecap="round" className="opacity-70 group-hover:opacity-100 transition-opacity">
                <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4" fill="#555" fillOpacity="0.15"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>
              </svg>
              <span className="text-[13px] uppercase tracking-[0.25em] font-medium text-gray-600 group-hover:text-black transition-colors">
                Deep Dive Test
              </span>
            </button>
            <button
              onClick={() => navigate('/core')}
              className="text-[11px] uppercase tracking-[0.35em] text-gray-300 hover:text-gray-500 font-light transition-colors"
            >
              Skip to workspace
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- TEXTURE MAP: high-quality Unsplash textures for each material ---
const MATERIAL_TEXTURES: Record<string, { url: string; alt: string }> = {
  'Travertine (honed)':           { url: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=400&h=400&fit=crop&q=80', alt: 'Honed travertine stone surface' },
  'Dark quartzite':               { url: 'https://images.unsplash.com/photo-1474044159687-1ee9f3a51722?w=400&h=400&fit=crop&q=80', alt: 'Dark quartzite stone surface' },
  'Clay plaster':                 { url: 'https://images.unsplash.com/photo-1615529328331-f8917597711f?w=400&h=400&fit=crop&q=80', alt: 'Clay plaster warm tones' },
  'Lime plaster (warm mineral)':  { url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=400&h=400&fit=crop&q=80', alt: 'Lime plaster warm mineral' },
  'Dark marble (high contrast)':   { url: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=400&h=400&fit=crop&q=80', alt: 'Dark marble surface' },
  'Basalt':                       { url: 'https://images.unsplash.com/photo-1545558014-8692077e9b5c?w=400&h=400&fit=crop&q=80', alt: 'Dark basalt stone' },
  'Blackened steel':               { url: 'https://images.unsplash.com/photo-1533035353720-f1c6a75cd8ab?w=400&h=400&fit=crop&q=80', alt: 'Blackened steel surface' },
  'Venetian plaster (polished)':   { url: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=400&h=400&fit=crop&q=80', alt: 'Polished venetian plaster' },
  'Bronze accents':                { url: 'https://images.unsplash.com/photo-1618424181497-157f25b6ddd5?w=400&h=400&fit=crop&q=80', alt: 'Bronze metal accents' },
  'Microcement (continuous)':      { url: 'https://images.unsplash.com/photo-1553356084-58ef4a67b2a7?w=400&h=400&fit=crop&q=80', alt: 'Smooth microcement floor' },
  'Smooth mineral plaster':       { url: 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=400&h=400&fit=crop&q=80', alt: 'Smooth mineral plaster wall' },
  'Matte ceramic':                { url: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=400&h=400&fit=crop&q=80', alt: 'Matte ceramic tiles' },
  'Linen / wool textile surfaces':{ url: 'https://images.unsplash.com/photo-1558171813-4c088753af8f?w=400&h=400&fit=crop&q=80', alt: 'Linen wool textile' },
  'Diffused glass':                { url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&h=400&fit=crop&q=80', alt: 'Diffused frosted glass' },
  'Limewash (bright)':            { url: 'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=400&h=400&fit=crop&q=80', alt: 'Bright limewash wall' },
  'White mineral plaster':        { url: 'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=400&h=400&fit=crop&q=80', alt: 'White mineral plaster' },
  'Light oak / ash':              { url: 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=400&h=400&fit=crop&q=80', alt: 'Light oak ash wood' },
  'White marble (Calacatta)':     { url: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=400&h=400&fit=crop&q=80', alt: 'White Calacatta marble surface' },
  'Clear glass (low-iron)':       { url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&h=400&fit=crop&q=80', alt: 'Clear low-iron glass' },
  'Bleached birch':               { url: 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=400&h=400&fit=crop&q=80', alt: 'Bleached birch wood' },
  'White terrazzo':                { url: 'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=400&h=400&fit=crop&q=80', alt: 'White terrazzo surface' },
  'Pale concrete (smooth)':       { url: 'https://images.unsplash.com/photo-1617791160505-6f00504e3519?w=400&h=400&fit=crop&q=80', alt: 'Pale smooth concrete' },
  'Textured concrete (matte)':    { url: 'https://images.unsplash.com/photo-1617791160505-6f00504e3519?w=400&h=400&fit=crop&q=80', alt: 'Textured concrete surface' },
  'Brushed metal':                { url: 'https://images.unsplash.com/photo-1533035353720-f1c6a75cd8ab?w=400&h=400&fit=crop&q=80', alt: 'Brushed metal texture' },
  'Solid oak':                    { url: 'https://images.unsplash.com/photo-1541123603104-512919d6a96c?w=400&h=400&fit=crop&q=80', alt: 'Solid oak grain' },
  'Walnut (natural finish)':       { url: 'https://images.unsplash.com/photo-1541123603104-512919d6a96c?w=400&h=400&fit=crop&q=80', alt: 'Natural walnut wood' },
  'Natural oak (horizontal)':     { url: 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=400&h=400&fit=crop&q=80', alt: 'Natural oak horizontal grain' },
  'Walnut veneer':                { url: 'https://images.unsplash.com/photo-1541123603104-512919d6a96c?w=400&h=400&fit=crop&q=80', alt: 'Walnut veneer surface' },
  'Industrial brick':             { url: 'https://images.unsplash.com/photo-1587582345426-bf07f52b4543?w=400&h=400&fit=crop&q=80', alt: 'Industrial red brick wall' },
  'Natural Oak':                  { url: 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=400&h=400&fit=crop&q=80', alt: 'Natural oak surface' },
  'Walnut':                       { url: 'https://images.unsplash.com/photo-1541123603104-512919d6a96c?w=400&h=400&fit=crop&q=80', alt: 'Walnut wood' },
  'Limestone':                    { url: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=400&h=400&fit=crop&q=80', alt: 'Limestone surface' },
  'Travertine':                   { url: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=400&h=400&fit=crop&q=80', alt: 'Travertine stone' },
  'Clay Plaster':                 { url: 'https://images.unsplash.com/photo-1615529328331-f8917597711f?w=400&h=400&fit=crop&q=80', alt: 'Clay plaster texture' },
  'Microcement':                  { url: 'https://images.unsplash.com/photo-1553356084-58ef4a67b2a7?w=400&h=400&fit=crop&q=80', alt: 'Microcement finish' },
};

// Element descriptors for the DNA sidebar
const ELEMENT_DESCRIPTORS: Record<Element, string> = {
  earth: 'Grounding & Tactile',
  fire:  'Warmth & Activation',
  water: 'Fluidity & Calm',
  air:   'Clarity & Lightness',
};

// Hotspot zones — architecturally anchored to where each element appears
// in a standard interior visualization (eye-level perspective)
type HotspotZone = {
  id: string;
  label: string;
  labelGe: string;
  category: 'flooring' | 'wall' | 'stone' | 'furniture' | 'seating' | 'lighting' | 'textile' | 'metal' | 'decor';
  x: number;
  y: number;
  materialMatch: string[];
  icon: string;
};

const IMAGE_HOTSPOTS: HotspotZone[] = [
  { id: 'floor',     label: 'Floor',      labelGe: 'იატაკი',      category: 'flooring',  x: 25, y: 88, icon: '▭', materialMatch: ['Travertine (honed)', 'White marble (Calacatta)', 'White terrazzo', 'Microcement (continuous)', 'Matte ceramic', 'Solid oak', 'Textured concrete (matte)', 'Board-formed concrete', 'Volcanic stone (basalt rough)', 'Herringbone parquet (warm oak)', 'Dark herringbone parquet', 'Basalt', 'Dark quartzite'] },
  { id: 'wall',      label: 'Wall',       labelGe: 'კედელი',      category: 'wall',      x: 8,  y: 40, icon: '▯', materialMatch: ['Clay plaster', 'Lime plaster (warm mineral)', 'Smooth mineral plaster', 'White mineral plaster', 'Limewash (bright)', 'Textured concrete (matte)', 'Board-formed concrete', 'Corten steel (weathering)', 'Rammed earth / terracotta plaster', 'Reclaimed weathered timber', 'Fluted white panel', '3D textured white panel', 'Tinted translucent glass'] },
  { id: 'furniture', label: 'Furniture',  labelGe: 'ავეჯი',       category: 'furniture', x: 38, y: 62, icon: '◫', materialMatch: ['Solid oak', 'Walnut (natural finish)', 'Bronze accents', 'Linen / wool textile surfaces', 'Light oak / ash', 'White Corian (curved seamless)', 'Metallic silver surface'] },
  { id: 'seating',   label: 'Seating',    labelGe: 'სკამი',       category: 'seating',   x: 55, y: 68, icon: '◰', materialMatch: ['Linen / wool textile surfaces', 'Solid oak', 'Walnut (natural finish)', 'Light oak / ash'] },
  { id: 'lighting',  label: 'Lighting',   labelGe: 'განათება',     category: 'lighting',  x: 35, y: 10, icon: '◎', materialMatch: ['Bronze accents', 'Brushed metal', 'Diffused glass', 'Curved bent glass', 'Satin chrome'] },
  { id: 'stone',     label: 'Stone',      labelGe: 'ქვა',         category: 'stone',     x: 72, y: 55, icon: '◆', materialMatch: ['White marble (Calacatta)', 'Travertine (honed)', 'Dark quartzite', 'Dark marble (high contrast)', 'Basalt', 'Textured concrete (matte)', 'Glass blocks (translucent)', 'Green onyx / marble (veined)', 'Volcanic stone (basalt rough)'] },
  { id: 'textile',   label: 'Textile',    labelGe: 'ტექსტილი',    category: 'textile',   x: 48, y: 52, icon: '◈', materialMatch: ['Linen / wool textile surfaces'] },
  { id: 'metal',     label: 'Accents',    labelGe: 'აქსესუარი',   category: 'metal',     x: 88, y: 35, icon: '◇', materialMatch: ['Blackened steel', 'Brushed metal', 'Bronze accents', 'Mirror-polished stainless steel', 'Hammered metal (rippled)', 'Satin chrome', 'Corten steel (weathering)', 'Oxidized copper', 'Aged brass (polished)', 'Metallic silver surface'] },
  { id: 'decor',     label: 'Decor',      labelGe: 'დეკორი',      category: 'decor',     x: 65, y: 38, icon: '✦', materialMatch: ['Dichroic / iridescent glass', 'Tinted translucent glass'] },
];

// Brand/company catalog — keyed by category
type BrandInfo = {
  id: string;
  name: string;
  category: HotspotZone['category'];
  specialty: string;
  url: string;
  logo?: string;
};

const BRAND_CATALOG: BrandInfo[] = [
  { id: 'boen',       name: 'Boen',           category: 'flooring',  specialty: 'Engineered Hardwood',    url: 'https://www.boen.com' },
  { id: 'kährs',      name: 'Kährs',          category: 'flooring',  specialty: 'Premium Wood Floors',    url: 'https://www.kahrs.com' },
  { id: 'mutina',     name: 'Mutina',         category: 'flooring',  specialty: 'Designer Tiles',         url: 'https://www.mutina.it' },
  { id: 'salvatori',  name: 'Salvatori',      category: 'stone',     specialty: 'Natural Stone',          url: 'https://www.salvatori.it' },
  { id: 'poliform',   name: 'Poliform',       category: 'furniture', specialty: 'Contemporary Systems',   url: 'https://www.poliform.it' },
  { id: 'minotti',    name: 'Minotti',        category: 'furniture', specialty: 'Italian Luxury',         url: 'https://www.minotti.com' },
  { id: 'bbitalia',   name: 'B&B Italia',     category: 'furniture', specialty: 'Modern Design Icons',    url: 'https://www.bebitalia.com' },
  { id: 'vitra',      name: 'Vitra',          category: 'furniture', specialty: 'Swiss Design Classics',  url: 'https://www.vitra.com' },
  { id: 'cassina',    name: 'Cassina',        category: 'seating',   specialty: 'Iconic Seating',         url: 'https://www.cassina.com' },
  { id: 'molteni',    name: 'Molteni&C',      category: 'seating',   specialty: 'Living Systems',         url: 'https://www.molteni.it' },
  { id: 'baxter',     name: 'Baxter',         category: 'seating',   specialty: 'Leather & Fabric',       url: 'https://www.bafranco.it' },
  { id: 'flos',       name: 'Flos',           category: 'lighting',  specialty: 'Architectural Lighting', url: 'https://www.flos.com' },
  { id: 'artemide',   name: 'Artemide',       category: 'lighting',  specialty: 'Design Luminaires',      url: 'https://www.artemide.com' },
  { id: 'vibia',      name: 'Vibia',          category: 'lighting',  specialty: 'Ambient Systems',        url: 'https://www.vibia.com' },
  { id: 'kvadrat',    name: 'Kvadrat',        category: 'textile',   specialty: 'Premium Textiles',       url: 'https://www.kvadrat.dk' },
  { id: 'fantini',    name: 'Fantini',        category: 'metal',     specialty: 'Designer Fittings',      url: 'https://www.fantini.it' },
  { id: 'dornbracht', name: 'Dornbracht',     category: 'metal',     specialty: 'Precision Hardware',     url: 'https://www.dornbracht.com' },
  { id: 'menu',       name: 'Menu/Audo',      category: 'decor',     specialty: 'Curated Objects',        url: 'https://www.menudesignshop.com' },
  { id: 'ferm',       name: 'Ferm Living',    category: 'decor',     specialty: 'Scandinavian Decor',     url: 'https://www.fermliving.com' },
  { id: 'aesop',      name: 'Aesop',          category: 'decor',     specialty: 'Lifestyle Objects',      url: 'https://www.aesop.com' },
];

// Category display config
// --- RESULTS VIEW ---
const ResultsView = ({ state, setState }: { state: UserState; setState: React.Dispatch<React.SetStateAction<UserState>> }) => {
  const navigate = useNavigate();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [story, setStory] = useState('');
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<'generating' | 'revealing' | 'complete'>('generating');
  const [loadProgress, setLoadProgress] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [hoveredHotspot, setHoveredHotspot] = useState<string | null>(null);
  const [hoveredBrand, setHoveredBrand] = useState<string | null>(null);
  const [activeHotspot, setActiveHotspot] = useState<string | null>(null);
  const [materialPickerOpen, setMaterialPickerOpen] = useState(false);
  const [materialsChanged, setMaterialsChanged] = useState(false);
  const [pctEditOpen, setPctEditOpen] = useState(false);
  const [generationKey, setGenerationKey] = useState(0);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [refinementInput, setRefinementInput] = useState('');
  const [refinementMessage, setRefinementMessage] = useState<string | null>(null);
  const [savedDirection, setSavedDirection] = useState<string | null>(null);
  const [directionPhoto, setDirectionPhoto] = useState<File | null>(null);
  const [directionPhotoPreview, setDirectionPhotoPreview] = useState<string | null>(null);
  const directionPhotoRef = React.useRef<HTMLInputElement>(null);
  const [selectedHistoryImage, setSelectedHistoryImage] = useState<string | null>(null);
  const refinementFeedbackRef = React.useRef<string | null>(null);

  const displayedImageUrl = selectedHistoryImage ?? imageUrl;
  const isEditingMaterials = materialPickerOpen || materialsChanged;

  React.useEffect(() => {
    setImageLoaded(false);
  }, [displayedImageUrl]);

  const liveDist = state.refinement.refinedPercentages || state.analysis?.percentages || { earth: 25, fire: 25, water: 25, air: 25 };
  const liveSortedElements = (Object.entries(liveDist) as [Element, number][]).sort((a, b) => b[1] - a[1]);
  const liveDominant = liveSortedElements[0][0];

  const liveSelectedMaterials = state.refinement.selectedMaterials || [];
  const liveSelectedAtmosphere = state.refinement.selectedAdjectives || [];

  const removeMaterial = (matName: string) => {
    setSelectedHistoryImage(null);
    const newMats = liveSelectedMaterials.filter(m => m.name !== matName);
    setState(prev => ({
      ...prev,
      refinement: { ...prev.refinement, selectedMaterials: newMats },
    }));
    setMaterialsChanged(true);
  };

  const addMaterial = (matName: string, element: Element) => {
    setSelectedHistoryImage(null);
    if (liveSelectedMaterials.some(m => m.name === matName)) return;
    const matDef: MaterialDef = {
      id: matName.toLowerCase().replace(/ /g, '-'),
      name: matName,
      element,
      isShared: false,
      elementWeights: { earth: 0, fire: 0, water: 0, air: 0, [element]: 1 },
    };
    const MAX = 7;
    let newMats = [...liveSelectedMaterials];
    if (newMats.length >= MAX) {
      const sameElIdx = newMats.findIndex(m => m.element === element);
      newMats.splice(sameElIdx >= 0 ? sameElIdx : newMats.length - 1, 1);
    }
    newMats.push(matDef);
    setState(prev => ({
      ...prev,
      refinement: { ...prev.refinement, selectedMaterials: newMats },
    }));
    setMaterialsChanged(true);
  };

  const similarReferences = React.useMemo(() => {
    const combo = `${liveDominant}-${liveSortedElements[1]?.[0] || liveDominant}`;
    const fromHistory = [...(state.generationHistory || [])];
    const items: GenerationHistoryEntry[] = [...fromHistory];
    if (imageUrl && phase === 'complete' && !items.some(i => i.imageUrl === imageUrl)) {
      items.unshift({
        id: 'current', imageUrl, combinationKey: combo,
        dominant: liveDominant, secondary: liveSortedElements[1]?.[0] || liveDominant,
        dist: { ...liveDist },
        spaceCategory: state.params.category || 'Living / Residential',
        domain: state.params.domain || 'interior',
        areaM2: state.params.squareMeters,
        timestamp: Date.now(),
        materials: liveSelectedMaterials.map(m => ({ name: m.name, element: m.element })),
        adjectives: liveSelectedAtmosphere.map(a => ({ label: a.label, element: a.element })),
        concept: `${liveDominant}-dominant (${Math.round(liveDist[liveDominant])}%) ${state.params.category || 'Living / Residential'} · ${state.params.squareMeters || 120}m²`,
        rooms: state.params.rooms || [],
      });
    }
    return items;
  }, [state.generationHistory, liveDominant, liveSortedElements, imageUrl, phase, liveDist, state.params, liveSelectedMaterials, liveSelectedAtmosphere]);

  const activeHistoryEntry = React.useMemo<GenerationHistoryEntry | null>(() => {
    if (!selectedHistoryImage) return null;
    return similarReferences.find(r => r.imageUrl === selectedHistoryImage) || null;
  }, [selectedHistoryImage, similarReferences]);

  const dist = activeHistoryEntry?.dist ?? liveDist;
  const sortedElements = React.useMemo(() =>
    (Object.entries(dist) as [Element, number][]).sort((a, b) => b[1] - a[1]),
    [dist]
  );
  const dominant = sortedElements[0][0];
  const domColor = ELEMENT_COLORS[dominant];

  const selectedMaterials: { name: string; element: Element }[] = activeHistoryEntry?.materials ?? liveSelectedMaterials;
  const selectedAtmosphere: { label: string; element: Element }[] = activeHistoryEntry?.adjectives ?? liveSelectedAtmosphere;

  // Build DNA materials
  const dnaMaterials = React.useMemo(() => {
    const mats = [...selectedMaterials];
    if (mats.length < 3) {
      const MATERIALS_BY_ELEMENT: Record<Element, string[]> = {
        earth: ['Travertine (honed)', 'Clay plaster', 'Lime plaster (warm mineral)', 'Natural oak (horizontal)', 'Walnut veneer', 'Industrial brick', 'Board-formed concrete', 'Volcanic stone (basalt rough)', 'Green onyx / marble (veined)', 'Rammed earth / terracotta plaster', 'Reclaimed weathered timber', 'Herringbone parquet (warm oak)'],
        fire: ['Dark quartzite', 'Basalt', 'Blackened steel', 'Venetian plaster (polished)', 'Bronze accents', 'Dark marble (high contrast)', 'Corten steel (weathering)', 'Oxidized copper', 'Aged brass (polished)', 'Dark herringbone parquet'],
        water: ['Microcement (continuous)', 'Smooth mineral plaster', 'Matte ceramic', 'Linen / wool textile surfaces', 'Diffused glass', 'Mirror-polished stainless steel', 'Hammered metal (rippled)', 'Satin chrome', 'Glass blocks (translucent)', 'Curved bent glass'],
        air: ['Limewash (bright)', 'White mineral plaster', 'Light oak / ash', 'White marble (Calacatta)', 'Clear glass (low-iron)', 'Dichroic / iridescent glass', 'Tinted translucent glass', 'White terrazzo', 'Metallic silver surface', 'White Corian (curved seamless)', 'Fluted white panel', '3D textured white panel'],
      };
      const selectedNames = new Set(mats.map(m => m.name));
      for (const [el] of sortedElements) {
        if (mats.length >= 6) break;
        const pool = MATERIALS_BY_ELEMENT[el].filter(n => !selectedNames.has(n));
        const count = Math.max(1, Math.round((dist[el] / 100) * 4));
        for (let i = 0; i < count && mats.length < 6; i++) {
          if (pool[i]) {
            mats.push({ id: pool[i].toLowerCase().replace(/ /g, '-'), name: pool[i], element: el, isShared: false, elementWeights: { earth: 0, fire: 0, water: 0, air: 0, [el]: 1 } } as any);
            selectedNames.add(pool[i]);
          }
        }
      }
    }
    return mats.slice(0, 8);
  }, [selectedMaterials, sortedElements, dist]);

  // Filter hotspots to only those matching current materials
  const activeHotspots = React.useMemo(() => {
    const matNames = new Set(dnaMaterials.map(m => m.name));
    return IMAGE_HOTSPOTS.filter(h => h.materialMatch.some(m => matNames.has(m)));
  }, [dnaMaterials]);

  // Get brands for a hotspot category
  const getBrandsForHotspot = (hotspotId: string) => {
    const hotspot = IMAGE_HOTSPOTS.find(h => h.id === hotspotId);
    if (!hotspot) return [];
    return BRAND_CATALOG.filter(b => b.category === hotspot.category);
  };

  // Get the highlighted category from either hover source
  const highlightedCategory = React.useMemo(() => {
    if (hoveredHotspot) {
      const h = IMAGE_HOTSPOTS.find(hs => hs.id === hoveredHotspot);
      return h?.category || null;
    }
    if (hoveredBrand) {
      const b = BRAND_CATALOG.find(br => br.id === hoveredBrand);
      return b?.category || null;
    }
    if (activeHotspot) {
      const h = IMAGE_HOTSPOTS.find(hs => hs.id === activeHotspot);
      return h?.category || null;
    }
    return null;
  }, [hoveredHotspot, hoveredBrand, activeHotspot]);

  // Simulated loading progress
  React.useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => {
      setLoadProgress(p => {
        if (p >= 92) { clearInterval(interval); return 92; }
        const inc = p < 30 ? 3 : p < 60 ? 2 : p < 80 ? 1 : 0.5;
        return Math.min(92, p + inc + Math.random() * inc);
      });
    }, 200);
    return () => clearInterval(interval);
  }, [loading]);

  React.useEffect(() => {
    let cancelled = false;

    const finishGeneration = (imgUrl: string) => {
      if (cancelled) return;
      setImageUrl(imgUrl);
      setLoadProgress(100);
      setTimeout(() => {
        if (cancelled) return;
        setLoading(false);
        setPhase('revealing');
        materialize();
        setTimeout(() => {
          if (cancelled) return;
          setPhase('complete');
          const p = state.refinement.refinedPercentages || state.analysis?.percentages || { earth: 25, fire: 25, water: 25, air: 25 };
          const sorted = (['earth', 'fire', 'water', 'air'] as Element[]).sort((a, b) => p[b] - p[a]);
          const dominant = sorted[0];
          const secondary = sorted[1];
          const mats = (state.refinement.selectedMaterials || []).map(m => ({ name: m.name, element: m.element }));
          const adjs = (state.refinement.selectedAdjectives || []).map(a => ({ label: a.label, element: a.element }));
          const space = state.params.category || 'Living / Residential';
          const area = state.params.squareMeters || 120;
          const roomLabel = state.params.rooms?.[0] || space;
          const matSnippet = mats.slice(0, 3).map(m => m.name).join(', ');
          const adjSnippet = adjs.slice(0, 2).map(a => a.label).join(' & ');
          const conceptParts = [
            `${roomLabel} — ${dominant} ${Math.round(p[dominant])}% / ${secondary} ${Math.round(p[secondary])}%`,
            matSnippet ? `Materials: ${matSnippet}` : null,
            adjSnippet ? `Mood: ${adjSnippet}` : null,
            `${area}m²`,
          ].filter(Boolean);
          const conceptStr = conceptParts.join(' · ');
          const newEntry: GenerationHistoryEntry = {
            id: crypto.randomUUID(),
            imageUrl: imgUrl,
            combinationKey: `${dominant}-${secondary}`,
            dominant,
            secondary,
            dist: { ...p },
            spaceCategory: space,
            domain: state.params.domain || 'interior',
            areaM2: area,
            timestamp: Date.now(),
            materials: mats,
            adjectives: adjs,
            concept: conceptStr,
            rooms: state.params.rooms || [],
          };
          setState(prev => {
            const history = [...(prev.generationHistory || []), newEntry].slice(-8);
            return { ...prev, generationHistory: history };
          });
        }, 1200);
      }, 400);
    };

    const run = async () => {
      try {
        setLoading(true);
        setRefinementMessage(null);
        const feedback = refinementFeedbackRef.current ?? savedDirection;
        refinementFeedbackRef.current = null;
        const result = buildUniversalPrompt(state, {
          generationIndex: generationKey,
          refinementFeedback: feedback || undefined,
        });
        setStory(result.promptStory);

        const imgUrl = await generateImageFromPrompt(result.imagePrompt, directionPhoto || undefined, result.aspectRatio);
        if (!cancelled) {
          finishGeneration(imgUrl);
        }
      } catch (err: any) {
        if (cancelled) return;
        console.error('Generation error:', err);
        setLoading(false);
        setGenError(err?.message || 'Image generation failed. Check your API key and network connection.');
      }
    };
    run();

    return () => { cancelled = true; };
  }, [generationKey]);

  const handleRefineSubmit = () => {
    const text = refinementInput.trim();
    if (!text) return;
    chime();
    const currentDist = state.refinement.refinedPercentages || state.analysis?.percentages || { earth: 25, fire: 25, water: 25, air: 25 };
    const { refinedPercentages, responseMessage } = interpretRefinementFeedback(text, currentDist);
    setState(prev => ({
      ...prev,
      refinement: {
        ...prev.refinement,
        hasUserRefined: true,
        refinedPercentages,
      },
    }));
    setRefinementMessage(responseMessage);
    refinementFeedbackRef.current = text;
    setSavedDirection(text);
    setRefinementInput('');
    setSelectedHistoryImage(null);
    setMaterialsChanged(true);
  };

  const handleSaveDirection = () => {
    if (refinementInput.trim()) {
      chime();
      setSavedDirection(refinementInput.trim());
    }
  };

  // --- ERROR STATE ---
  if (genError) {
    return (
      <div className="h-[calc(100vh-92px)] flex flex-col items-center justify-center bg-[#fafafa] relative overflow-hidden">
        <div className="relative z-10 flex flex-col items-center max-w-md px-6">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mb-6" style={{ background: `${domColor}10`, border: `1.5px solid ${domColor}25` }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={domColor} strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <h2 className="text-[14px] uppercase tracking-[0.4em] font-semibold text-gray-600 mb-3">Generation Failed</h2>
          <p className="text-[13px] text-gray-400 text-center leading-relaxed mb-6">{genError}</p>
          <div className="flex gap-3">
            <button onClick={() => { setGenError(null); setLoading(true); setPhase('generating'); setLoadProgress(0); setGenerationKey(k => k + 1); }}
              className="px-6 py-2.5 rounded-lg text-[12px] uppercase tracking-[0.2em] font-semibold text-white transition-all hover:shadow-lg active:scale-[0.97]"
              style={{ background: `linear-gradient(135deg, ${domColor}, ${domColor}cc)` }}>
              Retry
            </button>
            <button onClick={() => navigate('/core')}
              className="px-6 py-2.5 rounded-lg text-[12px] uppercase tracking-[0.2em] font-medium text-gray-400 transition-all hover:bg-gray-50 active:scale-[0.97]"
              style={{ border: '1px solid rgba(0,0,0,0.06)' }}>
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- LOADING STATE ---
  const ELEMENT_CONCEPTS: Record<Element, string> = {
    earth: 'Grounded warmth, organic depth',
    fire: 'Bold energy, dynamic intensity',
    water: 'Fluid serenity, cool clarity',
    air: 'Luminous space, ethereal lightness',
  };

  if (loading) {
    return (
      <div className="h-[calc(100vh-92px)] flex flex-col items-center justify-center bg-[#fafafa] relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-[0.04]" style={{ background: `radial-gradient(circle, ${domColor}, transparent 70%)` }} />
          <div className="absolute top-0 left-0 right-0 h-px bg-gray-100" />
        </div>
        <div className="relative z-10 flex flex-col items-center">
          <div className="relative w-20 h-20 mb-10">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 48 48">
              <circle cx="24" cy="24" r="20" fill="none" stroke="#f0f0f0" strokeWidth="1.2" />
              <circle cx="24" cy="24" r="20" fill="none" stroke={domColor} strokeWidth="1.5" strokeLinecap="round"
                strokeDasharray={`${loadProgress * 1.256} 125.6`} style={{ transition: 'stroke-dasharray 0.4s ease-out' }} />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[18px] font-mono tabular-nums" style={{ color: domColor, opacity: 0.8 }}>{Math.round(loadProgress)}</span>
            </div>
          </div>
          <p className="text-[15px] uppercase tracking-[0.5em] text-gray-400 font-medium mb-1.5">Materializing</p>
          <p className="text-[11px] uppercase tracking-[0.2em] text-gray-300 font-light mb-0">Constructing spatial visualization</p>

          <div className="mt-10 flex items-start gap-5">
            {sortedElements.map(([el, val]) => {
              const ec = ELEMENT_COLORS[el];
              const isUp = el === 'fire' || el === 'air';
              const hasBar = el === 'air' || el === 'earth';
              const animatedVal = Math.round(val * Math.min(loadProgress / 100, 1));
              return (
                <div key={el} className="flex flex-col items-center gap-1.5" style={{ minWidth: 52 }}>
                  <span className="text-[15px] font-mono tabular-nums font-medium transition-all duration-700" style={{ color: ec, opacity: 0.85 }}>{animatedVal}%</span>
                  <div className="h-24 w-3 rounded-full overflow-hidden relative" style={{ background: 'rgba(0,0,0,0.04)' }}>
                    <div className="absolute bottom-0 w-full rounded-full transition-all duration-1000 ease-out"
                      style={{ height: `${animatedVal}%`, backgroundColor: ec, opacity: 0.75,
                        boxShadow: `0 0 8px ${ec}40` }} />
                  </div>
                  <svg width="12" height="12" viewBox="0 0 14 14" className="mt-0.5">
                    <path d={isUp ? 'M7 2 L12 11 L2 11 Z' : 'M7 12 L12 3 L2 3 Z'}
                      fill="none" stroke={ec} strokeWidth="1.3" strokeLinejoin="round" opacity="0.7" />
                    {hasBar && <line x1="4" y1={isUp ? 7.5 : 6.5} x2="10" y2={isUp ? 7.5 : 6.5} stroke={ec} strokeWidth="1" strokeLinecap="round" opacity="0.7" />}
                  </svg>
                  <span className="text-[9px] uppercase tracking-[0.14em] font-semibold" style={{ color: ec, opacity: 0.75 }}>{el}</span>
                  <span className="text-[8px] text-center leading-[1.3] tracking-wide max-w-[64px]" style={{ color: ec, opacity: 0.45 }}>{ELEMENT_CONCEPTS[el].split(',')[0]}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }


  const isRevealed = phase === 'revealing' || phase === 'complete';
  const isComplete = phase === 'complete';
  const spaceType = activeHistoryEntry?.spaceCategory ?? (state.params.category || 'Living Space');
  const domain = activeHistoryEntry?.domain ?? (state.params.domain || 'interior');

  // --- RESULTS VIEW ---
  return (
    <div className="h-[calc(100vh-92px)] flex flex-col overflow-hidden bg-[#fafafa] relative">

      {/* ═══ MAIN AREA — image + sidebar ═══ */}
      <div className="flex-1 flex overflow-hidden relative min-h-0">

        {/* ── HERO IMAGE + HOTSPOTS ── */}
        <div className={`relative flex flex-col overflow-hidden transition-all duration-700 ease-[cubic-bezier(0.22,0.61,0.36,1)] min-w-0 ${isRevealed ? 'opacity-100' : 'opacity-0 scale-[1.02]'}`}
          style={{ flex: isEditingMaterials && sidebarOpen ? '1 1 55%' : '1 1 auto' }}>

          {/* Image container */}
          <div className={`flex-1 flex items-center justify-center relative z-10 min-h-0 transition-all duration-500 ${isEditingMaterials ? 'p-4' : 'p-2.5'}`}>
            {displayedImageUrl && (
              <div className={`relative w-full h-full flex items-center justify-center transition-all duration-700 ease-out ${isComplete ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'} ${isEditingMaterials ? 'scale-[0.94]' : 'scale-100'}`}>
                <div className={`relative w-full h-full max-h-full rounded-lg overflow-hidden transition-all duration-500 ${isEditingMaterials ? 'shadow-lg shadow-black/5' : 'shadow-2xl shadow-black/8'}`}>
                  <div className="absolute inset-0 rounded-lg overflow-hidden border border-white/50">
                    <img src={displayedImageUrl} alt="Architectural visualization"
                      className={`w-full h-full object-cover transition-all duration-[2s] ease-out cursor-zoom-in ${imageLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-[1.03]'}`}
                      onLoad={() => setImageLoaded(true)}
                      onClick={() => setZoomedImage(displayedImageUrl)}
                      key={displayedImageUrl} />
                    {/* Editing overlay */}
                    {isEditingMaterials && (
                      <div className="absolute inset-0 bg-black/[0.03] pointer-events-none transition-opacity duration-500" />
                    )}
                  </div>

                  {/* Hotspot orbs — animated with pulse rings */}
                  {isComplete && activeHotspots.map((h, i) => {
                    const isHovered = hoveredHotspot === h.id || highlightedCategory === h.category;
                    const isActive = activeHotspot === h.id;
                    const brands = getBrandsForHotspot(h.id);
                    return (
                      <div key={h.id}
                        className={`absolute z-20 transition-all duration-1000 ${isComplete ? 'opacity-100' : 'opacity-0'}`}
                        style={{ left: `${h.x}%`, top: `${h.y}%`, transform: 'translate(-50%, -50%)', transitionDelay: `${1400 + i * 150}ms` }}
                        onMouseEnter={() => setHoveredHotspot(h.id)}
                        onMouseLeave={() => setHoveredHotspot(null)}
                        onClick={(e) => { e.stopPropagation(); setActiveHotspot(prev => prev === h.id ? null : h.id); }}>
                        {/* Outer pulse ring */}
                        <div className={`absolute rounded-full transition-all duration-500 ${isActive ? 'opacity-0 scale-0' : 'opacity-100'}`}
                          style={{ width: '36px', height: '36px', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                            border: '1px solid rgba(255,255,255,0.15)',
                            animation: `hotspotBreathe ${3 + i * 0.3}s ease-in-out infinite`, animationDelay: `${i * 0.5}s` }} />
                        {/* Inner glow ring */}
                        <div className={`absolute rounded-full transition-all duration-500 ${isActive ? 'opacity-0' : 'opacity-70'}`}
                          style={{ width: '22px', height: '22px', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                            background: 'radial-gradient(circle, rgba(255,255,255,0.2) 0%, transparent 70%)',
                            animation: `hotspotBreathe ${2.5 + i * 0.3}s ease-in-out infinite reverse`, animationDelay: `${i * 0.4}s` }} />
                        {/* Core dot */}
                        <div className="relative rounded-full cursor-pointer transition-all duration-400"
                          style={{ width: isActive ? '16px' : isHovered ? '14px' : '10px', height: isActive ? '16px' : isHovered ? '14px' : '10px',
                            background: isActive
                              ? 'radial-gradient(circle at 40% 35%, #fff, rgba(255,255,255,0.9))'
                              : isHovered
                                ? 'radial-gradient(circle at 40% 35%, rgba(255,255,255,0.95), rgba(255,255,255,0.7))'
                                : 'radial-gradient(circle at 40% 35%, rgba(255,255,255,0.7), rgba(255,255,255,0.3))',
                            boxShadow: isActive
                              ? '0 0 20px rgba(255,255,255,0.9), 0 0 40px rgba(255,255,255,0.3), 0 2px 8px rgba(0,0,0,0.3)'
                              : isHovered
                                ? '0 0 16px rgba(255,255,255,0.7), 0 2px 6px rgba(0,0,0,0.25)'
                                : '0 0 10px rgba(255,255,255,0.4), 0 1px 4px rgba(0,0,0,0.2)',
                            border: isActive ? '2px solid rgba(255,255,255,1)' : '1.5px solid rgba(255,255,255,0.5)',
                          }} />
                        {/* Label + brands popup */}
                        <div className={`absolute left-1/2 whitespace-nowrap transition-all duration-300 ${isHovered || isActive ? 'opacity-100 translate-y-0 pointer-events-auto' : `opacity-0 ${h.y < 25 ? '-translate-y-1' : 'translate-y-1'} pointer-events-none`}`}
                          style={{ ...(h.y < 25 ? { top: '100%', marginTop: '10px' } : { bottom: '100%', marginBottom: '10px' }), transform: 'translateX(-50%)' }}>
                          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg backdrop-blur-xl border transition-all duration-300 ${isActive ? 'bg-white/95 border-white/80 shadow-xl' : 'bg-black/55 border-white/20 shadow-lg'}`}>
                            <span className={`text-[9px] opacity-60 ${isActive ? 'text-gray-500' : 'text-white/70'}`}>{h.icon}</span>
                            <span className={`text-[10px] uppercase tracking-[0.15em] font-semibold ${isActive ? 'text-gray-800' : 'text-white/95'}`}>{h.label}</span>
                            {isActive && (
                              <button onClick={(e) => { e.stopPropagation(); setActiveHotspot(null); }}
                                className="ml-1 w-3.5 h-3.5 rounded-full bg-gray-200 flex items-center justify-center hover:bg-gray-300 transition-colors">
                                <svg width="6" height="6" viewBox="0 0 8 8" stroke="#666" strokeWidth="1.5"><line x1="2" y1="2" x2="6" y2="6"/><line x1="6" y1="2" x2="2" y2="6"/></svg>
                              </button>
                            )}
                          </div>
                          {isActive && brands.length > 0 && (
                            <div className="mt-1 flex flex-col gap-0.5 animate-fade-in-up" style={{ animationDuration: '0.2s' }}>
                              {brands.slice(0, 3).map(b => (
                                <a key={b.id} href={b.url} target="_blank" rel="noopener noreferrer"
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/95 border border-gray-100 shadow-md hover:shadow-lg hover:border-gray-300 transition-all duration-200 group"
                                  onMouseEnter={() => setHoveredBrand(b.id)} onMouseLeave={() => setHoveredBrand(null)} onClick={(e) => e.stopPropagation()}>
                                  <span className="text-[10px] font-semibold text-gray-700 group-hover:text-black">{b.name}</span>
                                  <span className="text-[8px] text-gray-400 font-light">{b.specialty}</span>
                                  <svg width="7" height="7" viewBox="0 0 10 10" fill="none" stroke="#bbb" strokeWidth="1.5" strokeLinecap="round" className="flex-shrink-0 ml-auto"><path d="M3 7 L7 3 M7 3 L7 6 M7 3 L4 3" /></svg>
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Concept Brief strip — compact inline */}
          {isComplete && (
            <div className="flex-shrink-0 px-3 py-1.5 transition-all duration-700 ease-out"
              style={{ transitionDelay: '400ms' }}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: domColor, opacity: 0.7 }} />
                  <span className="text-[11px] uppercase tracking-[0.2em] text-gray-600 font-semibold flex-shrink-0">{spaceType}</span>
                  <span className="text-gray-200 text-[10px] flex-shrink-0">·</span>
                  <span className="text-[10px] uppercase tracking-[0.1em] text-gray-400 font-light flex-shrink-0">{domain}</span>
                  {(() => {
                    const conceptText = activeHistoryEntry && activeHistoryEntry.id !== 'current' ? activeHistoryEntry.concept : story;
                    return conceptText ? (
                      <>
                        <span className="text-gray-200 text-[10px] flex-shrink-0">—</span>
                        <span className="text-[10px] text-gray-400 font-light truncate">{conceptText}</span>
                      </>
                    ) : null;
                  })()}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => window.print()}
                    className="px-2 py-0.5 border border-gray-200 text-[8px] uppercase tracking-[0.2em] font-medium text-gray-400 hover:border-gray-400 hover:text-gray-600 rounded transition-all bg-white/60">
                    Export
                  </button>
                  <button onClick={() => navigate('/core')}
                    className="px-2 py-0.5 border border-gray-200 text-[8px] uppercase tracking-[0.2em] font-medium text-gray-400 hover:border-gray-400 hover:text-gray-600 rounded transition-all bg-white/60">
                    Re-calibrate
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── MATERIAL DNA SIDEBAR ── */}
        <div className={`bg-white border-l border-gray-100/60 flex flex-col overflow-hidden transition-all duration-700 ease-[cubic-bezier(0.22,0.61,0.36,1)] ${
          sidebarOpen ? 'w-[340px]' : 'w-[44px]'
        } ${isRevealed ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'}`}
          style={{ transitionDelay: isRevealed ? '300ms' : '0ms' }}>

          {/* Collapsed state */}
          {!sidebarOpen && (
            <button onClick={() => setSidebarOpen(true)}
              className="flex-1 flex flex-col items-center justify-center gap-3 py-6 group transition-all hover:bg-gray-50/50">
              <div className="w-6 h-6 rounded-full flex items-center justify-center shadow-sm"
                style={{ background: `radial-gradient(circle at 35% 35%, ${domColor}30, ${domColor}70)`, border: `1px solid ${domColor}40` }}>
                <span className="text-white text-[11px] font-semibold">{dnaMaterials.length}</span>
              </div>
              <div className="flex flex-col items-center" style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>
                <span className="text-[10px] uppercase tracking-[0.3em] text-gray-400 font-medium group-hover:text-gray-600 transition-colors">Material DNA</span>
              </div>
              <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="#bbb" strokeWidth="1.5" strokeLinecap="round" className="mt-1 group-hover:stroke-gray-600 transition-colors">
                <path d="M8 3 L5 6 L8 9" />
              </svg>
            </button>
          )}

          {/* Expanded state */}
          {sidebarOpen && (
            <div className="flex flex-col h-full">
              {/* ═══ SECTION 1: Header + Axonometric Orbital + Percentages ═══ */}
              <div className="flex-shrink-0 px-4 pt-3 pb-2 bg-white z-10 border-b border-gray-100/80">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-gray-400 font-medium">Material DNA</p>
                  <button onClick={() => setSidebarOpen(false)}
                    className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors">
                    <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="#999" strokeWidth="1.5" strokeLinecap="round"><path d="M4 3 L7 6 L4 9" /></svg>
                  </button>
                </div>

                {/* Axonometric orbital — materials grouped by element sector */}
                {(() => {
                  const CX = 120, CY = 52, ORX = 105, ORY = 42, IRX = 58, IRY = 23;
                  const EL_ANGLES: Record<Element, number> = { air: -90, fire: 0, earth: 90, water: 180 };
                  const matsByEl: Record<Element, typeof dnaMaterials> = { earth: [], fire: [], water: [], air: [] };
                  dnaMaterials.forEach(m => matsByEl[m.element]?.push(m));
                  return (
                    <div className="relative mx-auto" style={{ width: '240px', height: '104px' }}>
                      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 240 104" fill="none">
                        <ellipse cx={CX} cy={CY} rx={ORX} ry={ORY} stroke={`${domColor}18`} strokeWidth="1" strokeDasharray="3 4" />
                        <ellipse cx={CX} cy={CY} rx={IRX} ry={IRY} stroke={`${domColor}10`} strokeWidth="0.8" strokeDasharray="2 3" />
                      </svg>
                      {/* Center nucleus */}
                      <div className="absolute rounded-full" style={{
                        width: '14px', height: '14px', left: `${CX}px`, top: `${CY}px`,
                        transform: 'translate(-50%, -50%)',
                        background: `radial-gradient(circle at 38% 32%, ${domColor}A0, ${domColor}60)`,
                        boxShadow: `0 1px 8px ${domColor}30`, zIndex: 4,
                      }} />
                      {/* Element nodes + their grouped material spheres */}
                      {(['air', 'fire', 'earth', 'water'] as Element[]).map(el => {
                        const baseAngle = EL_ANGLES[el];
                        const val = Math.round(dist[el]);
                        const isDom = el === dominant;
                        const ec = ELEMENT_COLORS[el];
                        const rad = (baseAngle * Math.PI) / 180;
                        const elX = CX + Math.cos(rad) * ORX;
                        const elY = CY + Math.sin(rad) * ORY;
                        const s = Math.max(10, Math.min(18, val * 0.32 + 5));
                        const mats = matsByEl[el];
                        return (
                          <React.Fragment key={el}>
                            {/* Element node on outer ring */}
                            <div className="absolute rounded-full flex items-center justify-center transition-all duration-700"
                              style={{
                                width: `${s}px`, height: `${s}px`, left: `${elX}px`, top: `${elY}px`,
                                transform: 'translate(-50%, -50%)', backgroundColor: ec,
                                opacity: isDom ? 0.9 : 0.3,
                                boxShadow: isDom ? `0 2px 10px ${ec}50` : `0 1px 3px rgba(0,0,0,0.08)`,
                                zIndex: isDom ? 6 : 2,
                              }}>
                              {s >= 14 && <span className="text-white font-bold" style={{ fontSize: '7px' }}>{val}</span>}
                            </div>
                            {/* Material spheres clustered near this element on inner ring */}
                            {mats.map((mat, mi) => {
                              const spreadPerItem = mats.length <= 1 ? 0 : 18;
                              const totalSpread = (mats.length - 1) * spreadPerItem;
                              const offsetAngle = baseAngle - totalSpread / 2 + mi * spreadPerItem;
                              const mRad = (offsetAngle * Math.PI) / 180;
                              const mx = CX + Math.cos(mRad) * IRX;
                              const my = CY + Math.sin(mRad) * IRY;
                              const mc = ec;
                              const tex = MATERIAL_SPHERE_IMAGES[mat.name];
                              return (
                                <div key={mat.id || `${el}-${mi}`} className="absolute transition-all duration-500"
                                  style={{ width: '17px', height: '17px', left: `${mx}px`, top: `${my}px`, transform: 'translate(-50%, -50%)', zIndex: 3 }}>
                                  <div className="w-full h-full rounded-full overflow-hidden border-[1.5px] border-white shadow-sm"
                                    style={{ boxShadow: `0 1px 4px ${mc}20` }}>
                                    {tex && !tex.startsWith('https://placehold')
                                      ? <img src={tex} alt="" className="w-[140%] h-[140%] max-w-none object-cover" style={{ marginLeft: '-20%', marginTop: '-20%', mixBlendMode: 'multiply' }} loading="lazy" />
                                      : <div className="w-full h-full" style={{ background: `radial-gradient(circle at 35% 30%, ${mc}40, ${mc}15)` }} />}
                                  </div>
                                </div>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Element energy distribution — with clear element identification */}
                <div className="mt-3 px-1">
                  <p className="text-[8px] uppercase tracking-[0.25em] text-gray-300 font-medium text-center mb-2">Element Balance</p>
                  {/* Element rows with symbol + name + bar + percentage */}
                  <div className="space-y-1.5">
                    {(['earth', 'fire', 'water', 'air'] as Element[]).map(el => {
                      const val = dist[el];
                      const roundVal = Math.round(val);
                      const isDom = el === dominant;
                      const ec = ELEMENT_COLORS[el];
                      const isUp = el === 'fire' || el === 'air';
                      const hasBar = el === 'air' || el === 'earth';
                      return (
                        <div key={el} className="flex items-center gap-2 transition-all duration-300" style={{ opacity: isDom ? 1 : 0.6 }}>
                          {/* Alchemical triangle symbol */}
                          <svg width="12" height="12" viewBox="0 0 14 14" className="shrink-0">
                            <path d={isUp ? 'M7 2 L12 11 L2 11 Z' : 'M7 12 L12 3 L2 3 Z'}
                              fill={isDom ? `${ec}20` : 'none'} stroke={ec} strokeWidth={isDom ? 1.5 : 1.2} strokeLinejoin="round" />
                            {hasBar && <line x1="4" y1={isUp ? 7.5 : 6.5} x2="10" y2={isUp ? 7.5 : 6.5} stroke={ec} strokeWidth={isDom ? 1.4 : 1} strokeLinecap="round" />}
                          </svg>
                          {/* Element name */}
                          <span className="text-[9px] uppercase tracking-[0.15em] w-9 shrink-0" style={{ fontWeight: isDom ? 700 : 500, color: ec }}>{el}</span>
                          {/* Bar */}
                          <div className="flex-1 h-[5px] rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.04)' }}>
                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${val}%`, backgroundColor: ec, opacity: isDom ? 0.9 : 0.55 }} />
                          </div>
                          {/* Percentage */}
                          <span className="font-mono tabular-nums text-[10px] w-7 text-right shrink-0" style={{ fontWeight: isDom ? 700 : 400, color: isDom ? ec : '#aaa' }}>{roundVal}</span>
                        </div>
                      );
                    })}
                  </div>
                  {/* Expand/collapse toggle for sliders */}
                  <button
                    onClick={() => setPctEditOpen(p => !p)}
                    className="w-full flex items-center justify-center gap-1.5 mt-2.5 py-1.5 rounded-lg transition-all hover:bg-gray-50"
                    style={{ border: '1px solid rgba(0,0,0,0.05)' }}
                  >
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="#999" strokeWidth="1.3" strokeLinecap="round">
                      <path d="M2 5 h12 M2 8 h8 M2 11 h10" />
                    </svg>
                    <span className="text-[8px] uppercase tracking-[0.2em] text-gray-400 font-medium">Adjust Balance</span>
                    <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="#bbb" strokeWidth="1.5" strokeLinecap="round"
                      className={`transition-transform duration-200 ${pctEditOpen ? 'rotate-180' : ''}`}>
                      <polyline points="3,4.5 6,7.5 9,4.5" />
                    </svg>
                  </button>
                </div>

                {/* Inline percentage sliders */}
                {pctEditOpen && (
                  <div className="mt-1 px-2 py-3 rounded-xl animate-fade-in" style={{ animationDuration: '0.2s', background: 'rgba(0,0,0,0.015)', border: '1px solid rgba(0,0,0,0.04)' }}>
                    {(['earth', 'fire', 'water', 'air'] as Element[]).map(el => {
                      const val = Math.round(dist[el]);
                      const isDom = el === dominant;
                      const ec = ELEMENT_COLORS[el];
                      const ELEMENT_SYMBOLS: Record<Element, string> = { earth: '▽', fire: '△', water: '▿', air: '△' };
                      return (
                        <div key={el} className="flex items-center gap-2.5 mb-2 last:mb-0">
                          <span className="text-[11px] flex-shrink-0 w-3 text-center" style={{ color: ec, opacity: 0.7 }}>{ELEMENT_SYMBOLS[el]}</span>
                          <span className="text-[9px] font-semibold uppercase tracking-[0.15em] w-10 flex-shrink-0" style={{ color: isDom ? ec : '#999' }}>
                            {el}
                          </span>
                          <div className="flex-1 relative h-5 flex items-center">
                            <div className="absolute left-0 right-0 h-[3px] rounded-full" style={{ background: 'rgba(0,0,0,0.04)' }} />
                            <div className="absolute left-0 h-[3px] rounded-full transition-all duration-300"
                              style={{ width: `${val}%`, backgroundColor: ec, opacity: isDom ? 0.7 : 0.4 }} />
                            <input
                              type="range" min="0" max="100" value={val}
                              className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-ew-resize"
                              onChange={(e) => {
                                const newVal = parseInt(e.target.value, 10);
                                const oldVal = val;
                                const diff = newVal - oldVal;
                                const others = (['earth', 'fire', 'water', 'air'] as Element[]).filter(x => x !== el);
                                const othersSum = others.reduce((s, x) => s + dist[x], 0);
                                const newDist = { ...dist } as Record<Element, number>;
                                newDist[el] = newVal;
                                others.forEach(x => {
                                  newDist[x] = othersSum > 0
                                    ? Math.max(0, Math.round(dist[x] - (diff * dist[x] / othersSum)))
                                    : Math.round((100 - newVal) / others.length);
                                });
                                const total = others.reduce((s, x) => s + newDist[x], 0) + newVal;
                                if (total !== 100) {
                                  const biggest = others.sort((a, b) => newDist[b] - newDist[a])[0];
                                  newDist[biggest] += 100 - total;
                                }
                                const newSelection = getSelectionFromPercentages(newDist as any);
                                setState(prev => ({
                                  ...prev,
                                  refinement: { ...prev.refinement, hasUserRefined: true, refinedPercentages: newDist as any, selectedAdjectives: newSelection.adjectives, selectedMaterials: newSelection.materials },
                                }));
                                setMaterialsChanged(true);
                              }}
                            />
                          </div>
                          <span className="font-mono tabular-nums text-[10px] font-semibold w-8 text-right flex-shrink-0" style={{ color: isDom ? '#333' : '#bbb' }}>
                            {val}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {materialsChanged && (
                  <div className="flex items-center gap-2 mt-1.5 px-2 py-1 rounded-md bg-amber-50/80 border border-amber-200/50 animate-fade-in">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    <span className="text-[9px] text-amber-700 font-medium">Distribution changed</span>
                  </div>
                )}
              </div>

              {/* ═══ SECTION 2: Material Grid (always visible, own scroll if needed) ═══ */}
              <div className="flex-shrink-0 px-3 pt-2.5 pb-2 bg-white z-[5] border-b border-gray-50/80" style={{ maxHeight: '380px', overflowY: 'auto' }}>
                <div className="grid grid-cols-4 gap-1">
                  {dnaMaterials.map((mat, idx) => {
                    const elColor = ELEMENT_COLORS[mat.element];
                    const sphereImg = MATERIAL_SPHERE_IMAGES[mat.name];
                    const isLinked = highlightedCategory && IMAGE_HOTSPOTS.find(h => h.category === highlightedCategory)?.materialMatch.includes(mat.name);
                    const isUserSelected = selectedMaterials.some(m => m.name === mat.name);

                    return (
                      <div key={mat.id || idx}
                        className={`group relative flex flex-col items-center rounded-lg transition-all duration-300 hover:bg-gray-50/80 cursor-default p-1 ${isLinked ? 'bg-gray-50 ring-1 ring-gray-200/60' : ''}`}
                        title={`${mat.name} — ${ELEMENT_DESCRIPTORS[mat.element]} · ${Math.round(dist[mat.element])}%`}>
                        <div className="relative">
                          <div className={`rounded-full overflow-hidden transition-all duration-500 bg-white ${isLinked ? 'shadow-md scale-105' : ''}`}
                            style={{ width: '58px', height: '58px', border: `1.5px solid ${elColor}15` }}>
                            {sphereImg && !sphereImg.startsWith('https://placehold')
                              ? <img src={sphereImg} alt={mat.name}
                                  className="w-[130%] h-[130%] max-w-none object-cover transition-transform duration-500 group-hover:scale-110"
                                  style={{ mixBlendMode: 'multiply', marginLeft: '-15%', marginTop: '-15%' }}
                                  loading="lazy" />
                              : <div className="w-full h-full" style={{ background: `radial-gradient(circle at 40% 38%, ${elColor}30, ${elColor}10)` }} />}
                          </div>
                          <div className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-[1.5px] border-white shadow-sm" style={{ backgroundColor: elColor }} />
                          {isUserSelected && (
                            <button onClick={() => removeMaterial(mat.name)}
                              className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white border border-gray-200 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:border-red-200 transition-all duration-200 shadow-sm"
                              title="Remove">
                              <svg width="6" height="6" viewBox="0 0 12 12" fill="none" stroke="#e57373" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="3" x2="9" y2="9" /><line x1="9" y1="3" x2="3" y2="9" /></svg>
                            </button>
                          )}
                        </div>
                        <span className="text-center leading-tight mt-0.5 w-full truncate text-[7px]" style={{ color: '#8899b3' }}>
                          {mat.name.split('(')[0].trim()}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {/* Add material button inside the grid area */}
                <button onClick={() => setMaterialPickerOpen(!materialPickerOpen)}
                  className={`w-full mt-1.5 py-1.5 border border-dashed rounded-md text-[9px] uppercase tracking-[0.2em] font-medium transition-all duration-300 flex items-center justify-center gap-1 ${
                    materialPickerOpen ? 'border-gray-400 text-gray-600 bg-gray-50' : 'border-gray-200 text-gray-400 hover:border-gray-400 hover:text-gray-600'
                  }`}>
                  <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                    className={`transition-transform duration-300 ${materialPickerOpen ? 'rotate-45' : ''}`}>
                    <line x1="6" y1="1" x2="6" y2="11" /><line x1="1" y1="6" x2="11" y2="6" />
                  </svg>
                  {materialPickerOpen ? 'Close' : 'Add Material'}
                </button>
              </div>

              {/* ═══ SECTION 3: Scrollable lower panel ═══ */}
              <div className="flex-1 overflow-y-auto custom-scroll min-h-0">
                {/* Material picker dropdown */}
                {materialPickerOpen && (
                  <div className="px-3 pt-3 pb-2 border-b border-gray-100 animate-fade-in-up bg-gray-50/40" style={{ animationDuration: '0.2s', maxHeight: '400px', overflowY: 'auto' }}>
                    <p className="text-[9px] uppercase tracking-[0.2em] text-gray-400 font-semibold mb-2.5">Available Materials</p>
                    {(Object.entries(CANONICAL_MATERIALS) as [string, string[]][])
                      .filter(([key]) => key !== 'shared')
                      .map(([elKey, matNames]) => {
                        const elColor = ELEMENT_COLORS[elKey as Element];
                        const availableMats = matNames.filter(n => !selectedMaterials.some(m => m.name === n));
                        if (availableMats.length === 0) return null;
                        return (
                          <div key={elKey} className="mb-3">
                            <div className="flex items-center gap-2 mb-1.5 px-0.5">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: elColor }} />
                              <span className="text-[11px] uppercase tracking-[0.12em] font-bold" style={{ color: elColor }}>{elKey}</span>
                              <span className="text-[9px] text-gray-300 font-light ml-auto">{availableMats.length}</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {availableMats.map(name => {
                                const sphereImg = MATERIAL_SPHERE_IMAGES[name];
                                return (
                                  <button key={name} onClick={() => addMaterial(name, elKey as Element)}
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] tracking-[0.01em] font-medium border border-gray-150 text-gray-600 hover:border-gray-400 hover:text-gray-900 hover:bg-white hover:shadow-sm transition-all active:scale-95 bg-white/60">
                                    {sphereImg && !sphereImg.startsWith('https://placehold') && (
                                      <img src={sphereImg} alt="" className="w-4 h-4 rounded-full object-cover flex-shrink-0" style={{ mixBlendMode: 'multiply' }} loading="lazy" />
                                    )}
                                    {name}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}

                {/* Atmosphere chips */}
                {selectedAtmosphere.length > 0 && (
                  <div className="px-3 pt-2 pb-1.5">
                    <p className="text-[8px] uppercase tracking-[0.25em] text-gray-400 font-medium mb-1.5">Atmosphere</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedAtmosphere.slice(0, 6).map((adj, i) => {
                        const ec = ELEMENT_COLORS[adj.element];
                        return (
                          <span key={`${adj.label}-${i}`}
                            className="px-2 py-0.5 rounded-full text-[8px] tracking-[0.06em] font-light border"
                            style={{ background: `${ec}08`, color: ec, borderColor: `${ec}18` }}>
                            {adj.label}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Palette quick-select */}
                <div className="px-3 pt-1.5 pb-1.5 border-t border-gray-50/60">
                  <p className="text-[8px] uppercase tracking-[0.25em] text-gray-400 font-medium mb-1">Palette</p>
                  <div className="flex flex-wrap gap-1">
                    {(() => {
                      const ELEMENT_PALETTES_GEN: Record<string, { id: string; label: string; colors: string[] }[]> = {
                        earth: [
                          { id: 'auto', label: 'Auto', colors: ['#bbb', '#999'] },
                          { id: 'warm-earth', label: 'Warm Earth', colors: ['#C4A882', '#8B6E4E', '#E8DCC8'] },
                          { id: 'dark-bronze', label: 'Dark Bronze', colors: ['#3C2A1E', '#8B6E4E', '#2A2A2E'] },
                          { id: 'cool-mineral', label: 'Cool Mineral', colors: ['#A0A87E', '#C8C8CC', '#7A8450'] },
                        ],
                        fire: [
                          { id: 'auto', label: 'Auto', colors: ['#bbb', '#999'] },
                          { id: 'dark-bronze', label: 'Dark Bronze', colors: ['#3C2A1E', '#8B6E4E', '#2A2A2E'] },
                          { id: 'warm-earth', label: 'Warm Earth', colors: ['#A0522D', '#C87B30', '#E8DCC8'] },
                          { id: 'cool-mineral', label: 'Cool Mineral', colors: ['#8B8D94', '#C8C8CC', '#4A4A50'] },
                        ],
                        water: [
                          { id: 'auto', label: 'Auto', colors: ['#bbb', '#999'] },
                          { id: 'ocean-calm', label: 'Ocean Calm', colors: ['#C8D4DC', '#B8BCC4', '#E8E6E0'] },
                          { id: 'cool-mineral', label: 'Cool Mineral', colors: ['#C0C0C4', '#8B8D94', '#F0EDE8'] },
                          { id: 'light-air', label: 'Light Air', colors: ['#FAFAFA', '#E8DCC8', '#F0F2F4'] },
                        ],
                        air: [
                          { id: 'auto', label: 'Auto', colors: ['#bbb', '#999'] },
                          { id: 'light-air', label: 'Light Air', colors: ['#FAFAFA', '#F0F2F4', '#E4ECF0'] },
                          { id: 'ocean-calm', label: 'Ocean Calm', colors: ['#C8D4DC', '#D0D0D4', '#E8E6E0'] },
                          { id: 'cool-mineral', label: 'Cool Mineral', colors: ['#C8C8CC', '#8B8D94', '#F0EDE8'] },
                        ],
                      };
                      return (ELEMENT_PALETTES_GEN[dominant] || ELEMENT_PALETTES_GEN.earth).map(p => {
                        const active = (state.params.colorPalette || 'auto') === p.id;
                        return (
                          <button key={p.id}
                            onClick={() => {
                              setState(prev => ({ ...prev, params: { ...prev.params, colorPalette: p.id as any } }));
                              setMaterialsChanged(true);
                            }}
                            className={`flex items-center gap-1 px-1.5 py-[3px] rounded text-[8px] tracking-[0.03em] transition-all duration-200 border active:scale-95 ${
                              active ? 'border-gray-500 text-gray-700 bg-gray-50 font-semibold shadow-sm' : 'border-gray-100 text-gray-400 hover:border-gray-300 hover:text-gray-600'
                            }`}>
                            <div className="flex gap-px">
                              {p.colors.map((c, ci) => <div key={ci} className="w-2 h-2 rounded-full" style={{ backgroundColor: c }} />)}
                            </div>
                            {p.label}
                          </button>
                        );
                      });
                    })()}
                  </div>
                </div>

                {/* Direction bullets */}
                <div className="px-3 pt-1.5 pb-2 border-t border-gray-50/60">
                  <p className="text-[8px] uppercase tracking-[0.2em] text-gray-400 font-medium mb-1">Direction</p>
                  <div className="flex flex-wrap gap-1 mb-1.5">
                    {[
                      { label: 'Warmer', icon: '◐' },
                      { label: 'Cooler', icon: '◑' },
                      { label: 'Softer', icon: '○' },
                      { label: 'Cozier', icon: '◉' },
                      { label: 'More dramatic', icon: '◆' },
                      { label: 'Brighter', icon: '◇' },
                      { label: 'Darker', icon: '●' },
                      { label: 'More minimal', icon: '◌' },
                      { label: 'More grounded', icon: '▬' },
                      { label: 'More open', icon: '▽' },
                    ].map(d => {
                      const isDirectionActive = savedDirection === d.label;
                      return (
                        <button key={d.label}
                          onClick={() => {
                            chime();
                            const currentDist = state.refinement.refinedPercentages || state.analysis?.percentages || { earth: 25, fire: 25, water: 25, air: 25 };
                            const { refinedPercentages, responseMessage } = interpretRefinementFeedback(d.label, currentDist);
                            setState(prev => ({ ...prev, refinement: { ...prev.refinement, hasUserRefined: true, refinedPercentages } }));
                            setRefinementMessage(responseMessage);
                            refinementFeedbackRef.current = d.label;
                            setSavedDirection(isDirectionActive ? null : d.label);
                            setRefinementInput('');
                            setSelectedHistoryImage(null);
                            setMaterialsChanged(true);
                          }}
                          className={`px-1.5 py-[2px] rounded text-[8px] tracking-[0.03em] border transition-all duration-200 active:scale-95 ${
                            isDirectionActive
                              ? 'border-gray-600 text-gray-800 bg-gray-50 font-semibold shadow-sm'
                              : 'border-gray-100 text-gray-400 hover:border-gray-300 hover:text-gray-600'
                          }`}>
                          <span className="mr-0.5 opacity-50">{d.icon}</span> {d.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-1.5">
                    <input type="text" value={refinementInput} onChange={(e) => setRefinementInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleRefineSubmit()}
                      placeholder="Custom direction..."
                      className="flex-1 px-2 py-1 border border-gray-100 rounded text-[10px] placeholder:text-gray-300 focus:outline-none focus:border-gray-300 transition-colors" />
                    <input ref={directionPhotoRef} type="file" accept="image/*" className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setDirectionPhoto(file);
                          const reader = new FileReader();
                          reader.onloadend = () => setDirectionPhotoPreview(reader.result as string);
                          reader.readAsDataURL(file);
                          setMaterialsChanged(true);
                        }
                      }} />
                    <button onClick={() => directionPhotoRef.current?.click()}
                      title="Upload reference photo"
                      className={`px-1.5 py-1 border rounded transition-all active:scale-95 ${directionPhoto ? 'border-violet-300 text-violet-600 bg-violet-50' : 'border-gray-200 text-gray-400 hover:border-gray-400 hover:text-gray-600'}`}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
                      </svg>
                    </button>
                    <button onClick={handleRefineSubmit} disabled={!refinementInput.trim()}
                      className="px-2 py-1 border border-gray-200 text-[8px] uppercase tracking-[0.15em] font-semibold text-gray-500 hover:border-black hover:text-black disabled:opacity-40 disabled:cursor-not-allowed rounded transition-all active:scale-[0.97]">
                      Apply
                    </button>
                  </div>
                  {directionPhotoPreview && (
                    <div className="flex items-center gap-2 mt-1.5">
                      <img src={directionPhotoPreview} alt="Reference" className="w-10 h-7 object-cover rounded border border-gray-200" />
                      <span className="text-[8px] text-gray-400 flex-1 truncate">{directionPhoto?.name}</span>
                      <button onClick={() => { setDirectionPhoto(null); setDirectionPhotoPreview(null); if (directionPhotoRef.current) directionPhotoRef.current.value = ''; }}
                        className="text-[9px] text-gray-300 hover:text-red-400 transition-colors">&times;</button>
                    </div>
                  )}
                  {refinementMessage && <p className="text-[9px] text-gray-500 font-light mt-1 italic leading-snug">{refinementMessage}</p>}
                  {savedDirection && (
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-[8px] text-gray-400">Active:</span>
                      <span className="text-[8px] font-medium text-gray-600 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">{savedDirection}</span>
                      <button onClick={() => { setSavedDirection(null); refinementFeedbackRef.current = null; }} className="text-[8px] text-gray-300 hover:text-gray-600 ml-0.5">&times;</button>
                    </div>
                  )}
                </div>
              </div>

              {/* ═══ SECTION 4: Footer Actions (always visible) ═══ */}
              <div className={`flex-shrink-0 px-3 py-2 border-t space-y-1.5 transition-all duration-300 ${materialsChanged ? 'border-amber-200/60 bg-amber-50/30' : 'border-gray-100/60 bg-white'}`}>
                {materialsChanged && (
                  <button onClick={() => { chime(); setMaterialsChanged(false); setMaterialPickerOpen(false); setSelectedHistoryImage(null); setLoading(true); setPhase('generating'); setLoadProgress(0); setImageLoaded(false); setImageUrl(null); setGenerationKey(k => k + 1); }}
                    className="w-full py-2.5 bg-gradient-to-r from-gray-900 to-gray-800 text-white rounded-lg text-[10px] uppercase tracking-[0.3em] font-semibold transition-all active:scale-[0.97] shadow-lg hover:shadow-xl flex items-center justify-center gap-2 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 to-transparent animate-pulse" />
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="relative z-10">
                      <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                    </svg>
                    <span className="relative z-10">Regenerate</span>
                  </button>
                )}
                <button onClick={() => { whoosh(); navigate('/core'); }}
                  className="w-full py-1.5 border border-gray-200 text-[9px] uppercase tracking-[0.25em] font-medium text-gray-400 hover:border-black hover:text-black rounded-md transition-all active:scale-[0.97]">
                  Refine & Regenerate
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ HISTORY ROW ═══ */}
      {isComplete && similarReferences.length > 0 && (
        <div className="flex-shrink-0 border-t border-gray-100/60 bg-white/95 transition-all duration-1000 ease-out"
          style={{ transitionDelay: '800ms' }}>
          <div className="px-3 pt-1 pb-0">
            <span className="text-[7px] uppercase tracking-[0.25em] text-gray-400 font-medium">History</span>
          </div>
          <div className="px-3 pb-1.5 flex items-center gap-1.5 overflow-x-auto custom-scroll">
            {similarReferences.map((ref) => {
              const isSelected = displayedImageUrl === ref.imageUrl;
              const refDist = ref.dist;
              const refSorted = (Object.entries(refDist) as [Element, number][]).sort((a, b) => b[1] - a[1]);
              const refDominant = refSorted[0][0];
              return (
                <div key={ref.id} className="flex-shrink-0 flex flex-col items-center gap-0.5">
                  <button onClick={() => setSelectedHistoryImage(isSelected ? null : ref.imageUrl)}
                    onDoubleClick={() => setZoomedImage(ref.imageUrl)}
                    className={`w-16 h-11 rounded-md overflow-hidden border transition-all duration-300 group ${
                      isSelected ? 'border-gray-400 ring-1 ring-gray-300 shadow-md scale-105' : 'border-gray-100 hover:border-gray-300 hover:shadow-sm'
                    }`}>
                    <img src={ref.imageUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  </button>
                  {/* Mini 4-dot orbital showing this render's distribution */}
                  <div className="relative" style={{ width: '28px', height: '14px' }}>
                    {([
                      { el: 'air' as Element, x: 14, y: 1 },
                      { el: 'fire' as Element, x: 27, y: 7 },
                      { el: 'earth' as Element, x: 14, y: 13 },
                      { el: 'water' as Element, x: 1, y: 7 },
                    ]).map(({ el, x, y }) => {
                      const v = refDist[el] || 0;
                      const s = Math.max(3, Math.min(7, v * 0.12 + 2));
                      const isDom = el === refDominant;
                      return (
                        <div key={el} className="absolute rounded-full transition-all duration-500" style={{
                          width: `${s}px`, height: `${s}px`, left: `${x}px`, top: `${y}px`,
                          transform: 'translate(-50%, -50%)', backgroundColor: ELEMENT_COLORS[el],
                          opacity: isDom ? 0.85 : (isSelected ? 0.5 : 0.25),
                          boxShadow: isDom && isSelected ? `0 0 4px ${ELEMENT_COLORS[el]}50` : 'none',
                        }} />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ BRANDS BAR ═══ */}
      {isComplete && (
        <div className="flex-shrink-0 border-t border-gray-50 bg-white transition-all duration-1000 ease-out"
          style={{ transitionDelay: '1000ms' }}>
          <div className="px-3 py-1.5 flex items-center gap-1 overflow-x-auto custom-scroll">
            <span className="text-[9px] uppercase tracking-[0.2em] text-gray-400 font-medium mr-1 flex-shrink-0">Partners</span>
            {Array.from(new Set(BRAND_CATALOG.map(b => b.category))).map(cat => {
              const brands = BRAND_CATALOG.filter(b => b.category === cat);
              const isHighlighted = highlightedCategory === cat;
              return (
                <div key={cat} className="flex items-center gap-0.5 flex-shrink-0">
                  {brands.map(b => (
                    <a key={b.id} href={b.url} target="_blank" rel="noopener noreferrer"
                      className={`px-1.5 py-1 rounded text-[9px] tracking-[0.04em] font-medium transition-all duration-300 whitespace-nowrap ${
                        isHighlighted ? 'text-gray-700 bg-gray-50 shadow-sm' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                      }`}
                      onMouseEnter={() => setHoveredBrand(b.id)} onMouseLeave={() => setHoveredBrand(null)}
                      title={`${b.name} — ${b.specialty}`}>
                      {b.name}
                    </a>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Zoom lightbox with prev/next + keyboard navigation */}
      {zoomedImage && (() => {
        const allImages = [imageUrl, ...similarReferences.map(r => r.imageUrl)].filter(Boolean) as string[];
        const uniqueImages = [...new Set(allImages)];
        const currentIdx = uniqueImages.indexOf(zoomedImage);
        const hasPrev = currentIdx > 0;
        const hasNext = currentIdx < uniqueImages.length - 1;
        const goTo = (dir: -1 | 1) => {
          const nextIdx = currentIdx + dir;
          if (nextIdx >= 0 && nextIdx < uniqueImages.length) setZoomedImage(uniqueImages[nextIdx]);
        };
        return (
          <div
            className="fixed inset-0 z-[200] bg-black/85 flex items-center justify-center p-6 lg:p-10"
            onClick={() => setZoomedImage(null)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setZoomedImage(null);
              if (e.key === 'ArrowLeft' && hasPrev) goTo(-1);
              if (e.key === 'ArrowRight' && hasNext) goTo(1);
            }}
            tabIndex={0}
            ref={(el) => el?.focus()}
            style={{ outline: 'none' }}
          >
            {/* Prev button */}
            {hasPrev && (
              <button
                onClick={(e) => { e.stopPropagation(); goTo(-1); }}
                className="absolute left-4 lg:left-8 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white transition-all duration-300 backdrop-blur-sm"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
            )}

            {/* Image with loading skeleton */}
            <div className="relative max-w-full max-h-full" onClick={(e) => e.stopPropagation()}>
              <img
                key={zoomedImage}
                src={zoomedImage}
                alt="Zoomed view"
                className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl animate-fade-in"
                style={{ animation: 'fadeIn 0.3s ease-out' }}
              />
            </div>

            {/* Next button */}
            {hasNext && (
              <button
                onClick={(e) => { e.stopPropagation(); goTo(1); }}
                className="absolute right-4 lg:right-8 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white transition-all duration-300 backdrop-blur-sm"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            )}

            {/* Close button */}
            <button
              onClick={() => setZoomedImage(null)}
              className="absolute top-5 right-5 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors backdrop-blur-sm"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>

            {/* Image counter + keyboard hint */}
            {uniqueImages.length > 1 && (
              <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-3">
                <div className="px-4 py-2 rounded-full bg-black/40 backdrop-blur-sm">
                  <span className="text-[16px] text-white/70 font-mono tracking-wider">{currentIdx + 1} / {uniqueImages.length}</span>
                </div>
                <div className="px-3 py-2 rounded-full bg-black/25 backdrop-blur-sm hidden lg:block">
                  <span className="text-[13px] text-white/40 tracking-wide">← → to navigate · Esc to close</span>
                </div>
              </div>
            )}
          </div>
        );
      })()}

    </div>
  );
};

// --- MAIN APP ---
const App = () => {
  const [state, setState] = useState<UserState>(() => {
    const loaded = loadState();
    if (!loaded.params.domain) loaded.params.domain = 'interior';
    if (!loaded.params.category) loaded.params.category = 'Living / Residential';
    if (!loaded.params.squareMeters) loaded.params.squareMeters = 120;

    if (!loaded.analysis) {
      loaded.analysis = {
        percentages: { air: 25, fire: 25, water: 25, earth: 25 },
        primary: 'air',
        secondary: 'fire',
        estimate: { cost: { low: 0, high: 0 }, timeline: { low: 0, high: 0 } }
      };
    }
    loaded.refinement.isActive = true;
    if (!loaded.refinement.refinedPercentages) {
      loaded.refinement.refinedPercentages = loaded.analysis.percentages;
    }
    if (loaded.refinement.selectedAdjectives.length === 0) {
      const initial = getSelectionFromPercentages(loaded.refinement.refinedPercentages);
      loaded.refinement.selectedAdjectives = initial.adjectives;
      loaded.refinement.selectedMaterials = initial.materials;
    }
    return loaded;
  });

  React.useEffect(() => {
    saveState(state);
  }, [state]);

  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/survey" element={<Survey state={state} setState={setState} />} />
          <Route path="/core" element={<WorkspacePage state={state} setState={setState} />} />
          <Route path="/generate" element={<ResultsView state={state} setState={setState} />} />
          <Route path="/about" element={<AboutPage />} />
        </Routes>
        <SpaceGuide />
      </Layout>
    </Router>
  );
};

export default App;
