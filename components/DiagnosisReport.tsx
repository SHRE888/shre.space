/**
 * SHRE Diagnosis Report — concise, single-render client-facing view.
 *
 * Lay-out brief (rebuilt per user request "ლაკონური, მკაფიო, ერთხელ
 * დაიწეროს"):
 *   ┌ Header ───────────────────────────────────────────────┐
 *   │ DIAGNOSTIC REPORT · SHRE · Composition: <…>          │
 *   ├ HERO ─────────────────────────────────────────────────┤
 *   │ Ring (primary %)   ◯  Distribution bars (4 stacked)  │
 *   │                       Primary · Secondary metadata    │
 *   ├ ESSENCE ──────────────────────────────────────────────┤
 *   │ Style · Palette · Composition pills                   │
 *   │ Short 2-3-sentence summary (primary + spatial guide)  │
 *   ├ MATERIALS ────────────────────────────────────────────┤
 *   │ Compact pill list — coloured dot + label              │
 *   └ ACTIONS ──────────────────────────────────────────────┘
 *
 * Animation: ONE coordinated fade-in for the entire report (0.6 s ease-out).
 * No per-section cascade. That removes the perceived "multiple loads" the
 * staggered version produced.
 *
 * The 7-section diagnosis object is still consumed — we just present it
 * tightly. All seven pieces of information are still on the page:
 *   • primary + secondary collapsed into one metadata row;
 *   • style direction + palette collapsed into one pills row;
 *   • primary explanation + spatial guidance collapsed into ONE paragraph;
 *   • materials shown as compact rows without the role-register sub-label.
 */

import React, { useEffect, useState } from 'react';
import type { Element, Diagnosis } from '../types';
import { ELEMENT_COLORS } from '../constants';

interface DiagnosisReportProps {
  diagnosis: Diagnosis;
  onEnterWorkspace: () => void;
  /** When present, shows a second primary action ("Generate") that skips
   *  the workspace and runs generation with the diagnosis defaults. */
  onGenerateDirectly?: () => void;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Take a multi-sentence string and return the first N sentences joined,
 *  trimmed. Used to keep the long Spatial Guidance paragraph short on the
 *  results page — the full text is still available on the workspace. */
const firstSentences = (text: string | undefined, n: number): string => {
  if (!text) return '';
  const sentences = text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
  return sentences.slice(0, n).join(' ').trim();
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

  // Build a tight 2-3 sentence summary: first sentence of the primary
  // explanation + first sentence of the spatial guidance. Keeps the read
  // sharp without losing the most actionable content from each section.
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
        className="max-w-xl w-full mx-auto"
        style={{
          animation: mounted ? 'reportFadeIn 0.55s ease-out both' : undefined,
          opacity: mounted ? 1 : 0,
        }}
      >
        {/* ────────── HEADER ────────── */}
        <header className="text-center mb-7 sm:mb-9">
          <h1 className="text-[18px] sm:text-[22px] font-light tracking-[0.22em] uppercase text-[#1a1a1a]">
            Diagnostic Report
          </h1>
          <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.3em] font-light text-gray-400 mt-1.5">
            SHRE · {diagnosis.composition}
          </p>
        </header>

        {/* ────────── HERO — RING + DISTRIBUTION ──────────
            One row on desktop (ring left, bars right), stacked on mobile.
            No per-section label here — the visual itself IS the section. */}
        <section className="mb-7 sm:mb-9 flex flex-col sm:flex-row items-center sm:items-center gap-6 sm:gap-9">
          {/* Ring */}
          <div
            className="w-[104px] h-[104px] rounded-full flex items-center justify-center shrink-0"
            style={{
              background: `conic-gradient(${sorted
                .map(([el, val], i) => {
                  const start = sorted.slice(0, i).reduce((s, [, v]) => s + (v / Math.max(total, 1)) * 360, 0);
                  const end = start + (val / Math.max(total, 1)) * 360;
                  return `${ELEMENT_COLORS[el]} ${start}deg ${end}deg`;
                })
                .join(', ')})`,
              boxShadow: `0 0 36px ${primaryColor}25`,
            }}
          >
            <div className="w-[78px] h-[78px] rounded-full bg-[#fafafa] flex flex-col items-center justify-center">
              <span className="text-[22px] font-light tabular-nums leading-none" style={{ color: primaryColor }}>
                {pct[primaryEl]}%
              </span>
              <span className="text-[9px] uppercase tracking-[0.22em] text-gray-400 mt-1">
                {cap(primaryEl)}
              </span>
            </div>
          </div>

