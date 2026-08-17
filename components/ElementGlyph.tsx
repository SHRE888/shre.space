import React from 'react';
import type { Element } from '../types';
import { ELEMENT_COLORS } from '../constants';

/**
 * The classical alchemical marks, drawn the same way everywhere they appear:
 * fire and air point up, water and earth point down, and the two with a bar
 * are air and earth.
 *
 * The core diagram draws its own version of these because it animates stroke
 * weight and opacity per sector and positions the bar against a tuned
 * triangle. Everywhere else — the report, the workspace readout — shares this
 * one, so a number and its mark can never drift out of agreement.
 */
export const ElementGlyph: React.FC<{
  element: Element;
  size?: number;
  color?: string;
  strokeWidth?: number;
  opacity?: number;
}> = ({ element, size = 11, color, strokeWidth = 1.2, opacity = 1 }) => {
  const c = color ?? ELEMENT_COLORS[element];
  const s = size;
  const isUp = element === 'fire' || element === 'air';
  const hasBar = element === 'air' || element === 'earth';
  const triangle = isUp
    ? `M ${s / 2} 1.5 L ${s - 1.5} ${s - 2} L 1.5 ${s - 2} Z`
    : `M ${s / 2} ${s - 1.5} L ${s - 1.5} 2 L 1.5 2 Z`;
  const barY = isUp ? s * 0.55 : s * 0.38;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden className="shrink-0" style={{ opacity }}>
      <path d={triangle} fill="none" stroke={c} strokeWidth={strokeWidth} strokeLinejoin="round" />
      {hasBar && (
        <line x1={s * 0.28} y1={barY} x2={s * 0.72} y2={barY} stroke={c} strokeWidth={strokeWidth} strokeLinecap="round" />
      )}
    </svg>
  );
};
