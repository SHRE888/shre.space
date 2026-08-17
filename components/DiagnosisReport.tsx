/**
 * SHRE Diagnosis Report — merged with the welcome-energy aesthetic.
 *
 * Background: the user had two separate screens describing the same thing —
 * the post-survey Diagnosis Report (ring + horizontal bars + pills) and
 * the WorkspacePage welcome overlay (big element symbol + vertical bar
 * chart + secondary-influence line). They preferred the welcome overlay's
 * editorial typography and asked to "merge them — don't show twice".
 *
 * The reading is deliberately front-loaded. Someone who has just answered
 * five wordless questions wants the answer and the render button, not an
 * essay, so everything above the fold is only:
 *   • Top label "BASED ON YOUR SURVEY ANSWERS"
 *   • Element symbol (▲ ◆ ● ○) in primary colour with soft glow
 *   • Big element name (FIRE, EARTH, …) + "YOUR DOMINANT ENERGY"
 *   • The headline and one line of essence
 *   • Vertical 4-element bar chart with the primary highlighted
 *   • What the secondary element asks the room to do
 *   • Plan / Light / Matter — the whole translation in three lines
 *   • Generate and Enter Workspace
 *
 * Everything the engine wrote — the full address, meaning, spatial and
 * material translation, the named style and palette direction, the material
 * list and the working brief — is still here, behind "Read the full
 * diagnosis". It is the evidence, not the message.
 *
 * App.tsx sets `sessionStorage['shre_welcome_shown'] = 1` when this report
 * mounts, so WorkspacePage's welcome overlay does not re-present the same
 * reveal — the user sees the dominant-energy moment exactly once.
 */

import React, { useEffect, useMemo, useState } from 'react';
import type { Element, Diagnosis, CompositionMode } from '../types';
import { ELEMENT_COLORS } from '../constants';
import { buildEnergyNarrative } from '../services/energyNarrative';
import { SHRE_STYLE_DEFINITIONS, SHRE_PALETTE_DEFINITIONS } from '../services/shreDiagnosis';

interface DiagnosisReportProps {
  diagnosis: Diagnosis;
  onEnterWorkspace: () => void;
  /** Optional "Generate" shortcut — skips the workspace and starts the
   *  image-generation flow with the diagnosis defaults. */
  onGenerateDirectly?: () => void;
  /** Optional route into the long-form deep dive questionnaire. */
  onDeepDive?: () => void;
}

const ELEMENT_NAMES: Record<Element, string> = {
  earth: 'Earth',
  fire: 'Fire',
  water: 'Water',
  air: 'Air',
};

const ELEMENT_EMOJIS: Record<Element, string> = {
  earth: '◆',
  fire: '▲',
  water: '●',
  air: '○',
};

/** Pretty-print a PascalCase CompositionMode → "Single Dominant". */
const prettyComposition = (mode: CompositionMode): string =>
  mode.replace(/([a-z])([A-Z])/g, '$1 $2');

/**
 * Split the engine's spatial brief back into its labelled movements so the
 * report can lay them out as rows instead of one dense paragraph. The engine
 * always emits "Feel: … Avoid: … Balance critical at: …" in that order.
 */
const parseSpatialGuidance = (text: string): Array<{ label: string; body: string }> => {
  const matches = [...text.matchAll(/(Feel|Avoid|Balance critical at):\s*/g)];
  return matches.map((m, i) => ({
    label: m[1],
    body: text.slice(m.index! + m[0].length, i + 1 < matches.length ? matches[i + 1].index! : text.length).trim(),
  }));
};