          {/* Bars */}
          <div className="flex-1 w-full space-y-2.5">
            {sorted.map(([el, val], i) => (
              <div key={el} className="flex items-center gap-3">
                <span
                  className="text-[10px] uppercase tracking-[0.18em] w-12 text-right font-medium"
                  style={{ color: ELEMENT_COLORS[el], opacity: i === 0 ? 1 : 0.6 }}
                >
                  {cap(el)}
                </span>
                <div
                  className="flex-1 h-[5px] rounded-full overflow-hidden"
                  style={{ background: `${ELEMENT_COLORS[el]}12` }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      ['--bar-w' as string]: `${val}%`,
                      width: `${val}%`,
                      background: `linear-gradient(90deg, ${ELEMENT_COLORS[el]}cc, ${ELEMENT_COLORS[el]})`,
                      animation: mounted ? `reportBarGrow 0.6s ease-out ${0.1 + i * 0.06}s both` : undefined,
                    }}
                  />
                </div>
                <span
                  className="text-[12px] font-mono tabular-nums w-9 text-right"
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
          </div>
        </section>

        {/* ────────── ESSENCE — META PILLS + SHORT SUMMARY ────────── */}
        <section className="mb-7 sm:mb-9">
          {/* Meta pills row: secondary element + style + palette. */}
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2 mb-5">
            {secondaryEl && (
              <Pill
                accent={ELEMENT_COLORS[secondaryEl]}
                label={`+ ${cap(secondaryEl)} · ${pct[secondaryEl]}%`}
              />
            )}
            <Pill label={diagnosis.styleDirection} />
            <Pill label={diagnosis.palette} />
          </div>

          {/* Short summary — one tight paragraph instead of three. */}
          {summary && (
            <p className="text-[13px] sm:text-[14px] leading-[1.7] font-light text-[#2a2a2a] text-center max-w-[44ch] mx-auto">
              {summary}
            </p>
          )}
        </section>

        {/* ────────── MATERIALS — COMPACT LIST ────────── */}
        {diagnosis.materials && diagnosis.materials.length > 0 && (
          <section className="mb-8 sm:mb-10">
            <p className="text-[10px] uppercase tracking-[0.3em] text-gray-400 font-medium text-center mb-3">
              Material Palette
            </p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
              {diagnosis.materials.map((m) => (
                <li key={m.id} className="flex items-center gap-2.5">
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: ELEMENT_COLORS[m.primaryElement] }}
                  />
                  <span className="text-[12px] sm:text-[13px] font-light text-[#1a1a1a] truncate">
                    {m.label}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ────────── ACTIONS ────────── */}
        <footer className="pt-5 border-t border-[#e5e5e5]">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={onEnterWorkspace}
              className="px-6 py-3 min-h-[44px] uppercase tracking-[0.25em] text-[11px] sm:text-[12px] font-medium border border-[#1a1a1a] text-[#1a1a1a] bg-[#fafafa] hover:bg-[#f0f0f0] active:bg-[#e5e5e5] transition-colors duration-300 touch-manipulation"
            >
              Enter Workspace
            </button>
            {onGenerateDirectly && (
              <button
                type="button"
                onClick={onGenerateDirectly}
                className="px-6 py-3 min-h-[44px] uppercase tracking-[0.25em] text-[11px] sm:text-[12px] font-medium border border-[#1a1a1a] bg-[#1a1a1a] text-[#fafafa] hover:bg-[#000] active:bg-[#000] transition-colors duration-300 touch-manipulation"
              >
                Generate
              </button>
            )}
          </div>
          <p className="text-[10px] uppercase tracking-[0.3em] font-light text-gray-400 text-center mt-3">
            {onGenerateDirectly ? 'Refine first · or render now' : 'Refine materials and atmosphere'}
          </p>
        </footer>
      </div>
    </div>
  );
};

/** Compact uppercase pill used in the Essence meta row. Optional accent
 *  colour tints a small leading dot — used for the secondary-element pill. */
const Pill: React.FC<{ label: string; accent?: string }> = ({ label, accent }) => (
  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-[#e0e0e0] rounded-full bg-white/60">
    {accent && (
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accent }} />
    )}
    <span className="text-[10px] sm:text-[11px] uppercase tracking-[0.22em] font-medium text-[#1a1a1a]">
      {label}
    </span>
  </span>
);
