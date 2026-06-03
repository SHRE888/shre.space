/**
 * SHRE Diagnosis Report — concise, single-render, no-scroll layout.
 *
 * Compact, perfectly centred, with element-coloured accents pulled from
 * the ring diagram so the page reads as a single colour-coordinated card.
 *
 * Layout:
 *   ┌ Header (tight) ──────────────────────────────────────┐
 *   │ DIAGNOSTIC REPORT · SHRE · <Composition>            │
 *   ├ HERO ROW (ring + bars side by side) ─────────────────┤
 *   │ ◉ ring   ▤ 4 bars in a fixed-column grid             │
 *   ├ ESSENCE ─────────────────────────────────────────────┤
 *   │ (+Secondary)(Style)(Palette) pills + 1-2 sentence    │
 *   ├ MATERIALS (2-column compact) ────────────────────────┤
 *   │ • item        • item                                 │
 *   ├ ACTIONS ─────────────────────────────────────────────┤
 *   │ [ Workspace ] [ Generate ]                           │
 *   └──────────────────────────────────────────────────────┘
 *
 * Animation: ONE coordinated fade-in for the whole report (0.55 s
 * ease-out). Bars grow widths inside the same fade — no per-section
 * staggered cascade.
 *
 * Colour story:
 *   • Ring + bars + material dots already use ELEMENT_COLORS.
 *   • Composition kicker, footer separator, and Style / Palette pills
 *     pick up the PRIMARY element colour very subtly so the eye reads
 *     the whole page as one colour-coordinated diagnostic.
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

/** Pretty-print a PascalCase CompositionMode value:
 *  "SingleDominant" → "Single Dominant". Without this the header reads
 *  "SHRE · SINGLEDOMINANT" — ugly. */
