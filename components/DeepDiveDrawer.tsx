import React, { useState } from 'react';
import { DEEP_QUESTIONS } from '../constants';

const STEP_LABELS = [
  'Order', 'Horizon', 'Gravity', 'Time', 'Ground',
  'Temp', 'Geometry', 'Light', 'Scale', 'Memory',
];

const Q_ILLUSTRATIONS: Record<string, React.ReactNode> = {
  dq1: (
    <svg width="120" height="120" viewBox="0 0 48 48" fill="none" stroke="#1a1a1a" strokeWidth="1.3" strokeLinecap="round">
      {/* Order vs Entropy — grid dissolving into organic scatter */}
      <rect x="4" y="4" width="8" height="8" rx="1" opacity="0.9" />
      <rect x="14" y="4" width="8" height="8" rx="1" opacity="0.7" />
      <rect x="4" y="14" width="8" height="8" rx="1" opacity="0.7" />
      <rect x="14" y="14" width="8" height="8" rx="1" opacity="0.5" fill="#1a1a1a" fillOpacity="0.04" />
      <circle cx="32" cy="10" r="2.5" fill="#1a1a1a" fillOpacity="0.15" stroke="none" />
      <circle cx="38" cy="16" r="3.5" fill="#1a1a1a" fillOpacity="0.1" stroke="none" />
      <circle cx="30" cy="22" r="1.8" fill="#1a1a1a" fillOpacity="0.12" stroke="none" />
      <circle cx="42" cy="8" r="1.5" fill="#1a1a1a" fillOpacity="0.08" stroke="none" />
      <path d="M24 28 Q28 30 32 34 Q36 38 40 36 Q44 34 42 40" strokeWidth="1" opacity="0.4" />
      <line x1="4" y1="28" x2="22" y2="28" strokeDasharray="2 3" opacity="0.25" />
      <line x1="4" y1="34" x2="18" y2="34" strokeDasharray="2 3" opacity="0.15" />
    </svg>
  ),
  dq2: (
    <svg width="120" height="120" viewBox="0 0 48 48" fill="none" stroke="#1a1a1a" strokeWidth="1.3" strokeLinecap="round">
      {/* Horizon — landscape with horizon line and framing */}
      <line x1="2" y1="24" x2="46" y2="24" strokeWidth="1.8" opacity="0.8" />
      <circle cx="36" cy="14" r="5" strokeWidth="1" opacity="0.35" fill="#1a1a1a" fillOpacity="0.04" />
      <path d="M2 38 L12 24 L20 30 L32 20 L46 26" strokeWidth="1" opacity="0.3" fill="#1a1a1a" fillOpacity="0.03" />
      <rect x="8" y="10" width="12" height="20" rx="1" strokeDasharray="3 2" opacity="0.35" fill="none" />
      <line x1="2" y1="44" x2="46" y2="44" opacity="0.12" />
    </svg>
  ),
  dq3: (
    <svg width="120" height="120" viewBox="0 0 48 48" fill="none" stroke="#1a1a1a" strokeWidth="1.3" strokeLinecap="round">
      {/* Gravity — suspended object with downward pull */}
      <circle cx="24" cy="16" r="6" fill="#1a1a1a" fillOpacity="0.06" strokeWidth="1.5" />
      <line x1="24" y1="22" x2="24" y2="38" strokeWidth="1.5" />
      <path d="M20 34 L24 42 L28 34" strokeWidth="1.3" />
      <line x1="18" y1="16" x2="8" y2="12" strokeDasharray="2 2" opacity="0.3" />
      <line x1="30" y1="16" x2="40" y2="12" strokeDasharray="2 2" opacity="0.3" />
      <line x1="6" y1="44" x2="42" y2="44" opacity="0.2" />
      <circle cx="12" cy="28" r="1" fill="#1a1a1a" fillOpacity="0.1" stroke="none" />
      <circle cx="36" cy="30" r="1.5" fill="#1a1a1a" fillOpacity="0.08" stroke="none" />
    </svg>
  ),
  dq4: (
    <svg width="120" height="120" viewBox="0 0 48 48" fill="none" stroke="#1a1a1a" strokeWidth="1.3" strokeLinecap="round">
      {/* Time — clock/spiral motif */}
      <circle cx="24" cy="24" r="16" opacity="0.5" fill="#1a1a1a" fillOpacity="0.02" />
      <circle cx="24" cy="24" r="10" strokeDasharray="3 2" opacity="0.35" />
      <circle cx="24" cy="24" r="2" fill="#1a1a1a" fillOpacity="0.3" stroke="none" />
      <line x1="24" y1="24" x2="24" y2="12" strokeWidth="1.8" />
      <line x1="24" y1="24" x2="33" y2="28" strokeWidth="1.2" opacity="0.6" />
      <path d="M24 8 L24 10" opacity="0.7" /><path d="M24 38 L24 40" opacity="0.7" />
      <path d="M8 24 L10 24" opacity="0.7" /><path d="M38 24 L40 24" opacity="0.7" />
      <path d="M13 13 L14.5 14.5" opacity="0.4" /><path d="M33.5 33.5 L35 35" opacity="0.4" />
      <path d="M35 13 L33.5 14.5" opacity="0.4" /><path d="M14.5 33.5 L13 35" opacity="0.4" />
    </svg>
  ),
  dq5: (
    <svg width="120" height="120" viewBox="0 0 48 48" fill="none" stroke="#1a1a1a" strokeWidth="1.3" strokeLinecap="round">
      {/* Ground — layers of earth with structure above */}
      <line x1="4" y1="32" x2="44" y2="32" strokeWidth="1.8" opacity="0.8" />
      <rect x="16" y="18" width="16" height="14" rx="1.5" fill="#1a1a1a" fillOpacity="0.05" strokeWidth="1.2" />
      <path d="M16 32 L16 38" opacity="0.5" strokeDasharray="2 1.5" />
      <path d="M32 32 L32 38" opacity="0.5" strokeDasharray="2 1.5" />
      <path d="M24 32 L24 42" opacity="0.3" strokeDasharray="1 2" />
      <line x1="4" y1="38" x2="44" y2="38" opacity="0.2" strokeDasharray="4 3" />
      <line x1="4" y1="44" x2="44" y2="44" opacity="0.1" />
      <path d="M20 18 L24 10 L28 18" strokeWidth="1" opacity="0.35" />
    </svg>
  ),
  dq6: (
    <svg width="120" height="120" viewBox="0 0 48 48" fill="none" stroke="#1a1a1a" strokeWidth="1.3" strokeLinecap="round">
      {/* Temperature — thermometer/radiance concept */}
      <circle cx="24" cy="24" r="8" fill="#1a1a1a" fillOpacity="0.06" strokeWidth="1.2" />
      <circle cx="24" cy="24" r="3" fill="#1a1a1a" fillOpacity="0.15" stroke="none" />
      <path d="M24 16 L24 6" strokeWidth="1.5" opacity="0.6" />
      <path d="M24 32 L24 42" strokeWidth="1.5" opacity="0.6" />
      <path d="M16 24 L6 24" strokeWidth="1.5" opacity="0.6" />
      <path d="M32 24 L42 24" strokeWidth="1.5" opacity="0.6" />
      <path d="M18.3 18.3 L12 12" opacity="0.35" />
      <path d="M29.7 18.3 L36 12" opacity="0.35" />
      <path d="M18.3 29.7 L12 36" opacity="0.35" />
      <path d="M29.7 29.7 L36 36" opacity="0.35" />
      <circle cx="24" cy="24" r="14" strokeDasharray="2 4" opacity="0.2" />
    </svg>
  ),
  dq7: (
    <svg width="120" height="120" viewBox="0 0 48 48" fill="none" stroke="#1a1a1a" strokeWidth="1.3" strokeLinecap="round">
      {/* Geometry — four geometric primitives */}
      <rect x="4" y="4" width="14" height="14" rx="1" fill="#1a1a1a" fillOpacity="0.05" />
      <polygon points="38,4 44,18 32,18" fill="#1a1a1a" fillOpacity="0.05" strokeLinejoin="round" />
      <circle cx="12" cy="36" r="7" fill="#1a1a1a" fillOpacity="0.05" />
      <path d="M30 30 Q36 28 40 34 Q42 40 36 42 Q30 44 30 38 Z" fill="#1a1a1a" fillOpacity="0.05" />
      <line x1="18" y1="11" x2="32" y2="11" strokeDasharray="2 2" opacity="0.2" />
      <line x1="12" y1="18" x2="12" y2="29" strokeDasharray="2 2" opacity="0.2" />
    </svg>
  ),
  dq8: (
    <svg width="120" height="120" viewBox="0 0 48 48" fill="none" stroke="#1a1a1a" strokeWidth="1.3" strokeLinecap="round">
      {/* Light — rays emanating from source through prism */}
      <circle cx="8" cy="24" r="4" fill="#1a1a1a" fillOpacity="0.12" strokeWidth="1" />
      <line x1="12" y1="24" x2="22" y2="24" strokeWidth="1.5" />
      <polygon points="22,16 22,32 36,24" fill="#1a1a1a" fillOpacity="0.04" strokeWidth="1.2" strokeLinejoin="round" />
      <line x1="36" y1="24" x2="46" y2="18" strokeWidth="1" opacity="0.7" />
      <line x1="36" y1="24" x2="46" y2="24" strokeWidth="1" opacity="0.5" />
      <line x1="36" y1="24" x2="46" y2="30" strokeWidth="1" opacity="0.35" />
      <line x1="36" y1="24" x2="44" y2="36" strokeWidth="0.8" opacity="0.2" />
    </svg>
  ),
  dq9: (
    <svg width="120" height="120" viewBox="0 0 48 48" fill="none" stroke="#1a1a1a" strokeWidth="1.3" strokeLinecap="round">
      {/* Scale — human figure next to architecture */}
      <line x1="14" y1="42" x2="14" y2="26" strokeWidth="1.5" />
      <circle cx="14" cy="23" r="3" fill="#1a1a1a" fillOpacity="0.08" strokeWidth="1.2" />
      <path d="M12 32 L9 38" strokeWidth="1" />
      <path d="M16 32 L19 38" strokeWidth="1" />
      <path d="M11 28 L8 26" strokeWidth="0.8" opacity="0.6" />
      <path d="M17 28 L20 26" strokeWidth="0.8" opacity="0.6" />
      <rect x="26" y="6" width="16" height="36" rx="2" fill="#1a1a1a" fillOpacity="0.04" strokeWidth="1.2" />
      <line x1="26" y1="16" x2="42" y2="16" opacity="0.3" />
      <line x1="26" y1="26" x2="42" y2="26" opacity="0.3" />
      <line x1="34" y1="6" x2="34" y2="42" opacity="0.15" />
      <line x1="6" y1="42" x2="44" y2="42" opacity="0.3" />
    </svg>
  ),
  dq10: (
    <svg width="120" height="120" viewBox="0 0 48 48" fill="none" stroke="#1a1a1a" strokeWidth="1.3" strokeLinecap="round">
      {/* Memory — brain/thought motif with radiating impressions */}
      <circle cx="24" cy="20" r="12" fill="#1a1a1a" fillOpacity="0.04" strokeWidth="1.2" />
      <circle cx="24" cy="20" r="6" strokeDasharray="2 2" opacity="0.5" />
      <circle cx="24" cy="20" r="2" fill="#1a1a1a" fillOpacity="0.2" stroke="none" />
      <path d="M12 20 L6 20" opacity="0.4" /><path d="M36 20 L42 20" opacity="0.4" />
      <path d="M24 8 L24 4" opacity="0.4" />
      <path d="M16 12 L12 8" opacity="0.25" /><path d="M32 12 L36 8" opacity="0.25" />
      <path d="M10 36 Q16 32 24 35 Q32 38 38 33" strokeWidth="1" opacity="0.35" />
      <path d="M8 42 Q16 37 24 40 Q32 43 40 38" strokeWidth="0.8" opacity="0.2" />
    </svg>
  ),
};

