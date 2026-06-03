/**
 * SHRE Diagnosis Report — concise, single-render, symmetrically centred.
 *
 * Visual hierarchy (top → bottom, every block centre-aligned):
 *   ┌ Header ───────────────────────────────────────────────┐
 *   │ DIAGNOSTIC REPORT · SHRE · <Composition Mode>        │
 *   ├ HERO ─────────────────────────────────────────────────┤
 *   │            ◉  Ring (primary % + element)              │
 *   ├ DISTRIBUTION ─────────────────────────────────────────┤
 *   │            ▤  4 bars, centred column                  │
 *   ├ ESSENCE ──────────────────────────────────────────────┤
 *   │       ( +SECONDARY )( STYLE )( PALETTE ) pills        │
 *   │       short 2-sentence summary                        │
 *   ├ MATERIALS ────────────────────────────────────────────┤
 *   │       MATERIAL PALETTE                                │
 *   │       •  one centred column of pills                  │
 *   ├ ACTIONS ──────────────────────────────────────────────┤
 *   │       [ Enter Workspace ] [ Generate ]                │
 *   └───────────────────────────────────────────────────────┘
 *
 * Animation: ONE coordinated fade-in for the entire report (0.55 s
 * ease-out). Bars animate widths inside the same fade. No per-section
 * staggered cascade — that was the "loads multiple times" perception.
 *
 * All seven pieces of the Diagnosis object are still on the page —
 * presented tightly so the read is a single sharp moment.
 */

import React, { useEffect, useState } from 'react';
import type { Element, Diagnosis, CompositionMode } from '../types';
import { ELEMENT_COLORS } from '../constants';

interface DiagnosisReportProps {
  diagnosis: Diagnosis;
  onEnterWorkspace: () => void;
  /** When present, shows a second primary action ("Generate") that skips
   *  the workspace and runs generation with the diagnosis defaults. */
  onGenerateDirectly?: () => void;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Pretty-print a PascalCase CompositionMode enum value:
 *  "SingleDominant" → "Single Dominant", "NarrowLead" → "Narrow Lead",
 *  "DualCore" → "Dual Core", "Triadic" → "Triadic", "Minimal" → "Minimal".
 *  Without this the header reads "SHRE · SINGLEDOMINANT" — ugly. */
const prettyComposition = (mode: CompositionMode): string =>
  mode.replace(/([a-z])([A-Z])/g, '$1 $2');

/** First N sentences of a paragraph, joined and trimmed. Used to keep the
 *  diagnosis summary tight (2 sentences max) — full prose lives in the
 *  workspace if the user wants the deep read. */
const firstSentences = (text: string | undefined, n: number): string => {
  if (!text) return '';
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)
    .slice(0, n)
    .join(' ')
    .trim();
};