export const DiagnosisReport: React.FC<DiagnosisReportProps> = ({ diagnosis, onEnterWorkspace, onGenerateDirectly, onDeepDive }) => {
  const [mounted, setMounted] = useState(false);
  const [readingOpen, setreadingOpen] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 40);
    return () => clearTimeout(t);
  }, []);

  const el = diagnosis.primary.element;
  const sec = diagnosis.secondary?.element;
  const primaryColor = ELEMENT_COLORS[el];
  const pct = diagnosis.percentages;
  const sortedAll = (['earth', 'fire', 'water', 'air'] as Element[]).sort((a, b) => pct[b] - pct[a]);

  // Close-call detection mirrors the workspace overlay's logic — when the
  // top two elements are within 5 points we soften the "DOMINANT" claim
  // to "LEADING" so the copy stays honest.
  const gap = Math.round(pct[sortedAll[0]]) - Math.round(pct[sortedAll[1]]);
  const isCloseCall = gap <= 5;

  // The survey reads inner disposition, so the report opens by speaking to the
  // person before it describes the space.
  const narrative = useMemo(() => buildEnergyNarrative(pct, el, sec), [pct, el, sec]);
  const brief = useMemo(() => parseSpatialGuidance(diagnosis.spatialGuidance), [diagnosis.spatialGuidance]);

  return (
    <div
      className="min-h-app-main flex flex-col justify-center bg-[#fafafa]"
      style={{
        paddingLeft: 'max(1rem, env(safe-area-inset-left))',
        paddingRight: 'max(1rem, env(safe-area-inset-right))',
        paddingTop: 'max(1rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
      }}
    >
      <style>{`
        @keyframes diagFadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes diagBarGrow { from { height: 0; } to { height: var(--bar-h); } }
      `}</style>

      <div
        className="text-center max-w-lg w-full mx-auto px-2"
        style={{
          animation: mounted ? 'diagFadeUp 0.6s ease-out both' : undefined,
          opacity: mounted ? 1 : 0,
          fontFamily: "'IBM Plex Sans', sans-serif",
        }}
      >
        {/* ─── TOP LABEL ─── */}
        <div
          className="text-[10px] sm:text-[11px] uppercase font-light mb-3"
          style={{
            letterSpacing: '0.4em',
            color: 'rgba(0,0,0,0.22)',
            fontFamily: "'IBM Plex Mono', monospace",
          }}
        >
          Based on your survey answers
        </div>

        {/* ─── ELEMENT SYMBOL ─── */}
        <div
          className="leading-none mb-2"
          style={{
            fontSize: 'clamp(28px, 6vw, 36px)',
            color: primaryColor,
            textShadow: `0 0 36px ${primaryColor}40`,
          }}
        >
          {ELEMENT_EMOJIS[el]}
        </div>

        {/* ─── BIG ELEMENT NAME ─── */}
        <div
          className="font-extralight uppercase mb-1.5"
          style={{
            fontSize: 'clamp(24px, 6.5vw, 32px)',
            letterSpacing: '0.2em',
            color: '#1a1a1a',
          }}
        >
          {ELEMENT_NAMES[el]}
        </div>

        {/* ─── SUBTITLE ─── */}
        <div
          className="uppercase font-medium mb-3"
          style={{
            fontSize: 'clamp(11px, 2.8vw, 13px)',
            letterSpacing: '0.22em',
            color: primaryColor,
            fontFamily: "'IBM Plex Mono', monospace",
          }}
        >
          {isCloseCall ? 'Your leading energy' : 'Your dominant energy'}
        </div>

        {/* ─── THE SHORT READING ───
            One headline and one line. The full address, meaning and spatial
            translation are still written, but they live behind the disclosure
            further down so this screen answers the survey in a breath. */}
        <p
          className="mx-auto mb-3 max-w-[26ch] font-light leading-[1.3]"
          style={{
            fontSize: 'clamp(19px, 4.6vw, 25px)',
            color: '#1a1a1a',
            fontFamily: "'Playfair Display', Georgia, serif",
          }}
        >
          {narrative.headline}
        </p>
        <p
          className="text-[13px] sm:text-[14px] font-light leading-[1.7] mx-auto mb-5 max-w-[44ch]"
          style={{ color: 'rgba(0,0,0,0.6)' }}
        >
          Your energy leans toward{' '}
          <span style={{ color: '#1a1a1a', fontWeight: 500 }}>{narrative.leaning}</span>
          {' — '}
          {narrative.because}.
        </p>

        {/* ─── VERTICAL BAR CHART ───
            4 columns side-by-side, primary element gets full saturation,
            secondary at 50%, others at 25%. The bar height scales with
            percentage so the chart reads as a poster-clean stat block. */}
        <div className="flex justify-center items-end gap-3 sm:gap-4 mb-5" style={{ minHeight: 100 }}>
          {(['earth', 'fire', 'water', 'air'] as Element[]).map((e) => {
            const val = Math.round(pct[e]);
            const isPrimary = e === el;
            const isSecondary = e === sec;
            const heightPx = Math.max(val * 1.4, 8);
            return (
              <div key={e} className="text-center" style={{ width: 'clamp(40px, 10vw, 52px)' }}>
                <div
                  className="tabular-nums mb-1.5"
                  style={{
                    fontSize: '12.5px',
                    fontWeight: isPrimary ? 700 : isSecondary ? 500 : 300,
                    color: isPrimary
                      ? primaryColor
                      : isSecondary
                        ? `${ELEMENT_COLORS[e]}c0`
                        : 'rgba(0,0,0,0.2)',
                    fontFamily: "'IBM Plex Mono', monospace",
                  }}
                >
                  {val}%
                </div>
                <div
                  style={{
                    ['--bar-h' as string]: `${heightPx}px`,
                    height: `${heightPx}px`,
                    background: isPrimary
                      ? ELEMENT_COLORS[e]
                      : isSecondary
                        ? `${ELEMENT_COLORS[e]}80`
                        : `${ELEMENT_COLORS[e]}33`,
                    borderRadius: '3px 3px 0 0',
                    boxShadow: isPrimary ? `0 0 16px ${ELEMENT_COLORS[e]}40` : 'none',
                    marginBottom: '8px',
                    animation: mounted ? `diagBarGrow 0.8s ease-out 0.2s both` : undefined,
                  }}
                />
                <div
                  className="uppercase"
                  style={{
                    fontSize: isPrimary ? '9.5px' : '9px',
                    fontWeight: isPrimary ? 600 : 300,
                    letterSpacing: '0.14em',
                    color: isPrimary
                      ? '#1a1a1a'
                      : isSecondary
                        ? 'rgba(0,0,0,0.4)'
                        : 'rgba(0,0,0,0.22)',
                    fontFamily: "'IBM Plex Mono', monospace",
                  }}
                >
                  {ELEMENT_NAMES[e]}
                </div>
              </div>
            );
          })}
        </div>

        {/* ─── UNDERTONE ───
            The secondary element used to be announced without consequence
            ("with Water as your secondary influence"). It now says what it
            actually asks the room to do. */}
        {sec && sec !== el && narrative.undertone && (
          <p
            className="text-[12.5px] sm:text-[13px] font-light mb-5 mx-auto max-w-[42ch]"
            style={{ color: 'rgba(0,0,0,0.42)' }}
          >
            <span style={{ color: ELEMENT_COLORS[sec], fontWeight: 500 }}>
              {ELEMENT_NAMES[sec]}
            </span>{' '}
            underneath — {narrative.undertone}.
          </p>
        )}

        {/* ─── PLAN / LIGHT / MATTER ───
            The whole translation in three lines, so the reader gets the
            spatial answer without having to read a page for it. */}
        <dl className="mb-6 mx-auto max-w-[44ch] text-left space-y-2">
          {narrative.keys.map(({ label, body }) => (
            <div key={label} className="flex items-baseline gap-3">
              <dt
                className="text-[9px] uppercase font-medium shrink-0 w-[46px]"
                style={{
                  letterSpacing: '0.2em',
                  color: primaryColor,
                  opacity: 0.75,
                  fontFamily: "'IBM Plex Mono', monospace",
                }}
              >
                {label}
              </dt>
              <dd className="text-[12.5px] sm:text-[13px] font-light leading-[1.6]" style={{ color: 'rgba(0,0,0,0.62)' }}>
                {body}
              </dd>
            </div>
          ))}
        </dl>

        {/* ─── ACTIONS ───
            Kept directly under the short reading. The survey is five taps
            long, so the render button has to be reachable without scrolling
            past an essay first. */}
        <div className="pt-5 border-t" style={{ borderColor: `${primaryColor}22` }}>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5 sm:gap-3">
            {onGenerateDirectly && (
              <button
                type="button"
                onClick={onGenerateDirectly}
                className="px-6 py-2.5 min-h-[42px] uppercase tracking-[0.25em] text-[11px] font-medium border border-[#1a1a1a] bg-[#1a1a1a] text-[#fafafa] hover:bg-[#000] active:bg-[#000] transition-colors duration-300 touch-manipulation"
              >
                Generate
              </button>
            )}
            <button
              type="button"
              onClick={onEnterWorkspace}
              className="px-6 py-2.5 min-h-[42px] uppercase tracking-[0.25em] text-[11px] font-medium border border-[#1a1a1a] text-[#1a1a1a] bg-[#fafafa] hover:bg-[#f0f0f0] active:bg-[#e5e5e5] transition-colors duration-300 touch-manipulation"
            >
              Enter Workspace
            </button>
          </div>
          <p
            className="text-[9.5px] uppercase font-light text-center mt-2.5"
            style={{
              letterSpacing: '0.3em',
              color: 'rgba(0,0,0,0.32)',
              fontFamily: "'IBM Plex Mono', monospace",
            }}
          >
            {onGenerateDirectly ? 'Render now · or refine first' : 'Refine materials and atmosphere'}
          </p>
        </div>

        {/* ─── THE LONGER READING ───
            Everything the engine wrote: the full address, what it means, how
            it becomes space and material, the named direction, the material
            palette and the working brief. Collapsed, because the answer above
            is the message and this is the evidence for it. */}
        <section className="mt-6 text-left max-w-[52ch] mx-auto">
          <button
            type="button"
            onClick={() => setreadingOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-3 py-2 text-left"
            aria-expanded={readingOpen}
          >
            <span
              className="text-[9.5px] uppercase font-medium"
              style={{
                letterSpacing: '0.32em',
                color: primaryColor,
                opacity: 0.7,
                fontFamily: "'IBM Plex Mono', monospace",
              }}
            >
              Read the full diagnosis
            </span>
            <span
              className="text-[13px] leading-none transition-transform duration-300"
              style={{ color: primaryColor, opacity: 0.6, transform: readingOpen ? 'rotate(45deg)' : 'none' }}
              aria-hidden
            >
              +
            </span>
          </button>

          {readingOpen && (
            <div className="pt-2 space-y-6">
              <div>
                <SectionLabel accent={primaryColor}>Your energy</SectionLabel>
                <Prose>{narrative.address}</Prose>
              </div>
              <div>
                <SectionLabel accent={primaryColor}>What this means</SectionLabel>
                <Prose>{narrative.meaning}</Prose>
              </div>
              <div>
                <SectionLabel accent={primaryColor}>How it becomes space</SectionLabel>
                <Prose>{narrative.space}</Prose>
              </div>
              <div>
                <SectionLabel accent={primaryColor}>How it becomes material</SectionLabel>
                <Prose>{narrative.translation}</Prose>
              </div>

              <div>
                <SectionLabel accent={primaryColor}>Your design direction</SectionLabel>
                <dl className="space-y-2.5">
                  <DirectionRow
                    accent={primaryColor}
                    term={diagnosis.styleDirection}
                    definition={SHRE_STYLE_DEFINITIONS[diagnosis.styleDirection]}
                  />
                  <DirectionRow
                    accent={primaryColor}
                    term={`${diagnosis.palette} palette`}
                    definition={SHRE_PALETTE_DEFINITIONS[diagnosis.palette]}
                  />
                  <DirectionRow
                    accent={primaryColor}
                    term={prettyComposition(diagnosis.composition)}
                    definition={narrative.shape === 'duality'
                      ? 'two elements carry it together — the design lives in their tension'
                      : narrative.shape === 'single'
                        ? 'one element carries everything — the language should hold all the way through'
                        : 'one element leads while the others appear as moments, not as competing systems'}
                  />
                </dl>
              </div>

              {diagnosis.materials && diagnosis.materials.length > 0 && (
                <div>
                  <SectionLabel accent={primaryColor}>Material palette</SectionLabel>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-1.5">
                    {diagnosis.materials.map((m) => (
                      <li key={m.id} className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: ELEMENT_COLORS[m.primaryElement] }}
                        />
                        <span className="text-[12px] sm:text-[12.5px] font-light truncate" style={{ color: '#1a1a1a' }}>
                          {m.label}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {brief.length > 0 && (
                <div>
                  <SectionLabel accent={primaryColor}>The working brief</SectionLabel>
                  <dl className="space-y-3">
                    {brief.map(({ label, body }) => (
                      <div key={label}>
                        <dt
                          className="text-[9.5px] uppercase font-medium mb-1"
                          style={{
                            letterSpacing: '0.2em',
                            color: 'rgba(0,0,0,0.35)',
                            fontFamily: "'IBM Plex Mono', monospace",
                          }}
                        >
                          {label}
                        </dt>
                        <dd className="text-[12px] sm:text-[12.5px] font-light leading-[1.75]" style={{ color: 'rgba(0,0,0,0.55)' }}>
                          {body}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ─── DEEP DIVE ───
            Five wordless questions read the direction; the deep dive reads the
            detail. Offered at the very bottom as an option, never as a demand. */}
        {onDeepDive && (
          <section className="mt-8 pt-6 max-w-[52ch] mx-auto" style={{ borderTop: '1px solid rgba(0,0,0,0.07)' }}>
            <p
              className="text-[9.5px] uppercase font-medium mb-2"
              style={{
                letterSpacing: '0.32em',
                color: 'rgba(0,0,0,0.3)',
                fontFamily: "'IBM Plex Mono', monospace",
              }}
            >
              Deep dive questions
            </p>
            <p className="text-[12px] sm:text-[12.5px] font-light leading-[1.75] mb-3" style={{ color: 'rgba(0,0,0,0.5)' }}>
              Five questions found the direction of your energy. The deep dive asks the
              slower ones — and sharpens this reading if you want to go further.
            </p>
            <button
              type="button"
              onClick={onDeepDive}
              className="inline-flex min-h-[44px] items-center gap-2 px-4 py-2 rounded-full transition-all duration-300 hover:bg-gray-100 active:scale-[0.97] touch-manipulation"
              style={{ border: '1px solid rgba(0,0,0,0.12)' }}
            >
              <span
                className="text-[11px] uppercase font-medium"
                style={{
                  letterSpacing: '0.22em',
                  color: 'rgba(0,0,0,0.6)',
                  fontFamily: "'IBM Plex Mono', monospace",
                }}
              >
                Continue to deep dive
              </span>
              <span className="text-[13px] leading-none" style={{ color: primaryColor, opacity: 0.7 }} aria-hidden>
                →
              </span>
            </button>
          </section>
        )}
      </div>
    </div>
  );
};

/** Body copy for the long-form sections of the reading. */
const Prose: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[12.5px] sm:text-[13px] font-light leading-[1.8]" style={{ color: 'rgba(0,0,0,0.58)' }}>
    {children}
  </p>
);

/** Small uppercase heading used by the written sections of the reading. */
const SectionLabel: React.FC<{ accent: string; children: React.ReactNode }> = ({ accent, children }) => (
  <p
    className="text-[9.5px] uppercase font-medium mb-2"
    style={{
      letterSpacing: '0.32em',
      color: accent,
      opacity: 0.7,
      fontFamily: "'IBM Plex Mono', monospace",
    }}
  >
    {children}
  </p>
);

/** One line of the design-direction list: the canonical term plus the
 *  one-line definition that makes it mean something to a reader. */
const DirectionRow: React.FC<{ accent: string; term: string; definition: string }> = ({ accent, term, definition }) => (
  <div className="flex items-baseline gap-2.5">
    <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0 translate-y-[-2px]" style={{ backgroundColor: accent }} />
    <div className="min-w-0">
      <dt className="text-[12.5px] sm:text-[13px] font-medium inline" style={{ color: '#1a1a1a' }}>
        {term}
      </dt>
      <dd className="text-[12.5px] sm:text-[13px] font-light inline" style={{ color: 'rgba(0,0,0,0.5)' }}>
        {' — '}{definition}
      </dd>
    </div>
  </div>
);