const OPT_ICONS: Record<string, React.ReactNode[]> = {
  dq1: [
    /* Order: precise grid */
    <svg key="a" width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="2" y="2" width="5" height="5" rx="0.5" /><rect x="9" y="2" width="5" height="5" rx="0.5" /><rect x="2" y="9" width="5" height="5" rx="0.5" /><rect x="9" y="9" width="5" height="5" rx="0.5" /></svg>,
    /* Controlled Chaos: zigzag energy */
    <svg key="b" width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M2 12 L5 4 L8 10 L11 3 L14 9" /><circle cx="11" cy="3" r="1.5" fill="currentColor" opacity="0.15" stroke="none" /></svg>,
    /* Organic Decay: crumbling form */
    <svg key="c" width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M4 3 Q6 5 5 8 Q4 11 6 13" opacity="0.8" /><path d="M8 2 Q10 6 9 10 Q8 13 10 14" opacity="0.6" /><circle cx="12" cy="6" r="1" fill="currentColor" opacity="0.2" stroke="none" /><circle cx="13" cy="11" r="1.5" fill="currentColor" opacity="0.12" stroke="none" /></svg>,
    /* Fluid Adaptation: flowing wave */
    <svg key="d" width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M2 8 Q5 4 8 8 Q11 12 14 8" /><path d="M2 11 Q5 7 8 11 Q11 15 14 11" opacity="0.4" /></svg>,
  ],
  dq2: [
    /* Infinite/Unbroken: long horizon */
    <svg key="a" width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><line x1="1" y1="8" x2="15" y2="8" strokeWidth="1.8" /><circle cx="12" cy="5" r="2" opacity="0.3" /></svg>,
    /* Framed/Selective: frame window */
    <svg key="b" width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="3" y="3" width="10" height="10" rx="1" /><line x1="3" y1="8" x2="13" y2="8" opacity="0.5" /></svg>,
    /* Denied/Internal: enclosed box */
    <svg key="c" width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="3" y="3" width="10" height="10" rx="1" fill="currentColor" opacity="0.06" /><line x1="6" y1="6" x2="10" y2="10" opacity="0.4" /><line x1="10" y1="6" x2="6" y2="10" opacity="0.4" /></svg>,
    /* Distorted/Reflected: mirror wave */
    <svg key="d" width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M2 8 Q5 4 8 8 Q11 12 14 8" /><path d="M2 8 Q5 12 8 8 Q11 4 14 8" opacity="0.35" /></svg>,
  ],
  dq3: [
    /* Oppressive: heavy weight pressing down */
    <svg key="a" width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="3" y="3" width="10" height="5" rx="1" fill="currentColor" opacity="0.12" /><path d="M5 8 L5 13" /><path d="M11 8 L11 13" /><line x1="3" y1="13" x2="13" y2="13" /></svg>,
    /* Non-existent: floating dots */
    <svg key="b" width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="5" cy="6" r="1.5" opacity="0.5" /><circle cx="11" cy="4" r="1" opacity="0.3" /><circle cx="8" cy="10" r="2" opacity="0.6" /><circle cx="13" cy="9" r="1" opacity="0.25" /><path d="M4 14 L12 14" strokeDasharray="1.5 2" opacity="0.2" /></svg>,
    /* Suspended: hanging object */
    <svg key="c" width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><line x1="8" y1="2" x2="8" y2="6" strokeDasharray="1.5 1" /><circle cx="8" cy="9" r="3" fill="currentColor" opacity="0.06" /><path d="M5 14 L11 14" opacity="0.3" /></svg>,
    /* Dynamic: diagonal force arrows */
    <svg key="d" width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M3 13 L13 3" strokeWidth="1.5" /><path d="M10 3 L13 3 L13 6" /><path d="M3 8 L8 13" opacity="0.4" /></svg>,
  ],
  dq4: [
    /* Timeless/Static: hourglass frozen */
    <svg key="a" width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M4 2 L12 2 L8 8 L12 14 L4 14 L8 8 Z" fill="currentColor" fillOpacity="0.04" /><line x1="4" y1="2" x2="12" y2="2" strokeWidth="1.5" /><line x1="4" y1="14" x2="12" y2="14" strokeWidth="1.5" /></svg>,
    /* Accelerated: fast-forward arrows */
    <svg key="b" width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M2 4 L8 8 L2 12" /><path d="M8 4 L14 8 L8 12" /><circle cx="14" cy="8" r="0.8" fill="currentColor" opacity="0.3" stroke="none" /></svg>,
    /* Cyclical: circular arrows */
    <svg key="c" width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M12 6 A5 5 0 1 1 6 4" /><path d="M6 4 L8 2 M6 4 L8 6" opacity="0.7" /></svg>,
    /* Fleeting: dissolving line */
    <svg key="d" width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><line x1="2" y1="8" x2="6" y2="8" strokeWidth="1.5" /><line x1="7" y1="8" x2="10" y2="8" opacity="0.5" strokeDasharray="1.5 1" /><line x1="11" y1="8" x2="14" y2="8" opacity="0.2" strokeDasharray="1 1.5" /></svg>,
  ],
  dq5: [
    /* Excavated: dig downward */
    <svg key="a" width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><line x1="2" y1="6" x2="14" y2="6" /><path d="M5 6 L5 13 L11 13 L11 6" fill="currentColor" fillOpacity="0.06" /><line x1="8" y1="8" x2="8" y2="11" opacity="0.4" /></svg>,
    /* Hovering: floating platform */
    <svg key="b" width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="4" y="4" width="8" height="4" rx="1" fill="currentColor" opacity="0.06" /><path d="M5 12 L11 12" opacity="0.3" strokeDasharray="1.5 1.5" /><path d="M6 14 L10 14" opacity="0.15" strokeDasharray="1 1" /></svg>,
    /* Anchored: weight with root */
    <svg key="c" width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="5" y="4" width="6" height="5" rx="1" fill="currentColor" opacity="0.08" /><line x1="8" y1="9" x2="8" y2="14" strokeWidth="1.5" /><path d="M5 14 L11 14" strokeWidth="1.3" /></svg>,
    /* Dissolving: fading particles */
    <svg key="d" width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="4" y="6" width="4" height="4" rx="0.5" opacity="0.7" /><rect x="9" y="5" width="3" height="3" rx="0.5" opacity="0.4" /><circle cx="13" cy="4" r="1" opacity="0.2" /><circle cx="14" cy="9" r="0.8" opacity="0.12" /><line x1="3" y1="13" x2="13" y2="13" opacity="0.2" /></svg>,
  ],
  dq6: [
    /* Cold/Crisp: snowflake/crystal */
    <svg key="a" width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><line x1="8" y1="2" x2="8" y2="14" /><line x1="2" y1="8" x2="14" y2="8" /><line x1="4" y1="4" x2="12" y2="12" opacity="0.5" /><line x1="12" y1="4" x2="4" y2="12" opacity="0.5" /></svg>,
    /* Humid/Temperate: water droplet */
    <svg key="b" width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M8 3 Q4 8 4 10.5 A4 4 0 0 0 12 10.5 Q12 8 8 3 Z" fill="currentColor" fillOpacity="0.06" /></svg>,
    /* Radiant Heat: emanating warmth */
    <svg key="c" width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="8" cy="8" r="3" fill="currentColor" opacity="0.12" /><path d="M8 2 L8 3.5" /><path d="M8 12.5 L8 14" /><path d="M2 8 L3.5 8" /><path d="M12.5 8 L14 8" /><path d="M4.2 4.2 L5.3 5.3" opacity="0.6" /><path d="M10.7 4.2 L11.8 5.3" opacity="0.6" /></svg>,
    /* Thermal Mass: solid block absorbing */
    <svg key="d" width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="3" y="5" width="10" height="8" rx="1.5" fill="currentColor" opacity="0.1" /><path d="M6 5 L6 3" opacity="0.3" strokeDasharray="1 1" /><path d="M10 5 L10 3" opacity="0.3" strokeDasharray="1 1" /></svg>,
  ],
  dq7: [
    /* Orthogonal/Grid: clean grid */
    <svg key="a" width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><line x1="2" y1="4" x2="14" y2="4" /><line x1="2" y1="8" x2="14" y2="8" /><line x1="2" y1="12" x2="14" y2="12" /><line x1="5.5" y1="2" x2="5.5" y2="14" opacity="0.5" /><line x1="10.5" y1="2" x2="10.5" y2="14" opacity="0.5" /></svg>,
    /* Fractal/Jagged: sharp zigzag */
    <svg key="b" width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M2 12 L4 6 L6 10 L8 3 L10 9 L12 5 L14 11" /><circle cx="8" cy="3" r="0.8" fill="currentColor" opacity="0.2" stroke="none" /></svg>,
    /* Curvilinear: smooth flowing curve */
    <svg key="c" width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M2 10 Q6 2 10 8 Q14 14 14 6" /><path d="M3 13 Q8 8 13 12" opacity="0.3" /></svg>,
    /* Amorphous: organic blob */
    <svg key="d" width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M4 8 Q5 3 8 5 Q12 2 13 7 Q14 12 10 12 Q8 14 5 12 Q2 11 4 8 Z" fill="currentColor" fillOpacity="0.06" /></svg>,
  ],
  dq8: [
    /* Reflection: mirror surface */
    <svg key="a" width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><line x1="2" y1="8" x2="14" y2="8" strokeWidth="1.5" /><path d="M5 5 L8 8 L11 5" /><path d="M5 11 L8 8 L11 11" opacity="0.35" /></svg>,
    /* Refraction: bent ray through medium */
    <svg key="b" width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><line x1="2" y1="4" x2="8" y2="8" /><line x1="8" y1="8" x2="14" y2="6" /><rect x="7" y="4" width="2" height="8" rx="0.5" fill="currentColor" fillOpacity="0.08" opacity="0.5" /></svg>,
    /* Absorption: inward arrows */
    <svg key="c" width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="8" cy="8" r="3" fill="currentColor" opacity="0.12" /><path d="M2 8 L5 8" /><path d="M11 8 L14 8" /><path d="M8 2 L8 5" /><path d="M8 11 L8 14" /><path d="M4.5 6.5 L5 8" opacity="0.4" /><path d="M11.5 9.5 L11 8" opacity="0.4" /></svg>,
    /* Emission: outward rays */
    <svg key="d" width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="8" cy="8" r="2.5" fill="currentColor" opacity="0.15" /><path d="M8 2 L8 4.5" /><path d="M8 11.5 L8 14" /><path d="M2 8 L4.5 8" /><path d="M11.5 8 L14 8" /><path d="M4 4 L5.5 5.5" opacity="0.5" /><path d="M10.5 10.5 L12 12" opacity="0.5" /><path d="M12 4 L10.5 5.5" opacity="0.5" /><path d="M5.5 10.5 L4 12" opacity="0.5" /></svg>,
  ],
  dq9: [
    /* Intimate: small cozy enclosure */
    <svg key="a" width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M4 12 L4 6 Q4 3 8 3 Q12 3 12 6 L12 12" fill="currentColor" fillOpacity="0.04" /><line x1="3" y1="12" x2="13" y2="12" /><circle cx="8" cy="8" r="1" fill="currentColor" opacity="0.15" stroke="none" /></svg>,
    /* Monumental: tall towering form */
    <svg key="b" width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="5" y="2" width="6" height="12" rx="0.5" fill="currentColor" fillOpacity="0.05" /><line x1="3" y1="14" x2="13" y2="14" /><circle cx="8" cy="12" r="0.8" opacity="0.4" /></svg>,
    /* Expansive: wide open arrows */
    <svg key="c" width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M8 8 L2 4" /><path d="M2 4 L4 6" opacity="0.6" /><path d="M8 8 L14 4" /><path d="M14 4 L12 6" opacity="0.6" /><path d="M8 8 L2 12" /><path d="M8 8 L14 12" /><circle cx="8" cy="8" r="1" fill="currentColor" opacity="0.1" stroke="none" /></svg>,
    /* Compressed: squeeze inward */
    <svg key="d" width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M2 8 L6 8" /><path d="M4 6 L6 8 L4 10" opacity="0.6" /><path d="M14 8 L10 8" /><path d="M12 6 L10 8 L12 10" opacity="0.6" /><rect x="6.5" y="5" width="3" height="6" rx="0.5" fill="currentColor" fillOpacity="0.08" /></svg>,
  ],
  dq10: [
    /* A specific image: eye/picture frame */
    <svg key="a" width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="2" y="4" width="12" height="8" rx="1" /><circle cx="8" cy="8" r="2" fill="currentColor" opacity="0.08" /><path d="M4 10 L6 8 L8 9 L11 6 L14 9" opacity="0.35" /></svg>,
    /* A vague feeling: soft cloud/mist */
    <svg key="b" width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M3 10 Q3 7 6 7 Q6 4 9 5 Q11 3 13 6 Q15 7 13 10 Z" fill="currentColor" fillOpacity="0.06" /><path d="M5 13 L11 13" opacity="0.25" strokeDasharray="1.5 1.5" /></svg>,
    /* A tactile sensation: hand/touch dots */
    <svg key="c" width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="5" cy="6" r="1.5" fill="currentColor" opacity="0.1" /><circle cx="8" cy="4" r="1.5" fill="currentColor" opacity="0.15" /><circle cx="11" cy="6" r="1.5" fill="currentColor" opacity="0.1" /><circle cx="6.5" cy="9" r="1.5" fill="currentColor" opacity="0.12" /><circle cx="9.5" cy="9" r="1.5" fill="currentColor" opacity="0.12" /><path d="M4 13 L12 13" opacity="0.2" /></svg>,
    /* A thought: lightbulb/idea spark */
    <svg key="d" width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="8" cy="6" r="4" fill="currentColor" fillOpacity="0.06" /><path d="M6.5 10 L6.5 12 L9.5 12 L9.5 10" /><line x1="8" y1="12" x2="8" y2="14" opacity="0.4" /><path d="M4 3 L3 2" opacity="0.35" /><path d="M12 3 L13 2" opacity="0.35" /></svg>,
  ],
};

