/**
 * SHRE Diagnosis Report — merged with the welcome-energy aesthetic.
 *
 * Background: the user had two separate screens describing the same thing —
 * the post-survey Diagnosis Report (ring + horizontal bars + pills) and
 * the WorkspacePage welcome overlay (big element symbol + vertical bar
 * chart + secondary-influence line). They preferred the welcome overlay's
 * editorial typography and asked to "merge them — don't show twice".
 *
 * This component now adopts the welcome overlay's visual language:
 *   • Top label "BASED ON YOUR SURVEY ANSWERS"
 *   • Element symbol (▲ ◆ ● ○) in primary colour with soft glow
 *   • Big element name (FIRE, EARTH, …)
 *   • Subtitle "YOUR DOMINANT ENERGY" in primary colour
 *   • Short poetic per-element message (from the overlay's ELEMENT_MSGS)
 *   • Vertical 4-element bar chart with the primary highlighted
 *   • Meta row — composition · style · palette pills (kept tasteful)
 *   • Material palette list (compact 2 columns)
 *   • "with <Element> as your secondary influence" line
 *   • Two action buttons (Enter Workspace / Generate)
 *   • Hint copy underneath ("Refine first · or render now")
 *
 * App.tsx sets `sessionStorage['shre_welcome_shown'] = 1` when this report
 * mounts, so WorkspacePage's welcome overlay does not re-present the same
 * reveal — the user sees the dominant-energy moment exactly once.
 */

import React, { useEffect, useState } from 'react';
import type { Element, Diagnosis, CompositionMode } from '../types';
import { ELEMENT_COLORS } from '../constants';

interface DiagnosisReportProps {
  diagnosis: Diagnosis;
  onEnterWorkspace: () => void;
  /** Optional "Generate" shortcut — skips the workspace and starts the
   *  image-generation flow with the diagnosis defaults. */
  onGenerateDirectly?: () => void;
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

/** Short, evocative per-element message — copied from the welcome overlay
 *  so the two surfaces are now one continuous read. */
const ELEMENT_MSGS: Record<Element, string> = {
  earth: 'You are drawn to weight, texture, and permanence. Your spaces feel rooted and protective.',
  fire: 'You seek intensity, contrast, and bold presence. Your spaces ignite and energize.',
  water: 'You resonate with flow, softness, and depth. Your spaces breathe and calm.',
  air: 'You crave openness, light, and clarity. Your spaces dissolve boundaries.',
};

/** Pretty-print a PascalCase CompositionMode → "Single Dominant". */
const prettyComposition = (mode: CompositionMode): string =>
  mode.replace(/([a-z])([A-Z])/g, '$1 $2');

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const DiagnosisReport: React.FC<DiagnosisReportProps> = ({ diagnosis, onEnterWorkspace, onGenerateDirectly }) => {
  const [mounted, setMounted] = useState(false);
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

        {/* ─── ELEMENT MESSAGE ─── */}
        <p
          className="text-[12.5px] sm:text-[13px] font-light leading-[1.75] mx-auto mb-5 max-w-[44ch]"
          style={{ color: 'rgba(0,0,0,0.5)' }}
        >
          {ELEMENT_MSGS[el]}
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

        {/* ─── SECONDARY INFLUENCE LINE ─── */}
        {sec && sec !== el && (
          <p
            className="text-[12.5px] sm:text-[13px] font-light mb-5"
            style={{ color: 'rgba(0,0,0,0.32)' }}
          >
            with{' '}
            <span style={{ color: ELEMENT_COLORS[sec], fontWeight: 500 }}>
              {ELEMENT_NAMES[sec]}
            </span>{' '}
            as your secondary influence
          </p>
        )}

        {/* ─── META PILLS — composition · style · palette ─── */}
        <div className="flex flex-wrap items-center justify-center gap-1.5 mb-6">
          <Pill label={prettyComposition(diagnosis.composition)} accent={primaryColor} subtle />
          <Pill label={diagnosis.styleDirection} accent={primaryColor} subtle />
          <Pill label={diagnosis.palette} accent={primaryColor} subtle />
        </div>

        {/* ─── MATERIAL PALETTE ─── */}
        {diagnosis.materials && diagnosis.materials.length > 0 && (
          <section className="mb-6">
            <p
              className="text-[9.5px] uppercase font-medium mb-3"
              style={{
                letterSpacing: '0.32em',
                color: primaryColor,
                opacity: 0.7,
                fontFamily: "'IBM Plex Mono', monospace",
              }}
            >
              Material Palette
            </p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 sm:gap-x-14 gap-y-1.5 w-full max-w-[520px] mx-auto px-2 text-left">
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
          </section>
        )}

        {/* ─── ACTIONS ─── */}
        <div
          className="pt-5 border-t"
          style={{ borderColor: `${primaryColor}22` }}
        >
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={onEnterWorkspace}
              className="px-6 py-2.5 min-h-[42px] uppercase tracking-[0.25em] text-[11px] font-medium border border-[#1a1a1a] text-[#1a1a1a] bg-[#fafafa] hover:bg-[#f0f0f0] active:bg-[#e5e5e5] transition-colors duration-300 touch-manipulation"
            >
              Enter Workspace
            </button>
            {onGenerateDirectly && (
              <button
                type="button"
                onClick={onGenerateDirectly}
                className="px-6 py-2.5 min-h-[42px] uppercase tracking-[0.25em] text-[11px] font-medium border border-[#1a1a1a] bg-[#1a1a1a] text-[#fafafa] hover:bg-[#000] active:bg-[#000] transition-colors duration-300 touch-manipulation"
              >
                Generate
              </button>
            )}
          </div>
          <p
            className="text-[9.5px] uppercase font-light text-center mt-2.5"
            style={{
              letterSpacing: '0.3em',
              color: 'rgba(0,0,0,0.32)',
              fontFamily: "'IBM Plex Mono', monospace",
            }}
          >
            {onGenerateDirectly ? 'Refine first · or render now' : 'Refine materials and atmosphere'}
          </p>
        </div>
      </div>
    </div>
  );
};

/** Compact uppercase pill used in the meta row — composition / style /
 *  palette. The `subtle` variant tints the border + label with the
 *  primary-element colour so the meta facts read as one colour-
 *  coordinated row matching the ring/bars above. */
const Pill: React.FC<{ label: string; accent?: string; subtle?: boolean }> = ({ label, accent, subtle }) => {
  const borderColor = subtle && accent ? `${accent}40` : '#e5e5e5';
  const labelColor = subtle && accent ? accent : '#1a1a1a';
  const bg = subtle && accent ? `${accent}0a` : 'rgba(255,255,255,0.7)';
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-[5px] rounded-full"
      style={{ border: `1px solid ${borderColor}`, background: bg }}
    >
      {accent && !subtle && (
        <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accent }} />
      )}
      <span
        className="text-[10px] uppercase font-medium"
        style={{
          letterSpacing: '0.22em',
          color: labelColor,
          fontFamily: "'IBM Plex Mono', monospace",
        }}
      >
        {label}
      </span>
    </span>
  );
};
