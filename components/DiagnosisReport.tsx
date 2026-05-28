/**
 * SHRE Diagnosis Report — client-facing 7-section view.
 *
 * Renders the full Diagnosis object produced by services/shreDiagnosis.ts.
 * Sections appear in the spec order:
 *
 *   1. Elemental Distribution (ring + bars)
 *   2. Primary Element (behaviour + spatial preference)
 *   3. Secondary Element (or "Minimal composition" note when absent)
 *   4. Style Direction (one of 6)
 *   5. Color Logic (one of 4)
 *   6. Material Mapping (5–7 materials with elemental % per material)
 *   7. Spatial Guidance (prose, approved vocabulary only)
 *
 * Visual language reuses tokens already in the app (no new design system):
 *   - background  #fafafa
 *   - section dividers are 1px hairlines
 *   - typography:  uppercase tracking labels + light body weight
 *   - element colours come from ELEMENT_COLORS in constants.tsx
 *
 * The user advances to the workspace by clicking "Enter Workspace" — there
 * is no auto-redirect; the report is a real read.
 */

import React, { useEffect, useState } from 'react';
import type { Element, Diagnosis } from '../types';
import { ELEMENT_COLORS } from '../constants';

interface DiagnosisReportProps {
  diagnosis: Diagnosis;
  onEnterWorkspace: () => void;
  /**
   * Optional shortcut: skip the workspace and start the generation flow
   * immediately. When present, the report footer renders a second primary
   * action ("Generate") next to "Enter Workspace" — the user can either
   * customise their materials/atmosphere first (workspace) or generate the
   * default brief produced by this diagnosis right now.
   */
  onGenerateDirectly?: () => void;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const DiagnosisReport: React.FC<DiagnosisReportProps> = ({ diagnosis, onEnterWorkspace, onGenerateDirectly }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 60);
    return () => clearTimeout(t);
  }, []);

  const pct = diagnosis.percentages;
  const sorted = (Object.entries(pct) as Array<[Element, number]>).sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [, v]) => s + v, 0);
  const primaryEl = diagnosis.primary.element;
  const primaryColor = ELEMENT_COLORS[primaryEl];

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
        @keyframes reportFadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes reportBarGrow{from{width:0}to{width:var(--bar-w)}}
        .report-section{animation: reportFadeIn 0.55s ease-out both;}
      `}</style>

      <div
        className={`max-w-2xl w-full mx-auto transition-opacity duration-700 ${mounted ? 'opacity-100' : 'opacity-0'}`}
      >
        {/* Header — SHRE branding + report kicker. Tightened from
            mb-10/12 → mb-6/8 to remove the long blank ribbon before the
            ring; the SHRE kicker line is merged into the composition
            line below the title to save another row. */}
        <header className="text-center mb-6 sm:mb-8 report-section" style={{ animationDelay: '0ms' }}>
          <h1 className="text-[20px] sm:text-[24px] font-light tracking-[0.18em] uppercase text-[#1a1a1a]">
            Diagnostic Report
          </h1>
          <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.3em] font-light text-gray-400 mt-1.5">
            SHRE · Composition: {diagnosis.composition}
          </p>
        </header>

        {/* ───── SECTION 1 — ELEMENTAL DISTRIBUTION ───── */}
        <section className="mb-6 sm:mb-8 report-section" style={{ animationDelay: '80ms' }}>
          <SectionLabel index={1} title="Elemental Distribution" />
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 sm:gap-10">
            {/* Ring */}
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center shrink-0"
              style={{
                background: `conic-gradient(${sorted
                  .map(([el, val], i) => {
                    const start = sorted.slice(0, i).reduce((s, [, v]) => s + (v / Math.max(total, 1)) * 360, 0);
                    const end = start + (val / Math.max(total, 1)) * 360;
                    return `${ELEMENT_COLORS[el]} ${start}deg ${end}deg`;
                  })
                  .join(', ')})`,
                boxShadow: `0 0 30px ${primaryColor}25`,
              }}
            >
              <div className="w-[68px] h-[68px] rounded-full bg-[#fafafa] flex items-center justify-center">
                <span className="text-[20px] font-light tabular-nums" style={{ color: primaryColor }}>
                  {pct[primaryEl]}%
                </span>
              </div>
            </div>
            {/* Bars */}
            <div className="flex-1 w-full space-y-2.5">
              {sorted.map(([el, val], i) => (
                <div key={el} className="flex items-center gap-3">
                  <span
                    className="text-[10px] uppercase tracking-[0.18em] w-14 text-right font-medium tabular-nums"
                    style={{ color: ELEMENT_COLORS[el], opacity: i === 0 ? 1 : 0.65 }}
                  >
                    {cap(el)}
                  </span>
                  <div
                    className="flex-1 h-[6px] rounded-full overflow-hidden"
                    style={{ background: `${ELEMENT_COLORS[el]}10` }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        ['--bar-w' as string]: `${val}%`,
                        width: `${val}%`,
                        background: `linear-gradient(90deg, ${ELEMENT_COLORS[el]}cc, ${ELEMENT_COLORS[el]})`,
                        animation: `reportBarGrow 0.7s ease-out ${0.2 + i * 0.1}s both`,
                      }}
                    />
                  </div>
                  <span
                    className="text-[12px] font-mono tabular-nums w-10 text-right"
                    style={{
                      color: ELEMENT_COLORS[el],
                      fontWeight: i === 0 ? 600 : 400,
                      opacity: i === 0 ? 1 : 0.6,
                    }}
                  >
                    {val}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ───── SECTION 2 — PRIMARY ELEMENT ───── */}
        <section className="mb-6 sm:mb-8 report-section" style={{ animationDelay: '160ms' }}>
          <SectionLabel index={2} title="Primary Element" />
          <div className="flex items-center gap-3 mb-3">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: ELEMENT_COLORS[diagnosis.primary.element] }}
            />
            <p
              className="text-[14px] sm:text-[15px] uppercase tracking-[0.22em] font-medium"
              style={{ color: ELEMENT_COLORS[diagnosis.primary.element] }}
            >
              {cap(diagnosis.primary.element)} · {pct[diagnosis.primary.element]}%
            </p>
          </div>
          <p className="text-[13px] sm:text-[14px] leading-[1.7] font-light text-[#2a2a2a]">
            {diagnosis.primary.explanation}
          </p>
        </section>

        {/* ───── SECTION 3 — SECONDARY ELEMENT ───── */}
        <section className="mb-6 sm:mb-8 report-section" style={{ animationDelay: '240ms' }}>
          <SectionLabel index={3} title="Secondary Element" />
          {diagnosis.secondary ? (
            <>
              <div className="flex items-center gap-3 mb-3">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: ELEMENT_COLORS[diagnosis.secondary.element] }}
                />
                <p
                  className="text-[14px] sm:text-[15px] uppercase tracking-[0.22em] font-medium"
                  style={{ color: ELEMENT_COLORS[diagnosis.secondary.element] }}
                >
                  {cap(diagnosis.secondary.element)} · {pct[diagnosis.secondary.element]}%
                </p>
              </div>
              <p className="text-[13px] sm:text-[14px] leading-[1.7] font-light text-[#2a2a2a]">
                {diagnosis.secondary.explanation}
              </p>
            </>
          ) : (
            <p className="text-[13px] sm:text-[14px] leading-[1.7] font-light text-[#666] italic">
              Minimal composition — only one element carries meaningful presence at this distribution. The primary register operates alone; supporting elements enter only as small accents.
            </p>
          )}
        </section>

        {/* ───── SECTION 4 — STYLE DIRECTION ───── */}
        <section className="mb-6 sm:mb-8 report-section" style={{ animationDelay: '320ms' }}>
          <SectionLabel index={4} title="Style Direction" />
          <p className="text-[14px] sm:text-[15px] uppercase tracking-[0.22em] font-medium text-[#1a1a1a] mb-3">
            {diagnosis.styleDirection}
          </p>
          <p className="text-[13px] sm:text-[14px] leading-[1.7] font-light text-[#2a2a2a]">
            {diagnosis.styleDirectionReason}
          </p>
        </section>

        {/* ───── SECTION 5 — COLOR LOGIC ───── */}
        <section className="mb-6 sm:mb-8 report-section" style={{ animationDelay: '400ms' }}>
          <SectionLabel index={5} title="Color Logic" />
          <p className="text-[14px] sm:text-[15px] uppercase tracking-[0.22em] font-medium text-[#1a1a1a] mb-3">
            {diagnosis.palette}
          </p>
          <p className="text-[13px] sm:text-[14px] leading-[1.7] font-light text-[#2a2a2a]">
            {diagnosis.paletteReason}
          </p>
        </section>

        {/* ───── SECTION 6 — MATERIAL MAPPING ───── */}
        <section className="mb-6 sm:mb-8 report-section" style={{ animationDelay: '480ms' }}>
          <SectionLabel index={6} title="Material Mapping" />
          <ul className="space-y-2.5">
            {diagnosis.materials.map((m) => (
              <li key={m.id} className="flex items-baseline gap-3">
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full shrink-0 translate-y-[1px]"
                  style={{ backgroundColor: ELEMENT_COLORS[m.primaryElement] }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] sm:text-[14px] font-light text-[#1a1a1a]">
                    <span className="font-medium">{m.label}</span>
                    <span className="text-gray-400 mx-2">—</span>
                    <span className="text-[12px] sm:text-[13px] font-mono tabular-nums text-[#444]">
                      {(['earth', 'fire', 'water', 'air'] as Element[])
                        .filter((el) => m.percentages[el] > 0)
                        .map((el) => `${cap(el)} ${m.percentages[el]}%`)
                        .join(' · ')}
                    </span>
                  </p>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-gray-400 font-light mt-0.5">
                    {m.role} register
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* ───── SECTION 7 — SPATIAL GUIDANCE ───── */}
        <section className="mb-6 sm:mb-8 report-section" style={{ animationDelay: '560ms' }}>
          <SectionLabel index={7} title="Spatial Guidance" />
          <p className="text-[13px] sm:text-[14px] leading-[1.7] font-light text-[#2a2a2a] whitespace-pre-line">
            {diagnosis.spatialGuidance}
          </p>
        </section>

        {/* ───── FOOTER — TWO PATHS ─────
            The user explicitly asked for both a customise-first path and a
            generate-now path on this screen:
              • "Enter Workspace" → the existing flow: refine materials /
                atmosphere first, then generate from the workspace.
              • "Generate" → shortcut: run the generation pipeline straight
                away using the diagnosis defaults. The actual auto-start is
                wired in App.tsx (sets a sessionStorage flag that the
                WorkspacePage picks up on mount). Only rendered when the
                parent provides the `onGenerateDirectly` callback. */}
        <footer
          className="pt-5 border-t border-[#e5e5e5] report-section"
          style={{ animationDelay: '640ms' }}
        >
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
            {onGenerateDirectly
              ? 'Refine first · or render now'
              : 'Refine materials and atmosphere · render the space'}
          </p>
        </footer>
      </div>
    </div>
  );
};

const SectionLabel: React.FC<{ index: number; title: string }> = ({ index, title }) => (
  // mb-4 → mb-3 to bring the section content closer to its label, part of
  // the overall report-shortening pass requested by the user.
  <div className="flex items-center gap-3 mb-3">
    <span className="text-[10px] uppercase tracking-[0.3em] font-mono tabular-nums text-gray-400">
      {String(index).padStart(2, '0')}
    </span>
    <span className="h-px flex-1 bg-[#e5e5e5]" />
    <span className="text-[10px] uppercase tracking-[0.3em] font-medium text-[#1a1a1a]">{title}</span>
  </div>
);