const prettyComposition = (mode: CompositionMode): string =>
  mode.replace(/([a-z])([A-Z])/g, '$1 $2');

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

  // Tight 2-sentence summary: primary insight + spatial-guidance opener.
  const summary = [
    firstSentences(diagnosis.primary.explanation, 1),
    firstSentences(diagnosis.spatialGuidance, 1),
  ]
    .filter(Boolean)
    .join(' ');

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
        @keyframes reportFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes reportBarGrow { from { width: 0; } to { width: var(--bar-w); } }
      `}</style>

      <div
        className="max-w-[560px] w-full mx-auto"
        style={{
          animation: mounted ? 'reportFadeIn 0.55s ease-out both' : undefined,
          opacity: mounted ? 1 : 0,
        }}
      >
        {/* ────────── HEADER ────────── */}
        <header className="text-center mb-5">
          <h1 className="text-[16px] sm:text-[18px] font-light tracking-[0.24em] uppercase text-[#1a1a1a]">
            Diagnostic Report
          </h1>
          <p
            className="text-[10px] uppercase tracking-[0.3em] font-medium mt-1.5"
            style={{ color: primaryColor, opacity: 0.75 }}
          >
            SHRE · {prettyComposition(diagnosis.composition)}
          </p>
        </header>

        {/* ────────── HERO ROW — RING + BARS SIDE BY SIDE ──────────
            Ring left, bars right, vertically centred so the row feels
            visually balanced. Bars sit inside a fixed-column grid so
            every row is mirror-symmetric to the others. */}
        <section className="mb-5 flex items-center justify-center gap-6 sm:gap-8 max-w-[520px] mx-auto">
          {/* Ring */}
          <div
            className="w-[96px] h-[96px] rounded-full flex items-center justify-center shrink-0"
            style={{
              background: `conic-gradient(${sorted
                .map(([el, val], i) => {
                  const start = sorted.slice(0, i).reduce((s, [, v]) => s + (v / Math.max(total, 1)) * 360, 0);
                  const end = start + (val / Math.max(total, 1)) * 360;
                  return `${ELEMENT_COLORS[el]} ${start}deg ${end}deg`;
                })
                .join(', ')})`,
              boxShadow: `0 0 40px ${primaryColor}1f`,
            }}
          >
            <div className="w-[72px] h-[72px] rounded-full bg-[#fafafa] flex flex-col items-center justify-center">
              <span className="text-[22px] font-light tabular-nums leading-none" style={{ color: primaryColor }}>
                {pct[primaryEl]}%
              </span>
              <span className="text-[9px] uppercase tracking-[0.28em] text-gray-400 mt-1">
                {cap(primaryEl)}
              </span>
            </div>
          </div>

          {/* Bars */}
          <div className="flex-1 min-w-0 space-y-2">
            {sorted.map(([el, val], i) => (
              <div key={el} className="grid grid-cols-[52px_1fr_34px] items-center gap-3">
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
                      animation: mounted ? `reportBarGrow 0.6s ease-out ${0.1 + i * 0.05}s both` : undefined,
                    }}
                  />
                </div>
                <span
                  className="text-[11.5px] font-mono tabular-nums text-right"
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

        {/* ────────── ESSENCE — PILLS + SHORT SUMMARY ────────── */}
        <section className="mb-5 text-center">
          <div className="flex flex-wrap items-center justify-center gap-1.5 mb-3">
            {secondaryEl && (
              <Pill accent={ELEMENT_COLORS[secondaryEl]} label={`+ ${cap(secondaryEl)} · ${pct[secondaryEl]}%`} />
            )}
            <Pill label={diagnosis.styleDirection} accent={primaryColor} subtle />
            <Pill label={diagnosis.palette} accent={primaryColor} subtle />
          </div>

          {summary && (
            <p className="text-[12.5px] sm:text-[13px] leading-[1.65] font-light text-[#2a2a2a] max-w-[46ch] mx-auto">
              {summary}
            </p>
          )}
        </section>

        {/* ────────── MATERIALS — 2-COL COMPACT ──────────
            With 5-7 materials this collapses into 2 lean centred
            columns — same content, half the height. */}
        {diagnosis.materials && diagnosis.materials.length > 0 && (
          <section className="mb-5">
            <p
              className="text-[9.5px] uppercase tracking-[0.3em] font-medium text-center mb-2.5"
              style={{ color: primaryColor, opacity: 0.7 }}
            >
              Material Palette
            </p>
            {/* Materials grid spans the SAME width as the bars + pills band
                above (560 px) so the right column reaches the same x-axis
                as the bar percentages. Both columns are equal halves of the
                container, gap-x sized so the two columns sit symmetrically
                inside the band — same distance to the left edge of the
                card as to the right edge. */}
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 sm:gap-x-14 gap-y-1.5 w-full max-w-[520px] mx-auto px-2">
              {diagnosis.materials.map((m) => (
                <li key={m.id} className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: ELEMENT_COLORS[m.primaryElement] }}
                  />
                  <span className="text-[12px] sm:text-[12.5px] font-light text-[#1a1a1a] truncate">
                    {m.label}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ────────── ACTIONS ────────── */}
        <footer
          className="pt-4 border-t"
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
          <p className="text-[9.5px] uppercase tracking-[0.3em] font-light text-gray-400 text-center mt-2.5">
            {onGenerateDirectly ? 'Refine first · or render now' : 'Refine materials and atmosphere'}
          </p>
        </footer>
      </div>
    </div>
  );
};

/** Compact uppercase pill used in the Essence row. Two visual modes:
 *  • accent only (used for the secondary-element pill) — coloured dot
 *    in front of the label, neutral border;
 *  • subtle accent (used for Style + Palette) — primary-element colour
 *    tints the border and label so the meta row reads as colour-
 *    coordinated with the ring diagram. */
const Pill: React.FC<{ label: string; accent?: string; subtle?: boolean }> = ({ label, accent, subtle }) => {
  const borderColor = subtle && accent ? `${accent}40` : '#e5e5e5';
  const labelColor = subtle && accent ? accent : '#1a1a1a';
  const bg = subtle && accent ? `${accent}08` : 'rgba(255,255,255,0.7)';
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-[5px] rounded-full"
      style={{ border: `1px solid ${borderColor}`, background: bg }}
    >
      {accent && !subtle && (
        <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accent }} />
      )}
      <span
        className="text-[10px] uppercase tracking-[0.22em] font-medium"
        style={{ color: labelColor }}
      >
        {label}
      </span>
    </span>
  );
};
