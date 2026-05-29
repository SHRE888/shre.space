import React, { useState, useEffect, useRef, useCallback } from 'react';
import { HashRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import { whoosh, chime, materialize, dnaNucleusResonance } from './services/soundService';
import { Layout } from './components/Layout';
import { WorkspacePage } from './components/WorkspacePage';
import { AboutPage } from './components/AboutPage';
import { SpaceGuide } from './components/SpaceGuide';
import { DiagnosisReport } from './components/DiagnosisReport';
import { UserState, Element, MaterialDef, GenerationHistoryEntry, CustomMaterial } from './types';
import AddCustomMaterialModal from './components/AddCustomMaterialModal';
import { loadState, saveState, clearState } from './services/storageService';
import { calculateAnalysis, buildUniversalPrompt, buildTargetedEditPrompt } from './services/promptEngine';
import { buildDiagnosis } from './services/shreDiagnosis';
import { generateImageFromPrompt, dataUrlToFile, setUserApiKey, hasUserApiKey } from './services/geminiService';
import { interpretRefinementFeedback } from './services/refinementFeedback';
import { getInitialSelection, getSelectionFromPercentages } from './services/refinementLogic';
import { SHORT_QUESTIONS, ELEMENT_COLORS, CANONICAL_MATERIALS, MATERIAL_SPHERE_IMAGES, MATERIAL_TEXTURE_FILTER, MATERIAL_TEXTURE_TINT, generateSurveyQuestions } from './constants';
import { getRecommendedProfessionalPartners, type ProfessionalPartner } from './lib/professionalPartners';

// --- API KEY ENTRY PANEL (browser-local override) ---
// Lets the user paste their own Gemini API key when the build-baked key is
// suspended / over-quota. Stored only in this browser's localStorage — never
// committed, never deployed, never visible to anyone else. This is the escape
// hatch that breaks the "build-key gets suspended → site dies" cycle.
const ApiKeyEntryPanel = ({
  isSuspended,
  onSaved,
}: {
  isSuspended: boolean;
  onSaved: () => void;
}) => {
  const [keyInput, setKeyInput] = React.useState('');
  const [hasStoredKey, setHasStoredKey] = React.useState<boolean>(() => hasUserApiKey());
  const [error, setError] = React.useState<string | null>(null);

  const handleSave = () => {
    const trimmed = keyInput.trim();
    if (!trimmed) {
      setError('შეიყვანე key.');
      return;
    }
    if (!/^AIza[0-9A-Za-z_-]{20,}$/.test(trimmed)) {
      setError('key არასწორი ფორმატის ჩანს — Google Gemini key იწყება „AIza"-თი.');
      return;
    }
    setUserApiKey(trimmed);
    setHasStoredKey(true);
    setError(null);
    setKeyInput('');
    onSaved();
  };

  const handleClear = () => {
    setUserApiKey(undefined);
    setHasStoredKey(false);
    setError(null);
  };

  return (
    <div className="mt-4 mb-2 w-full rounded-xl border border-gray-200 bg-white p-5 text-left">
      <p className="text-[12px] uppercase tracking-[0.25em] font-semibold text-gray-700 mb-2">
        {isSuspended ? 'ააამოქმედე ერთი წუთში' : 'API key გესაჭიროება'}
      </p>
      <p className="text-[12.5px] text-gray-600 leading-[1.6] mb-4">
        Google-ის key {isSuspended ? '„suspended"-ად მონიშნა' : 'არ მუშაობს'}. შენი პირადი key
        ჩასვი ქვემოთ — ის ჩაიწერება მხოლოდ <span className="font-medium">ამ ბრაუზერში</span>, არსად არ
        გადაიგზავნება, არც gitში, არც deploy-ში. შენი key ვერავინ ნახავს.
      </p>

      <ol className="text-[12px] text-gray-500 leading-[1.7] space-y-1 list-decimal pl-5 mb-4">
        <li>
          აიღე უფასო key →{' '}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
            className="underline font-medium text-gray-800 hover:text-black"
          >
            aistudio.google.com/apikey
          </a>
        </li>
        <li>დააკოპირე key (იწყება „AIza…")</li>
        <li>ჩასვი ქვემოთ და დააჭირე „შენახვა"</li>
      </ol>

      <div className="flex gap-2">
        <input
          type="password"
          value={keyInput}
          onChange={(e) => { setKeyInput(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
          placeholder="AIzaSy..."
          autoComplete="off"
          spellCheck={false}
          className="flex-1 px-3 py-2 text-[12px] font-mono rounded-lg border border-gray-200 bg-gray-50 focus:bg-white focus:border-gray-400 focus:outline-none transition-colors"
        />
        <button
          onClick={handleSave}
          className="px-4 py-2 rounded-lg text-[12px] uppercase tracking-[0.15em] font-semibold text-white bg-gray-800 hover:bg-black transition-colors active:scale-[0.97]"
        >
          შენახვა
        </button>
      </div>

      {error && (
        <p className="text-[11.5px] text-red-500 mt-2 leading-relaxed">{error}</p>
      )}

      {hasStoredKey && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
          <span className="text-[11px] text-gray-400">
            შენი key შენახულია ბრაუზერში
          </span>
          <button
            onClick={handleClear}
            className="text-[11px] text-gray-400 hover:text-gray-700 underline"
          >
            წაშლა
          </button>
        </div>
      )}
    </div>
  );
};

// --- LANDING PAGE ---
const Landing = () => {
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="h-screen h-[100dvh] bg-[#fafafa] select-none overflow-hidden relative flex flex-col items-center justify-center pt-[max(0px,env(safe-area-inset-top))] pb-[max(0px,env(safe-area-inset-bottom))]">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] sm:w-[800px] h-[600px] sm:h-[800px] rounded-full bg-gradient-to-br from-gray-100/30 via-transparent to-transparent blur-3xl" />
      </div>

      {/* Top — SHRE branding, centered */}
      <div className={`absolute top-[max(1.25rem,env(safe-area-inset-top,0px)+0.5rem)] sm:top-8 left-1/2 -translate-x-1/2 z-10 text-center transition-all duration-700 ease-out px-2 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}`}>
        <p className="text-[11px] sm:text-[13px] uppercase tracking-[0.4em] sm:tracking-[0.6em] font-medium" style={{ color: '#b0b0b0' }}>
          SHRE ENGINE
        </p>
        <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.25em] sm:tracking-[0.35em] font-light mt-1" style={{ color: '#c0c0c0' }}>
          Spatial Calibration Platform
        </p>
      </div>

      {/* Top-right — About link */}
      <div className={`absolute top-[max(1rem,env(safe-area-inset-top,0px)+0.25rem)] sm:top-8 right-[max(1rem,env(safe-area-inset-right,0px))] sm:right-10 z-10 transition-all duration-700 ease-out ${mounted ? 'opacity-100' : 'opacity-0'}`} style={{ transitionDelay: '400ms' }}>
        <button
          type="button"
          onClick={() => navigate('/about')}
          className="min-h-[44px] min-w-[44px] px-2 flex items-center justify-center text-[11px] sm:text-[13px] uppercase tracking-[0.2em] sm:tracking-[0.3em] font-light hover:text-gray-700 active:text-gray-900 transition-colors duration-300 touch-manipulation"
          style={{ color: '#b0b0b0' }}
        >
          About
        </button>
      </div>

      {/* Center — Hero text, full width centered */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center w-full px-4 sm:px-6">
        <h1
          className={`uppercase leading-[1.05] transition-all duration-[1.2s] ease-out text-center ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
          style={{
            fontSize: 'clamp(26px, 6.5vw, 82px)',
            fontWeight: 300,
            letterSpacing: 'clamp(0.15em, 2vw, 0.32em)',
            fontFamily: "'IBM Plex Sans', 'Inter', system-ui, sans-serif",
            color: '#2A2A2A',
            transitionDelay: '100ms',
          }}
        >
          CREATE YOUR<br/>ATMOSPHERE
        </h1>

        <div
          className={`mt-5 sm:mt-8 flex items-center justify-center gap-3 sm:gap-6 transition-all duration-700 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}
          style={{ transitionDelay: '350ms' }}
        >
          <div className="w-6 sm:w-10 h-px" style={{ background: '#d0d0d0' }} />
          <p className="text-[10px] sm:text-[13px] tracking-[0.15em] sm:tracking-[0.25em] font-light uppercase" style={{ color: '#a0a0a0' }}>
            Four elements · One spatial language
          </p>
          <div className="w-6 sm:w-10 h-px" style={{ background: '#d0d0d0' }} />
        </div>

        <div
          className={`mt-8 sm:mt-12 transition-all duration-700 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}
          style={{ transitionDelay: '500ms' }}
        >
          <button
            type="button"
            onClick={() => { whoosh(); clearState(); sessionStorage.removeItem('shre_welcome_shown'); navigate('/survey'); }}
            className="w-full max-w-[min(100%,320px)] sm:max-w-none sm:w-auto px-8 sm:px-16 py-3.5 sm:py-5 text-[13px] sm:text-[16px] uppercase tracking-[0.28em] sm:tracking-[0.5em] font-medium transition-all duration-500 ease-out sm:hover:tracking-[0.6em] active:scale-[0.97] rounded-full touch-manipulation min-h-[48px]"
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
      <div className={`absolute bottom-[max(1.25rem,env(safe-area-inset-bottom,0px)+0.5rem)] sm:bottom-8 left-1/2 -translate-x-1/2 z-10 text-center transition-all duration-700 ease-out px-4 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`} style={{ transitionDelay: '600ms' }}>
        <a href="https://shre.ge" target="_blank" rel="noopener noreferrer" className="text-[10px] sm:text-[11px] uppercase tracking-[0.2em] sm:tracking-[0.3em] font-light inline-block py-2 touch-manipulation" style={{ color: '#c0c0c0' }}>
          SHRE Studio · 2026
        </a>
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
  // Tracks options whose <img> failed to load (404, CORS, network, etc.). When
  // an image fails we hide the broken <img> tag and reveal an element-tinted
  // gradient behind it so the tile never gets stuck on the skeleton pulse —
  // previously a broken Unsplash photo (e.g. the old "Fjord silence" ID, or
  // any future link-rot) would leave the tile pulsing grey forever.
  const [imagesFailed, setImagesFailed] = useState<Record<string, boolean>>({});
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
    const baseAnalysis = calculateAnalysis(updatedState);
    // Attach the SHRE 7-section diagnosis to the analysis so the report
    // screen and the image-prompt builder can both read it from the same
    // place. Wrapped in try/catch: in production the diagnosis builder
    // logs validation errors and degrades gracefully; we never want a
    // diagnostic-only failure to break the survey-complete flow.
    let analysis = baseAnalysis;
    try {
      const diagnosis = buildDiagnosis(baseAnalysis);
      analysis = { ...baseAnalysis, diagnosis };
    } catch (err) {
      console.error('SHRE diagnosis build failed; falling back to base analysis', err);
    }
    // Pass the diagnosis through so the workspace material orbit mirrors
    // the report screen's picks exactly — fixes the SHRE MATERIAL
    // SELECTION LOCK rule "every material shown must have a clear
    // elemental reason" and the VARIATION RULE "do not show 5 versions
    // of white marble".
    const proportionalItems = getSelectionFromPercentages(
      analysis.percentages,
      analysis.diagnosis,
    );
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

  // SHRE v2.0 — the auto-redirect was removed. The user reads the diagnosis
  // report and clicks "Enter Workspace" to advance. If the diagnosis fails to
  // build (caught in finalizeSurvey), we render the legacy ring-only fallback
  // below as a graceful degradation path.

  if (showResult) {
    const diagnosis = completedState?.analysis?.diagnosis;

    // Happy path — render the SHRE 7-section diagnostic report.
    if (diagnosis) {
      return (
        <DiagnosisReport
          diagnosis={diagnosis}
          onEnterWorkspace={() => {
            whoosh();
            navigate('/core');
          }}
          onGenerateDirectly={() => {
            // User chose the "Generate" shortcut on the diagnosis report.
            // Goal: skip the workspace + gather/concept-modal review
            // steps and land on /generate, which is the only place that
            // actually calls the image API (generateImageFromPrompt).
            //
            // /generate (ResultsView) auto-runs its `run()` effect on
            // mount because the effect is keyed on `generationKey` (which
            // starts at 0) — buildUniversalPrompt + the API call fire
            // without any further user click. We just need to make sure
            // state.params has enough info for buildUniversalPrompt to
            // build a coherent brief: after the survey, params is `{}`,
            // so the workspace's space-config (domain / category /
            // rooms) would normally fill that in. For the shortcut we
            // inject sensible interior defaults if and only if those
            // fields are still empty — anything the user might have set
            // earlier (returning user from localStorage) is preserved.
            whoosh();
            setState((prev) => ({
              ...prev,
              params: {
                ...prev.params,
                domain: prev.params.domain ?? 'interior',
                category: prev.params.category ?? 'Living / Residential',
                rooms: (prev.params.rooms && prev.params.rooms.length)
                  ? prev.params.rooms
                  : ['Living Room'],
              },
            }));
            navigate('/generate');
          }}
        />
      );
    }

    // Fallback — preserved minimal legacy result screen for resilience.
    const dist = completedState?.analysis?.percentages || { earth: 25, fire: 25, water: 25, air: 25 };
    const sorted = (Object.entries(dist) as [Element, number][]).sort((a, b) => b[1] - a[1]);
    const domEl = sorted[0][0];
    const domColor = ELEMENT_COLORS[domEl];
    const headline = ENERGY_HEADLINES[domEl][Math.floor(Math.random() * 3)];
    const total = sorted.reduce((s, [, v]) => s + v, 0);
    return (
      <div
        className="min-h-app-main flex flex-col items-center justify-center bg-[#fafafa] px-4 sm:px-6"
        style={{ paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))', paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        <style>{`
          @keyframes resultFadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
          @keyframes barGrow{from{width:0}to{width:var(--bar-w)}}
          @keyframes ringPulse{0%,100%{box-shadow:0 0 0 0 var(--ring-c)}50%{box-shadow:0 0 0 12px transparent}}
        `}</style>
        <div className="max-w-sm w-full text-center" style={{ animation: 'resultFadeIn 0.6s ease-out' }}>
          <div className="w-20 h-20 rounded-full mx-auto mb-5 flex items-center justify-center"
            style={{
              background: `conic-gradient(${sorted.map(([el, val], i) => {
                const start = sorted.slice(0, i).reduce((s, [, v]) => s + (v / total) * 360, 0);
                const end = start + (val / total) * 360;
                return `${ELEMENT_COLORS[el]} ${start}deg ${end}deg`;
              }).join(', ')})`,
              boxShadow: `0 0 30px ${domColor}30`,
            }}>
            <div className="w-14 h-14 rounded-full bg-[#fafafa] flex items-center justify-center">
              <span className="text-[22px] font-light tracking-wide" style={{ color: domColor }}>
                {Math.round(sorted[0][1])}%
              </span>
            </div>
          </div>
          <h2 className="text-[20px] font-light tracking-[0.12em] mb-1" style={{ color: domColor }}>{headline}</h2>
          <p className="text-[11px] uppercase tracking-[0.35em] text-gray-400 font-light mb-6">Your Energy Profile</p>
          <div className="space-y-2.5 mb-6 text-left">
            {sorted.map(([el, val], i) => (
              <div key={el} className="flex items-center gap-3">
                <span className="text-[11px] uppercase tracking-[0.15em] w-12 text-right font-medium" style={{ color: ELEMENT_COLORS[el], opacity: i === 0 ? 1 : 0.6 }}>{el.slice(0, 5)}</span>
                <div className="flex-1 h-[6px] rounded-full overflow-hidden" style={{ background: `${ELEMENT_COLORS[el]}10` }}>
                  <div className="h-full rounded-full" style={{ width: `${(val / total) * 100}%`, background: ELEMENT_COLORS[el] }} />
                </div>
                <span className="text-[12px] font-mono tabular-nums w-9 text-right" style={{ color: ELEMENT_COLORS[el] }}>{Math.round(val)}%</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => { whoosh(); navigate('/core'); }}
            className="px-6 py-3 min-h-[44px] uppercase tracking-[0.25em] text-[11px] font-medium border border-[#1a1a1a] text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-[#fafafa] transition-colors duration-300"
          >
            Enter Workspace
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-app-main flex flex-col bg-[#fafafa]"
      style={{ paddingLeft: 'max(0.75rem, env(safe-area-inset-left))', paddingRight: 'max(0.75rem, env(safe-area-inset-right))' }}
    >
      {/* Numbered step progress — symmetric connectors, readable on narrow phones */}
      <div className="pt-3 sm:pt-6 pb-2 sm:pb-4 px-2 sm:px-4 shrink-0">
        <div className="max-w-lg sm:max-w-xl mx-auto flex items-start justify-between gap-0">
          {stepLabels.map((label, i) => (
            <div key={i} className="flex flex-col items-center gap-1 sm:gap-1.5 relative min-w-0 flex-1 max-w-[25%]">
              {i > 0 && (
                <div
                  className="absolute h-[1.5px] z-0"
                  style={{
                    top: 14,
                    right: '50%',
                    width: '100%',
                    background: qIndex > i - 1 ? '#1a1a1a' : '#e5e5e5',
                    transition: 'background 0.4s ease',
                  }}
                />
              )}
              <div
                className="relative z-10 flex shrink-0 items-center justify-center rounded-full transition-all duration-400"
                style={{
                  width: 28,
                  height: 28,
                  background: qIndex > i ? '#1a1a1a' : qIndex === i ? '#1a1a1a' : '#fff',
                  border: qIndex >= i ? '2px solid #1a1a1a' : '2px solid #d4d4d4',
                  color: qIndex >= i ? '#fff' : '#aaa',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {qIndex > i ? (
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 8.5 L6.5 12 L13 4" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className="w-full text-center uppercase font-medium transition-colors duration-300 leading-tight text-[9px] sm:text-[10px] tracking-[0.08em] sm:tracking-[0.12em] break-words px-0.5"
                style={{ color: qIndex >= i ? '#1a1a1a' : '#b0b0b0' }}
              >
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Question + visual grid — full page */}
      <div className="flex-grow flex min-h-0 items-center justify-center px-2 sm:px-6 md:px-8 py-1 sm:py-4">
        <div className="max-w-5xl w-full min-h-0">
          <div className={`transition-all duration-400 ease-out ${transitioning ? 'opacity-0 translate-y-3 scale-[0.98]' : 'opacity-100 translate-y-0 scale-100'}`}>
            {/* Question text */}
            <div className="text-center mb-3 sm:mb-6 md:mb-8 px-1">
              <h2 className="text-[clamp(1.05rem,4.2vw,1.875rem)] font-light tracking-tight text-black leading-snug">
                {q.text}
              </h2>
              {q.subtitle && (
                <p className="mt-1.5 sm:mt-3 text-[10px] sm:text-xs md:text-sm uppercase tracking-[0.18em] sm:tracking-[0.28em] md:tracking-[0.35em] text-neutral-400 font-light max-w-xl mx-auto">
                  {q.subtitle}
                </p>
              )}
            </div>

            {/* Visual image grid — 2×2 square tiles, equal gaps (symmetry) */}
            <div className="grid w-full max-w-[min(100%,28rem)] sm:max-w-xl md:max-w-2xl mx-auto grid-cols-2 gap-[clamp(0.5rem,2vw,0.75rem)]">
              {q.options.map((opt, i) => {
                const isSelected = answers[q.id] === i;
                const isHovered = hoveredOption === i;
                const imgKey = `${q.id}-${i}`;
                const loaded = imagesLoaded[imgKey];
                const failed = imagesFailed[imgKey];

                // Resolve the option's dominant element (highest weight) so
                // a failed image can fall back to an element-tinted gradient
                // instead of a blank grey skeleton. Tie-break order follows
                // the SHRE canon: earth > fire > water > air.
                const tieOrder: Element[] = ['earth', 'fire', 'water', 'air'];
                const primaryElement: Element = tieOrder.reduce((best, el) =>
                  (opt.weights[el] || 0) > (opt.weights[best] || 0) ? el : best,
                tieOrder[0]);
                const fallbackColor = ELEMENT_COLORS[primaryElement];

                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleAnswer(i)}
                    onMouseEnter={() => setHoveredOption(i)}
                    onMouseLeave={() => setHoveredOption(null)}
                    className="group relative w-full min-h-[44px] min-w-0 overflow-hidden rounded-[12px] focus:outline-none focus-visible:ring-2 focus-visible:ring-black/40 focus-visible:ring-offset-2 touch-manipulation"
                    style={{
                      aspectRatio: '1 / 1',
                      background: '#fff',
                      border: isSelected ? '3px solid #1a1a1a' : '1px solid rgba(0,0,0,0.08)',
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
                    {/* Skeleton loader — only while the image is genuinely
                        loading; on failure we switch straight to the
                        element-tinted fallback below so the tile never
                        pulses forever. */}
                    {!loaded && !failed && (
                      <div className="absolute inset-0 bg-gray-100 animate-pulse" />
                    )}

                    {/* Element-tinted fallback for broken images. Mirrors
                        the look of the photo tiles (radial highlight + dark
                        vignette) so a failed option still reads as a
                        coherent answer card, just coloured by its dominant
                        element. */}
                    {failed && (
                      <div
                        className="absolute inset-0"
                        style={{
                          background: `radial-gradient(circle at 30% 25%, ${fallbackColor}cc 0%, ${fallbackColor}88 45%, ${fallbackColor}44 100%)`,
                        }}
                      />
                    )}

                    {/* Image — full-bleed texture / scene photo */}
                    {opt.image && !failed && (
                      <img
                        src={opt.image}
                        alt={opt.text}
                        sizes="(max-width: 480px) 46vw, (max-width: 768px) 38vw, 360px"
                        decoding="async"
                        loading={qIndex === 0 ? 'eager' : 'lazy'}
                        onLoad={() => setImagesLoaded(prev => ({ ...prev, [imgKey]: true }))}
                        onError={() => {
                          setImagesFailed(prev => ({ ...prev, [imgKey]: true }));
                          setImagesLoaded(prev => ({ ...prev, [imgKey]: true }));
                        }}
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
                      className="absolute inset-0 pointer-events-none"
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
                    <div className="absolute bottom-0 left-0 right-0 p-2 sm:p-3 md:p-4 pb-2.5 sm:pb-3">
                      <span
                        className="block text-center text-white font-medium tracking-wide uppercase"
                        style={{
                          fontSize: isSelected ? 'clamp(11px, 3.1vw, 13px)' : 'clamp(9px, 2.8vw, 11px)',
                          letterSpacing: '0.08em',
                          textShadow: '0 1px 6px rgba(0,0,0,0.55)',
                          transition: 'font-size 0.3s ease',
                          lineHeight: 1.25,
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
          <div
            className="mt-3 sm:mt-6 flex flex-col items-center gap-2 sm:gap-3 shrink-0 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:pb-1"
          >
            <button
              type="button"
              onClick={() => { chime(); navigate('/core'); setTimeout(() => window.dispatchEvent(new Event('toggle-deep-dive')), 500); }}
              className="flex min-h-[44px] items-center justify-center gap-2 sm:gap-2.5 px-4 sm:px-6 py-2 sm:py-2.5 rounded-full transition-all duration-300 hover:bg-gray-100 active:scale-[0.97] group touch-manipulation"
              style={{ border: '1.5px solid rgba(0,0,0,0.12)' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5" strokeLinecap="round" className="opacity-70 group-hover:opacity-100 transition-opacity sm:w-4 sm:h-4">
                <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4" fill="#555" fillOpacity="0.15"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>
              </svg>
              <span className="text-[12px] sm:text-[13px] uppercase tracking-[0.15em] sm:tracking-[0.25em] font-medium text-gray-600 group-hover:text-black transition-colors">
                Deep Dive Test
              </span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/core')}
              className="min-h-[44px] px-3 py-2 text-[11px] uppercase tracking-[0.2em] sm:tracking-[0.35em] text-gray-300 hover:text-gray-500 font-light transition-colors touch-manipulation"
            >
              Skip to workspace
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- TEXTURE MAP: high-quality Unsplash textures for the DNA / brand panel.
// Mirrors the SHRE v2.1 curated 8-per-element catalog. Each visible material
// in the catalog gets a visually distinct stock photo so the DNA cards never
// fall back to a generic placeholder.
const MATERIAL_TEXTURES: Record<string, { url: string; alt: string }> = {
  // ── EARTH (8) ──────────────────────────────────────────────
  'Travertine (honed)':                       { url: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=400&h=400&fit=crop&q=80', alt: 'Honed travertine stone surface' },
  'Natural oak (horizontal)':                 { url: 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=400&h=400&fit=crop&q=80', alt: 'Natural oak horizontal grain' },
  'Clay plaster':                             { url: 'https://images.unsplash.com/photo-1615529328331-f8917597711f?w=400&h=400&fit=crop&q=80', alt: 'Clay plaster warm tones' },
  'Board-formed concrete':                    { url: 'https://images.unsplash.com/photo-1617791160505-6f00504e3519?w=400&h=400&fit=crop&q=80', alt: 'Board-formed concrete with formwork lines' },
  'Walnut veneer':                            { url: 'https://images.unsplash.com/photo-1541123603104-512919d6a96c?w=400&h=400&fit=crop&q=80', alt: 'Walnut veneer joinery surface' },
  'Industrial brick':                         { url: 'https://images.unsplash.com/photo-1587582345426-bf07f52b4543?w=400&h=400&fit=crop&q=80', alt: 'Industrial red brick wall' },
  'Pietra Serena (Tuscan)':                   { url: 'https://images.unsplash.com/photo-1618220179428-22790b461013?w=400&h=400&fit=crop&q=80', alt: 'Tuscan Pietra Serena grey-green sandstone' },
  'Tadelakt (warm pigmented Moroccan)':       { url: 'https://images.unsplash.com/photo-1615529328331-f8917597711f?w=400&h=400&fit=crop&q=80', alt: 'Tadelakt warm pigmented Moroccan plaster wall' },

  // ── FIRE (8) ───────────────────────────────────────────────
  'Dark marble (high contrast)':              { url: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=400&h=400&fit=crop&q=80', alt: 'Dark marble with white veining' },
  'Burnished antique brass':                  { url: 'https://images.unsplash.com/photo-1618424181497-157f25b6ddd5?w=400&h=400&fit=crop&q=80', alt: 'Burnished antique brass metal' },
  'Smoked / fumed oak':                       { url: 'https://images.unsplash.com/photo-1541123603104-512919d6a96c?w=400&h=400&fit=crop&q=80', alt: 'Smoked / fumed dark oak floor' },
  'Venetian plaster (polished)':              { url: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=400&h=400&fit=crop&q=80', alt: 'Polished Venetian plaster wall' },
  'Corten steel (weathering)':                { url: 'https://images.unsplash.com/photo-1533035353720-f1c6a75cd8ab?w=400&h=400&fit=crop&q=80', alt: 'Corten weathering steel with rust patina' },
  'Patagonia quartzite (smoky burgundy)':     { url: 'https://images.unsplash.com/photo-1474044159687-1ee9f3a51722?w=400&h=400&fit=crop&q=80', alt: 'Smoky burgundy Patagonia quartzite' },
  'Shou-sugi-ban (charred timber)':           { url: 'https://images.unsplash.com/photo-1545558014-8692077e9b5c?w=400&h=400&fit=crop&q=80', alt: 'Shou-sugi-ban charred timber cladding' },
  'Oxblood / rust velvet upholstery':         { url: 'https://images.unsplash.com/photo-1558171813-4c088753af8f?w=400&h=400&fit=crop&q=80', alt: 'Oxblood rust velvet upholstery' },

  // ── WATER (8) ──────────────────────────────────────────────
  'Microcement (continuous)':                 { url: 'https://images.unsplash.com/photo-1553356084-58ef4a67b2a7?w=400&h=400&fit=crop&q=80', alt: 'Continuous microcement floor' },
  'Smoke quartzite (silver-grey)':            { url: 'https://images.unsplash.com/photo-1474044159687-1ee9f3a51722?w=400&h=400&fit=crop&q=80', alt: 'Silver-grey smoke quartzite' },
  'Mirror-polished stainless steel':          { url: 'https://images.unsplash.com/photo-1533035353720-f1c6a75cd8ab?w=400&h=400&fit=crop&q=80', alt: 'Mirror-polished stainless steel' },
  'Reeded / ribbed fluted glass':             { url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&h=400&fit=crop&q=80', alt: 'Reeded fluted ribbed glass partition' },
  'Onice Acqua (translucent water-blue onyx)':{ url: 'https://images.unsplash.com/photo-1600210491892-03d3c28da189?w=400&h=400&fit=crop&q=80', alt: 'Translucent water-blue Onice Acqua onyx' },
  'Curved bent glass':                        { url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&h=400&fit=crop&q=80', alt: 'Curved bent glass partition' },
  'Sodalite Blue (deep midnight stone)':      { url: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=400&h=400&fit=crop&q=80', alt: 'Deep midnight Sodalite Blue stone' },
  'Glass mosaic tile (10–25 mm cool)':        { url: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=400&h=400&fit=crop&q=80', alt: 'Cool glass mosaic tile' },

  // ── AIR (8) ────────────────────────────────────────────────
  'White marble (Calacatta)':                 { url: 'https://images.unsplash.com/photo-1600210491892-03d3c28da189?w=400&h=400&fit=crop&q=80', alt: 'White Calacatta marble with subtle veining' },
  'Light oak / ash':                          { url: 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=400&h=400&fit=crop&q=80', alt: 'Light oak / ash pale wood floor' },
  'Limewash (bright)':                        { url: 'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=400&h=400&fit=crop&q=80', alt: 'Bright limewash matte wall' },
  'Clear glass (low-iron)':                   { url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&h=400&fit=crop&q=80', alt: 'Clear low-iron glass' },
  'Anodized champagne aluminium':             { url: 'https://images.unsplash.com/photo-1533035353720-f1c6a75cd8ab?w=400&h=400&fit=crop&q=80', alt: 'Anodized champagne aluminium thin profile' },
  'Pale concrete (smooth)':                   { url: 'https://images.unsplash.com/photo-1617791160505-6f00504e3519?w=400&h=400&fit=crop&q=80', alt: 'Pale smooth concrete' },
  'White Corian (curved seamless)':           { url: 'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=400&h=400&fit=crop&q=80', alt: 'Seamless curved White Corian solid surface' },
  'Sheer linen voile drapery':                { url: 'https://images.unsplash.com/photo-1558171813-4c088753af8f?w=400&h=400&fit=crop&q=80', alt: 'Sheer linen voile drapery' },

  // ── SHARED (4) ─────────────────────────────────────────────
  'Textured concrete (matte)':                { url: 'https://images.unsplash.com/photo-1617791160505-6f00504e3519?w=400&h=400&fit=crop&q=80', alt: 'Textured matte concrete' },
  'Brushed metal':                            { url: 'https://images.unsplash.com/photo-1533035353720-f1c6a75cd8ab?w=400&h=400&fit=crop&q=80', alt: 'Brushed metal directional grain' },
  'Solid oak':                                { url: 'https://images.unsplash.com/photo-1541123603104-512919d6a96c?w=400&h=400&fit=crop&q=80', alt: 'Solid oak with visible grain' },
  'Walnut (natural finish)':                  { url: 'https://images.unsplash.com/photo-1541123603104-512919d6a96c?w=400&h=400&fit=crop&q=80', alt: 'Natural walnut wood' },

  // ── ALIASES — legacy / short labels used elsewhere ────────
  'Natural Oak':                              { url: 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=400&h=400&fit=crop&q=80', alt: 'Natural oak surface' },
  'Walnut':                                   { url: 'https://images.unsplash.com/photo-1541123603104-512919d6a96c?w=400&h=400&fit=crop&q=80', alt: 'Walnut wood' },
  'Travertine':                               { url: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=400&h=400&fit=crop&q=80', alt: 'Travertine stone' },
  'Clay Plaster':                             { url: 'https://images.unsplash.com/photo-1615529328331-f8917597711f?w=400&h=400&fit=crop&q=80', alt: 'Clay plaster texture' },
  'Microcement':                              { url: 'https://images.unsplash.com/photo-1553356084-58ef4a67b2a7?w=400&h=400&fit=crop&q=80', alt: 'Microcement finish' },
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

// SHRE v2.1 — hotspot material-match arrays mirror the curated 8-per-element
// catalog. Each hotspot lists only materials that are plausibly used on that
// surface (floor / wall / furniture / etc) — extras are deliberately omitted.
const IMAGE_HOTSPOTS: HotspotZone[] = [
  { id: 'floor',     label: 'Floor',      labelGe: 'იატაკი',      category: 'flooring',  x: 25, y: 88, icon: '▭', materialMatch: ['Travertine (honed)', 'Natural oak (horizontal)', 'Walnut veneer', 'Pietra Serena (Tuscan)', 'Board-formed concrete', 'Smoked / fumed oak', 'Patagonia quartzite (smoky burgundy)', 'Microcement (continuous)', 'Glass mosaic tile (10–25 mm cool)', 'White marble (Calacatta)', 'Light oak / ash', 'Pale concrete (smooth)', 'Solid oak', 'Textured concrete (matte)'] },
  { id: 'wall',      label: 'Wall',       labelGe: 'კედელი',      category: 'wall',      x: 8,  y: 40, icon: '▯', materialMatch: ['Clay plaster', 'Tadelakt (warm pigmented Moroccan)', 'Board-formed concrete', 'Industrial brick', 'Venetian plaster (polished)', 'Corten steel (weathering)', 'Shou-sugi-ban (charred timber)', 'Microcement (continuous)', 'Limewash (bright)', 'White Corian (curved seamless)', 'Pale concrete (smooth)', 'Textured concrete (matte)'] },
  { id: 'furniture', label: 'Furniture',  labelGe: 'ავეჯი',       category: 'furniture', x: 38, y: 62, icon: '◫', materialMatch: ['Walnut veneer', 'Natural oak (horizontal)', 'Burnished antique brass', 'Light oak / ash', 'White Corian (curved seamless)', 'Anodized champagne aluminium', 'Solid oak', 'Walnut (natural finish)', 'Brushed metal'] },
  { id: 'seating',   label: 'Seating',    labelGe: 'სკამი',       category: 'seating',   x: 55, y: 68, icon: '◰', materialMatch: ['Oxblood / rust velvet upholstery', 'Sheer linen voile drapery', 'Solid oak', 'Walnut (natural finish)'] },
  { id: 'lighting',  label: 'Lighting',   labelGe: 'განათება',     category: 'lighting',  x: 35, y: 10, icon: '◎', materialMatch: ['Burnished antique brass', 'Brushed metal', 'Anodized champagne aluminium', 'Mirror-polished stainless steel', 'Clear glass (low-iron)', 'Reeded / ribbed fluted glass', 'Curved bent glass'] },
  { id: 'stone',     label: 'Stone',      labelGe: 'ქვა',         category: 'stone',     x: 72, y: 55, icon: '◆', materialMatch: ['White marble (Calacatta)', 'Travertine (honed)', 'Pietra Serena (Tuscan)', 'Dark marble (high contrast)', 'Patagonia quartzite (smoky burgundy)', 'Smoke quartzite (silver-grey)', 'Onice Acqua (translucent water-blue onyx)', 'Sodalite Blue (deep midnight stone)'] },
  { id: 'textile',   label: 'Textile',    labelGe: 'ტექსტილი',    category: 'textile',   x: 48, y: 52, icon: '◈', materialMatch: ['Oxblood / rust velvet upholstery', 'Sheer linen voile drapery'] },
  { id: 'metal',     label: 'Accents',    labelGe: 'აქსესუარი',   category: 'metal',     x: 88, y: 35, icon: '◇', materialMatch: ['Burnished antique brass', 'Corten steel (weathering)', 'Mirror-polished stainless steel', 'Anodized champagne aluminium', 'Brushed metal'] },
  { id: 'decor',     label: 'Decor',      labelGe: 'დეკორი',      category: 'decor',     x: 65, y: 38, icon: '✦', materialMatch: ['Clear glass (low-iron)', 'Reeded / ribbed fluted glass', 'Curved bent glass', 'Glass mosaic tile (10–25 mm cool)', 'Sheer linen voile drapery'] },
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
  // Flooring
  { id: 'boen',       name: 'Boen',           category: 'flooring',  specialty: 'Engineered Hardwood',    url: 'https://www.boen.com/floors' },
  { id: 'kährs',      name: 'Kährs',          category: 'flooring',  specialty: 'Premium Wood Floors',    url: 'https://www.kahrs.com/commercial/products' },
  { id: 'mutina',     name: 'Mutina',         category: 'flooring',  specialty: 'Designer Tiles',         url: 'https://www.mutina.it/collections' },
  // Stone
  { id: 'salvatori',  name: 'Salvatori',      category: 'stone',     specialty: 'Natural Stone',          url: 'https://www.salvatori.it/en/products' },
  // Furniture — sofas, tables, storage
  { id: 'poliform',   name: 'Poliform',       category: 'furniture', specialty: 'Contemporary Systems',   url: 'https://www.poliform.it/en/products/sofas' },
  { id: 'minotti',    name: 'Minotti',        category: 'furniture', specialty: 'Italian Luxury Sofas',   url: 'https://www.minotti.com/en/products/sofas' },
  { id: 'bbitalia',   name: 'B&B Italia',     category: 'furniture', specialty: 'Design Icons',           url: 'https://www.bebitalia.com/en/furniture/sofas' },
  { id: 'vitra',      name: 'Vitra',          category: 'furniture', specialty: 'Swiss Design Classics',  url: 'https://www.vitra.com/en-us/living/sofas' },
  { id: 'molteni-f',  name: 'Molteni&C',      category: 'furniture', specialty: 'Modular Living',         url: 'https://www.molteni.it/en/products/living' },
  { id: 'flexform',   name: 'Flexform',       category: 'furniture', specialty: 'Italian Comfort',        url: 'https://www.flexform.it/en/products/sofas' },
  { id: 'living-div', name: 'Living Divani',  category: 'furniture', specialty: 'Minimalist Forms',       url: 'https://www.livingdivani.it/en/products/sofas' },
  // Seating — chairs, dining, accent
  { id: 'cassina',    name: 'Cassina',        category: 'seating',   specialty: 'Iconic Chairs',          url: 'https://www.cassina.com/en/collection/chairs' },
  { id: 'fritz-h',    name: 'Fritz Hansen',   category: 'seating',   specialty: 'Danish Design',          url: 'https://fritzhansen.com/en/categories/chairs' },
  { id: 'hay',        name: 'HAY',            category: 'seating',   specialty: 'Contemporary Danish',    url: 'https://hay.dk/en/furniture/chairs' },
  { id: 'baxter',     name: 'Baxter',         category: 'seating',   specialty: 'Leather & Fabric',       url: 'https://www.bafranco.it/en/products/seating' },
  { id: 'moroso',     name: 'Moroso',         category: 'seating',   specialty: 'Art Furniture',          url: 'https://www.moroso.it/en/products' },
  // Lighting
  { id: 'flos',       name: 'Flos',           category: 'lighting',  specialty: 'Architectural Lighting', url: 'https://www.flos.com/professional' },
  { id: 'artemide',   name: 'Artemide',       category: 'lighting',  specialty: 'Design Luminaires',      url: 'https://www.artemide.com/en/products' },
  { id: 'vibia',      name: 'Vibia',          category: 'lighting',  specialty: 'Ambient Systems',        url: 'https://www.vibia.com/en/products' },
  { id: 'louis-p',    name: 'Louis Poulsen',  category: 'lighting',  specialty: 'Scandinavian Light',     url: 'https://www.louispoulsen.com/en/products' },
  { id: 'tomdixon',   name: 'Tom Dixon',      category: 'lighting',  specialty: 'Sculptural Light',       url: 'https://www.tomdixon.net/collections/lighting' },
  // Textile
  { id: 'kvadrat',    name: 'Kvadrat',        category: 'textile',   specialty: 'Premium Textiles',       url: 'https://www.kvadrat.dk/en/products' },
  { id: 'dedar',      name: 'Dedar',          category: 'textile',   specialty: 'Luxury Fabrics',         url: 'https://www.dedar.com/en/fabrics' },
  // Metal / Hardware
  { id: 'fantini',    name: 'Fantini',        category: 'metal',     specialty: 'Designer Fittings',      url: 'https://www.fantini.it/en/products' },
  { id: 'dornbracht', name: 'Dornbracht',     category: 'metal',     specialty: 'Precision Hardware',     url: 'https://www.dornbracht.com/en/products' },
  // Decor
  { id: 'menu',       name: 'Menu/Audo',      category: 'decor',     specialty: 'Curated Objects',        url: 'https://afrancdo.com/collections' },
  { id: 'ferm',       name: 'Ferm Living',    category: 'decor',     specialty: 'Scandinavian Decor',     url: 'https://www.fermliving.com/collections' },
  // Wall
  { id: 'farrow',     name: 'Farrow & Ball',  category: 'wall',      specialty: 'Paint & Wallpaper',      url: 'https://www.farrow-ball.com/paint-colours' },
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
  /** Natural aspect ratio of the loaded render, used to size the image frame
      so the render hugs the column without letterbox bands. Keeps hotspot
      orbs aligned to render pixels and lets the render command the page. */
  const [renderAspect, setRenderAspect] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  /** DNA panel open by default on phones too — collapsed 30vh cap hid sliders, orbit, and palette. */
  const [sidebarOpen, setSidebarOpen] = useState(true);

  /** Material DNA orbital — static diagram (no drag-to-rotate) */
  const [dnaOrbitHover, setDnaOrbitHover] = useState(false);
  const [dnaNucleusNear, setDnaNucleusNear] = useState(false);
  const dnaOrbitalRef = useRef<HTMLDivElement | null>(null);

  const updateDnaNucleusProximity = useCallback((clientX: number, clientY: number) => {
    const el = dnaOrbitalRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const scale = Math.min(rect.width / 200, rect.height / 200) || 1;
    const near = Math.hypot(clientX - cx, clientY - cy) < 28 * scale;
    setDnaNucleusNear((prev) => {
      if (near && !prev && typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(pointer: fine)').matches) {
        dnaNucleusResonance();
      }
      return near;
    });
  }, []);
  const [hoveredHotspot, setHoveredHotspot] = useState<string | null>(null);
  const [hoveredBrand, setHoveredBrand] = useState<string | null>(null);
  const [activeHotspot, setActiveHotspot] = useState<string | null>(null);
  const [materialPickerOpen, setMaterialPickerOpen] = useState(false);
  useEffect(() => {
    if (materialPickerOpen) setSidebarOpen(true);
  }, [materialPickerOpen]);
  const [materialsChanged, setMaterialsChanged] = useState(false);
  // Custom-material modal — opened from the new "Materials used in this space"
  // dashboard card on the results view.
  const [showCustomMatModal, setShowCustomMatModal] = useState(false);
  const [editingCustomMat, setEditingCustomMat] = useState<CustomMaterial | null>(null);
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
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [targetedEditMode, setTargetedEditMode] = useState(false);
  const [targetedEditText, setTargetedEditText] = useState<string | null>(null);
  const refinementFeedbackRef = React.useRef<string | null>(null);
  /** Prior targeted-edit instructions keyed by the image URL they were applied from (follow-up edits stay on-topic). */
  const editThreadsByImageUrlRef = React.useRef<Record<string, string[]>>({});

  const [scaleAreaDraft, setScaleAreaDraft] = useState(() => String(state.params.squareMeters ?? 120));
  const [scaleCeilingDraft, setScaleCeilingDraft] = useState(() => String(state.params.ceilingHeight ?? 2.8));

  React.useEffect(() => {
    setScaleAreaDraft(String(state.params.squareMeters ?? 120));
    setScaleCeilingDraft(String(state.params.ceilingHeight ?? 2.8));
  }, [state.params.squareMeters, state.params.ceilingHeight]);

  const parseScaleDrafts = React.useCallback((): { area: number; ceil: number } => {
    const a = parseFloat(scaleAreaDraft.replace(',', '.'));
    const c = parseFloat(scaleCeilingDraft.replace(',', '.'));
    const area = Number.isFinite(a) ? Math.max(8, Math.min(50000, Math.round(a))) : (state.params.squareMeters ?? 120);
    const ceil = Number.isFinite(c) ? Math.max(2, Math.min(12, Math.round(c * 10) / 10)) : (state.params.ceilingHeight ?? 2.8);
    return { area, ceil };
  }, [scaleAreaDraft, scaleCeilingDraft, state.params.squareMeters, state.params.ceilingHeight]);

  const scaleDirty = React.useMemo(() => {
    const { area, ceil } = parseScaleDrafts();
    const ca = state.params.squareMeters ?? 120;
    const cc = state.params.ceilingHeight ?? 2.8;
    return area !== ca || ceil !== cc;
  }, [parseScaleDrafts, state.params.squareMeters, state.params.ceilingHeight]);

  const displayedImageUrl = selectedHistoryImage ?? imageUrl;
  const isEditingMaterials = materialPickerOpen || materialsChanged;

  React.useEffect(() => {
    setImageLoaded(false);
    setRenderAspect(null);
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

  /**
   * Save a user-defined custom material from the results dashboard
   * (called by `AddCustomMaterialModal`). Persists it on
   * `state.customMaterials` and auto-selects it into
   * `state.refinement.selectedMaterials` so it shows up in the
   * "Materials used in this space" panel immediately.
   */
  const addCustomMaterialFromResults = (material: CustomMaterial) => {
    setSelectedHistoryImage(null);
    setState(prev => {
      const existing = prev.customMaterials ?? [];
      const replaceIdx = existing.findIndex((m) => m.id === material.id);
      const nextCustom = replaceIdx >= 0
        ? existing.map((m, i) => (i === replaceIdx ? material : m))
        : [...existing, material];

      const sel = prev.refinement.selectedMaterials;
      const existingSelIdx = sel.findIndex((m) => m.id === material.id);
      let nextSelected: MaterialDef[];
      if (existingSelIdx >= 0) {
        nextSelected = sel.map((m, i) => (i === existingSelIdx ? material : m));
      } else {
        const MAX = 7;
        if (sel.length >= MAX) {
          const sameElIdx = sel.findIndex((m) => m.element === material.element);
          const removeIdx = sameElIdx >= 0 ? sameElIdx : sel.length - 1;
          nextSelected = [...sel];
          nextSelected.splice(removeIdx, 1);
          nextSelected.push(material);
        } else {
          nextSelected = [...sel, material];
        }
      }
      return {
        ...prev,
        customMaterials: nextCustom,
        refinement: { ...prev.refinement, selectedMaterials: nextSelected, hasUserRefined: true },
      };
    });
    setMaterialsChanged(true);
    setShowCustomMatModal(false);
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

  const professionalRecs = React.useMemo(
    () =>
      getRecommendedProfessionalPartners(
        {
          squareMeters: state.params.squareMeters ?? 120,
          category: state.params.category,
          domain: state.params.domain ?? 'interior',
        },
        { perRole: 6 },
      ),
    [state.params.squareMeters, state.params.category, state.params.domain],
  );

  const architectsAndDesigners = React.useMemo(() => {
    const seen = new Set<string>();
    const out: ProfessionalPartner[] = [];
    for (const p of professionalRecs.architect) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
    for (const p of professionalRecs.designer) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
    return out;
  }, [professionalRecs]);

  // Build DNA materials
  const dnaMaterials = React.useMemo(() => {
    const mats = [...selectedMaterials];
    if (mats.length < 3) {
      const MATERIALS_BY_ELEMENT: Record<Element, string[]> = {
        // SHRE v2.1 — curated 8-per-element catalog (mirrors materialsCatalog.ts
        // ordering so the picker reads category-interleaved on every element).
        earth: ['Travertine (honed)', 'Natural oak (horizontal)', 'Clay plaster', 'Board-formed concrete', 'Walnut veneer', 'Industrial brick', 'Pietra Serena (Tuscan)', 'Tadelakt (warm pigmented Moroccan)'],
        fire:  ['Dark marble (high contrast)', 'Burnished antique brass', 'Smoked / fumed oak', 'Venetian plaster (polished)', 'Corten steel (weathering)', 'Patagonia quartzite (smoky burgundy)', 'Shou-sugi-ban (charred timber)', 'Oxblood / rust velvet upholstery'],
        water: ['Microcement (continuous)', 'Smoke quartzite (silver-grey)', 'Mirror-polished stainless steel', 'Reeded / ribbed fluted glass', 'Onice Acqua (translucent water-blue onyx)', 'Curved bent glass', 'Sodalite Blue (deep midnight stone)', 'Glass mosaic tile (10–25 mm cool)'],
        air:   ['White marble (Calacatta)', 'Light oak / ash', 'Limewash (bright)', 'Clear glass (low-iron)', 'Anodized champagne aluminium', 'Pale concrete (smooth)', 'White Corian (curved seamless)', 'Sheer linen voile drapery'],
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

  const budgetEstimate = React.useMemo(() => {
    const area = state.params.squareMeters || 120;
    const cat = state.params.category || 'Living / Residential';
    const dom = state.params.domain || 'interior';

    const BASE_RATES: Record<string, { low: number; mid: number; high: number }> = {
      'Living / Residential': { low: 400, mid: 900, high: 2200 },
      'Office / Commercial': { low: 350, mid: 800, high: 1800 },
      'Restaurant / Cafe': { low: 500, mid: 1100, high: 2800 },
      'Hotel / Hospitality': { low: 550, mid: 1200, high: 3200 },
      'Retail / Showroom': { low: 450, mid: 1000, high: 2500 },
      'Cultural / Public': { low: 600, mid: 1400, high: 3500 },
    };
    const rate = BASE_RATES[cat] || { low: 400, mid: 900, high: 2200 };

    if (dom === 'architecture') {
      rate.low *= 2.2;
      rate.mid *= 2.2;
      rate.high *= 2.2;
    }

    const MATERIAL_TIER: Record<string, number> = {
      'Carrara Marble': 1.35, 'Travertine': 1.25, 'Terrazzo': 1.2, 'Venetian Plaster': 1.15,
      'Brass': 1.3, 'Copper': 1.25, 'Bronze': 1.3, 'Blackened Steel': 1.15,
      'Walnut': 1.1, 'Oak': 1.05, 'Teak': 1.2, 'Bamboo': 0.95,
      'Linen': 0.95, 'Velvet': 1.15, 'Leather': 1.2, 'Wool': 1.1,
      'Concrete': 0.9, 'Raw Concrete': 0.85, 'Microcement': 1.05,
      'Glass': 1.1, 'Smoked Glass': 1.15, 'Frosted Glass': 1.1,
    };
    let matMultiplier = 1.0;
    const matNames = dnaMaterials.map(m => m.name);
    let tierCount = 0;
    matNames.forEach(n => {
      if (MATERIAL_TIER[n]) { matMultiplier += (MATERIAL_TIER[n] - 1); tierCount++; }
    });
    if (tierCount > 0) matMultiplier = 1 + (matMultiplier - 1) / Math.max(1, tierCount * 0.7);

    const fireRatio = (dist.fire || 25) / 100;
    const luxuryBias = 1 + fireRatio * 0.15;

    const lowTotal = Math.round(area * rate.low * matMultiplier * luxuryBias);
    const midTotal = Math.round(area * rate.mid * matMultiplier * luxuryBias);
    const highTotal = Math.round(area * rate.high * matMultiplier * luxuryBias);

    const breakdown = [
      { label: 'Construction & Base', pct: dom === 'architecture' ? 40 : 25 },
      { label: 'Materials & Finishes', pct: 30 },
      { label: 'Furniture & Fixtures', pct: dom === 'architecture' ? 10 : 25 },
      { label: 'Lighting & MEP', pct: 12 },
      { label: 'Decor & Accessories', pct: dom === 'architecture' ? 3 : 8 },
      { label: 'Design & Management', pct: dom === 'architecture' ? 5 : 0 },
    ].filter(b => b.pct > 0).map(b => ({
      ...b,
      low: Math.round(lowTotal * b.pct / 100),
      mid: Math.round(midTotal * b.pct / 100),
      high: Math.round(highTotal * b.pct / 100),
    }));

    return { area, lowTotal, midTotal, highTotal, breakdown, matMultiplier, luxuryBias };
  }, [state.params, dist, dnaMaterials]);

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

    const finishGeneration = (
      imgUrl: string,
      scale: { area: number; ceil: number },
      editMeta?: { baseImageUrl: string; instruction: string } | null,
    ) => {
      if (cancelled) return;
      if (editMeta) {
        const prev = editThreadsByImageUrlRef.current[editMeta.baseImageUrl] || [];
        const next = [...prev, editMeta.instruction].slice(-12);
        editThreadsByImageUrlRef.current = {
          ...editThreadsByImageUrlRef.current,
          [imgUrl]: next,
        };
      }
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
          const roomLabel = state.params.rooms?.[0] || space;
          const matSnippet = mats.slice(0, 3).map(m => m.name).join(', ');
          const adjSnippet = adjs.slice(0, 2).map(a => a.label).join(' & ');
          const conceptParts = [
            `${roomLabel} — ${dominant} ${Math.round(p[dominant])}% / ${secondary} ${Math.round(p[secondary])}%`,
            matSnippet ? `Materials: ${matSnippet}` : null,
            adjSnippet ? `Mood: ${adjSnippet}` : null,
            `${scale.area} m² · ceiling ${scale.ceil} m`,
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
            areaM2: scale.area,
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

        const scaleSnap = parseScaleDrafts();
        setState((prev) => ({
          ...prev,
          params: { ...prev.params, squareMeters: scaleSnap.area, ceilingHeight: scaleSnap.ceil },
        }));

        const isTargeted = targetedEditMode && targetedEditText && displayedImageUrl;

        if (isTargeted && displayedImageUrl) {
          const currentDist = state.refinement.refinedPercentages || state.analysis?.percentages || { earth: 25, fire: 25, water: 25, air: 25 };
          const sortedEls = (['earth', 'fire', 'water', 'air'] as Element[]).sort((a, b) => currentDist[b] - currentDist[a]);
          const dom = sortedEls[0];
          const mats = (state.refinement.selectedMaterials || []).map(m => ({ name: m.name, element: m.element }));
          const adjs = (state.refinement.selectedAdjectives || []).map(a => ({ label: a.label, element: a.element }));
          const priorEdits = editThreadsByImageUrlRef.current[displayedImageUrl] || [];
          const editPrompt = buildTargetedEditPrompt(
            targetedEditText!,
            dom,
            currentDist,
            mats,
            adjs,
            state.params.domain || 'interior',
            state.params.category || 'Living / Residential',
            priorEdits,
          );
          const turn = (priorEdits.length || 0) + 1;
          setStory(`Edit (${turn}): ${targetedEditText}`);
          const renderFile = await dataUrlToFile(displayedImageUrl);
          const imgUrl = await generateImageFromPrompt('', renderFile, '16:9', editPrompt);
          const editSnapshot = { baseImageUrl: displayedImageUrl, instruction: targetedEditText! };
          setTargetedEditMode(false);
          setTargetedEditText(null);
          if (!cancelled) finishGeneration(imgUrl, scaleSnap, editSnapshot);
        } else {
          editThreadsByImageUrlRef.current = {};
          const stateForPrompt = {
            ...state,
            params: { ...state.params, squareMeters: scaleSnap.area, ceilingHeight: scaleSnap.ceil },
          };
          const result = buildUniversalPrompt(stateForPrompt, {
            generationIndex: generationKey,
            refinementFeedback: feedback || undefined,
          });
          setStory(result.promptStory);

          // Choose the most informative reference image to feed Gemini.
          // The floor plan, when uploaded, MUST be sent — otherwise the
          // model has no way to follow the spatial layout the user drew.
          const planFile = (state.params as any).architecturalPlan as File | undefined;
          const spacePhotoFile = (state.params as any).spacePhoto as File | undefined;
          const generalReferenceFile = (state.params as any).referenceImage as File | undefined;
          let refFile: File | undefined;
          let refKind: 'plan' | 'space-photo' | 'reference' | undefined;
          if (planFile) {
            refFile = planFile;
            refKind = 'plan';
          } else if (spacePhotoFile) {
            refFile = spacePhotoFile;
            refKind = 'space-photo';
          } else if (generalReferenceFile) {
            refFile = generalReferenceFile;
            refKind = 'reference';
          } else if (directionPhoto) {
            refFile = directionPhoto;
            refKind = 'reference';
          }

          const imgUrl = await generateImageFromPrompt(
            result.imagePrompt,
            refFile,
            result.aspectRatio,
            undefined,
            refKind,
          );
          if (!cancelled) finishGeneration(imgUrl, scaleSnap);
        }
      } catch (err: any) {
        if (cancelled) return;
        console.error('Generation error:', err);
        setLoading(false);
        setTargetedEditMode(false);
        setTargetedEditText(null);
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
    const isKeyProblem =
      /GEMINI_KEY_SUSPENDED|GEMINI_KEY_INVALID|suspend|consumer_suspended|api key/i.test(genError);
    const isSuspended = /GEMINI_KEY_SUSPENDED|suspend/i.test(genError);
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center bg-[#fafafa] relative overflow-hidden px-4 py-8 overflow-y-auto">
        <div className="relative z-10 flex flex-col items-center max-w-lg px-6 w-full">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mb-6" style={{ background: `${domColor}10`, border: `1.5px solid ${domColor}25` }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={domColor} strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <h2 className="text-[14px] uppercase tracking-[0.4em] font-semibold text-gray-600 mb-3 text-center">
            {isKeyProblem ? 'API Key გესაჭიროება' : 'გენერაცია ვერ შესრულდა'}
          </h2>
          {!isKeyProblem && (
            <p className="text-[13px] text-gray-500 text-center leading-relaxed mb-2">{genError}</p>
          )}

          {isKeyProblem && (
            <ApiKeyEntryPanel
              isSuspended={isSuspended}
              onSaved={() => {
                setGenError(null);
                setLoading(true);
                setPhase('generating');
                setLoadProgress(0);
                setGenerationKey(k => k + 1);
              }}
            />
          )}

          <div className="flex gap-3 mt-4">
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
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center bg-[#fafafa] relative overflow-hidden px-4">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(600px,140vw)] h-[min(600px,140vw)] rounded-full opacity-[0.04]" style={{ background: `radial-gradient(circle, ${domColor}, transparent 70%)` }} />
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
    <div className="flex-1 min-h-0 flex flex-col overflow-x-hidden overflow-y-auto md:overflow-hidden bg-[#fafafa] relative w-full min-h-[50dvh]">

      {/* ═══ MAIN AREA — image + sidebar ═══ */}
      <div className="flex-1 flex flex-col md:flex-row overflow-visible md:overflow-hidden relative min-h-0">

        {/* ── HERO IMAGE + HOTSPOTS — on mobile cap height so Material DNA (below) stays usable ── */}
        <div
          className={`relative flex flex-col overflow-hidden transition-all duration-700 ease-[cubic-bezier(0.22,0.61,0.36,1)] min-w-0 min-h-0 max-md:flex-shrink-0 max-md:flex-none md:flex-1 max-md:sticky max-md:top-11 max-md:z-30 max-md:bg-[#fafafa] max-md:shadow-[0_6px_20px_-8px_rgba(0,0,0,0.08)] ${
            isEditingMaterials && sidebarOpen ? 'md:flex-[1_1_55%]' : ''
          } ${isRevealed ? 'opacity-100' : 'opacity-0 scale-[1.02]'}`}
        >

          {/* Image container — the render is the hero. Padding is minimal so
              the image gets the largest possible footprint on every viewport,
              and `object-contain` keeps the full render in view (never cropped). */}
          <div className={`flex-1 md:flex-1 flex items-center justify-center relative z-10 w-full min-h-0 max-md:max-h-[min(48dvh,460px)] md:max-h-none transition-all duration-500 ${isEditingMaterials ? 'p-1.5 sm:p-3' : 'p-1 sm:p-2'}`}>
            {displayedImageUrl && (
              <div className={`relative w-full max-w-full overflow-hidden transition-all duration-700 ease-out max-md:aspect-[16/9] max-md:min-h-[min(200px,30dvh)] max-md:max-h-[min(48dvh,460px)] md:flex md:items-center md:justify-center md:h-full md:min-h-0 md:max-h-none md:aspect-auto ${isRevealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'} ${isEditingMaterials ? 'scale-[0.95]' : 'scale-100'}`}>
                {/* Shadow / frame wrapper. On desktop, when the render's
                    natural aspect ratio is known we apply `aspectRatio` so the
                    frame hugs the image exactly (no letterbox bands) and the
                    hotspot orbs land on render pixels. `w-full + max-h-full`
                    lets the browser pick the larger constraint (the smaller of
                    width or height) while preserving aspect. */}
                <div className={`relative max-w-full min-h-[220px] md:min-h-0 rounded-lg overflow-hidden transition-all duration-500 ${isEditingMaterials ? 'shadow-lg shadow-black/5' : 'shadow-2xl shadow-black/10'} ${renderAspect ? 'w-full max-md:h-full md:max-h-full' : 'w-full h-full'}`}
                     style={renderAspect ? { aspectRatio: renderAspect } : undefined}>
                  <div className="absolute inset-0 rounded-lg overflow-hidden border border-white/50 bg-gray-100/60">
                    <img src={displayedImageUrl} alt="Architectural visualization"
                      className={`w-full h-full object-contain transition-all duration-[2s] ease-out cursor-zoom-in ${imageLoaded ? 'opacity-100 scale-100' : 'opacity-40 scale-[1.01]'}`}
                      onLoad={(e) => {
                        setImageLoaded(true);
                        const t = e.currentTarget;
                        if (t.naturalWidth && t.naturalHeight) {
                          setRenderAspect(`${t.naturalWidth} / ${t.naturalHeight}`);
                        }
                      }}
                      onClick={() => setZoomedImage(displayedImageUrl)}
                      key={displayedImageUrl} />
                    {/* PRIMARY ELEMENT overlay — top-left card matching the
                        reference (element name + behavioural caption + DETAILS
                        link to the Diagnosis report). */}
                    {isComplete && (
                      <div className="absolute top-4 left-4 z-[15] max-w-[200px] sm:max-w-[240px] animate-fade-in"
                           style={{ animationDuration: '0.6s' }}>
                        <p className="text-[9px] uppercase tracking-[0.3em] font-medium mb-1.5"
                           style={{ color: 'rgba(255,255,255,0.7)', textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
                          Primary element
                        </p>
                        <p className="text-[28px] sm:text-[36px] uppercase tracking-[0.06em] font-semibold leading-none mb-2.5"
                           style={{ color: '#fff', textShadow: '0 2px 12px rgba(0,0,0,0.45)' }}>
                          {dominant}
                        </p>
                        <p className="text-[11px] font-light leading-snug mb-3"
                           style={{ color: 'rgba(255,255,255,0.82)', textShadow: '0 1px 6px rgba(0,0,0,0.45)' }}>
                          {dominant === 'earth' && 'Structural stability, warmth and grounded presence.'}
                          {dominant === 'fire' && 'Dramatic warmth, oxidized depth and cinematic energy.'}
                          {dominant === 'water' && 'Reflective fluidity, cool clarity and sculptural curves.'}
                          {dominant === 'air' && 'Luminous transparency, lightness and forward-looking openness.'}
                        </p>
                        {state.analysis?.diagnosis && (
                          <button onClick={() => navigate('/diagnosis-report')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] uppercase tracking-[0.2em] font-semibold transition-all hover:bg-white/15"
                            style={{
                              background: 'rgba(255,255,255,0.10)',
                              border: '1px solid rgba(255,255,255,0.30)',
                              color: '#fff',
                              backdropFilter: 'blur(8px)',
                            }}>
                            Details
                            <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                              <path d="M3 6 L9 6 M6 3 L9 6 L6 9" />
                            </svg>
                          </button>
                        )}
                      </div>
                    )}
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

          {/* Scale — one thin row; Regenerate only when values differ (like DNA tweak) */}
          {isComplete && displayedImageUrl && (
            <div className="flex-shrink-0 border-t border-gray-100/80 bg-white/55">
              <div className="flex items-center gap-2 px-2 sm:px-3 py-1">
                <span className="text-[8px] uppercase tracking-[0.2em] text-gray-400 font-medium shrink-0">Scale</span>
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1 tabular-nums text-[9px] sm:text-[10px] text-gray-600">
                  <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    spellCheck={false}
                    aria-label="Area square meters"
                    className="w-10 sm:w-11 bg-transparent border-0 border-b border-gray-200/90 focus:border-gray-400 px-0 py-0.5 text-right focus:outline-none focus:ring-0"
                    value={scaleAreaDraft}
                    onChange={(e) => setScaleAreaDraft(e.target.value.replace(/[^\d.]/g, ''))}
                  />
                  <span className="text-gray-400 shrink-0">m²</span>
                  <span className="text-gray-200 shrink-0">·</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    spellCheck={false}
                    aria-label="Ceiling height meters"
                    className="w-8 sm:w-9 bg-transparent border-0 border-b border-gray-200/90 focus:border-gray-400 px-0 py-0.5 text-right focus:outline-none focus:ring-0"
                    value={scaleCeilingDraft}
                    onChange={(e) => setScaleCeilingDraft(e.target.value.replace(/[^\d.,]/g, '').replace(',', '.'))}
                  />
                  <span className="text-gray-400 shrink-0">m</span>
                </div>
                <div
                  className={`shrink-0 overflow-hidden transition-all duration-300 ease-out ${
                    scaleDirty ? 'max-w-[140px] opacity-100 translate-x-0' : 'max-w-0 opacity-0 translate-x-1 pointer-events-none'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      const { area, ceil } = parseScaleDrafts();
                      setScaleAreaDraft(String(area));
                      setScaleCeilingDraft(String(ceil));
                      chime();
                      setSelectedHistoryImage(null);
                      setLoading(true);
                      setPhase('generating');
                      setLoadProgress(0);
                      setImageLoaded(false);
                      setImageUrl(null);
                      setState((prev) => {
                        const next = { ...prev.params, squareMeters: area, ceilingHeight: ceil };
                        delete next.spaceSummaryLine;
                        return { ...prev, params: next };
                      });
                      setGenerationKey((k) => k + 1);
                    }}
                    className="whitespace-nowrap text-[8px] uppercase tracking-[0.16em] font-semibold px-2.5 py-1 rounded-md transition-all active:scale-[0.97] text-white shadow-sm"
                    style={{
                      background: scaleDirty ? `linear-gradient(135deg, ${domColor}, ${domColor}cc)` : 'transparent',
                      boxShadow: scaleDirty ? `0 1px 6px ${domColor}35` : 'none',
                    }}
                  >
                    Regenerate
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Concept Brief strip — compact inline */}
          {isComplete && (
            <div className="flex-shrink-0 px-2 sm:px-3 py-1.5 transition-all duration-700 ease-out"
              style={{ transitionDelay: '400ms' }}>
              <div className="flex items-center justify-between gap-2 sm:gap-3">
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: domColor, opacity: 0.7 }} />
                  <span className="text-[10px] sm:text-[11px] uppercase tracking-[0.15em] sm:tracking-[0.2em] text-gray-600 font-semibold flex-shrink-0">{spaceType}</span>
                  <span className="text-gray-200 text-[10px] flex-shrink-0 hidden sm:inline">·</span>
                  <span className="text-[10px] uppercase tracking-[0.1em] text-gray-400 font-light flex-shrink-0 hidden sm:inline">{domain}</span>
                  {(() => {
                    const conceptText = activeHistoryEntry && activeHistoryEntry.id !== 'current' ? activeHistoryEntry.concept : story;
                    return conceptText ? (
                      <>
                        <span className="text-gray-200 text-[10px] flex-shrink-0 hidden md:inline">—</span>
                        <span className="text-[10px] text-gray-400 font-light truncate hidden md:inline">{conceptText}</span>
                      </>
                    ) : null;
                  })()}
                </div>
                <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
                  <button onClick={() => setBudgetOpen(true)}
                    className="px-2 sm:px-2.5 py-0.5 border text-[8px] uppercase tracking-[0.15em] sm:tracking-[0.2em] font-semibold rounded transition-all flex items-center gap-1 touch-target-auto"
                    style={{ borderColor: `${domColor}30`, color: domColor, background: `${domColor}06` }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = `${domColor}60`; e.currentTarget.style.background = `${domColor}10`; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = `${domColor}30`; e.currentTarget.style.background = `${domColor}06`; }}>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                    <span className="hidden sm:inline">Budget</span>
                  </button>
                  <button onClick={() => window.print()}
                    className="px-1.5 sm:px-2 py-0.5 border border-gray-200 text-[8px] uppercase tracking-[0.15em] sm:tracking-[0.2em] font-medium text-gray-400 hover:border-gray-400 hover:text-gray-600 rounded transition-all bg-white/60 touch-target-auto">
                    Export
                  </button>
                  <button onClick={() => navigate('/core')}
                    className="px-1.5 sm:px-2 py-0.5 border border-gray-200 text-[8px] uppercase tracking-[0.15em] sm:tracking-[0.2em] font-medium text-gray-400 hover:border-gray-400 hover:text-gray-600 rounded transition-all bg-white/60 touch-target-auto hidden sm:inline-flex">
                    Re-calibrate
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── MATERIAL DNA SIDEBAR ── */}
        <div className={`relative z-10 bg-white border-l md:border-l border-t md:border-t-0 border-gray-100/60 flex flex-col overflow-hidden shrink-0 transition-all duration-700 ease-[cubic-bezier(0.22,0.61,0.36,1)] ${
          sidebarOpen
            ? 'w-full md:w-[340px] flex-1 min-h-0 max-md:min-h-[min(42dvh,400px)] md:flex-none md:max-h-none'
            : 'w-full md:w-[44px] max-h-[44px] md:max-h-none flex-none'
        } ${isRevealed ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'}`}
          style={{ transitionDelay: isRevealed ? '300ms' : '0ms' }}>

          {/* Collapsed state */}
          {!sidebarOpen && (
            <button onClick={() => setSidebarOpen(true)}
              className="flex-1 flex md:flex-col flex-row items-center justify-center gap-2 md:gap-3 py-2 md:py-6 px-4 md:px-0 group transition-all hover:bg-gray-50/50 touch-target-auto">
              <div className="w-6 h-6 rounded-full flex items-center justify-center shadow-sm flex-shrink-0"
                style={{ background: `radial-gradient(circle at 35% 35%, ${domColor}30, ${domColor}70)`, border: `1px solid ${domColor}40` }}>
                <span className="text-white text-[11px] font-semibold">{dnaMaterials.length}</span>
              </div>
              <div className="hidden md:flex flex-col items-center" style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>
                <span className="text-[11px] uppercase tracking-[0.3em] text-gray-400 font-medium group-hover:text-gray-600 transition-colors">Material DNA</span>
              </div>
              <span className="md:hidden text-[11px] uppercase tracking-[0.2em] text-gray-400 font-medium group-hover:text-gray-600 transition-colors">Material DNA</span>
              <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="#bbb" strokeWidth="1.5" strokeLinecap="round" className="md:mt-1 group-hover:stroke-gray-600 transition-colors md:rotate-0 -rotate-90">
                <path d="M8 3 L5 6 L8 9" />
              </svg>
            </button>
          )}

          {/* Expanded state */}
          {sidebarOpen && (
            <div className="flex flex-col h-full">
              {/* ═══ HEADER — fixed ═══ */}
              <div className="flex-shrink-0 px-4 pt-3 pb-1.5 bg-white z-10 border-b border-gray-100/80">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[12px] uppercase tracking-[0.25em] text-gray-400 font-medium">Material DNA</p>
                    <p className="text-[8px] text-gray-400/65 font-light tracking-[0.12em] mt-0.5">Materials · atmosphere · balance</p>
                  </div>
                  <button onClick={() => setSidebarOpen(false)}
                    className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors">
                    <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="#999" strokeWidth="1.5" strokeLinecap="round"><path d="M4 3 L7 6 L4 9" /></svg>
                  </button>
                </div>
              </div>

              {/* ═══ SCROLLABLE BODY ═══ */}
              <div className="flex-1 overflow-y-auto custom-scroll min-h-0">
              <div className="px-4 pt-2 pb-2">

                {/* Orbit + compact element regulator side-by-side.
                    Reference layout: orbital diagram on the left, the four
                    element sliders sit immediately to its right (instead of
                    stacked below) so the panel is shorter and reads at a
                    glance. Sliders keep the same applyNewVal handler — only
                    the visual proportions change. */}
                <div className="flex flex-col md:flex-row md:items-center gap-3">
                {(() => {
                  const VB = 200;
                  const CX = 100;
                  const CY = 100;
                  const ROUT = 76;
                  const RIN = 42;
                  const EL_ANGLES: Record<Element, number> = { air: -90, fire: 0, earth: 90, water: 180 };
                  const matsByEl: Record<Element, typeof dnaMaterials> = { earth: [], fire: [], water: [], air: [] };
                  dnaMaterials.forEach(m => matsByEl[m.element]?.push(m));
                  const orbitHover = dnaOrbitHover;
                  const nucleusHot = dnaNucleusNear;
                  const ringOuterOpacity = orbitHover ? 0.36 : 0.22;
                  const ringInnerOpacity = orbitHover ? 0.26 : 0.14;
                  return (
                    <div className="mx-auto md:mx-0 shrink-0 w-full max-w-[168px] md:w-[160px] md:max-w-[160px]">
                    <div
                      ref={dnaOrbitalRef}
                      aria-label="Material DNA — element shares and selected materials"
                      className={`relative mx-auto select-none rounded-full transition-[box-shadow] duration-500 aspect-square max-w-[168px] ${orbitHover ? 'shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_6px_20px_-5px_rgba(0,0,0,0.06)]' : ''}`}
                      style={{ width: 'min(100%, 168px)' }}
                      onMouseEnter={() => setDnaOrbitHover(true)}
                      onMouseMove={(e) => updateDnaNucleusProximity(e.clientX, e.clientY)}
                      onMouseLeave={() => {
                        setDnaOrbitHover(false);
                        setDnaNucleusNear(false);
                      }}
                    >
                    <div className="absolute inset-0 origin-center">
                      <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" viewBox={`0 0 ${VB} ${VB}`} fill="none">
                        <circle
                          cx={CX}
                          cy={CY}
                          r={ROUT}
                          stroke={domColor}
                          strokeWidth={1}
                          fill="none"
                          opacity={ringOuterOpacity}
                          style={{ transition: 'opacity 0.35s ease' }}
                        />
                        <circle
                          cx={CX}
                          cy={CY}
                          r={RIN}
                          stroke={domColor}
                          strokeWidth={0.85}
                          fill="none"
                          opacity={ringInnerOpacity}
                          style={{ transition: 'opacity 0.35s ease' }}
                        />
                      </svg>
                      {/* Center nucleus — static reference point */}
                      <div
                        className="absolute pointer-events-none z-[4] transition-opacity duration-300"
                        style={{ left: `${(CX / VB) * 100}%`, top: `${(CY / VB) * 100}%`, transform: 'translate(-50%, -50%)' }}
                      >
                        <div className="relative flex items-center justify-center w-6 h-6">
                          <div
                            className="absolute rounded-full border border-solid w-[24px] h-[24px]"
                            style={{
                              borderColor: `${domColor}55`,
                              boxShadow: `inset 0 0 0 1px ${domColor}12`,
                              opacity: nucleusHot ? 0.88 : 0.65,
                              transition: 'opacity 0.35s ease',
                            }}
                          />
                          <div
                            className="absolute rounded-full border w-[18px] h-[18px]"
                            style={{
                              borderColor: `${domColor}35`,
                              opacity: nucleusHot ? 0.62 : 0.45,
                              transition: 'opacity 0.35s ease',
                            }}
                          />
                          <div
                            className="absolute rounded-full transition-[box-shadow,transform] duration-500"
                            style={{
                              width: '8px',
                              height: '8px',
                              background: `radial-gradient(circle at 38% 32%, ${domColor}E0, ${domColor}70)`,
                              boxShadow: nucleusHot
                                ? `0 0 14px ${domColor}70, 0 1px 8px ${domColor}45`
                                : `0 0 10px ${domColor}55, 0 1px 6px ${domColor}35`,
                            }}
                          />
                        </div>
                      </div>
                      {/* Spheres drawn first (below nodes); % labels on top */}
                      {(['air', 'fire', 'earth', 'water'] as Element[]).map(el => {
                        const baseAngle = EL_ANGLES[el];
                        const val = Math.round(dist[el]);
                        const isDom = el === dominant;
                        const ec = ELEMENT_COLORS[el];
                        const rad = (baseAngle * Math.PI) / 180;
                        const elX = CX + Math.cos(rad) * ROUT;
                        const elY = CY + Math.sin(rad) * ROUT;
                        const s = Math.max(7, Math.min(13, val * 0.26 + 4));
                        const mats = matsByEl[el];
                        const lr = rad;
                        const labelScale = 1.2;
                        const lx = CX + Math.cos(lr) * ROUT * labelScale;
                        const ly = CY + Math.sin(lr) * ROUT * labelScale;
                        return (
                          <React.Fragment key={el}>
                            {mats.map((mat, mi) => {
                              const spreadPerItem = mats.length <= 1 ? 0 : 18;
                              const totalSpread = (mats.length - 1) * spreadPerItem;
                              const offsetAngle = baseAngle - totalSpread / 2 + mi * spreadPerItem;
                              const mRad = (offsetAngle * Math.PI) / 180;
                              const tuck = isDom ? 0.85 : 1;
                              const mx = CX + Math.cos(mRad) * RIN * tuck;
                              const my = CY + Math.sin(mRad) * RIN * tuck;
                              const mc = ec;
                              const tex = MATERIAL_SPHERE_IMAGES[mat.name];
                              const sphereSize = isDom ? 13 : 14;
                              return (
                                <div
                                  key={`${mat.name}-${el}-${mi}`}
                                  className="absolute transition-all duration-500"
                                  style={{
                                    width: `${sphereSize}px`,
                                    height: `${sphereSize}px`,
                                    left: `${(mx / VB) * 100}%`,
                                    top: `${(my / VB) * 100}%`,
                                    transform: 'translate(-50%, -50%)',
                                    zIndex: 1,
                                    transitionDelay: '0ms',
                                  }}
                                >
                                  <div
                                    className="w-full h-full rounded-full overflow-hidden border border-white shadow-sm"
                                    style={{ boxShadow: `0 1px 4px ${mc}18` }}
                                  >
                                    {tex && !tex.startsWith('https://placehold')
                                      ? <img src={tex} alt="" className="w-[140%] h-[140%] max-w-none object-cover" style={{ marginLeft: '-20%', marginTop: '-20%', mixBlendMode: 'multiply' }} loading="lazy" />
                                      : <div className="w-full h-full" style={{ background: `radial-gradient(circle at 35% 30%, ${mc}40, ${mc}15)` }} />}
                                  </div>
                                </div>
                              );
                            })}
                            <div
                              className="absolute rounded-full flex items-center justify-center transition-all duration-700"
                              style={{
                                width: `${s}px`,
                                height: `${s}px`,
                                left: `${(elX / VB) * 100}%`,
                                top: `${(elY / VB) * 100}%`,
                                transform: 'translate(-50%, -50%)',
                                backgroundColor: ec,
                                opacity: isDom ? 0.92 : 0.34,
                                boxShadow: isDom ? `0 2px 12px ${ec}45` : `0 1px 3px rgba(0,0,0,0.08)`,
                                zIndex: isDom ? 10 : 5,
                              }}
                            />
                            <span
                              className="absolute pointer-events-none z-[12] font-mono tabular-nums max-md:text-[9px] text-[6px] sm:text-[6.5px] font-extralight leading-none tracking-tight transition-opacity duration-300"
                              style={{
                                left: `${(lx / VB) * 100}%`,
                                top: `${(ly / VB) * 100}%`,
                                transform: 'translate(-50%, -50%)',
                                color: ec,
                                opacity: orbitHover ? (isDom ? 0.95 : 0.78) : isDom ? 0.88 : 0.62,
                                textShadow: '0 0 4px rgba(255,255,255,0.98), 0 1px 1px rgba(255,255,255,0.9)',
                              }}
                            >
                              {val}
                              <span style={{ opacity: 0.55, fontSize: '5px' }}>%</span>
                            </span>
                          </React.Fragment>
                        );
                      })}
                    </div>
                    </div>
                    </div>
                  );
                })()}

                {/* Compact Element Balance — interactive bars + direct input */}
                {(() => {
                  const applyNewVal = (el: Element, newVal: number) => {
                    newVal = Math.max(0, Math.min(100, newVal));
                    const val = Math.round(dist[el]);
                    const diff = newVal - val;
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
                  };
                  return (
                    <div className="flex-1 min-w-0 md:max-w-[200px] space-y-[2px] md:px-0 px-1">
                      {(['earth', 'fire', 'water', 'air'] as Element[]).map(el => {
                        const val = Math.round(dist[el]);
                        const isDom = el === dominant;
                        const ec = ELEMENT_COLORS[el];
                        return (
                          <div key={el} className="flex items-center gap-1.5" style={{ opacity: isDom ? 1 : 0.7 }}>
                            <span className="text-[9px] uppercase tracking-[0.1em] w-6 shrink-0 text-right font-light" style={{ fontWeight: isDom ? 600 : 400, color: ec }}>{el.slice(0, 2)}</span>
                            <div className="flex-1 relative h-[12px] flex items-center cursor-ew-resize group touch-manipulation">
                              <div className="absolute left-0 right-0 h-[3px] top-1/2 -translate-y-1/2 rounded-full" style={{ background: 'rgba(0,0,0,0.05)' }} />
                              <div className="absolute left-0 top-1/2 -translate-y-1/2 h-[3px] rounded-full transition-all duration-300"
                                style={{ width: `${val}%`, backgroundColor: ec, opacity: isDom ? 0.85 : 0.5 }} />
                              <input
                                type="range" min="0" max="100" value={val}
                                className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-ew-resize"
                                aria-label={`${el} share percent`}
                                onChange={(e) => applyNewVal(el, parseInt(e.target.value, 10))}
                              />
                            </div>
                            <input
                              type="text"
                              inputMode="numeric"
                              maxLength={3}
                              defaultValue={val}
                              key={`${el}-${val}`}
                              className="font-mono tabular-nums text-[10px] w-8 text-center shrink-0 rounded px-0 py-[1px] outline-none transition-all border font-normal"
                              style={{
                                fontWeight: isDom ? 600 : 450,
                                color: isDom ? ec : '#666',
                                borderColor: `${ec}30`,
                                background: `${ec}08`,
                              }}
                              onFocus={(e) => { e.target.select(); e.target.style.borderColor = ec; e.target.style.background = '#fff'; e.target.style.boxShadow = `0 0 0 2px ${ec}15`; }}
                              onBlur={(e) => {
                                e.target.style.borderColor = `${ec}30`;
                                e.target.style.background = `${ec}08`;
                                e.target.style.boxShadow = 'none';
                                const v = parseInt(e.target.value, 10);
                                if (!isNaN(v) && v >= 0 && v <= 100 && v !== val) applyNewVal(el, v);
                                else e.target.value = String(val);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const v = parseInt((e.target as HTMLInputElement).value, 10);
                                  if (!isNaN(v) && v >= 0 && v <= 100) applyNewVal(el, v);
                                  (e.target as HTMLInputElement).blur();
                                }
                                if (e.key === 'ArrowUp') { e.preventDefault(); applyNewVal(el, Math.min(100, val + 1)); }
                                if (e.key === 'ArrowDown') { e.preventDefault(); applyNewVal(el, Math.max(0, val - 1)); }
                              }}
                              onInput={(e) => {
                                const input = e.target as HTMLInputElement;
                                input.value = input.value.replace(/[^0-9]/g, '');
                                if (input.value.length > 0 && parseInt(input.value, 10) > 100) input.value = '100';
                              }}
                            />
                            <span className="text-[8px] font-medium" style={{ color: `${ec}50` }}>%</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
                </div>{/* /flex orbit-+-sliders */}

                {materialsChanged && (
                  <div className="flex items-center gap-2 mt-1.5 px-2 py-1 rounded-md bg-amber-50/80 border border-amber-200/50 animate-fade-in">
                    <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    <span className="text-[10px] text-amber-700 font-medium">Distribution changed</span>
                  </div>
                )}
              </div>

              {/* Material Grid + Material picker — REMOVED from the Material
                  DNA sidebar so materials live in exactly one place: the
                  bottom-row 3-column dashboard ("Materials used in this space").
                  Catalog picking is still available via the Workspace
                  materials picker; custom materials open via the dashboard's
                  "+ ADD CUSTOM MATERIAL" card. The sidebar now focuses on the
                  things only it does well: the orbital diagram, the compact
                  element regulator, and atmosphere + palette + direction
                  refinement controls. */}

                {/* Atmosphere chips */}
                {selectedAtmosphere.length > 0 && (
                  <div className="px-3 pt-2 pb-1.5">
                    <p className="text-[8px] uppercase tracking-[0.22em] text-gray-400/70 font-light mb-1.5">Atmosphere</p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedAtmosphere.slice(0, 6).map((adj, i) => {
                        const ec = ELEMENT_COLORS[adj.element];
                        return (
                          <span key={`${adj.label}-${i}`}
                            className="px-2.5 py-1 rounded-full text-[10px] tracking-[0.04em] font-normal border"
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
                  <p className="text-[10px] uppercase tracking-[0.2em] text-gray-400 font-medium mb-1.5">Palette</p>
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
                            className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] tracking-[0.02em] transition-all duration-200 border active:scale-95 ${
                              active ? 'border-gray-500 text-gray-700 bg-gray-50 font-semibold shadow-sm' : 'border-gray-100 text-gray-400 hover:border-gray-300 hover:text-gray-600'
                            }`}>
                            <div className="flex gap-0.5">
                              {p.colors.map((c, ci) => <div key={ci} className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c }} />)}
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
                  <p className="text-[10px] uppercase tracking-[0.15em] text-gray-400 font-medium mb-1.5">Direction</p>
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
                          className={`px-2 py-1 rounded text-[10px] tracking-[0.02em] border transition-all duration-200 active:scale-95 ${
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
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.shiftKey && refinementInput.trim() && displayedImageUrl) {
                          e.preventDefault();
                          chime();
                          setTargetedEditText(refinementInput.trim());
                          setTargetedEditMode(true);
                          setSavedDirection(refinementInput.trim());
                          setRefinementMessage(`Targeted edit: "${refinementInput.trim()}" — will modify only the specified element.`);
                          setRefinementInput('');
                          setSelectedHistoryImage(null);
                          setLoading(true); setPhase('generating'); setLoadProgress(0); setImageLoaded(false); setGenerationKey(k => k + 1);
                        } else if (e.key === 'Enter') {
                          handleRefineSubmit();
                        }
                      }}
                      placeholder={displayedImageUrl ? "Edit detail… (follow-ups remember this render — “it”, “more”, same topic)" : "Custom direction..."}
                      className="flex-1 px-2.5 py-1.5 border border-gray-100 rounded text-[11px] placeholder:text-gray-300 focus:outline-none focus:border-gray-300 transition-colors" />
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
                    {displayedImageUrl && (
                      <button
                        onClick={() => {
                          if (!refinementInput.trim()) return;
                          chime();
                          setTargetedEditText(refinementInput.trim());
                          setTargetedEditMode(true);
                          setSavedDirection(refinementInput.trim());
                          setRefinementMessage(`Targeted edit: "${refinementInput.trim()}"`);
                          setRefinementInput('');
                          setSelectedHistoryImage(null);
                          setLoading(true); setPhase('generating'); setLoadProgress(0); setImageLoaded(false); setGenerationKey(k => k + 1);
                        }}
                        disabled={!refinementInput.trim()}
                        title="Edit only the specified element on the current render (Shift+Enter)"
                        className="px-2.5 py-1.5 border text-[10px] uppercase tracking-[0.08em] font-semibold rounded transition-all active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed"
                        style={{ borderColor: `${domColor}40`, color: domColor, background: `${domColor}06` }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline -mt-px mr-0.5">
                          <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                        </svg>
                        Edit
                      </button>
                    )}
                    <button onClick={handleRefineSubmit} disabled={!refinementInput.trim()}
                      className="px-2.5 py-1.5 border border-gray-200 text-[10px] uppercase tracking-[0.12em] font-semibold text-gray-500 hover:border-black hover:text-black disabled:opacity-40 disabled:cursor-not-allowed rounded transition-all active:scale-[0.97]">
                      Apply
                    </button>
                  </div>
                  {displayedImageUrl && (
                    <p className="text-[9px] text-gray-300 mt-1 leading-tight">
                      <span style={{ color: `${domColor}80` }}>Edit</span> = modify only specified element · <span className="text-gray-400">Apply</span> = full regeneration
                    </p>
                  )}
                  {directionPhotoPreview && (
                    <div className="flex items-center gap-2 mt-1.5">
                      <img src={directionPhotoPreview} alt="Reference" className="w-10 h-7 object-cover rounded border border-gray-200" />
                      <span className="text-[8px] text-gray-400 flex-1 truncate">{directionPhoto?.name}</span>
                      <button onClick={() => { setDirectionPhoto(null); setDirectionPhotoPreview(null); if (directionPhotoRef.current) directionPhotoRef.current.value = ''; }}
                        className="text-[9px] text-gray-300 hover:text-red-400 transition-colors">&times;</button>
                    </div>
                  )}
                  {refinementMessage && <p className="text-[10px] text-gray-500 font-light mt-1.5 italic leading-snug">{refinementMessage}</p>}
                  {savedDirection && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="text-[9px] text-gray-400 font-medium">{targetedEditMode ? 'Edit:' : 'Active:'}</span>
                      <span className="text-[9px] font-medium text-gray-600 bg-gray-50 px-2 py-0.5 rounded border border-gray-100">{savedDirection}</span>
                      <button onClick={() => {
                        setSavedDirection(null);
                        refinementFeedbackRef.current = null;
                        setTargetedEditMode(false);
                        setTargetedEditText(null);
                        editThreadsByImageUrlRef.current = {};
                      }} className="text-[9px] text-gray-300 hover:text-gray-600 ml-0.5">&times;</button>
                    </div>
                  )}
                </div>
              </div>

              {/* ═══ FOOTER Actions (always visible) ═══ */}
              <div className={`flex-shrink-0 px-3 py-2 border-t space-y-1.5 transition-all duration-300 ${materialsChanged ? 'border-amber-200/60 bg-amber-50/30' : 'border-gray-100/60 bg-white'}`}>
                {materialsChanged && (
                  <button onClick={() => { chime(); setMaterialsChanged(false); setMaterialPickerOpen(false); setSelectedHistoryImage(null); setLoading(true); setPhase('generating'); setLoadProgress(0); setImageLoaded(false); setImageUrl(null); setGenerationKey(k => k + 1); }}
                    className="w-full py-3 bg-gradient-to-r from-gray-900 to-gray-800 text-white rounded-lg text-[11px] uppercase tracking-[0.25em] font-semibold transition-all active:scale-[0.97] shadow-lg hover:shadow-xl flex items-center justify-center gap-2 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 to-transparent animate-pulse" />
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="relative z-10">
                      <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                    </svg>
                    <span className="relative z-10">Regenerate</span>
                  </button>
                )}
                <button onClick={() => { whoosh(); navigate('/core'); }}
                  className="w-full py-2 border border-gray-200 text-[10px] uppercase tracking-[0.2em] font-medium text-gray-400 hover:border-black hover:text-black rounded-md transition-all active:scale-[0.97]">
                  Refine & Regenerate
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ RESULTS DASHBOARD — 3-column row: HISTORY · DISTRIBUTION · MATERIALS ═══
          Mirrors the reference layout — each column is its own card with a
          clear uppercase title and a vertical hairline divider between them. */}
      {isComplete && (
        <div className="flex-shrink-0 border-t border-gray-100/70 bg-white transition-all duration-1000 ease-out"
             style={{ transitionDelay: '800ms' }}>
          <div className="flex flex-col md:flex-row md:items-stretch md:divide-x md:divide-gray-100">

            {/* ─── COLUMN 1: RENDER HISTORY ─────────────────────────────── */}
            {similarReferences.length > 0 && (
              <div className="flex-1 md:basis-[55%] md:max-w-[55%] px-4 py-2 min-w-0">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] uppercase tracking-[0.3em] text-gray-700 font-semibold">Render History</span>
                  <span className="text-[9px] uppercase tracking-[0.18em] text-gray-300 font-light">
                    {similarReferences.length} {similarReferences.length === 1 ? 'render' : 'renders'}
                  </span>
                </div>
                {/* History row scales rather than scrolls — items use `flex-1`
                    with a sane `max-w` so they distribute the full row width.
                    More variations → each thumb shrinks (down to a tight
                    `min-w-0` floor) so the whole sequence stays visible without
                    a horizontal scrollbar. */}
                <div className="flex flex-nowrap items-start gap-1.5 sm:gap-2 overflow-hidden pb-0.5">
                  {similarReferences.map((ref, idx) => {
                    const isSelected = displayedImageUrl === ref.imageUrl;
                    const refDist = ref.dist;
                    const refSorted = (Object.entries(refDist) as [Element, number][]).sort((a, b) => b[1] - a[1]);
                    const refDominant = refSorted[0][0];
                    const refDomColor = ELEMENT_COLORS[refDominant];
                    const label = ref.id === 'current'
                      ? 'CURRENT'
                      : `V${String(idx).padStart(2, '0')}`;
                    // Top-2 elements with % — reference shows "Earth 37% · Fire 28%"
                    const top2 = refSorted.slice(0, 2);
                    return (
                      <div key={ref.id} className="flex-1 min-w-0 max-w-[120px] flex flex-col items-center gap-1">
                        <button onClick={() => setSelectedHistoryImage(isSelected ? null : ref.imageUrl)}
                          onDoubleClick={() => setZoomedImage(ref.imageUrl)}
                          className={`w-full aspect-[13/8] rounded-md overflow-hidden border transition-all duration-300 group ${
                            isSelected ? 'border-gray-400 ring-1 ring-gray-300 shadow-md' : 'border-gray-100 hover:border-gray-300 hover:shadow-sm'
                          }`}
                          style={isSelected ? { transform: 'scale(1.04)' } : undefined}>
                          <img src={ref.imageUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                        </button>
                        <span className="text-[9px] uppercase tracking-[0.16em] font-semibold w-full text-center truncate"
                              style={{ color: isSelected ? refDomColor : '#5a6577' }}>
                          {label}
                        </span>
                        {/* Top-2 element percentages — truncates instead of overflowing on tight rows. */}
                        <span className="text-[8px] tracking-[0.04em] font-light w-full text-center truncate">
                          {top2.map(([el, v], k) => (
                            <span key={el}>
                              <span style={{ color: ELEMENT_COLORS[el], opacity: 0.85 }}>
                                {el.charAt(0).toUpperCase() + el.slice(1, 2)}&nbsp;{Math.round(v)}%
                              </span>
                              {k < top2.length - 1 && <span className="text-gray-300 mx-0.5">·</span>}
                            </span>
                          ))}
                        </span>
                        {/* Mini 4-dot orbital — kept per user request, fixed size keeps the elemental signature readable */}
                        <div className="relative mt-0.5 flex-shrink-0" style={{ width: '36px', height: '16px' }}>
                          {([
                            { el: 'air' as Element, x: 18, y: 1 },
                            { el: 'fire' as Element, x: 35, y: 8 },
                            { el: 'earth' as Element, x: 18, y: 15 },
                            { el: 'water' as Element, x: 1, y: 8 },
                          ]).map(({ el, x, y }) => {
                            const v = refDist[el] || 0;
                            const s = Math.max(3, Math.min(8, v * 0.12 + 2));
                            const isDom = el === refDominant;
                            return (
                              <div key={el} className="absolute rounded-full transition-all duration-500" style={{
                                width: `${s}px`, height: `${s}px`, left: `${x}px`, top: `${y}px`,
                                transform: 'translate(-50%, -50%)', backgroundColor: ELEMENT_COLORS[el],
                                opacity: isDom ? 0.9 : (isSelected ? 0.55 : 0.3),
                                boxShadow: isDom && isSelected ? `0 0 4px ${ELEMENT_COLORS[el]}55` : 'none',
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

            {/* ─── COLUMN 2: MATERIALS USED IN THIS SPACE ───────────────── */}
            <div className="flex-1 md:basis-[45%] md:max-w-[45%] px-4 py-2 min-w-0 border-t md:border-t-0 border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-[0.3em] text-gray-700 font-semibold">Materials Used in this Space</span>
                <button onClick={() => { setEditingCustomMat(null); setShowCustomMatModal(true); }}
                  className="text-[9px] uppercase tracking-[0.2em] text-gray-400 hover:text-gray-700 font-medium transition-colors">
                  Manage
                </button>
              </div>
              {/* Materials row scales with the count — each bead is a `flex-1`
                  cell with a max width, so 3 selections look generous and
                  8 selections compress neatly without an overflow scrollbar. */}
              <div className="flex flex-nowrap items-start gap-1.5 sm:gap-2 overflow-hidden pb-0.5">
                {liveSelectedMaterials.slice(0, 6).map((m) => {
                  const ec = ELEMENT_COLORS[m.element];
                  const sphere = MATERIAL_SPHERE_IMAGES[m.name];
                  const tint = MATERIAL_TEXTURE_TINT[m.name];
                  const flt = MATERIAL_TEXTURE_FILTER[m.name];
                  const pct = Math.round(dist[m.element] || 0);
                  const isCustom = (m as Partial<CustomMaterial>).isCustom === true;
                  const refImg = (m as Partial<CustomMaterial>).referenceImageDataUrl;
                  return (
                    <div key={m.id} className="group flex-1 min-w-0 max-w-[80px] flex flex-col items-center gap-1">
                      {/* Circular sphere bead — matches the orbital-material
                          style. Hover reveals the × delete button so the
                          user can deselect any picked material directly. */}
                      <div className="relative w-full aspect-square max-w-[64px] rounded-full overflow-hidden"
                           style={{
                             border: `1.5px solid ${ec}30`,
                             boxShadow: `0 0 0 1px ${ec}18, 0 2px 8px ${ec}25, 0 1px 4px rgba(0,0,0,0.08)`,
                             background: refImg
                               ? 'transparent'
                               : sphere
                                 ? 'transparent'
                                 : `radial-gradient(circle at 34% 30%, ${ec}E8, ${ec}A0)`,
                           }}>
                        {refImg ? (
                          <img src={refImg} alt={m.name} className="absolute inset-0 w-full h-full object-cover" />
                        ) : sphere ? (
                          <img src={sphere} alt={m.name}
                            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.14)', filter: flt || 'saturate(1.04) contrast(1.04)' }} />
                        ) : null}
                        {tint && (
                          <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', pointerEvents: 'none', backgroundColor: tint.color, opacity: tint.alpha, mixBlendMode: tint.mode }} />
                        )}
                        {isCustom && (
                          <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 text-[6px] uppercase tracking-[0.1em] font-bold px-1 py-[0.5px] rounded-sm bg-black/75 text-white">custom</span>
                        )}
                        {/* × delete button — visible on hover (always visible
                            on mobile via group-hover override below). */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (isCustom) {
                              // Remove a user-defined material — clear from both
                              // custom catalog and selection.
                              setState((prev) => ({
                                ...prev,
                                customMaterials: (prev.customMaterials ?? []).filter((cm) => cm.id !== m.id),
                                refinement: {
                                  ...prev.refinement,
                                  hasUserRefined: true,
                                  selectedMaterials: prev.refinement.selectedMaterials.filter((sm) => sm.id !== m.id),
                                },
                              }));
                              setMaterialsChanged(true);
                            } else {
                              removeMaterial(m.name);
                            }
                          }}
                          className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-white border border-gray-200 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:border-red-200 transition-all duration-200 shadow-sm"
                          title={`Remove ${m.name}`}
                          aria-label={`Remove ${m.name}`}
                        >
                          <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="#e57373" strokeWidth="2" strokeLinecap="round">
                            <line x1="3" y1="3" x2="9" y2="9" /><line x1="9" y1="3" x2="3" y2="9" />
                          </svg>
                        </button>
                        {/* Element-color dot — corner accent like the orbit beads */}
                        <div className="absolute bottom-0.5 right-0.5 w-2 h-2 rounded-full border border-white shadow-sm" style={{ background: ec }} />
                      </div>
                      <span className="text-[9px] font-medium text-center leading-tight w-full truncate" style={{ color: '#3a4a64' }}>
                        {m.name.split('(')[0].trim()}
                      </span>
                      <span className="text-[8px] font-medium uppercase tracking-[0.1em] text-center w-full truncate" style={{ color: ec, opacity: 0.85 }}>
                        {m.element} {pct}%
                      </span>
                    </div>
                  );
                })}
                {/* ADD CUSTOM MATERIAL slot — same flex-1 sizing so it shrinks
                    with the rest of the row instead of forcing a scrollbar. */}
                <button onClick={() => { setEditingCustomMat(null); setShowCustomMatModal(true); }}
                  className="flex-1 min-w-0 max-w-[80px] flex flex-col items-center justify-center gap-1 group">
                  <div className="w-full aspect-square max-w-[64px] rounded-full border border-dashed flex items-center justify-center transition-colors group-hover:border-gray-500 group-hover:bg-gray-50"
                       style={{ borderColor: 'rgba(0,0,0,0.22)' }}>
                    <span className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center text-[14px] leading-none group-hover:scale-110 transition-transform">+</span>
                  </div>
                  <span className="text-[8px] uppercase tracking-[0.14em] text-gray-500 group-hover:text-gray-800 font-semibold text-center leading-tight w-full truncate">
                    Add custom
                  </span>
                </button>
                {liveSelectedMaterials.length === 0 && (
                  <span className="text-[10px] italic text-gray-400 self-center pl-1">No materials picked yet — add custom or pick from the side picker.</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ BRANDS IN THIS SPACE  +  ARCHITECTS & INTERIOR DESIGNERS ═══
          Reference-style bottom row: two side-by-side panels (split ~60/40)
          where every brand sits as its own "card" — brand name on top in a
          slightly heavier weight, category label underneath in lighter type.
          Mirrors the Polifrom · Boffi · GAGGENAU · FLOS treatment in the
          design reference. */}
      {isComplete && (
        <div className="flex-shrink-0 border-t border-gray-100/70 bg-white transition-all duration-1000 ease-out"
             style={{ transitionDelay: '1000ms' }}>
          <div className="flex flex-col md:flex-row md:items-stretch md:divide-x md:divide-gray-100">

            {/* ─── BRANDS IN THIS SPACE ────────────────────────────────── */}
            <div className="flex-1 md:basis-[62%] md:max-w-[62%] px-4 py-2 min-w-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-[0.3em] text-gray-700 font-semibold">Brands in this Space</span>
                <span className="text-[9px] uppercase tracking-[0.18em] text-gray-300 font-light">curated</span>
              </div>
              {/* Brand row scales rather than scrolls — each card is a
                  flex-1 cell that shrinks gracefully (with truncation on the
                  category label) so every category stays visible at once. */}
              <div className="flex flex-nowrap items-start gap-2 sm:gap-3 overflow-hidden pb-1">
                {/* Pick one representative brand per category so the row reads
                    like the reference: each brand shown as a separate
                    name + role card, not a comma-separated list. */}
                {(() => {
                  // Order categories by the catalogue's natural appearance.
                  const seenCats = new Set<string>();
                  const orderedCats: string[] = [];
                  BRAND_CATALOG.forEach((b) => {
                    if (!seenCats.has(b.category)) {
                      seenCats.add(b.category);
                      orderedCats.push(b.category);
                    }
                  });
                  const PRETTY_CAT: Record<string, string> = {
                    flooring: 'Floors',
                    stone: 'Surfaces',
                    furniture: 'Sofas & Storage',
                    seating: 'Chairs',
                    lighting: 'Lighting',
                    textile: 'Textiles',
                    metal: 'Hardware',
                    decor: 'Decor',
                    wall: 'Walls & Paint',
                  };
                  return orderedCats.map((cat) => {
                    const brand = BRAND_CATALOG.find((b) => b.category === cat);
                    if (!brand) return null;
                    const isHighlighted = highlightedCategory === cat;
                    return (
                      <a key={brand.id} href={brand.url} target="_blank" rel="noopener noreferrer"
                         onMouseEnter={() => setHoveredBrand(brand.id)} onMouseLeave={() => setHoveredBrand(null)}
                         title={`${brand.name} — ${brand.specialty} (${PRETTY_CAT[cat] || cat})`}
                         className="flex-1 min-w-0 max-w-[140px] flex flex-col items-start group">
                        <span className={`text-[13px] sm:text-[15px] font-semibold tracking-[0.01em] leading-tight transition-colors w-full truncate ${
                          isHighlighted ? 'text-black' : 'text-gray-800 group-hover:text-black'
                        }`}
                              style={{ fontFamily: "'Libre Bodoni', 'Playfair Display', serif", letterSpacing: '0.005em' }}>
                          {brand.name}
                        </span>
                        <span className="text-[9px] uppercase tracking-[0.14em] text-gray-400 group-hover:text-gray-600 font-medium leading-tight mt-1 w-full truncate transition-colors">
                          {PRETTY_CAT[cat] || cat}
                        </span>
                      </a>
                    );
                  });
                })()}
              </div>
            </div>

            {/* ─── ARCHITECTS & INTERIOR DESIGNERS ──────────────────────── */}
            <div className="flex-1 md:basis-[38%] md:max-w-[38%] px-4 py-2 min-w-0 border-t md:border-t-0 border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-[0.3em] text-gray-700 font-semibold">Architects &amp; Interior Designers</span>
                <span className="text-[9px] uppercase tracking-[0.18em] text-gray-300 font-light">{architectsAndDesigners.length}</span>
              </div>
              {/* Architect row also fits-to-row instead of overflowing —
                  longer studio names truncate with ellipsis so every firm
                  stays visible without horizontal scrolling. */}
              <div className="flex flex-nowrap items-start gap-2 sm:gap-3 overflow-hidden pb-1">
                {architectsAndDesigners.slice(0, 6).map((p) => (
                  <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer"
                     title={`${p.name} — ${p.specialty} · ${p.role === 'architect' ? 'Architecture' : 'Interior'}`}
                     className="flex-1 min-w-0 max-w-[140px] flex flex-col items-start group">
                    <span className={`text-[11px] sm:text-[13px] font-semibold tracking-[0.01em] leading-tight transition-colors w-full truncate ${
                      p.id === 'shre-studio' ? 'text-black' : 'text-gray-800 group-hover:text-black'
                    }`}
                          style={{ fontFamily: "'Libre Bodoni', 'Playfair Display', serif" }}>
                      {p.name}
                    </span>
                    <span className="text-[9px] uppercase tracking-[0.16em] text-gray-400 group-hover:text-gray-600 font-medium leading-tight mt-1 w-full truncate transition-colors">
                      {p.role === 'architect' ? 'Arch' : 'Int'}
                    </span>
                  </a>
                ))}
              </div>
              <p className="text-[8px] text-gray-400 leading-snug pt-1.5 border-t border-gray-100/70 mt-1.5">
                Informational links — verify scope and fit with each firm before engaging.
              </p>
            </div>
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
            className="fixed inset-0 z-[200] bg-black/85 flex items-center justify-center p-2 sm:p-6 lg:p-10"
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
                className="max-w-full max-h-[80vh] max-h-[80dvh] object-contain rounded-lg sm:rounded-xl shadow-2xl animate-fade-in"
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

      {/* ═══ ADD CUSTOM MATERIAL MODAL — dashboard "+ Add custom material" CTA ═══ */}
      <AddCustomMaterialModal
        open={showCustomMatModal}
        initial={editingCustomMat ?? undefined}
        onCancel={() => { setShowCustomMatModal(false); setEditingCustomMat(null); }}
        onSave={addCustomMaterialFromResults}
      />

      {/* ═══ BUDGET ESTIMATE OVERLAY ═══ */}
      {budgetOpen && (() => {
        const b = budgetEstimate;
        const fmt = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}K` : `${n}`;
        const fmtFull = (n: number) => new Intl.NumberFormat('en-US').format(n);
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-sm animate-fade-in"
            onClick={() => setBudgetOpen(false)}>
            <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-[520px] max-w-[94vw] max-h-[88vh] max-h-[88dvh] overflow-hidden overflow-y-auto animate-fade-in-up"
              onClick={e => e.stopPropagation()} style={{ animationDuration: '0.3s' }}>

              {/* Header */}
              <div className="px-6 pt-5 pb-3 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${domColor}10`, border: `1px solid ${domColor}20` }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={domColor} strokeWidth="1.8" strokeLinecap="round"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                    </div>
                    <div>
                      <h3 className="text-[13px] font-semibold text-gray-800 tracking-wide">Budget Estimate</h3>
                      <p className="text-[10px] text-gray-400 tracking-wide mt-0.5">{spaceType} · {domain} · {b.area}m²</p>
                    </div>
                  </div>
                  <button onClick={() => setBudgetOpen(false)}
                    className="w-7 h-7 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors">
                    <svg width="12" height="12" viewBox="0 0 12 12" stroke="#999" strokeWidth="1.5"><line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/></svg>
                  </button>
                </div>
              </div>

              {/* Range Summary */}
              <div className="px-6 py-4 bg-gradient-to-b from-gray-50/50 to-white">
                <div className="flex items-end justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-[9px] uppercase tracking-[0.2em] text-gray-400 font-medium mb-2">Estimated Range (USD)</p>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[22px] font-light text-gray-800 tracking-tight">${fmt(b.lowTotal)}</span>
                      <span className="text-[13px] text-gray-300 mx-1">—</span>
                      <span className="text-[22px] font-light text-gray-800 tracking-tight">${fmt(b.highTotal)}</span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">Mid estimate: <span className="font-semibold text-gray-600">${fmtFull(b.midTotal)}</span></p>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-[9px] text-gray-400">
                    <span>${fmtFull(Math.round(b.midTotal / b.area))}/m²</span>
                    <div className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: domColor, opacity: 0.6 }} />
                      <span>{dominant}-led</span>
                    </div>
                  </div>
                </div>

                {/* Visual range bar */}
                <div className="mt-3 h-2 rounded-full bg-gray-100 overflow-hidden relative">
                  <div className="absolute inset-y-0 rounded-full transition-all duration-700" style={{
                    left: '0%', right: '0%',
                    background: `linear-gradient(90deg, ${ELEMENT_COLORS.earth}50, ${ELEMENT_COLORS.fire}60, ${ELEMENT_COLORS.water}50, ${ELEMENT_COLORS.air}50)`,
                  }} />
                  <div className="absolute inset-y-0 w-0.5 bg-gray-600/40 rounded" style={{ left: '50%' }} />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[8px] text-gray-400 uppercase tracking-wider">Standard</span>
                  <span className="text-[8px] text-gray-400 uppercase tracking-wider">Premium</span>
                </div>
              </div>

              {/* Breakdown */}
              <div className="px-6 py-3 overflow-y-auto" style={{ maxHeight: '260px' }}>
                <p className="text-[9px] uppercase tracking-[0.2em] text-gray-400 font-medium mb-2.5">Cost Breakdown</p>
                <div className="space-y-2">
                  {b.breakdown.map((item, i) => {
                    const barColors = [ELEMENT_COLORS.earth, ELEMENT_COLORS.fire, ELEMENT_COLORS.water, ELEMENT_COLORS.air, `${domColor}80`, `${domColor}60`];
                    return (
                      <div key={item.label}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[11px] text-gray-600 font-medium">{item.label}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-400">${fmtFull(item.low)} – ${fmtFull(item.high)}</span>
                            <span className="text-[9px] text-gray-300 font-mono">{item.pct}%</span>
                          </div>
                        </div>
                        <div className="h-1.5 rounded-full bg-gray-50 overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700 ease-out"
                            style={{ width: `${item.pct}%`, backgroundColor: barColors[i % barColors.length], opacity: 0.55 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Material Impact */}
              <div className="px-6 py-3 border-t border-gray-100">
                <div className="flex items-center gap-4 text-[10px]">
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-400">Material tier:</span>
                    <span className="font-semibold text-gray-600">{b.matMultiplier > 1.15 ? 'Premium' : b.matMultiplier > 1.05 ? 'Mid-High' : 'Standard'}</span>
                    <span className="text-gray-300">(×{b.matMultiplier.toFixed(2)})</span>
                  </div>
                  <div className="w-px h-3 bg-gray-200" />
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-400">Energy factor:</span>
                    <span className="font-semibold text-gray-600">×{b.luxuryBias.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Footer Disclaimer */}
              <div className="px-6 py-3 bg-gray-50/80 border-t border-gray-100">
                <p className="text-[9px] text-gray-400 leading-relaxed">
                  Approximate estimate based on space parameters, material selection, and elemental distribution.
                  Actual costs may vary significantly based on location, labor, brand choices, and project complexity.
                </p>
              </div>
            </div>
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