export const DiagnosisReport: React.FC<DiagnosisReportProps> = ({ diagnosis, onEnterWorkspace, onGenerateDirectly }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 40);
    return () => clearTimeout(t);
  }, []);

  const pct = diagnosis.percentages;
  const sorted = (Object.entries(pct) as Array<[Element, number]>).sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [, v]) => s + v, 0);
  const primaryEl = diagnosis.primary.element;
  const primaryColor = ELEMENT_COLORS[primaryEl];
  const secondaryEl = diagnosis.secondary?.element;

  // Tight 2-sentence summary: primary-element insight + spatial-guidance
  // opener. The full prose for each section is still accessible from the
  // workspace; this page is a sharp single-glance read.
  const summary = [
    firstSentences(diagnosis.primary.explanation, 1),
    firstSentences(diagnosis.spatialGuidance, 1),
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className="min-h-app-main flex flex-col bg-[#fafafa]"
      style={{
        paddingLeft: 'max(1rem, env(safe-area-inset-left))',
        paddingRight: 'max(1rem, env(safe-area-inset-right))',
        paddingTop: 'max(1rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
      }}
    >
      <style>{`
        @keyframes reportFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes reportBarGrow { from { width: 0; } to { width: var(--bar-w); } }
      `}</style>

      <div
        className="max-w-[520px] w-full mx-auto text-center"
        style={{
          animation: mounted ? 'reportFadeIn 0.55s ease-out both' : undefined,
          opacity: mounted ? 1 : 0,
        }}
      >
        {/* ────────── HEADER ────────── */}
        <header className="mb-8 sm:mb-10">
          <h1 className="text-[18px] sm:text-[22px] font-light tracking-[0.22em] uppercase text-[#1a1a1a]">
            Diagnostic Report
          </h1>
          <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.3em] font-light text-gray-400 mt-2">
            SHRE · {prettyComposition(diagnosis.composition)}
          </p>
        </header>

        {/* ────────── HERO RING (centred, alone) ────────── */}
        <section className="mb-8 sm:mb-10 flex justify-center">
          <div
            className="w-[124px] h-[124px] rounded-full flex items-center justify-center"
            style={{
              background: `conic-gradient(${sorted
                .map(([el, val], i) => {
                  const start = sorted.slice(0, i).reduce((s, [, v]) => s + (v / Math.max(total, 1)) * 360, 0);
                  const end = start + (val / Math.max(total, 1)) * 360;
                  return `${ELEMENT_COLORS[el]} ${start}deg ${end}deg`;
                })
                .join(', ')})`,
              boxShadow: `0 0 48px ${primaryColor}1f`,
            }}
          >
            <div className="w-[96px] h-[96px] rounded-full bg-[#fafafa] flex flex-col items-center justify-center">
              <span
                className="text-[26px] sm:text-[28px] font-light tabular-nums leading-none"
                style={{ color: primaryColor }}
              >
                {pct[primaryEl]}%
              </span>
              <span className="text-[9px] uppercase tracking-[0.3em] text-gray-400 mt-1.5">
                {cap(primaryEl)}
              </span>
            </div>
          </div>
        </section>

        {/* ────────── DISTRIBUTION BARS (centred column) ──────────
            Each row is a 3-cell grid (label · bar · %) with fixed column
            widths so every row reads as a perfectly symmetric mirror of
            the others. Bars sit inside a max-width band so the block
            stays visually centred regardless of viewport. */}
        <section className="mb-9 sm:mb-11 max-w-[360px] mx-auto space-y-2.5">
          {sorted.map(([el, val], i) => (
            <div key={el} className="grid grid-cols-[56px_1fr_38px] items-center gap-3">
              <span
                className="text-[10px] uppercase tracking-[0.2em] text-right font-medium"
                style={{ color: ELEMENT_COLORS[el], opacity: i === 0 ? 1 : 0.55 }}
              >
                {cap(el)}
              </span>
              <div
                className="h-[5px] rounded-full overflow-hidden"
                style={{ background: `${ELEMENT_COLORS[el]}14` }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    ['--bar-w' as string]: `${val}%`,
                    width: `${val}%`,
                    background: `linear-gradient(90deg, ${ELEMENT_COLORS[el]}b3, ${ELEMENT_COLORS[el]})`,
                    animation: mounted ? `reportBarGrow 0.6s ease-out ${0.12 + i * 0.06}s both` : undefined,
                  }}
                />
              </div>
              <span
                className="text-[12px] font-mono tabular-nums text-right"
                style={{
                  color: ELEMENT_COLORS[el],
                  fontWeight: i === 0 ? 600 : 400,
                  opacity: i === 0 ? 1 : 0.55,
                }}
              >
                {val}%
              </span>
            </div>
          ))}
        </section>

        {/* ────────── ESSENCE — META PILLS + SHORT SUMMARY ────────── */}
        <section className="mb-9 sm:mb-11">
          <div className="flex flex-wrap items-center justify-center gap-2 mb-5">
            {secondaryEl && (
              <Pill accent={ELEMENT_COLORS[secondaryEl]} label={`+ ${cap(secondaryEl)} · ${pct[secondaryEl]}%`} />
            )}
            <Pill label={diagnosis.styleDirection} />
            <Pill label={diagnosis.palette} />
          </div>

          {summary && (
            <p className="text-[13px] sm:text-[14px] leading-[1.7] font-light text-[#2a2a2a] max-w-[44ch] mx-auto">
              {summary}
            </p>
          )}
        </section>

        {/* ────────── MATERIALS — CENTRED SINGLE COLUMN ──────────
            A symmetric centred list reads cleaner than a 2-column grid
            with uneven-length labels. With 5-7 materials this stays
            short; the visual rhythm of "dot + label" repeats neatly. */}
        {diagnosis.materials && diagnosis.materials.length > 0 && (
          <section className="mb-10 sm:mb-12">
            <p className="text-[10px] uppercase tracking-[0.3em] text-gray-400 font-medium mb-4">
              Material Palette
            </p>
            <ul className="inline-flex flex-col items-start gap-y-2 mx-auto text-left">
              {diagnosis.materials.map((m) => (
                <li key={m.id} className="flex items-center gap-3">
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: ELEMENT_COLORS[m.primaryElement] }}
                  />
                  <span className="text-[12.5px] sm:text-[13.5px] font-light text-[#1a1a1a]">
                    {m.label}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ────────── ACTIONS ────────── */}
        <footer className="pt-6 border-t border-[#e8e8e8]">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={onEnterWorkspace}
              className="px-7 py-3 min-h-[44px] uppercase tracking-[0.25em] text-[11px] sm:text-[12px] font-medium border border-[#1a1a1a] text-[#1a1a1a] bg-[#fafafa] hover:bg-[#f0f0f0] active:bg-[#e5e5e5] transition-colors duration-300 touch-manipulation"
            >
              Enter Workspace
            </button>
            {onGenerateDirectly && (
              <button
                type="button"
                onClick={onGenerateDirectly}
                className="px-7 py-3 min-h-[44px] uppercase tracking-[0.25em] text-[11px] sm:text-[12px] font-medium border border-[#1a1a1a] bg-[#1a1a1a] text-[#fafafa] hover:bg-[#000] active:bg-[#000] transition-colors duration-300 touch-manipulation"
              >
                Generate
              </button>
            )}
          </div>
          <p className="text-[10px] uppercase tracking-[0.3em] font-light text-gray-400 mt-3.5">
            {onGenerateDirectly ? 'Refine first · or render now' : 'Refine materials and atmosphere'}
          </p>
        </footer>
      </div>
    </div>
  );
};

/** Compact uppercase pill for the Essence meta row. Optional leading dot
 *  tints with an accent colour — used by the secondary-element pill so
 *  the colour code links back to the ring/bars without extra labelling. */
const Pill: React.FC<{ label: string; accent?: string }> = ({ label, accent }) => (
  <span className="inline-flex items-center gap-1.5 px-3 py-1 border border-[#e5e5e5] rounded-full bg-white/70">
    {accent && (
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accent }} />
    )}
    <span className="text-[10px] sm:text-[11px] uppercase tracking-[0.22em] font-medium text-[#1a1a1a]">
      {label}
    </span>
  </span>
);