interface DeepDiveDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  answers: Record<string, number>;
  onComplete: (answers: Record<string, number>) => void;
}

export const DeepDiveDrawer: React.FC<DeepDiveDrawerProps> = ({
  isOpen, onClose, answers, onComplete
}) => {
  const [localAnswers, setLocalAnswers] = useState(answers);
  const [currentQ, setCurrentQ] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [hoveredOpt, setHoveredOpt] = useState<number | null>(null);

  const handleSelect = (idx: number) => {
    const qId = DEEP_QUESTIONS[currentQ].id;
    setLocalAnswers(prev => ({ ...prev, [qId]: idx }));

    if (currentQ < DEEP_QUESTIONS.length - 1) {
      setTransitioning(true);
      setTimeout(() => {
        setCurrentQ(prev => prev + 1);
        setHoveredOpt(null);
        setTransitioning(false);
      }, 280);
    }
  };

  const handleSubmit = () => {
    onComplete(localAnswers);
  };

  if (!isOpen) return null;

  const qData = DEEP_QUESTIONS[currentQ];
  const isSelected = (idx: number) => localAnswers[qData.id] === idx;
  const optIcons = OPT_ICONS[qData.id];
  const canSubmit = Object.keys(localAnswers).length >= 5;

  const visibleStepStart = Math.max(0, Math.min(currentQ - 2, DEEP_QUESTIONS.length - 5));
  const visibleSteps = DEEP_QUESTIONS.slice(visibleStepStart, visibleStepStart + 5);

  return (
    <div className="fixed inset-0 z-50 bg-[#fafafa] flex flex-col" style={{ animation: 'ddFadeIn 0.3s ease-out' }}>
      <style>{`
        @keyframes ddFadeIn{from{opacity:0}to{opacity:1}}
        @keyframes ddSlideUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes ddPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
      `}</style>

      {/* Header */}
      <div className="h-12 border-b border-gray-100 bg-white/90 backdrop-blur-xl px-4 sm:px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-full bg-black flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
              <circle cx="8" cy="8" r="3" /><line x1="8" y1="1" x2="8" y2="4" /><line x1="8" y1="12" x2="8" y2="15" /><line x1="1" y1="8" x2="4" y2="8" /><line x1="12" y1="8" x2="15" y2="8" />
            </svg>
          </div>
          <h2 className="text-[13px] uppercase tracking-[0.35em] font-semibold text-black">Deep Dive</h2>
          <span className="text-[11px] text-gray-400 font-light ml-1 hidden sm:inline">
            Architectural Perception Test
          </span>
        </div>
        <button onClick={onClose}
          className="text-[11px] uppercase tracking-[0.25em] text-gray-400 hover:text-black font-medium px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-all">
          Close ✕
        </button>
      </div>

      {/* Numbered step progress — shows 5 steps at a time with scrolling window */}
      <div className="pt-4 pb-3 px-4 shrink-0">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          {visibleSteps.map((q, vi) => {
            const i = visibleStepStart + vi;
            const answered = localAnswers[DEEP_QUESTIONS[i].id] !== undefined;
            const isCurrent = currentQ === i;
            return (
              <div key={i} className="flex flex-col items-center gap-1.5 relative" style={{ flex: 1 }}>
                {vi > 0 && (
                  <div className="absolute top-[13px] right-1/2 w-full h-[1.5px]"
                    style={{ background: answered || currentQ > i ? '#1a1a1a' : '#e8e8e8', transition: 'background 0.4s ease' }} />
                )}
                <button
                  onClick={() => {
                    if (answered || i <= currentQ) {
                      setTransitioning(true);
                      setTimeout(() => { setCurrentQ(i); setHoveredOpt(null); setTransitioning(false); }, 200);
                    }
                  }}
                  className="relative z-10 flex items-center justify-center rounded-full transition-all duration-300"
                  style={{
                    width: 28, height: 28, cursor: answered || i <= currentQ ? 'pointer' : 'default',
                    background: answered && !isCurrent ? '#1a1a1a' : isCurrent ? '#1a1a1a' : '#fff',
                    border: isCurrent ? '2.5px solid #1a1a1a' : answered ? '2px solid #1a1a1a' : '2px solid #d4d4d4',
                    color: answered || isCurrent ? '#fff' : '#aaa',
                    fontSize: '11px', fontWeight: 700,
                    boxShadow: isCurrent ? '0 0 0 4px rgba(26,26,26,0.08)' : 'none',
                  }}>
                  {answered && !isCurrent ? (
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 8.5 L6.5 12 L13 4" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </button>
                <span className="text-[9px] uppercase tracking-[0.12em] font-medium transition-colors duration-300 whitespace-nowrap"
                  style={{ color: isCurrent ? '#1a1a1a' : answered ? '#666' : '#c0c0c0' }}>
                  {STEP_LABELS[i]}
                </span>
              </div>
            );
          })}
        </div>
        {/* Overall progress indicator */}
        <div className="max-w-lg mx-auto mt-3">
          <div className="h-[2px] bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-black rounded-full transition-all duration-500 ease-out"
              style={{ width: `${((Object.keys(localAnswers).length) / DEEP_QUESTIONS.length) * 100}%` }} />
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-grow flex items-center justify-center overflow-y-auto px-4 sm:px-8 py-2">
        <div className="max-w-2xl w-full">
          <div className={`transition-all duration-300 ease-out ${transitioning ? 'opacity-0 translate-y-4 scale-[0.97]' : 'opacity-100 translate-y-0 scale-100'}`}
            style={{ animation: !transitioning ? 'ddSlideUp 0.35s ease-out' : undefined }}>

            {/* Illustration */}
            {Q_ILLUSTRATIONS[qData.id] && (
              <div className="flex justify-center mb-5">
                <div className="rounded-2xl flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, rgba(0,0,0,0.02), rgba(0,0,0,0.04))', padding: '20px', border: '1px solid rgba(0,0,0,0.04)' }}>
                  {Q_ILLUSTRATIONS[qData.id]}
                </div>
              </div>
            )}

            {/* Question number + text */}
            <div className="text-center mb-7 px-4">
              <span className="inline-block text-[10px] uppercase tracking-[0.3em] text-gray-300 font-medium mb-2">
                Question {currentQ + 1} of {DEEP_QUESTIONS.length}
              </span>
              <h3 className="text-xl sm:text-2xl font-light tracking-tight leading-relaxed text-black">
                {qData.text}
              </h3>
            </div>

            {/* Options — 2-column grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl mx-auto">
              {qData.options.map((opt, idx) => {
                const selected = isSelected(idx);
                const hovered = hoveredOpt === idx;
                return (
                  <button
                    key={idx}
                    onClick={() => handleSelect(idx)}
                    onMouseEnter={() => setHoveredOpt(idx)}
                    onMouseLeave={() => setHoveredOpt(null)}
                    className="group relative flex items-center gap-4 px-5 py-4 rounded-xl transition-all duration-300 active:scale-[0.97]"
                    style={{
                      background: selected ? '#1a1a1a' : hovered ? '#f5f5f5' : '#fff',
                      border: selected ? '2px solid #1a1a1a' : hovered ? '2px solid #bbb' : '2px solid rgba(0,0,0,0.07)',
                      boxShadow: selected ? '0 8px 24px rgba(0,0,0,0.15)' : hovered ? '0 4px 16px rgba(0,0,0,0.06)' : '0 1px 4px rgba(0,0,0,0.03)',
                      transform: selected ? 'scale(1.02)' : hovered ? 'translateY(-1px)' : 'none',
                    }}
                  >
                    {optIcons?.[idx] && (
                      <div className="flex-shrink-0 transition-all duration-300"
                        style={{
                          color: selected ? '#fff' : hovered ? '#333' : '#888',
                          opacity: selected ? 0.9 : hovered ? 0.8 : 0.5,
                          transform: selected ? 'scale(1.15)' : hovered ? 'scale(1.05)' : 'scale(1)',
                        }}>
                        {optIcons[idx]}
                      </div>
                    )}
                    <span className="text-[14px] tracking-[0.03em] font-normal text-left leading-snug flex-1 transition-colors duration-300"
                      style={{ color: selected ? '#fff' : hovered ? '#111' : '#555' }}>
                      {opt.text}
                    </span>
                    <div className="w-[18px] h-[18px] rounded-full flex-shrink-0 flex items-center justify-center transition-all duration-300"
                      style={{
                        border: selected ? '2px solid rgba(255,255,255,0.5)' : '2px solid rgba(0,0,0,0.12)',
                        background: selected ? 'rgba(255,255,255,0.2)' : 'transparent',
                      }}>
                      {selected && (
                        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 8.5 L6.5 12 L13 4" />
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="h-14 border-t border-gray-100 bg-white/90 backdrop-blur-xl px-4 sm:px-8 flex items-center justify-between shrink-0">
        <button
          onClick={() => {
            if (currentQ > 0) {
              setTransitioning(true);
              setTimeout(() => { setCurrentQ(Math.max(0, currentQ - 1)); setHoveredOpt(null); setTransitioning(false); }, 200);
            }
          }}
          disabled={currentQ === 0}
          className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.25em] text-gray-400 hover:text-black disabled:opacity-20 font-medium transition-all px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:hover:bg-transparent"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M10 3 L5 8 L10 13" /></svg>
          Back
        </button>

        <div className="flex items-center gap-3">
          <span className="text-[10px] text-gray-300 tracking-[0.1em] font-light">
            {Object.keys(localAnswers).length}/{DEEP_QUESTIONS.length} answered
          </span>
          {canSubmit ? (
            <button onClick={handleSubmit}
              className="px-7 py-2.5 bg-black text-white rounded-lg text-[11px] uppercase tracking-[0.3em] font-semibold hover:bg-gray-800 transition-all active:scale-[0.97] shadow-md hover:shadow-lg">
              Apply Results
            </button>
          ) : (
            <span className="text-[10px] text-gray-300 tracking-[0.12em] font-light px-4 py-2 border border-gray-100 rounded-lg">
              answer 5+ to continue
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
