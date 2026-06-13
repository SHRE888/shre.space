import React, { useMemo, useState, useEffect, useRef, useCallback, memo } from 'react';
import { Element, AdjectiveDef, MaterialDef } from '../types';
import { ELEMENT_COLORS, ELEMENT_COLORS_MUTED, CANONICAL_MATERIALS, CANONICAL_ATMOSPHERE, MATERIAL_SPHERE_IMAGES, MATERIAL_TEXTURE_FILTER, MATERIAL_TEXTURE_TINT, MATERIAL_TEXTURE_TRANSFORM } from '../constants';
import { tick, snap, toggleAmbient, isAmbientPlaying, warmupSpeech } from '../services/soundService';
import { isMaterialEnabled } from '../services/refinementLogic';
import { MaterialEnableToggle } from './MaterialEnableToggle';

const ANIM_STYLE = document.createElement('style');
ANIM_STYLE.textContent = `
  @keyframes levitate{0%{transform:translate(-50%,-50%) translateY(0)}25%{transform:translate(-50%,-50%) translateY(-8px)}50%{transform:translate(-50%,-50%) translateY(-3px)}75%{transform:translate(-50%,-50%) translateY(-10px)}100%{transform:translate(-50%,-50%) translateY(0)}}
  @keyframes blobDrift1{0%{transform:translate(0,0) scale(1)}33%{transform:translate(5%,-4%) scale(1.04)}66%{transform:translate(-2%,5%) scale(.97)}100%{transform:translate(0,0) scale(1)}}
  @keyframes blobDrift2{0%{transform:translate(0,0) scale(1)}50%{transform:translate(-6%,4%) scale(1.06)}100%{transform:translate(0,0) scale(1)}}
  @keyframes spherePulse{0%,100%{opacity:.18}50%{opacity:.4}}
  @keyframes haloBreath{0%,100%{opacity:.4;transform:scale(1)}50%{opacity:.65;transform:scale(1.03)}}
  @keyframes specDrift{0%,100%{transform:translate(0,0)}40%{transform:translate(3%,-2%)}80%{transform:translate(-2%,1%)}}
  @keyframes sphereBreath{0%,100%{transform:translate(-50%,-50%) scale(1)}50%{transform:translate(-50%,-50%) scale(1.015)}}
  @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
  @keyframes orbFloat{0%,100%{transform:translate(-50%,-50%) translateY(0)}50%{transform:translate(-50%,-50%) translateY(0)}}
  @keyframes atmoGlow{0%,100%{box-shadow:0 1px 5px var(--mc30),0 0 8px var(--mc15)}50%{box-shadow:0 2px 10px var(--mc30),0 0 16px var(--mc15)}}
  .nucleus-levitate{animation:levitate 7s cubic-bezier(0.45,0,0.55,1) infinite,sphereBreath 5s ease-in-out infinite;will-change:transform}
  .halo-breathe{animation:haloBreath 6s ease-in-out infinite;will-change:transform,opacity}
  .grad-blob-1{animation:blobDrift1 10s ease-in-out infinite;will-change:transform}
  .grad-blob-2{animation:blobDrift2 12s ease-in-out infinite;will-change:transform}
  .sphere-pulse{animation:spherePulse 5s ease-in-out infinite;will-change:opacity}
  .specular-drift{animation:specDrift 11s ease-in-out infinite;will-change:transform}
  .animate-fade-in{animation:fadeIn .2s ease-out both}
  .orb-hover{transition:transform .3s ease,box-shadow .3s ease}
  .orb-hover:hover{transform:translate(-50%,-50%) scale(1.18) !important;z-index:25 !important}
  .atmo-orb{transition:transform .35s ease,box-shadow .35s ease;cursor:pointer}
  .atmo-orb:hover .atmo-sphere{transform:scale(1.5)}
  .core-gathering .orbit-svg{transition:opacity 0.7s ease;opacity:0 !important}
  .core-gathering .orb-item{transition:all 0.8s cubic-bezier(0.68,-0.1,0.27,1.15) !important;opacity:0 !important}
  .core-gathering .nucleus-levitate{transition:all 1s cubic-bezier(0.22,0.61,0.36,1) !important;filter:brightness(1.2)}
  .atmo-orb:hover .atmo-label{opacity:1 !important}
  @keyframes tooltipPop{from{opacity:0;transform:translateX(-50%) translateY(6px) scale(0.95)}to{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}}
  @keyframes nucleusSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  @keyframes nucleusFadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
  @keyframes btnShimmer{0%{background-position:200% center}100%{background-position:-200% center}}
  @keyframes softGlow{0%,100%{box-shadow:0 0 12px var(--gc30),0 0 24px var(--gc15)}50%{box-shadow:0 0 20px var(--gc40),0 0 40px var(--gc20)}}
  @keyframes sectorHintFadeIn{from{opacity:0}to{opacity:0.92}}
`;
if (!document.getElementById('core-diagram-anims')) {
  ANIM_STYLE.id = 'core-diagram-anims';
  document.head.appendChild(ANIM_STYLE);
}

interface CoreDiagramProps {
  distribution: Record<Element, number>;
  selectedAdjectives: AdjectiveDef[];
  selectedMaterials: MaterialDef[];
  lockedElements: Element[];
  onAdjust: (element: Element, newValue: number) => void;
  onToggleLock: (element: Element) => void;
  onToggleMaterial?: (name: string, element: Element) => void;
  disabledMaterialIds?: string[];
  onToggleMaterialEnabled?: (materialId: string, e: React.MouseEvent) => void;
  onToggleAtmosphere?: (word: string, element: Element) => void;
  isMuted?: boolean;
  onBrilliantChange?: (combo: PresetCombo | null) => void;
  isMatrixOpen?: boolean;
  onRotationSnap?: (ring: 'mat' | 'atmo', dominantElement: Element, rotationAngle: number) => void;
  onGenerate?: () => void;
  onToggleDiagnostic?: () => void;
  onToggleGuide?: () => void;
  onTutorialComplete?: () => void;
  spaceCategory?: string;
  rooms?: string[];
  domain?: string;
  gathering?: boolean;
  onGatherComplete?: () => void;
  /** Briefly highlights a bead after the user adds a material (workspace picker). */
  highlightMaterialId?: string | null;
}

export interface PresetCombo {
  id: number; name: string; dist: Record<Element, number>; brilliant: boolean;
  prompt: string; angle: number; dominant?: Element; reinforcer?: Element; supporter?: Element;
}

/** ~half of on-screen material bead for angular clearance */
const MATERIAL_RING_PACKING_RADIUS_PX = 34;
const MATERIAL_BEAD_MIN_GAP_PX = 62;
const ATMOSPHERE_RING_PACKING_RADIUS_PX = 14;

const MAT_TEX: Record<string, string> = MATERIAL_SPHERE_IMAGES;

/**
 * Compose the per-material CSS `filter` for the texture <img>. Adds a tiny
 * saturate/contrast lift on top of the catalog tint so PBR photos pop at
 * orbit-bead scale without looking heavily processed. Travertine gets a
 * subtle warm-toned counterweight inherited from the previous calibration.
 */
function buildTextureFilter(name: string): string {
  const tint = MATERIAL_TEXTURE_FILTER[name];
  const base = /travertine/i.test(name)
    ? 'saturate(0.96) contrast(1.04) brightness(1.04)'
    : 'saturate(1.04) contrast(1.04)';
  return tint ? `${tint} ${base}` : base;
}

/**
 * Material bead inner. Renders the photo texture, an optional colour-overlay
 * tint for materials whose target colour is far from the base PNG (Sodalite
 * Blue, Calacatta Viola, Oxidised copper, Shou-sugi-ban…) and a subtle
 * specular highlight. `mc` is only used as the fallback radial gradient if
 * the photo fails to load — there is intentionally no element-color ring or
 * dark contour drawn here.
 */
function MaterialBeadInner({
  name,
  tex,
  mc,
}: { name: string; tex: string | undefined; mc: string }) {
  const tint = MATERIAL_TEXTURE_TINT[name];
  const xform = MATERIAL_TEXTURE_TRANSFORM[name] ?? { objectPosition: 'center', zoom: 1.14 };
  return (
    <>
      {tex && (
        <img
          src={tex}
          alt=""
          draggable={false}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: xform.objectPosition,
            borderRadius: '50%', display: 'block',
            transform: `scale(${xform.zoom})`,
            filter: buildTextureFilter(name),
          }}
          onError={(e) => {
            const img = e.currentTarget as HTMLImageElement;
            img.style.display = 'none';
            const parent = img.parentElement;
            if (parent) parent.style.background = `radial-gradient(circle at 34% 30%, ${mc}E8, ${mc}A0)`;
          }}
        />
      )}
      {tint && (
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%', pointerEvents: 'none',
          backgroundColor: tint.color,
          opacity: tint.alpha,
          mixBlendMode: tint.mode,
        }} />
      )}
    </>
  );
}

/** Clockwise slice order from top-left boundary (-135°) — matches historical quadrant layout */
const SECTOR_ORDER: Element[] = ['air', 'fire', 'earth', 'water'];
const ELEMENTS: Element[] = ['earth', 'fire', 'water', 'air'];

/** First symbol index uses this base (historical quadrant layout). */
const SECTOR_LAYOUT_ANGULAR_START = (-3 * Math.PI) / 4;

/**
 * Fixed compass angle per stychia symbol (equal 25% slice centers).
 * Sectors are laid out so boundaries stay in the four quadrants between these rays; symbols do not move.
 */
function fixedStychiaAngleRad(el: Element): number {
  const i = SECTOR_ORDER.indexOf(el);
  const quarter = Math.PI / 2;
  return SECTOR_LAYOUT_ANGULAR_START + i * quarter + quarter / 2;
}

type ElementSectorLayout = Record<Element, { start: number; end: number; center: number; half: number }>;

const TWO_PI = 2 * Math.PI;

function normAngleMinusPiToPi(a: number): number {
  let x = a;
  while (x > Math.PI) x -= TWO_PI;
  while (x <= -Math.PI) x += TWO_PI;
  return x;
}

/**
 * Sectors tile the circle with boundaries only inside the π/2 gaps between adjacent fixed symbols.
 * Each sector grows/shrinks symmetrically toward/away from its two neighbors — stychia marks stay fixed.
 */
function buildSectorLayout(dist: Record<Element, number>): ElementSectorLayout {
  const w = {} as Record<Element, number>;
  SECTOR_ORDER.forEach((el) => {
    w[el] = Math.max(dist[el], 4);
  });

  const b_af = (-Math.PI / 2) + (Math.PI / 2) * (w.air / (w.air + w.fire));
  const b_fe = 0 + (Math.PI / 2) * (w.fire / (w.fire + w.earth));
  const b_ew = (Math.PI / 2) + (Math.PI / 2) * (w.earth / (w.earth + w.water));
  const b_wa = Math.PI + (Math.PI / 2) * (w.water / (w.water + w.air));

  let a0 = b_wa;
  let a1 = b_af;
  if (a1 <= a0) a1 += TWO_PI;
  let a2 = b_fe;
  if (a2 <= a1) a2 += TWO_PI;
  let a3 = b_ew;
  if (a3 <= a2) a3 += TWO_PI;
  const aClose = a0 + TWO_PI;

  const layout = {} as ElementSectorLayout;
  const segments: { el: Element; start: number; end: number }[] = [
    { el: 'air', start: a0, end: a1 },
    { el: 'fire', start: a1, end: a2 },
    { el: 'earth', start: a2, end: a3 },
    { el: 'water', start: a3, end: aClose },
  ];

  segments.forEach(({ el, start, end }) => {
    const span = end - start;
    const geoMid = start + span / 2;
    layout[el] = {
      start,
      end,
      center: normAngleMinusPiToPi(geoMid),
      half: span / 2,
    };
  });

  return layout;
}

/** Annular sector path (same sweep convention as legacy fixed quadrants). */
function sectorBandPath(ri: number, ro: number, start: number, end: number): string {
  const delta = end - start;
  const large = delta > Math.PI ? 1 : 0;
  const xis = Math.cos(start) * ri, yis = Math.sin(start) * ri;
  const xie = Math.cos(end) * ri, yie = Math.sin(end) * ri;
  const xoe = Math.cos(end) * ro, yoe = Math.sin(end) * ro;
  const xos = Math.cos(start) * ro, yos = Math.sin(start) * ro;
  return [`M ${xis} ${yis}`, `A ${ri} ${ri} 0 ${large} 1 ${xie} ${yie}`, `L ${xoe} ${yoe}`, `A ${ro} ${ro} 0 ${large} 0 ${xos} ${yos}`, 'Z'].join(' ');
}

function sectorRingArcPath(r: number, start: number, end: number): string {
  const delta = end - start;
  const large = delta > Math.PI ? 1 : 0;
  const x1 = Math.cos(start) * r, y1 = Math.sin(start) * r;
  const x2 = Math.cos(end) * r, y2 = Math.sin(end) * r;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

type RingOrbitLayoutOpts = {
  orbRadiusPx: number;
  edgeFrac?: number;
  minEdgeRad?: number;
  /** Radial offset between stacked rows when many items share one sector (px, diagram space). */
  ringStepPx?: number;
};

/**
 * Places ring items on one or more concentric rows: each row gets as many evenly spaced angles
 * as fit in the sector arc (min angular step from orb diameter). Avoids piling every bead on one angle.
 */
function sectorPosRingItemsInLayout(
  _el: Element, idx: number, total: number, orbit: number, layout: ElementSectorLayout, opts: RingOrbitLayoutOpts,
) {
  const { start, end } = layout[_el];
  const span = end - start;
  const edgeFrac = opts.edgeFrac ?? 0.14;
  const minEdgeRad = opts.minEdgeRad ?? Math.PI / 18;
  let edgeMargin = Math.max(span * edgeFrac, minEdgeRad);
  edgeMargin = Math.min(edgeMargin, Math.max(0, span * 0.36 - 0.02));
  edgeMargin = Math.max(0, edgeMargin);

  const lo = start + edgeMargin;
  const hi = end - edgeMargin;
  const width = Math.max(hi - lo, 1e-5);

  const ringStep = opts.ringStepPx ?? 22;
  const minStep = 2 * Math.atan((opts.orbRadiusPx * 1.14) / Math.max(orbit, 1));
  const maxSlots = Math.max(1, Math.floor(width / minStep));

  const row = Math.floor(idx / maxSlots);
  const idxRow0 = row * maxSlots;
  const nThis = Math.min(maxSlots, total - idxRow0);
  const col = idx - idxRow0;

  const effOrbit = Math.max(orbit * 0.62, orbit - row * ringStep);

  /** One bead in this sector: bisector of the sector arc (same as inset midpoint when margins are symmetric). */
  if (total <= 1) {
    const mid = start + span / 2;
    return { x: Math.cos(mid) * effOrbit, y: Math.sin(mid) * effOrbit };
  }

  if (nThis <= 1) {
    const a = lo + width / 2 + (row % 2 === 1 ? minStep * 0.2 : 0);
    const ac = Math.max(lo + width * 0.02, Math.min(hi - width * 0.02, a));
    return { x: Math.cos(ac) * effOrbit, y: Math.sin(ac) * effOrbit };
  }

  let a = lo + (col + 0.5) * (width / nThis);
  if (row > 0) {
    const rowStagger = ((row % 2) * 2 - 1) * (minStep * 0.35);
    a += rowStagger;
  }
  const pad = Math.min(minStep * 0.12, width / (4 * nThis));
  a = Math.max(lo + pad, Math.min(hi - pad, a));

  return { x: Math.cos(a) * effOrbit, y: Math.sin(a) * effOrbit };
}

/** Push overlapping ring beads apart so added materials never stack as ghosts. */
function resolveRingCollisions(positions: Record<string, { x: number; y: number }>, minGap: number) {
  const keys = Object.keys(positions);
  if (keys.length < 2) return positions;
  const next = { ...positions };
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const a = keys[i];
        const b = keys[j];
        const p1 = next[a];
        const p2 = next[b];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const d = Math.hypot(dx, dy);
        if (d >= minGap || d < 1e-4) continue;
        const push = (minGap - d) / 2;
        const nx = dx / d;
        const ny = dy / d;
        next[a] = { x: p1.x - nx * push, y: p1.y - ny * push };
        next[b] = { x: p2.x + nx * push, y: p2.y + ny * push };
      }
    }
  }
  return next;
}

function hexToRgba(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return `rgba(136,136,136,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function stychiaConicGradient(layout: ElementSectorLayout, opacityHi: number, opacityLo: number): string {
  const toDeg = (r: number) => ((r + Math.PI / 2) * 180 / Math.PI + 360) % 360;
  const stops = SECTOR_ORDER.map(el => {
    const { start, end } = layout[el];
    const hex = MUTED_COLORS[el];
    return `${hexToRgba(hex, opacityHi)} ${toDeg(start)}deg, ${hexToRgba(hex, opacityLo)} ${toDeg(end)}deg`;
  }).join(', ');
  return `conic-gradient(${stops})`;
}

/** Drag angle (rad, atan2) → element using proportional sectors */
function elementFromDragAngle(angRad: number, layout: ElementSectorLayout): Element {
  let t = angRad;
  const base = layout.air.start;
  while (t < base) t += 2 * Math.PI;
  while (t >= base + 2 * Math.PI) t -= 2 * Math.PI;
  for (const el of SECTOR_ORDER) {
    const { start, end } = layout[el];
    if (t >= start && t < end) return el;
  }
  return SECTOR_ORDER[0];
}

const ELEMENT_LABEL_EN: Record<Element, string> = {
  earth: 'Earth',
  fire: 'Fire',
  water: 'Water',
  air: 'Air',
};

type DistBracket = 'low' | 'mid' | 'high';

function distributionBracket(pct: number): DistBracket {
  if (pct < 18) return 'low';
  if (pct < 42) return 'mid';
  return 'high';
}

const BRACKET_LABEL_EN: Record<DistBracket, string> = {
  low: 'Light',
  mid: 'Balanced',
  high: 'Strong',
};

/** Short English hint: what this element does at your share, and where the design lands. */
const SECTOR_OUTCOME_HINT_EN: Record<Element, Record<DistBracket, string>> = {
  earth: {
    low: 'Low Earth share — the outcome leans lighter and more technical; natural mass stays in the background.',
    mid: 'Medium Earth — warm, organic balance: wood, stone, and tactility read clearly without going fully rustic.',
    high: 'Strong Earth — expect a grounded result: natural materials, calm warmth, and a space that feels rooted.',
  },
  fire: {
    low: 'Low Fire — less drama and contrast; the palette stays calmer and more neutral overall.',
    mid: 'Medium Fire — warm accents, deeper surfaces, and an evening / mood-lit character come through.',
    high: 'Strong Fire — a bold, cinematic interior: intensity, depth, and confident material presence.',
  },
  water: {
    low: 'Low Water — less mirror-like clarity; the space reads more matte and solid than fluid.',
    mid: 'Medium Water — quiet reflections, smooth forms, and a serene, sculpted calm.',
    high: 'Strong Water — a polished, fluid outcome: clarity, reflectivity, and refined depth.',
  },
  air: {
    low: 'Low Air — less ethereal lightness; more weight stays on texture and physical material.',
    mid: 'Medium Air — modern minimal openness: light, space, and transparency read clearly.',
    high: 'Strong Air — an airy, forward result: light tones, spaciousness, and refined lightness.',
  },
};

/** One short line per sector (shown near each slice after a dwell — avoids a crowded central panel). */
const SECTOR_HINT_BRIEF_EN: Record<Element, Record<DistBracket, string>> = {
  earth: {
    low: 'Lighter, more technical; nature stays in the background.',
    mid: 'Warm organic balance — wood & stone without going rustic.',
    high: 'Grounded: natural materials, calm warmth, rooted feel.',
  },
  fire: {
    low: 'Calmer palette — less drama and contrast.',
    mid: 'Warm accents & mood-lit depth.',
    high: 'Bold, cinematic — intensity and confident surfaces.',
  },
  water: {
    low: 'More matte and solid than fluid or mirror-like.',
    mid: 'Quiet reflections, smooth forms, serene calm.',
    high: 'Polished and fluid — clarity and refined depth.',
  },
  air: {
    low: 'Heavier on texture; less airy ethereality.',
    mid: 'Minimal openness — light, space, transparency.',
    high: 'Airy and forward — spacious, refined lightness.',
  },
};

/** Cursor must rest near nucleus this long before per-sector hints ease in */
const NUCLEUS_HINT_DWELL_MS = 1200;

const MUTED_COLORS = ELEMENT_COLORS_MUTED;

const CONCEPT_HEADLINES: Record<Element, string[]> = {
  earth: ['Grounded Raw Warmth', 'Rooted Natural Craft', 'Textured Earth Living'],
  fire: ['Oxidized Warmth Drama', 'Moody Cinematic Luxury', 'Dark Material Intensity'],
  water: ['Liquid Chrome Immersion', 'Reflective Fluid Luxury', 'Sculptural Metal Flow'],
  air: ['Futuristic Ethereal Light', 'Iridescent Forward Vision', 'Cosmic Translucent Clarity'],
};

// ── ATMOSPHERE REFERENCES ─────────────────────────────────────────────────────
// One entry per canonical atmosphere WORD (4 per element — matching
// adjectivesCatalog.ts). Each entry shows a real interior image plus a short
// "what this word means visually in an interior" description so the user can
// literally see the meaning of every atmosphere adjective. All images are
// local (/public/references/) — no external hotlinks that can die.
const ATMO_REFS: Record<Element, { title: string; style: string; desc: string; img?: string }[]> = {
  earth: [
    { title: 'grounded',  style: 'Heavy stone wall, low anchored seating', desc: 'Massive stone wall, low grounded sofas sitting close to the floor — rooted, anchored, nothing floats.', img: '/references/earth-stone-wall-living.png' },
    { title: 'tactile',   style: 'Reclaimed timber, raw plaster, ceramics', desc: 'Rough reclaimed wood, cracked plaster and handmade ceramics — surfaces you instinctively want to touch.', img: '/references/earth-wabisabi-restaurant.png' },
    { title: 'mineral',   style: 'Bare stone, mineral plaster, honest rock', desc: 'Exposed natural stone and mineral plaster — the honest geology of the material left visible.', img: '/references/earth-stone-palazzo.png' },
    { title: 'warm mass', style: 'Solid warm volumes, glowing hearth', desc: 'Thick warm-toned volumes and a glowing fireplace — heavy, comforting, enveloping mass.', img: '/references/earth-rustic-fireplace.png' },
  ],
  fire: [
    { title: 'moody',     style: 'Deep dark walls, low warm lamplight', desc: 'Dark charcoal/navy walls lit only by warm pools of lamplight — intimate, shadowed, moody.', img: '/references/fire-dark-elegance.png' },
    { title: 'cinematic', style: 'High-contrast staging, brass, marble', desc: 'Charcoal room, dramatic marble fireplace and brass accents staged like a film set — cinematic contrast.', img: '/references/fire-bold-dramatic.png' },
    { title: 'intense',   style: 'Bold dark masses, single glowing focus', desc: 'Heavy dark forms with one concentrated glowing focal point — bold, decisive, intense.', img: '/references/fire-bold-dramatic.png' },
    { title: 'oxidized',  style: 'Aged metal, dark walnut, warm patina', desc: 'Aged metals, dark walnut and warm rust-toned patina — the burnished warmth of oxidised surfaces.', img: '/references/fire-dark-elegance.png' },
  ],
  water: [
    { title: 'reflective', style: 'Polished stone, mirrors, calm light', desc: 'Mirror-polished stone and calm reflective surfaces under soft light — serene, still, reflective.', img: '/references/water-marble-bath.jpg' },
    { title: 'flowing',    style: 'Soft rounded forms, neutral palette', desc: 'Soft rounded furniture and a continuous neutral palette — everything reads as gentle, uninterrupted flow.', img: '/references/water-soft-fluid.jpg' },
    { title: 'immersive',  style: 'Enveloping soft textiles, calm tones', desc: 'Layered soft textiles in calm tones that wrap around you — quiet, immersive comfort.', img: '/references/water-serene-comfort.jpg' },
    { title: 'sculptural', style: 'Sculpted freestanding stone forms', desc: 'Freestanding honed-stone forms shaped like sculpture — fluid, sculptural water ritual.', img: '/references/water-marble-bath.jpg' },
  ],
  air: [
    { title: 'ethereal',   style: 'Sheer white scrim, daylight through cloth', desc: 'Translucent white scrim with daylight passing through fabric — weightless, ethereal monumentality.', img: '/references/air-veiled-pavilion.png' },
    { title: 'weightless', style: 'Undulating white walls, mirror columns', desc: 'Curving white ribbed walls and reflective columns — a volume that feels like it has no weight.', img: '/references/air-wave-hall.png' },
    { title: 'luminous',   style: 'Sculptural ceiling cloud, soft glow', desc: 'Pleated white sculptural ceiling washed in soft daylight — silent, luminous, full of light.', img: '/references/air-cloud-lobby.png' },
    { title: 'futuristic', style: 'Chrome ribbon, fluted columns, pale blue', desc: 'A sweeping chrome ribbon over pale plaster — forward-looking, iridescent, futuristic lightness.', img: '/references/air-mirror-ribbon.png' },
  ],
};

const NUCLEUS_CURSOR = (() => {
  const s = 32;
  const m = s / 2;
  const side = s * 0.78;
  const h = side * Math.sqrt(3) / 2;
  const topY = (s - h) / 2;
  const botY = topY + h;
  const lx = (s - side) / 2;
  const rx = lx + side;
  const d = `M ${m} ${topY} L ${rx} ${botY} L ${lx} ${botY} Z`;
  return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${s}' height='${s}' viewBox='0 0 ${s} ${s}'%3E%3Cpath d='${d}' fill='none' stroke='%23222' stroke-width='1.5' stroke-linejoin='round'/%3E%3C/svg%3E") ${m} ${m}, pointer`;
})();

function evenCircle(idx: number, total: number, orbit: number, startAngle = -Math.PI / 2) {
  const a = startAngle + (2 * Math.PI * idx) / Math.max(total, 1);
  return { x: Math.cos(a) * orbit, y: Math.sin(a) * orbit };
}

const CoreDiagram: React.FC<CoreDiagramProps> = ({
  distribution, selectedAdjectives, selectedMaterials, lockedElements,
  onAdjust, onToggleLock, onToggleMaterial, disabledMaterialIds, onToggleMaterialEnabled, onToggleAtmosphere, isMuted = false,
  onBrilliantChange, isMatrixOpen = false, onRotationSnap, onGenerate,
  onToggleDiagnostic, onToggleGuide, onTutorialComplete, spaceCategory, rooms, domain,
  gathering = false, onGatherComplete, highlightMaterialId = null,
}) => {
  const cRef = useRef<HTMLDivElement>(null);
  const nucleusRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [expMat, setExpMat] = useState<string | null>(null);
  const [fullMat, setFullMat] = useState<string | null>(null);
  const [matPicker, setMatPicker] = useState<Element | null>(null);
  const [atmoPicker, setAtmoPicker] = useState<Element | null>(null);
  const [showAllMats, setShowAllMats] = useState(false);
  const [showAtmoRefs, setShowAtmoRefs] = useState(false);
  const [nucleusTooltip, setNucleusTooltip] = useState(false);
  const lastClickRef = useRef<{ name: string; time: number } | null>(null);
  const [hoveredRing, setHoveredRing] = useState<'mat' | 'atmo' | null>(null);
  const [expandedRing, setExpandedRing] = useState<'mat' | 'atmo' | null>(null);
  const [generating, setGenerating] = useState(false);
  const [musicOn, setMusicOn] = useState(false);
  const [guideDismissed, setGuideDismissed] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [dragAngle, setDragAngle] = useState(0);
  const [divePhase, setDivePhase] = useState<0 | 1 | 2 | 3>(0);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const [orbitSectorHover, setOrbitSectorHover] = useState<Element | null>(null);
  /** Cursor inside nucleus inspect radius (dial emphasis — immediate). */
  const [nucleusZoneFocused, setNucleusZoneFocused] = useState(false);
  /** After dwell in nucleus zone — soft per-sector labels at each slice. */
  const [nucleusHintsVisible, setNucleusHintsVisible] = useState(false);
  const nucleusHintsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setMounted(true); setMusicOn(isAmbientPlaying()); }, []);
  useEffect(() => {
    if (gathering && onGatherComplete) {
      const t = setTimeout(onGatherComplete, 1100);
      return () => clearTimeout(t);
    }
  }, [gathering, onGatherComplete]);
  useEffect(() => {
    const h = (e: Event) => { const d = (e as CustomEvent).detail; if (d) setGuideDismissed(d.dismissed); };
    window.addEventListener('guide-voice-state', h);
    return () => window.removeEventListener('guide-voice-state', h);
  }, []);
  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem('shre_tutorial_done') !== '1') {
      sessionStorage.setItem('shre_tutorial_done', '1'); onTutorialComplete?.();
    }
  }, [onTutorialComplete]);

  useEffect(() => {
    const h = () => setShowAtmoRefs(p => !p);
    window.addEventListener('open-atmo-refs', h);
    return () => window.removeEventListener('open-atmo-refs', h);
  }, []);

  const dom = useMemo(() => (Object.entries(distribution).reduce((a, b) => a[1] > b[1] ? a : b)[0]) as Element, [distribution]);
  const sorted = useMemo(() => (Object.entries(distribution) as [Element, number][]).sort((a, b) => b[1] - a[1]), [distribution]);
  const dc = MUTED_COLORS[dom];
  const dcOrig = ELEMENT_COLORS[dom];

  const nR = 118;
  /** Pixel radius from diagram center: inside this = nucleus mix readout + dial emphasis */
  const nucleusInspectR = nR + 36;
  const symOrbR = nR + 50;
  const matOrbR = nR + 140;
  const atmoOrbR = nR + 250;
  /** Symmetric canvas margin — extra gutter so sector hints sit clearly outside the outer orbit */
  const diagramPad = 60;
  const canvasSize = atmoOrbR * 2 + diagramPad * 2;
  const ctr = atmoOrbR + diagramPad;

  const [containerSize, setContainerSize] = useState<{ w: number; h: number }>({ w: 1200, h: 800 });
  useEffect(() => {
    const el = cRef.current;
    if (!el) return;
    const update = () => setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const diagramScale = Math.min(1, containerSize.w / canvasSize, containerSize.h / canvasSize);

  const nColors = useMemo(() => sorted.map(([el]) => MUTED_COLORS[el as Element]), [sorted]);
  const nGrad = useMemo(() => `radial-gradient(circle at 36% 32%, ${dc}D8 0%, ${dc}98 32%, ${nColors[1]}55 58%, ${nColors[2]}28 80%, transparent 100%)`, [dc, nColors]);
  const bgGrad = useMemo(() => `radial-gradient(ellipse at center, ${dc}08 0%, ${dc}04 32%, #FAFBFC 62%, #F7F7F6 100%)`, [dc]);

  const matsByEl = useMemo(() => {
    const g: Record<Element, MaterialDef[]> = { earth: [], fire: [], water: [], air: [] };
    const seen = new Set<string>();
    selectedMaterials.forEach(m => {
      if (seen.has(m.id)) return;
      seen.add(m.id);
      g[m.element]?.push(m);
    });
    return g;
  }, [selectedMaterials]);

  const sectorLayout = useMemo(() => buildSectorLayout(distribution), [distribution]);

  const clearPointerOverlays = useCallback(() => {
    if (nucleusHintsTimerRef.current) {
      clearTimeout(nucleusHintsTimerRef.current);
      nucleusHintsTimerRef.current = null;
    }
    setOrbitSectorHover(null);
    setNucleusZoneFocused(false);
    setNucleusHintsVisible(false);
  }, []);

  const handleOrbitDiagramMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (matPicker || atmoPicker || dragging || gathering) {
      clearPointerOverlays();
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const ox = e.clientX - rect.left;
    const oy = e.clientY - rect.top;
    const cx0 = ctr;
    const cy0 = ctr;
    const dx = ox - cx0;
    const dy = oy - cy0;
    const r = Math.hypot(dx, dy);
    if (r <= nucleusInspectR) {
      setOrbitSectorHover(null);
      setNucleusZoneFocused(true);
      if (!nucleusHintsVisible && !nucleusHintsTimerRef.current) {
        nucleusHintsTimerRef.current = setTimeout(() => {
          nucleusHintsTimerRef.current = null;
          setNucleusHintsVisible(true);
        }, NUCLEUS_HINT_DWELL_MS);
      }
      return;
    }
    if (nucleusHintsTimerRef.current) {
      clearTimeout(nucleusHintsTimerRef.current);
      nucleusHintsTimerRef.current = null;
    }
    setNucleusZoneFocused(false);
    setNucleusHintsVisible(false);
    if (r > atmoOrbR + 82) {
      setOrbitSectorHover(null);
      return;
    }
    setOrbitSectorHover(elementFromDragAngle(Math.atan2(dy, dx), sectorLayout));
  }, [matPicker, atmoPicker, dragging, gathering, sectorLayout, atmoOrbR, ctr, nucleusInspectR, nucleusHintsVisible, clearPointerOverlays]);

  const handleOrbitDiagramMouseLeave = useCallback(() => {
    clearPointerOverlays();
  }, [clearPointerOverlays]);

  useEffect(() => {
    clearPointerOverlays();
  }, [sectorLayout, clearPointerOverlays]);

  const ringConicMat = useMemo(() => stychiaConicGradient(sectorLayout, 0.26, 0.09), [sectorLayout]);
  const ringConicAtmo = useMemo(() => stychiaConicGradient(sectorLayout, 0.22, 0.08), [sectorLayout]);

  const matPositions = useMemo(() => {
    const map: Record<string, { x: number; y: number }> = {};
    ELEMENTS.forEach(el => {
      matsByEl[el].forEach((m, i) => {
        map[m.id] = sectorPosRingItemsInLayout(el, i, matsByEl[el].length, matOrbR, sectorLayout, {
          orbRadiusPx: MATERIAL_RING_PACKING_RADIUS_PX,
          edgeFrac: 0.09,
          minEdgeRad: Math.PI / 22,
          ringStepPx: 32,
        });
      });
    });
    return resolveRingCollisions(map, MATERIAL_BEAD_MIN_GAP_PX);
  }, [matsByEl, matOrbR, sectorLayout]);

  const adjsByEl = useMemo(() => {
    const g: Record<Element, AdjectiveDef[]> = { earth: [], fire: [], water: [], air: [] };
    selectedAdjectives.forEach(a => { if (distribution[a.element] >= 5) g[a.element].push(a); });
    return g;
  }, [selectedAdjectives, distribution]);

  const atmoPositions = useMemo(() => {
    const map: Record<string, { x: number; y: number }> = {};
    ELEMENTS.forEach(el => {
      adjsByEl[el].forEach((a, i) => {
        map[`${a.label}-${a.element}`] = sectorPosRingItemsInLayout(el, i, adjsByEl[el].length, atmoOrbR, sectorLayout, {
          orbRadiusPx: ATMOSPHERE_RING_PACKING_RADIUS_PX,
          edgeFrac: 0.085,
          minEdgeRad: Math.PI / 22,
          ringStepPx: 20,
        });
      });
    });
    return map;
  }, [adjsByEl, atmoOrbR, sectorLayout]);

  const handleGenerate = useCallback(() => {
    if (generating || divePhase > 0) return;
    onGenerate?.();
  }, [onGenerate, generating, divePhase]);

  const startDive = useCallback(() => {
    if (divePhase > 0) return;
    setGenerating(true); setDivePhase(1);
    setTimeout(() => setDivePhase(2), 60);
    setTimeout(() => setDivePhase(3), 1500);
    setTimeout(() => { window.dispatchEvent(new Event('dive-complete')); setGenerating(false); setDivePhase(0); }, 2400);
  }, [divePhase]);

  useEffect(() => {
    const h = () => startDive();
    window.addEventListener('start-sphere-dive', h);
    return () => window.removeEventListener('start-sphere-dive', h);
  }, [startDive]);

  const handleNucleusPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    const rect = nucleusRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragStartRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const lastMoveTs = useRef(0);
  const handleNucleusPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStartRef.current || !dragging) return;
    const now = performance.now();
    if (now - lastMoveTs.current < 50) return;
    lastMoveTs.current = now;
    const { x: cx, y: cy } = dragStartRef.current;
    const dx = e.clientX - cx, dy = e.clientY - cy;
    if (Math.sqrt(dx * dx + dy * dy) < 10) return;
    let ang = Math.atan2(dy, dx) * (180 / Math.PI);
    if (ang < 0) ang += 360;
    setDragAngle(ang);
    const angRad = Math.atan2(dy, dx);
    const t = elementFromDragAngle(angRad, sectorLayout);
    const c = distribution[t];
    if (c < 60) { onAdjust(t, Math.min(65, c + 1.5)); tick(isMuted); }
  }, [dragging, distribution, onAdjust, isMuted, sectorLayout]);

  const handleNucleusPointerUp = useCallback(() => { dragStartRef.current = null; setDragging(false); }, []);

  return (
    <div ref={cRef}
      className={`w-full h-full flex items-center justify-center select-none relative overflow-hidden ${gathering ? 'core-gathering' : ''}`}
      style={{ background: bgGrad, opacity: mounted ? 1 : 0, transition: 'opacity 0.8s ease' }}
      onClick={() => {
        warmupSpeech(); clearPointerOverlays(); setMatPicker(null); setAtmoPicker(null); setExpMat(null); setShowAllMats(false); setFullMat(null);
        setShowAtmoRefs(false); setNucleusTooltip(false); setExpandedRing(null);
      }}
    >
      {/* ═══ Outer scene container — zoom shrinks layout box in Chromium/WebKit; scale() does not ═══ */}
      <div
        className="relative mx-auto diagram-scene-root"
        style={{
          width: canvasSize,
          height: canvasSize,
          flexShrink: 0,
          ...(diagramScale < 1
            ? { zoom: diagramScale, maxWidth: '100%', marginLeft: 'auto', marginRight: 'auto' }
            : {}),
        }}
        onMouseMove={handleOrbitDiagramMouseMove}
        onMouseLeave={handleOrbitDiagramMouseLeave}
      >

        {/* ═══ SVG orbit rings + sector guides ═══ */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none orbit-svg" viewBox={`${-canvasSize/2} ${-canvasSize/2} ${canvasSize} ${canvasSize}`}>
          <defs>
            <filter id="sector-hi-soft" x="-12%" y="-12%" width="124%" height="124%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="orbit-arc-soft" x="-8%" y="-8%" width="116%" height="116%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            {[matOrbR, atmoOrbR].flatMap((ringR, ri) =>
              ELEMENTS.map(el => {
                const { start, end } = sectorLayout[el];
                const mc = MUTED_COLORS[el];
                const pct = distribution[el] / 100;
                const peak = 0.035 + pct * 0.14;
                const x1 = Math.cos(start) * ringR;
                const y1 = Math.sin(start) * ringR;
                const x2 = Math.cos(end) * ringR;
                const y2 = Math.sin(end) * ringR;
                const gid = `orbit-arc-${ri}-${el}`;
                return (
                  <linearGradient key={gid} id={gid} gradientUnits="userSpaceOnUse" x1={x1} y1={y1} x2={x2} y2={y2}>
                    <stop offset="0%" stopColor={mc} stopOpacity={0} />
                    <stop offset="12%" stopColor={mc} stopOpacity={peak * 0.22} />
                    <stop offset="28%" stopColor={mc} stopOpacity={peak * 0.72} />
                    <stop offset="50%" stopColor={mc} stopOpacity={peak} />
                    <stop offset="72%" stopColor={mc} stopOpacity={peak * 0.72} />
                    <stop offset="88%" stopColor={mc} stopOpacity={peak * 0.22} />
                    <stop offset="100%" stopColor={mc} stopOpacity={0} />
                  </linearGradient>
                );
              }),
            )}
            {SECTOR_ORDER.map((el, i) => {
              const rad = sectorLayout[el].start;
              const r1 = nR + 10;
              const r2 = atmoOrbR + 10;
              const x1 = Math.cos(rad) * r1;
              const y1 = Math.sin(rad) * r1;
              const x2 = Math.cos(rad) * r2;
              const y2 = Math.sin(rad) * r2;
              const did = `div-line-grad-${i}`;
              return (
                <linearGradient key={did} id={did} gradientUnits="userSpaceOnUse" x1={x1} y1={y1} x2={x2} y2={y2}>
                  <stop offset="0%" stopColor="#a8a8ae" stopOpacity={0} />
                  <stop offset="14%" stopColor="#9c9ca3" stopOpacity={0.14} />
                  <stop offset="50%" stopColor="#92929a" stopOpacity={0.27} />
                  <stop offset="86%" stopColor="#9c9ca3" stopOpacity={0.14} />
                  <stop offset="100%" stopColor="#a8a8ae" stopOpacity={0} />
                </linearGradient>
              );
            })}
            <path id="orbit-textpath-atmo" d={`M ${-(atmoOrbR - 22)} 0 A ${atmoOrbR - 22} ${atmoOrbR - 22} 0 0 0 ${atmoOrbR - 22} 0`} fill="none" />
            <path id="orbit-textpath-mat" d={`M ${-(matOrbR - 26)} 0 A ${matOrbR - 26} ${matOrbR - 26} 0 0 0 ${matOrbR - 26} 0`} fill="none" />
          </defs>
          {/* Sector zone tints — hierarchy when cursor on nucleus; subtle orbit-sector hover */}
          {ELEMENTS.map(el => {
            const mc = MUTED_COLORS[el];
            const pct = distribution[el] / 100;
            const { start, end } = sectorLayout[el];
            const ri = nR + 16;
            const ro = atmoOrbR + 6;
            const d = sectorBandPath(ri, ro, start, end);
            const orbHi = orbitSectorHover === el;
            const rank = sorted.findIndex(([e]) => e === el);
            const hier = nucleusHintsVisible && rank >= 0 ? [0.042, 0.028, 0.018, 0.012][rank] ?? 0.008 : 0;
            const baseOp = 0.014 + pct * 0.05;
            const op = Math.min(0.165, baseOp + hier + (orbHi ? 0.03 : 0));
            return <path key={`zone-${el}`} d={d} fill={mc} opacity={op} filter={orbHi ? 'url(#sector-hi-soft)' : undefined} style={{ transition: 'opacity 0.38s ease' }} />;
          })}

          {/* Sector divider lines — boundaries follow distribution-weighted layout */}
          {SECTOR_ORDER.map((el, i) => {
            const rad = sectorLayout[el].start;
            const r1 = nR + 10;
            const r2 = atmoOrbR + 10;
            return (
              <line key={`div-${el}-${i}`}
                x1={Math.cos(rad) * r1} y1={Math.sin(rad) * r1}
                x2={Math.cos(rad) * r2} y2={Math.sin(rad) * r2}
                stroke={`url(#div-line-grad-${i})`} strokeWidth="0.68" strokeLinecap="round"
              />
            );
          })}

          {/* Nucleus boundary */}
          <circle cx="0" cy="0" r={nR + 4} fill="none" stroke={dc} strokeWidth="0.35" opacity={0.08} />

          {/* Static orbit tracks — subtle full rings (symbols align to fixed quadrants; sectors slide underneath) */}
          <circle cx="0" cy="0" r={matOrbR} fill="none" stroke="rgba(88,88,98,0.045)" strokeWidth="0.5" />
          <circle cx="0" cy="0" r={atmoOrbR} fill="none" stroke="rgba(88,88,98,0.04)" strokeWidth="0.45" />

          {/* Orbit rings — element-colored arcs per sector (geometry follows distribution) */}
          {[matOrbR, atmoOrbR].map((ringR, ri) => (
            <React.Fragment key={`ring-${ri}`}>
              {ELEMENTS.map(el => {
                const { start, end } = sectorLayout[el];
                const arcD = sectorRingArcPath(ringR, start, end);
                const gid = `orbit-arc-${ri}-${el}`;
                return (
                  <path
                    key={`ring-${ri}-${el}`}
                    d={arcD}
                    fill="none"
                    stroke={`url(#${gid})`}
                    strokeWidth={ri === 0 ? 0.88 : 0.62}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter="url(#orbit-arc-soft)"
                    style={{
                      transition: 'opacity 0.55s ease, d 0.55s cubic-bezier(0.22, 0.61, 0.36, 1)',
                    }}
                  />
                );
              })}
            </React.Fragment>
          ))}

          {/* Minimal compass rim + outward ticks at sector centers */}
          <circle cx="0" cy="0" r={atmoOrbR + 5} fill="none" stroke="rgba(88,88,98,0.1)" strokeWidth="0.55" />
          <circle cx="0" cy="0" r={atmoOrbR - 4} fill="none" stroke="rgba(88,88,98,0.06)" strokeWidth="0.45" />
          {SECTOR_ORDER.map(el => {
            const ca = fixedStychiaAngleRad(el);
            const rBase = atmoOrbR - 0.5;
            const rTip = atmoOrbR + 12;
            const xm = Math.cos(ca);
            const ym = Math.sin(ca);
            const hw = 2.15;
            const px = -ym * hw;
            const py = xm * hw;
            return (
              <path
                key={`compass-tick-${el}`}
                d={`M ${xm * rBase + px} ${ym * rBase + py} L ${xm * rTip} ${ym * rTip} L ${xm * rBase - px} ${ym * rBase - py} Z`}
                fill="rgba(72,72,82,0.08)"
                stroke="rgba(72,72,82,0.12)"
                strokeWidth="0.32"
                strokeLinejoin="round"
              />
            );
          })}

          {/* Ring labels — curved along orbit (structural, high contrast) */}
          <text
            className="pointer-events-none"
            fill={dc}
            fillOpacity={hoveredRing === 'atmo' || expandedRing === 'atmo' ? 0.92 : 0.62}
            fontSize="9.5"
            fontWeight="600"
            letterSpacing="0.34em"
            style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif", textTransform: 'uppercase' }}
          >
            <textPath href="#orbit-textpath-atmo" startOffset="50%" textAnchor="middle">atmosphere</textPath>
          </text>
          <text
            className="pointer-events-none"
            fill={dc}
            fillOpacity={hoveredRing === 'mat' || expandedRing === 'mat' ? 0.92 : 0.62}
            fontSize="9.25"
            fontWeight="600"
            letterSpacing="0.3em"
            style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif", textTransform: 'uppercase' }}
          >
            <textPath href="#orbit-textpath-mat" startOffset="50%" textAnchor="middle">materials</textPath>
          </text>

          {/* Subtle radial spokes toward outer hints (ties copy to each sector when dwell completes) */}
          {nucleusHintsVisible && ELEMENTS.map(el => {
            const ca = fixedStychiaAngleRad(el);
            const mc = MUTED_COLORS[el];
            const rInner = atmoOrbR + 4;
            const rOuter = atmoOrbR + 40;
            const x1 = Math.cos(ca) * rInner, y1 = Math.sin(ca) * rInner;
            const x2 = Math.cos(ca) * rOuter, y2 = Math.sin(ca) * rOuter;
            return (
              <line key={`hint-spoke-${el}`}
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={hexToRgba(mc, 0.38)} strokeWidth="0.85" strokeLinecap="round" opacity={0.85}
              />
            );
          })}
        </svg>

        {/* ═══ Orbit rings — interactive: hover glow + click to expand ═══ */}
        <div className="absolute rounded-full"
          style={{
            left: ctr - matOrbR - 8, top: ctr - matOrbR - 8,
            width: matOrbR * 2 + 16, height: matOrbR * 2 + 16,
            cursor: 'pointer', zIndex: 5,
          }}
          onMouseEnter={() => setHoveredRing('mat')}
          onMouseLeave={() => setHoveredRing(null)}
          onClick={(e) => { e.stopPropagation(); setExpandedRing(expandedRing === 'mat' ? null : 'mat'); }}
        >
          <div className="absolute rounded-full" style={{
            inset: 8,
            borderRadius: '50%',
            background: ringConicMat,
            opacity: hoveredRing === 'mat' || expandedRing === 'mat' ? 1 : 0.88,
            boxShadow: hoveredRing === 'mat' || expandedRing === 'mat'
              ? `0 0 28px ${dc}22, 0 0 12px ${dc}12, inset 0 0 24px ${dc}0A`
              : `0 0 14px ${dc}0C, inset 0 0 18px rgba(255,255,255,0.35)`,
            transition: 'opacity 0.45s ease, box-shadow 0.45s ease, background 0.55s cubic-bezier(0.22,0.61,0.36,1)',
            WebkitMask: `radial-gradient(circle closest-side, transparent calc(100% - ${expandedRing === 'mat' ? 5 : hoveredRing === 'mat' ? 4 : 3}px), #000 100%)`,
            mask: `radial-gradient(circle closest-side, transparent calc(100% - ${expandedRing === 'mat' ? 5 : hoveredRing === 'mat' ? 4 : 3}px), #000 100%)`,
          }} />
        </div>
        <div className="absolute rounded-full"
          style={{
            left: ctr - atmoOrbR - 8, top: ctr - atmoOrbR - 8,
            width: atmoOrbR * 2 + 16, height: atmoOrbR * 2 + 16,
            cursor: 'pointer', zIndex: 4,
          }}
          onMouseEnter={() => setHoveredRing('atmo')}
          onMouseLeave={() => setHoveredRing(null)}
          onClick={(e) => { e.stopPropagation(); setExpandedRing(expandedRing === 'atmo' ? null : 'atmo'); }}
        >
          <div className="absolute rounded-full" style={{
            inset: 8,
            borderRadius: '50%',
            background: ringConicAtmo,
            opacity: hoveredRing === 'atmo' || expandedRing === 'atmo' ? 1 : 0.82,
            boxShadow: hoveredRing === 'atmo' || expandedRing === 'atmo'
              ? `0 0 30px ${dc}1A, 0 0 14px ${dc}10, inset 0 0 26px ${dc}08`
              : `0 0 14px ${dc}08, inset 0 0 20px rgba(255,255,255,0.28)`,
            transition: 'opacity 0.45s ease, box-shadow 0.45s ease, background 0.55s cubic-bezier(0.22,0.61,0.36,1)',
            WebkitMask: `radial-gradient(circle closest-side, transparent calc(100% - ${expandedRing === 'atmo' ? 5 : hoveredRing === 'atmo' ? 4 : 3}px), #000 100%)`,
            mask: `radial-gradient(circle closest-side, transparent calc(100% - ${expandedRing === 'atmo' ? 5 : hoveredRing === 'atmo' ? 4 : 3}px), #000 100%)`,
          }} />
        </div>

        {/* ═══ Element symbol triangles — uniform size ═══ */}
        {ELEMENTS.map(el => {
          const a = fixedStychiaAngleRad(el);
          const mc = MUTED_COLORS[el];
          const cx = ctr + Math.cos(a) * symOrbR;
          const cy = ctr + Math.sin(a) * symOrbR;
          const isAct = matPicker === el;
          const isDom = el === dom;
          const SZ = 28;
          const op = isAct ? 0.8 : isDom ? 0.55 : 0.32;
          const sw = isAct ? 1.8 : 1.3;
          const isUp = el === 'fire' || el === 'air';
          const hasBar = el === 'air' || el === 'earth';
          const side = SZ * 0.78;
          const h = side * Math.sqrt(3) / 2;
          const topY = (SZ - h) / 2;
          const bottomY = topY + h;
          const leftX = (SZ - side) / 2;
          const rightX = leftX + side;
          const triPath = isUp
            ? `M ${SZ / 2} ${topY} L ${rightX} ${bottomY} L ${leftX} ${bottomY} Z`
            : `M ${SZ / 2} ${bottomY} L ${rightX} ${topY} L ${leftX} ${topY} Z`;
          const barY = isUp ? topY + h * 0.4 : topY + h * 0.6;
          const scale = isAct ? 1.2 : 1;
          const pct = distribution[el];
          return (
            <div key={`sym-${el}`} className="absolute flex flex-col items-center group orb-item"
              style={{ left: cx, top: cy, transform: `translate(-50%, -50%) scale(${scale})`, zIndex: 20, transition: 'transform 0.3s ease, opacity 0.3s ease' }}
              onMouseEnter={e => { if (!isAct) (e.currentTarget as HTMLElement).style.transform = 'translate(-50%, -50%) scale(1.15)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = `translate(-50%, -50%) scale(${scale})`; }}>
              <button className="flex items-center justify-center transition-all opacity-0 group-hover:opacity-70 hover:!opacity-100 hover:scale-125"
                style={{ width: 22, height: 16, color: mc, background: 'none', border: 'none', padding: 0, cursor: 'pointer', marginBottom: 2 }}
                onClick={e => { e.stopPropagation(); snap(isMuted); onAdjust(el, Math.min(65, pct + 5)); }}>
                <svg width="10" height="6" viewBox="0 0 10 6"><path d="M1 5 L5 1 L9 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <button style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                onClick={e => { e.stopPropagation(); snap(isMuted); setMatPicker(matPicker === el ? null : el); setAtmoPicker(null); }}>
                <svg width={SZ} height={SZ} viewBox={`0 0 ${SZ} ${SZ}`} style={{ overflow: 'visible', transition: 'all 0.3s ease' }}>
                  <path d={triPath} fill="none" stroke={mc} strokeWidth={sw} strokeLinejoin="round" opacity={op} />
                  {hasBar && <line x1={leftX + side * 0.2} y1={barY} x2={rightX - side * 0.2} y2={barY} stroke={mc} strokeWidth={sw} strokeLinecap="round" opacity={op} />}
                </svg>
              </button>
              <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: mc, opacity: isAct ? 0.78 : isDom ? 0.48 : 0.28, lineHeight: 1, transition: 'opacity 0.3s ease, transform 0.3s ease', background: 'rgba(255,255,255,0.82)', padding: '0 4px', borderRadius: 2 }}>{el}</span>
              <button className="flex items-center justify-center transition-all opacity-0 group-hover:opacity-70 hover:!opacity-100 hover:scale-125"
                style={{ width: 22, height: 16, color: mc, background: 'none', border: 'none', padding: 0, cursor: 'pointer', marginTop: 2 }}
                onClick={e => { e.stopPropagation(); snap(isMuted); onAdjust(el, Math.max(5, pct - 5)); }}>
                <svg width="10" height="6" viewBox="0 0 10 6"><path d="M1 1 L5 5 L9 1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </div>
          );
        })}

        {/* ═══ Material beads — element border ring, names on hover (label toward center) ═══ */}
        {!showAllMats && selectedMaterials.map(mat => {
          const p = matPositions[mat.id]; if (!p) return null;
          const mc = MUTED_COLORS[mat.element];
          const isDom = mat.element === dom;
          const tex = MAT_TEX[mat.name];
          const isExp = expMat === mat.name;
          const matOn = isMaterialEnabled(mat.id, disabledMaterialIds);
          const ringExp = expandedRing === 'mat';
          const isHighlighted = highlightMaterialId === mat.id;
          const baseSz = 54;
          const sz = isExp ? 92 : isHighlighted ? baseSz + 10 : ringExp ? baseSz + 8 : baseSz;
          const cx = ctr + p.x;
          const cy = ctr + p.y;
          const ang = Math.atan2(p.y, p.x);
          const rBead = Math.hypot(p.x, p.y);
          const labelOutR = Math.max(rBead + sz / 2 + 22, symOrbR + 54);
          const ox = Math.cos(ang) * labelOutR;
          const oy = Math.sin(ang) * labelOutR;
          const labelDx = ox - p.x;
          const labelDy = oy - p.y;
          const handleMatClick = (e: React.MouseEvent) => {
            e.stopPropagation();
            snap(isMuted);
            if (isExp) {
              setFullMat(mat.name);
              setExpMat(null);
            } else {
              setExpMat(mat.name);
            }
          };
          const showLabel = isExp || ringExp;
          return (
            <div key={mat.id} className="absolute group orb-item"
              style={{
                left: cx, top: cy, transform: 'translate(-50%, -50%)',
                transition: 'all 0.45s cubic-bezier(0.34,1.56,0.64,1)',
                zIndex: isExp ? 26 : isHighlighted ? 24 : ringExp ? 18 : 15,
                cursor: 'pointer',
                opacity: matOn ? 1 : 0.38,
                filter: matOn ? 'none' : 'grayscale(0.55) saturate(0.7)',
              }}
              onClick={handleMatClick}
              onMouseEnter={e => { if (!isExp) { (e.currentTarget as HTMLElement).style.transform = 'translate(-50%, -50%) scale(1.08)'; (e.currentTarget as HTMLElement).style.zIndex = '25'; } }}
              onMouseLeave={e => { if (!isExp) { (e.currentTarget as HTMLElement).style.transform = 'translate(-50%, -50%)'; (e.currentTarget as HTMLElement).style.zIndex = ringExp ? '18' : '15'; } }}>
              {/* Single clean sphere — soft element-colour glow around it, no
                  hard ring, no dark contour. The photo texture's natural rim
                  shadows are hidden by scale(1.14) on the <img>. */}
              <div style={{
                width: sz, height: sz, borderRadius: '50%', position: 'relative', overflow: 'hidden',
                flexShrink: 0,
                background: tex
                  ? 'transparent'
                  : `radial-gradient(circle at 34% 30%, ${mc}E8, ${mc}A0)`,
                boxShadow: isHighlighted
                  ? `0 0 0 3px ${mc}55, 0 0 28px ${mc}66, 0 4px 16px rgba(0,0,0,0.14)`
                  : isExp
                  ? `0 0 22px ${mc}66, 0 4px 16px rgba(0,0,0,0.14)`
                  : matOn
                    ? `0 0 14px ${mc}38, 0 2px 10px rgba(0,0,0,0.10)`
                    : `0 0 0 1px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)`,
                transition: 'all 0.4s cubic-bezier(0.34,1.56,0.64,1)',
                border: matOn ? 'none' : '1.5px dashed rgba(0,0,0,0.12)',
              }}>
                <MaterialBeadInner name={mat.name} tex={tex} mc={mc} />
              </div>
              {onToggleMaterialEnabled && (
                <div
                  className={`absolute z-30 transition-opacity duration-200 ${matOn ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}`}
                  style={{ right: -2, bottom: -2 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <MaterialEnableToggle
                    enabled={matOn}
                    color={ELEMENT_COLORS[mat.element]}
                    onToggle={(e) => onToggleMaterialEnabled(mat.id, e)}
                    size={12}
                  />
                </div>
              )}
              {/* Label — name + dominant element + percentage breakdown.
                  SHRE rule: "every material must display material name,
                  dominant element, and elemental percentage logic" so the
                  client sees the diagnostic reason for each pick on the
                  orbit, not just the name. */}
              <div
                className={`absolute rounded-md whitespace-nowrap transition-all ${showLabel ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                style={{
                  background: 'rgba(255,255,255,0.96)',
                  backdropFilter: 'blur(6px)',
                  boxShadow: `0 1px 4px rgba(0,0,0,0.08), 0 0 0 1px ${mc}24`,
                  pointerEvents: 'none',
                  textAlign: 'center',
                  lineHeight: 1.3,
                  padding: ringExp ? '4px 8px' : '3px 7px',
                  maxWidth: 160,
                  left: '50%', top: '50%',
                  transform: `translate(calc(-50% + ${labelDx}px), calc(-50% + ${labelDy}px))`,
                }}
              >
                <div
                  style={{
                    fontSize: ringExp ? 10 : 9,
                    fontWeight: 600,
                    color: mc,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: 152,
                    textShadow: '0 1px 0 rgba(255,255,255,0.9)',
                  }}
                >
                  {mat.name.split('(')[0].trim()}
                </div>
                {mat.elementWeights && (
                  <div
                    style={{
                      fontSize: ringExp ? 8.5 : 7.8,
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      fontWeight: 400,
                      color: '#666',
                      letterSpacing: '0.01em',
                      marginTop: 1,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {(['earth', 'fire', 'water', 'air'] as Element[])
                      .map((el) => ({ el, p: Math.round((mat.elementWeights[el] || 0) * 100) }))
                      .filter(({ p }) => p > 0)
                      .map(({ el, p }) => `${el.charAt(0).toUpperCase()}${el.slice(1)} ${p}%`)
                      .join(' · ')}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* ═══ Atmosphere — visible labels, hover glow + animate enlarge ═══ */}
        {selectedAdjectives.map((adj, i) => {
          const key = `${adj.label}-${adj.element}`;
          const p = atmoPositions[key]; if (!p) return null;
          const mc = MUTED_COLORS[adj.element];
          const ec = ELEMENT_COLORS[adj.element];
          const cx = ctr + p.x;
          const cy = ctr + p.y;
          const ang = Math.atan2(p.y, p.x);
          const atmoRingExp = expandedRing === 'atmo';
          const sphereSz = atmoRingExp ? 28 : 21;
          const rBead = Math.hypot(p.x, p.y);
          const labelOutR = Math.max(rBead + sphereSz / 2 + 18, symOrbR + 52);
          const ox = Math.cos(ang) * labelOutR;
          const oy = Math.sin(ang) * labelOutR;
          const lblX = ox - p.x;
          const lblY = oy - p.y;
          return (
            <div key={`${key}-${i}`} className="absolute cursor-pointer orb-item"
              style={{ left: cx, top: cy, transform: `translate(-50%, -50%)${atmoRingExp ? ' scale(1.15)' : ''}`, zIndex: atmoRingExp ? 12 : 8, transition: 'all 0.4s cubic-bezier(0.34,1.56,0.64,1)' }}
              onClick={e => { e.stopPropagation(); snap(isMuted); setAtmoPicker(atmoPicker === adj.element ? null : adj.element); setMatPicker(null); }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.transform = 'translate(-50%, -50%) scale(1.4)';
                el.style.zIndex = '25';
                const sphere = el.querySelector('[data-atmo-sphere]') as HTMLElement;
                if (sphere) { sphere.style.boxShadow = `0 2px 10px ${mc}40`; sphere.style.borderColor = `${mc}60`; }
                const lbl = el.querySelector('[data-atmo-label]') as HTMLElement;
                if (lbl) { lbl.style.opacity = '0.8'; lbl.style.color = ec; lbl.style.transform = 'translate(-50%, -50%) scale(1.05)'; lbl.style.fontWeight = '500'; }
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.transform = `translate(-50%, -50%)${atmoRingExp ? ' scale(1.15)' : ''}`;
                el.style.zIndex = atmoRingExp ? '12' : '8';
                const sphere = el.querySelector('[data-atmo-sphere]') as HTMLElement;
                if (sphere) {
                  sphere.style.boxShadow = atmoRingExp ? `0 2px 8px ${mc}40, 0 0 10px ${mc}18` : `0 1px 4px ${mc}25`;
                  sphere.style.borderColor = atmoRingExp ? `${mc}65` : `${mc}38`;
                }
                const lbl = el.querySelector('[data-atmo-label]') as HTMLElement;
                if (lbl) {
                  lbl.style.opacity = atmoRingExp ? '0.88' : '0.62';
                  lbl.style.color = atmoRingExp ? ec : mc;
                  lbl.style.transform = 'translate(-50%, -50%) scale(1)';
                  lbl.style.fontWeight = atmoRingExp ? '500' : '400';
                }
              }}>
              <div data-atmo-sphere="" style={{
                width: sphereSz, height: sphereSz, borderRadius: '50%', position: 'relative', overflow: 'hidden',
                background: `radial-gradient(circle at 35% 30%, ${mc}A0, ${mc}60)`,
                boxShadow: atmoRingExp ? `0 2px 8px ${mc}40, 0 0 10px ${mc}18` : `0 1px 4px ${mc}25`,
                border: atmoRingExp ? `1.5px solid ${mc}65` : `1px solid ${mc}38`,
                transition: 'all 0.4s ease',
              }}>
                <div style={{ position: 'absolute', width: '40%', height: '35%', top: '12%', left: '16%', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(255,255,255,0.35) 0%, transparent 75%)' }} />
              </div>
              <span data-atmo-label="" className="absolute pointer-events-none" style={{
                fontSize: atmoRingExp ? 11.5 : 10.5, fontWeight: atmoRingExp ? 500 : 400, fontStyle: 'italic',
                color: atmoRingExp ? ec : mc, fontFamily: "'IBM Plex Serif', Georgia, serif",
                whiteSpace: 'nowrap', letterSpacing: '0.03em', opacity: atmoRingExp ? 0.9 : 0.68,
                maxWidth: 128, overflow: 'hidden', textOverflow: 'ellipsis',
                textShadow: '0 1px 2px rgba(255,255,255,0.95), 0 0 12px rgba(255,255,255,0.65)',
                transition: 'all 0.4s cubic-bezier(0.34,1.56,0.64,1)',
                left: `calc(50% + ${lblX}px)`, top: `calc(50% + ${lblY}px)`, transform: 'translate(-50%, -50%) scale(1)',
              }}>{adj.label}</span>
            </div>
          );
        })}

        {/* ═══ Central Nucleus — zIndex 30 to stay above everything ═══ */}
        <div ref={nucleusRef} className="absolute nucleus-levitate"
          style={{
            left: ctr, top: ctr, width: nR * 2, height: nR * 2, transform: 'translate(-50%, -50%)',
            cursor: dragging ? NUCLEUS_CURSOR.replace('pointer', 'grabbing') : NUCLEUS_CURSOR, zIndex: 30,
          }}
          onPointerDown={handleNucleusPointerDown} onPointerMove={handleNucleusPointerMove} onPointerUp={handleNucleusPointerUp} onPointerCancel={handleNucleusPointerUp}
        >
          <div className="absolute rounded-full pointer-events-none halo-breathe" style={{ inset: -22, background: `radial-gradient(circle, ${dc}0A 0%, ${dc}06 38%, transparent 72%)` }} />

          {/* ═══ Rotation indicator — readable dial (drag / center focus) ═══ */}
          <svg className="absolute pointer-events-none" style={{ inset: -14, width: 'calc(100% + 28px)', height: 'calc(100% + 28px)', opacity: dragging ? 0.62 : nucleusZoneFocused ? 0.5 : 0.24, transition: 'opacity 0.35s ease', transform: dragging ? `rotate(${dragAngle}deg)` : 'rotate(0deg)', transformOrigin: 'center center' }}
            viewBox={`0 0 ${nR * 2 + 28} ${nR * 2 + 28}`}>
            {(() => {
              const c = nR + 14;
              const r = nR + 6;
              const ticks: React.ReactElement[] = [];
              for (let i = 0; i < 36; i++) {
                const ang = (i / 36) * Math.PI * 2 - Math.PI / 2;
                const isMajor = i % 9 === 0;
                const len = isMajor ? 7 : 3.2;
                const x1 = c + Math.cos(ang) * (r - len);
                const y1 = c + Math.sin(ang) * (r - len);
                const x2 = c + Math.cos(ang) * r;
                const y2 = c + Math.sin(ang) * r;
                ticks.push(<line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={dc} strokeWidth={isMajor ? 1.05 : 0.55} opacity={isMajor ? 0.72 : 0.4} />);
              }
              const arrowR = r - 1;
              const aStart = -20 * Math.PI / 180;
              const aEnd = 50 * Math.PI / 180;
              const ax1 = c + Math.cos(aStart) * arrowR;
              const ay1 = c + Math.sin(aStart) * arrowR;
              const ax2 = c + Math.cos(aEnd) * arrowR;
              const ay2 = c + Math.sin(aEnd) * arrowR;
              const tipAng = aEnd + 0.08;
              const tipLen = 5;
              const t1x = ax2 + Math.cos(tipAng + 2.4) * tipLen;
              const t1y = ay2 + Math.sin(tipAng + 2.4) * tipLen;
              const t2x = ax2 + Math.cos(tipAng + 0.6) * tipLen;
              const t2y = ay2 + Math.sin(tipAng + 0.6) * tipLen;
              return (
                <>
                  <circle cx={c} cy={c} r={r + 5} fill="none" stroke={dc} strokeWidth="0.65" opacity={nucleusZoneFocused ? 0.2 : 0.1} />
                  {ticks}
                  <path d={`M ${ax1} ${ay1} A ${arrowR} ${arrowR} 0 0 1 ${ax2} ${ay2}`} fill="none" stroke={dc} strokeWidth="1" opacity="0.45" strokeLinecap="round" />
                  <polyline points={`${t1x},${t1y} ${ax2},${ay2} ${t2x},${t2y}`} fill="none" stroke={dc} strokeWidth="1" opacity="0.45" strokeLinecap="round" strokeLinejoin="round" />
                </>
              );
            })()}
          </svg>

          <div className="absolute inset-0 rounded-full overflow-hidden" style={{
            boxShadow: `
              0 0 0 1px rgba(255,255,255,0.28) inset,
              0 2px 24px ${dc}22,
              0 0 48px ${dc}0C,
              0 1px 2px rgba(255,255,255,0.45) inset,
              0 -1px 20px ${dc}18 inset
            `,
            contain: 'paint',
          }}>
            <div className="absolute inset-0" style={{ background: nGrad }} />
            <div className="absolute grad-blob-1 pointer-events-none" style={{ width: '125%', height: '125%', top: '-12%', left: '-12%', background: `radial-gradient(ellipse at 38% 32%, ${nColors[0]}70 0%, ${nColors[0]}16 42%, transparent 66%)`, opacity: 0.42 }} />
            <div className="absolute grad-blob-2 pointer-events-none" style={{ width: '108%', height: '108%', top: '-4%', left: '-4%', background: `radial-gradient(ellipse at 62% 65%, ${nColors[1]}48 0%, ${nColors[1]}10 38%, transparent 62%)`, opacity: 0.38 }} />
            <div className="absolute sphere-pulse pointer-events-none" style={{ inset: 0, background: `radial-gradient(circle, ${nColors[0]}10 0%, transparent 58%)` }} />
          </div>
          <div className="absolute rounded-full pointer-events-none specular-drift" style={{ width: '42%', height: '40%', top: '10%', left: '15%', background: 'radial-gradient(ellipse at 40% 32%, rgba(255,255,255,0.26) 0%, rgba(255,255,255,0.06) 48%, transparent 100%)' }} />
          {/* Center content — triangle + label OR spin-to-generate overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10"
            onClick={e => {
              e.stopPropagation();
              if (generating) return;
              if (!nucleusTooltip) {
                setNucleusTooltip(true);
                setTimeout(() => setNucleusTooltip(prev => prev ? false : prev), 4500);
              } else if (selectedMaterials.length > 0) {
                setNucleusTooltip(false);
                handleGenerate();
              }
            }}
            style={{ cursor: NUCLEUS_CURSOR }}>

            {/* Default state — element triangle + label */}
            <div style={{ opacity: nucleusTooltip ? 0 : 1, transform: nucleusTooltip ? 'scale(0.6) rotate(120deg)' : 'scale(1) rotate(0deg)', transition: 'opacity 0.5s ease, transform 0.6s cubic-bezier(0.34,1.56,0.64,1)', pointerEvents: nucleusTooltip ? 'none' : 'auto' }}
              className="flex flex-col items-center justify-center">
              {(() => {
                const s = 48;
                const side = s * 0.78;
                const triH = side * Math.sqrt(3) / 2;
                const tY = (s - triH) / 2;
                const bY = tY + triH;
                const lX = (s - side) / 2;
                const rX = lX + side;
                const isUp = dom === 'fire' || dom === 'air';
                const hasBar = dom === 'air' || dom === 'earth';
                const triP = isUp
                  ? `M ${s / 2} ${tY} L ${rX} ${bY} L ${lX} ${bY} Z`
                  : `M ${s / 2} ${bY} L ${rX} ${tY} L ${lX} ${tY} Z`;
                const barYi = isUp ? tY + triH * 0.4 : tY + triH * 0.6;
                return (
                  <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ overflow: 'visible', filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.1))' }}>
                    <path d={triP} fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.8" strokeLinejoin="round" />
                    {hasBar && <line x1={lX + side * 0.2} y1={barYi} x2={rX - side * 0.2} y2={barYi} stroke="rgba(255,255,255,0.6)" strokeWidth="1.8" strokeLinecap="round" />}
                  </svg>
                );
              })()}
              <div className="flex flex-col items-center justify-center mt-1">
                <span
                  className="tabular-nums font-extralight leading-none text-center"
                  style={{
                    fontSize: 13,
                    color: 'rgba(255,255,255,0.75)',
                    letterSpacing: '0.02em',
                    textShadow: '0 1px 6px rgba(0,0,0,0.12)',
                  }}
                >
                  {Math.round(distribution[dom])}
                </span>
              </div>
            </div>

            {/* Active state — spinning rings + headline + generate */}
            <div className="absolute inset-0 flex flex-col items-center justify-center"
              style={{ opacity: nucleusTooltip ? 1 : 0, transform: nucleusTooltip ? 'scale(1)' : 'scale(0.8)', transition: 'opacity 0.4s ease 0.15s, transform 0.5s cubic-bezier(0.22,0.61,0.36,1) 0.15s', pointerEvents: nucleusTooltip ? 'auto' : 'none' }}>

              {/* Spinning rings — sharper */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 236 236">
                <circle cx="118" cy="118" r="110" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />
                <g style={{ animation: nucleusTooltip ? 'nucleusSpin 4s linear infinite' : 'none', transformOrigin: '118px 118px' }}>
                  <circle cx="118" cy="118" r="110" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5"
                    strokeDasharray="50 250" strokeLinecap="round" />
                </g>
                <g style={{ animation: nucleusTooltip ? 'nucleusSpin 6s linear infinite reverse' : 'none', transformOrigin: '118px 118px' }}>
                  <circle cx="118" cy="118" r="100" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.8"
                    strokeDasharray="30 280" strokeLinecap="round" />
                </g>
              </svg>

              {/* 3-word concept headline */}
              {(() => {
                const headlines = CONCEPT_HEADLINES[dom];
                const headlineIdx = (selectedMaterials.length + selectedAdjectives.length) % headlines.length;
                const headline = headlines[headlineIdx];
                return (
                  <span className="text-center font-light italic" style={{
                    fontSize: 14, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.12em', lineHeight: 1.3,
                    fontFamily: "'IBM Plex Serif', Georgia, serif",
                    animation: nucleusTooltip ? 'nucleusFadeUp 0.4s ease-out 0.2s both' : 'none',
                  }}>{headline}</span>
                );
              })()}

              {/* Subtle counts */}
              <span className="mt-2" style={{
                fontSize: 8, letterSpacing: '0.25em', textTransform: 'uppercase', fontWeight: 400,
                color: 'rgba(255,255,255,0.3)',
                animation: nucleusTooltip ? 'nucleusFadeUp 0.4s ease-out 0.3s both' : 'none',
              }}>
                {selectedMaterials.length > 0
                  ? `${selectedMaterials.length} mat · ${selectedAdjectives.length} atmo`
                  : 'select materials'}
              </span>

              {/* Generate button */}
              {selectedMaterials.length > 0 && (
                <button className="mt-4 uppercase transition-all hover:scale-108 active:scale-95"
                  style={{
                    fontSize: 9, letterSpacing: '0.35em', fontWeight: 600, padding: '7px 22px',
                    borderRadius: 20, color: '#fff',
                    background: `linear-gradient(135deg, ${dc}C8, ${dc}90)`,
                    border: '1px solid rgba(255,255,255,0.2)',
                    backdropFilter: 'blur(6px)',
                    boxShadow: `0 3px 16px ${dc}30, 0 0 24px ${dc}12`,
                    animation: nucleusTooltip ? 'nucleusFadeUp 0.4s ease-out 0.4s both' : 'none',
                  }}
                  onClick={e => { e.stopPropagation(); setNucleusTooltip(false); handleGenerate(); }}>
                  Generate
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Per-sector hints — push into outer gutter + tangential offset; Plex Serif italic */}
        {!matPicker && !atmoPicker && !gathering && !fullMat && nucleusHintsVisible && ELEMENTS.map(el => {
          const livePct = distribution[el];
          const bracket = distributionBracket(livePct);
          const brief = SECTOR_HINT_BRIEF_EN[el][bracket];
          const mc = MUTED_COLORS[el];
          const stagger = sorted.findIndex(([e]) => e === el);
          const safeStagger = stagger < 0 ? 0 : stagger;
          const ca = fixedStychiaAngleRad(el);
          const c = Math.cos(ca), s = Math.sin(ca);
          const pad = 44;
          const innerR = atmoOrbR + 24;
          let bestT = innerR + 20;
          for (let t = innerR + 18; t < 560; t += 1.5) {
            const x = ctr + c * t, y = ctr + s * t;
            if (x < pad || x > canvasSize - pad || y < pad || y > canvasSize - pad) break;
            bestT = t;
          }
          const slot = SECTOR_ORDER.indexOf(el);
          const tn = -s, ts = c;
          const spread = (slot % 2 === 0 ? 1 : -1) * (22 + slot * 5);
          let lx = ctr + c * bestT + tn * spread;
          let ly = ctr + s * bestT + ts * spread;
          const pull = Math.hypot(lx - ctr, ly - ctr);
          if (pull < innerR + 14) {
            const sc = (lx - ctr) / (pull || 1), sy = (ly - ctr) / (pull || 1);
            lx = ctr + sc * (innerR + 16);
            ly = ctr + sy * (innerR + 16);
          }
          lx = Math.min(canvasSize - pad - 4, Math.max(pad + 4, lx));
          ly = Math.min(canvasSize - pad - 4, Math.max(pad + 4, ly));
          const hintSerif = "'IBM Plex Serif', Georgia, serif";
          const labelShadow = '0 0 28px rgba(252,252,251,0.98), 0 1px 3px rgba(255,255,255,0.95)';
          return (
            <div
              key={`nucleus-hint-${el}`}
              className="absolute z-[5] pointer-events-none text-center"
              style={{
                left: lx,
                top: ly,
                transform: 'translate(-50%, -50%)',
                maxWidth: 168,
                animation: `sectorHintFadeIn 0.75s ease-out ${safeStagger * 88}ms both`,
              }}
            >
              <div
                style={{
                  fontSize: 10.5,
                  fontStyle: 'italic',
                  fontWeight: 500,
                  letterSpacing: '0.12em',
                  color: mc,
                  fontFamily: hintSerif,
                  textShadow: labelShadow,
                  marginBottom: 3,
                  lineHeight: 1.25,
                }}
              >{ELEMENT_LABEL_EN[el]}</div>
              <div
                style={{
                  fontSize: 9.5,
                  fontStyle: 'italic',
                  fontWeight: 400,
                  letterSpacing: '0.06em',
                  color: 'rgba(52,52,60,0.62)',
                  fontFamily: hintSerif,
                  textShadow: labelShadow,
                  marginBottom: 6,
                }}
              >{Math.round(livePct)}% · {BRACKET_LABEL_EN[bracket]}</div>
              <p
                className="m-0"
                style={{
                  fontSize: 10.5,
                  fontStyle: 'italic',
                  fontWeight: 400,
                  lineHeight: 1.58,
                  letterSpacing: '0.02em',
                  color: 'rgba(36,36,44,0.88)',
                  fontFamily: hintSerif,
                  textShadow: labelShadow,
                }}
              >{brief}</p>
            </div>
          );
        })}
      </div>

      {/* ═══ "All" materials — full-width bottom panel ═══ */}
      {showAllMats && selectedMaterials.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 animate-fade-in" onClick={e => e.stopPropagation()}>
          <div className="w-full px-3 sm:px-10 py-4 sm:py-6 overflow-x-auto"
            style={{ background: 'rgba(255,255,255,0.97)', borderTop: `1.5px solid ${dc}10`, boxShadow: '0 -6px 40px rgba(0,0,0,0.06)', backdropFilter: 'blur(8px)', maxHeight: '60vh', overflowY: 'auto' }}>

            {/* Close button */}
            <button className="absolute top-3 right-4 w-7 h-7 rounded-full flex items-center justify-center hover:bg-gray-100 transition-all"
              onClick={() => setShowAllMats(false)}>
              <svg width="10" height="10" viewBox="0 0 8 8" stroke="#999" strokeWidth="1.5"><line x1="1" y1="1" x2="7" y2="7" /><line x1="7" y1="1" x2="1" y2="7" /></svg>
            </button>

            <div className="flex flex-wrap justify-center gap-6 sm:gap-12">
              {ELEMENTS.filter(el => matsByEl[el].length > 0).map(el => {
                const mc = MUTED_COLORS[el];
                const ec = ELEMENT_COLORS[el];
                return (
                  <div key={el} className="flex flex-col items-center gap-3 sm:gap-4 shrink-0">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ec }} />
                      <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.2em', color: mc }}>{el}</span>
                    </div>
                    <div className="flex gap-5">
                      {matsByEl[el].map(mat => {
                        const tex = MAT_TEX[mat.name];
                        const isExp = expMat === mat.name;
                        return (
                          <div key={mat.name} className="flex flex-col items-center gap-2 cursor-pointer group"
                            onClick={e => { e.stopPropagation(); snap(isMuted); setExpMat(isExp ? null : mat.name); }}>
                            <div style={{
                              width: isExp ? 108 : 88, height: isExp ? 108 : 88,
                              borderRadius: '50%', position: 'relative', overflow: 'hidden',
                              background: tex ? 'transparent' : `radial-gradient(circle at 34% 30%, ${mc}E8, ${mc}A0)`,
                              boxShadow: isExp ? `0 10px 36px rgba(0,0,0,0.20), 0 0 22px ${mc}55` : `0 4px 14px rgba(0,0,0,0.12), 0 0 12px ${mc}38`,
                              transition: 'all 0.35s ease',
                            }}>
                              <MaterialBeadInner name={mat.name} tex={tex} mc={mc} />
                            </div>
                            {/* Name + elemental percentage breakdown. SHRE
                                MATERIAL SELECTION LOCK: every material on
                                the board must show its diagnostic reason
                                (name, dominant element, percentage logic),
                                not just a thumbnail. */}
                            <div className="px-2 py-0.5 rounded-md text-center" style={{ background: 'rgba(255,255,255,0.92)', maxWidth: 116, lineHeight: 1.3 }}>
                              <div style={{ fontSize: 11, fontWeight: 600, color: mc, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'normal', wordBreak: 'break-word' as const }}>
                                {mat.name.split('(')[0].trim()}
                              </div>
                              {mat.elementWeights && (
                                <div style={{ fontSize: 8.5, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontWeight: 400, color: '#777', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                                  {(['earth', 'fire', 'water', 'air'] as Element[])
                                    .map((e2) => ({ e2, p: Math.round((mat.elementWeights[e2] || 0) * 100) }))
                                    .filter(({ p }) => p > 0)
                                    .map(({ e2, p }) => `${e2.charAt(0).toUpperCase()}${e2.slice(1)} ${p}%`)
                                    .join(' · ')}
                                </div>
                              )}
                            </div>
                            {isExp && (
                              <button className="px-3 py-1 rounded-full text-[11px] uppercase tracking-[0.08em] font-medium transition-all hover:bg-red-50"
                                style={{ color: '#b06060', background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(180,96,96,0.12)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
                                onClick={e => { e.stopPropagation(); onToggleMaterial?.(mat.name, mat.element); setExpMat(null); snap(isMuted); }}>
                                Remove
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══ Material picker ═══ */}
      {matPicker && (() => {
        const mc = MUTED_COLORS[matPicker];
        const a = fixedStychiaAngleRad(matPicker);
        const midR = (symOrbR + matOrbR) / 2;
        const rawX = Math.cos(a) * (midR + 70);
        const rawY = Math.sin(a) * (midR + 70);
        return (
          <div className="fixed z-50 animate-fade-in" style={{ left: `clamp(8px, calc(50% + ${rawX}px - 130px), calc(100vw - 270px))`, top: `clamp(60px, calc(50% + ${rawY}px - 110px), calc(100vh - 320px))` }} onClick={e => e.stopPropagation()}>
            <div className="rounded-2xl shadow-xl border p-3 w-[260px] max-w-[calc(100vw-16px)] max-h-[48vh] overflow-y-auto" style={{ background: 'rgba(252,252,250,0.98)', borderColor: `${mc}18` }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: mc }} />
                  <span className="text-[13px] uppercase tracking-[0.2em] font-semibold" style={{ color: mc }}>{matPicker}</span>
                </div>
                <button onClick={() => setMatPicker(null)} className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-50">
                  <svg width="8" height="8" viewBox="0 0 8 8" stroke="#bbb" strokeWidth="1.5"><line x1="1" y1="1" x2="7" y2="7" /><line x1="7" y1="1" x2="1" y2="7" /></svg>
                </button>
              </div>
              <div className="text-[11px] uppercase tracking-[0.2em] mb-1 font-medium" style={{ color: `${mc}80` }}>Materials</div>
              <div className="space-y-0.5 mb-2">
                {(CANONICAL_MATERIALS[matPicker] || []).map(name => {
                  const sel = selectedMaterials.some(m => m.name === name);
                  const tex = MAT_TEX[name];
                  return (
                    <button key={name} onClick={() => { onToggleMaterial?.(name, matPicker); snap(isMuted); }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all text-left"
                      style={{ background: sel ? `${mc}0A` : 'transparent', border: `1px solid ${sel ? `${mc}18` : 'transparent'}`, cursor: 'pointer' }}>
                      <div className="w-10 h-10 rounded-full shrink-0 relative overflow-hidden" style={{
                        boxShadow: `0 2px 8px rgba(0,0,0,0.14), 0 0 10px ${mc}30`,
                        background: tex ? 'transparent' : `radial-gradient(circle at 34% 30%, ${mc}E8, ${mc}A0)`,
                      }}>
                        <MaterialBeadInner name={name} tex={tex} mc={mc} />
                      </div>
                      <div className="flex-1 min-w-0"><div className="text-[13px] font-medium truncate" style={{ color: '#777' }}>{name}</div></div>
                      {sel && <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: mc }}><svg width="6" height="6" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5"><path d="M2 6l3 3 5-5" /></svg></div>}
                    </button>
                  );
                })}
              </div>
              <div className="text-[11px] uppercase tracking-[0.2em] mb-1 font-medium" style={{ color: `${mc}80` }}>Atmosphere</div>
              <div className="flex flex-wrap gap-1">
                {(CANONICAL_ATMOSPHERE[matPicker] || []).map(w => {
                  const sel = selectedAdjectives.some(a => a.label === w && a.element === matPicker);
                  return (
                    <button key={w} onClick={() => { onToggleAtmosphere?.(w, matPicker); snap(isMuted); }}
                      className="px-2 py-1 rounded-md text-[11px] font-medium transition-all"
                      style={{ backgroundColor: sel ? `${mc}0C` : '#f6f6f4', color: sel ? mc : '#aaa', border: `1px solid ${sel ? `${mc}1A` : '#e8e8e5'}`, cursor: 'pointer' }}>
                      {sel && '✓ '}{w}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══ Atmosphere picker — triggered by clicking atmo sphere ═══ */}
      {atmoPicker && (() => {
        const mc = MUTED_COLORS[atmoPicker];
        const a = fixedStychiaAngleRad(atmoPicker);
        const midR = (matOrbR + atmoOrbR) / 2;
        const rawX = Math.cos(a) * (midR + 30);
        const rawY = Math.sin(a) * (midR + 30);
        const atmoWords = CANONICAL_ATMOSPHERE[atmoPicker] || [];
        return (
          <div className="fixed z-50 animate-fade-in" style={{ left: `clamp(8px, calc(50% + ${rawX}px - 110px), calc(100vw - 240px))`, top: `clamp(60px, calc(50% + ${rawY}px - 80px), calc(100vh - 260px))` }} onClick={e => e.stopPropagation()}>
            <div className="rounded-2xl shadow-xl border p-3 w-[230px] max-w-[calc(100vw-16px)] max-h-[40vh] overflow-y-auto" style={{ background: 'rgba(252,252,250,0.98)', borderColor: `${mc}18` }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: mc }} />
                  <span className="text-[12px] uppercase tracking-[0.2em] font-semibold" style={{ color: mc }}>{atmoPicker} atmosphere</span>
                </div>
                <button onClick={() => setAtmoPicker(null)} className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-50">
                  <svg width="8" height="8" viewBox="0 0 8 8" stroke="#bbb" strokeWidth="1.5"><line x1="1" y1="1" x2="7" y2="7" /><line x1="7" y1="1" x2="1" y2="7" /></svg>
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {atmoWords.map(w => {
                  const sel = selectedAdjectives.some(a => a.label === w && a.element === atmoPicker);
                  return (
                    <button key={w} onClick={() => { onToggleAtmosphere?.(w, atmoPicker); snap(isMuted); }}
                      className="px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-all hover:scale-105"
                      style={{ backgroundColor: sel ? `${mc}10` : '#f8f8f6', color: sel ? mc : '#aaa', border: `1px solid ${sel ? `${mc}22` : '#eaeae8'}`, cursor: 'pointer' }}>
                      {sel && <span style={{ marginRight: 4 }}>✓</span>}{w}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {selectedMaterials.length > 0 && (
        <div className="absolute bottom-3 sm:bottom-5 right-2 sm:right-5 z-20 flex items-center gap-1.5 sm:gap-2">
          <button className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-full transition-all hover:scale-105 touch-target-auto"
            style={{ background: showAllMats ? `${dc}10` : 'rgba(252,252,250,0.95)', border: `1px solid ${showAllMats ? `${dc}20` : `${dc}10`}`, color: showAllMats ? dc : '#999' }}
            onClick={e => { e.stopPropagation(); setShowAllMats(!showAllMats); }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
            <span className="text-[11px] uppercase tracking-[0.12em] font-medium">
              {selectedMaterials.filter((m) => isMaterialEnabled(m.id, disabledMaterialIds)).length}
              {selectedMaterials.length !== selectedMaterials.filter((m) => isMaterialEnabled(m.id, disabledMaterialIds)).length
                ? ` / ${selectedMaterials.length}`
                : ''}{' '}
              materials
            </span>
          </button>
          {selectedAdjectives.length > 0 && (
            <button className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-full transition-all hover:scale-105 touch-target-auto"
              style={{ background: 'rgba(252,252,250,0.95)', border: `1px solid ${dc}10`, color: `${dc}80` }}
              onClick={e => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('open-atmo-refs')); }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9" /><path d="M8 12h8M12 8v8" /></svg>
              <span className="text-[11px] uppercase tracking-[0.12em] font-medium">{selectedAdjectives.length} atmosphere</span>
            </button>
          )}
        </div>
      )}

      {/* Top-left controls */}
      <div className="absolute top-2 sm:top-4 left-2 sm:left-5 z-20 flex items-center gap-1.5 sm:gap-2">
        {onToggleDiagnostic && <button className="w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-110" style={{ background: 'rgba(252,252,250,0.9)', border: `1px solid ${dc}12` }} onClick={e => { e.stopPropagation(); onToggleDiagnostic(); }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={dc} strokeWidth="1.5" opacity={0.5}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg></button>}
        <button className="w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-110" style={{ background: musicOn ? `${dc}0A` : 'rgba(252,252,250,0.9)', border: `1px solid ${dc}12` }} onClick={e => { e.stopPropagation(); toggleAmbient(); setMusicOn(!musicOn); }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={dc} strokeWidth="1.5" opacity={musicOn ? 0.6 : 0.35}><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg></button>
        <button className="w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-110" style={{ background: !guideDismissed ? `${dc}0A` : 'rgba(252,252,250,0.9)', border: `1px solid ${dc}12` }} onClick={e => { e.stopPropagation(); warmupSpeech(); window.dispatchEvent(new Event('guide-voice-toggle')); }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={dc} strokeWidth="1.5" opacity={!guideDismissed ? 0.6 : 0.35}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" /></svg></button>
      </div>

      {/* Top counters removed — bottom buttons are sufficient */}

      {selectedMaterials.length === 0 && !matPicker && divePhase === 0 && (
        <div className="absolute bottom-20 sm:bottom-24 left-1/2 -translate-x-1/2 z-10 max-w-[90vw] text-center px-2">
          <p className="text-[11px] sm:text-[13px] font-light tracking-[0.04em] sm:tracking-[0.06em]" style={{ color: `${dc}50` }}>Tap an element symbol to add materials · drag nucleus to shift energy</p>
        </div>
      )}

      {/* ═══ Fullscreen material view — double-click to open ═══ */}
      {fullMat && (() => {
        const viewEl = selectedMaterials.find(m => m.name === fullMat)?.element
          || (Object.entries(CANONICAL_MATERIALS).find(([, names]) => names.includes(fullMat))?.[0] as Element) || dom;
        const mc = MUTED_COLORS[viewEl];
        const ec = ELEMENT_COLORS[viewEl];
        const viewTex = MAT_TEX[fullMat];
        const samElMats = CANONICAL_MATERIALS[viewEl] || [];
        const isViewSelected = selectedMaterials.some(m => m.name === fullMat);
        const circSz = Math.min(window.innerHeight * 0.5, 380);
        return (
          <div className="fixed inset-0 z-[90] flex items-center justify-center animate-fade-in p-3 sm:p-6 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }} onClick={e => { e.stopPropagation(); setFullMat(null); }}>
            <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-10 max-w-full" onClick={e => e.stopPropagation()}>

              {/* Left — large material sphere + info card */}
              <div className="flex flex-col items-center gap-5">
                <div style={{
                  width: circSz, height: circSz,
                  borderRadius: '50%', position: 'relative', overflow: 'hidden',
                  border: `3px solid ${mc}`,
                  boxShadow: `0 20px 80px rgba(0,0,0,0.3), 0 0 0 1px ${mc}30`,
                }}>
                  <div style={{ position: 'absolute', inset: '-10%', width: '120%', height: '120%', borderRadius: '50%', background: viewTex ? `url(${viewTex}) center/cover` : `radial-gradient(circle at 32% 28%, ${mc}CC, ${mc}60)` }} />
                  <div className="absolute pointer-events-none" style={{ width: '40%', height: '35%', top: '8%', left: '14%', background: 'radial-gradient(ellipse at 42% 35%, rgba(255,255,255,0.28) 0%, transparent 70%)', borderRadius: '50%' }} />
                </div>

                {/* Info card */}
                <div className="flex flex-col items-center gap-2 px-6 py-3 rounded-2xl" style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
                  <span style={{ fontSize: 16, fontWeight: 600, color: '#333', letterSpacing: '0.06em' }}>{fullMat}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ec }} />
                    <span style={{ fontSize: 12, fontWeight: 500, color: mc, textTransform: 'uppercase', letterSpacing: '0.15em' }}>{viewEl}</span>
                  </div>
                  <button className="mt-1 px-5 py-1.5 rounded-full text-[12px] uppercase tracking-[0.12em] font-medium transition-all"
                    style={isViewSelected
                      ? { color: '#b06060', background: 'rgba(252,248,248,0.95)', border: '1px solid rgba(180,96,96,0.15)' }
                      : { color: '#4a7a4a', background: 'rgba(248,252,248,0.95)', border: '1px solid rgba(96,160,96,0.15)' }}
                    onClick={() => { onToggleMaterial?.(fullMat, viewEl); snap(isMuted); if (isViewSelected) setFullMat(null); }}>
                    {isViewSelected ? 'Remove' : 'Add'}
                  </button>
                </div>
              </div>

              {/* Right — palette: add / remove any material */}
              <div className="rounded-2xl py-4 px-5 flex flex-col gap-2 max-h-[65vh] overflow-y-auto"
                style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)', boxShadow: '0 4px 24px rgba(0,0,0,0.1)', minWidth: 250, maxWidth: 290 }}>
                <span className="mb-1 px-1" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.25em', color: mc }}>{viewEl} materials</span>
                {samElMats.map(name => {
                  const isViewing = name === fullMat;
                  const isSelected = selectedMaterials.some(m => m.name === name);
                  const t = MAT_TEX[name];
                  return (
                    <div key={name} className="flex items-center gap-3 px-3 py-2 rounded-xl transition-all"
                      style={{ background: isViewing ? `${mc}10` : isSelected ? `${mc}05` : 'transparent', border: `1.5px solid ${isViewing ? `${mc}30` : isSelected ? `${mc}12` : 'rgba(0,0,0,0.03)'}` }}>
                      {/* Preview — click to view */}
                      <div className="cursor-pointer" style={{ flexShrink: 0 }} onClick={() => setFullMat(name)}>
                        <div style={{ width: 48, height: 48, borderRadius: '50%', position: 'relative', overflow: 'hidden', border: `2px solid ${mc}${isViewing ? '60' : '20'}`, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', transition: 'all 0.3s ease' }}>
                          <div style={{ position: 'absolute', inset: '-15%', width: '130%', height: '130%', borderRadius: '50%', background: t ? `url(${t}) center/cover` : `linear-gradient(135deg, ${mc}28, ${mc}0C)` }} />
                        </div>
                      </div>
                      {/* Name — click to view */}
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setFullMat(name)}>
                        <div style={{ fontSize: 13, fontWeight: isViewing ? 600 : 400, color: isViewing ? '#333' : '#555', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
                      </div>
                      {/* Add/Remove toggle */}
                      <button className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all"
                        style={isSelected
                          ? { background: `${mc}18`, color: mc }
                          : { background: 'rgba(0,0,0,0.03)', color: '#bbb' }}
                        onClick={() => { onToggleMaterial?.(name, viewEl); snap(isMuted); }}
                        title={isSelected ? 'Remove' : 'Add'}>
                        {isSelected
                          ? <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 6 L5 9 L10 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          : <svg width="12" height="12" viewBox="0 0 12 12"><line x1="6" y1="2" x2="6" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><line x1="2" y1="6" x2="10" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══ Atmosphere references panel ═══ */}
      {showAtmoRefs && (
        <div className="fixed bottom-0 left-0 right-0 z-[45] animate-fade-in" onClick={e => e.stopPropagation()}>
          <div className="w-full px-3 sm:px-6 py-4 sm:py-5 overflow-x-auto" style={{ background: 'rgba(252,252,250,0.98)', borderTop: `1px solid ${dc}10`, boxShadow: '0 -8px 40px rgba(0,0,0,0.06)', maxHeight: '65vh', overflowY: 'auto' }}>
            <div className="flex items-center justify-between mb-3 sm:mb-4 px-2">
              <span style={{ fontSize: 14, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#999' }}>Atmosphere References</span>
              <button className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100 transition-all" onClick={() => setShowAtmoRefs(false)}>
                <svg width="10" height="10" viewBox="0 0 8 8" stroke="#bbb" strokeWidth="1.5"><line x1="1" y1="1" x2="7" y2="7" /><line x1="7" y1="1" x2="1" y2="7" /></svg>
              </button>
            </div>
            <div className="flex flex-wrap sm:flex-nowrap justify-center gap-4 sm:gap-6">
              {sorted.map(([el, pct]) => {
                const mc = MUTED_COLORS[el as Element];
                const refs = ATMO_REFS[el as Element];
                const topRef = refs[Math.floor((pct as number) % refs.length)] || refs[0];
                return (
                  <div key={el} className="flex flex-col items-center shrink-0" style={{ width: 'min(220px, 45vw)' }}>
                    <div className="w-full rounded-xl overflow-hidden mb-3" style={{ background: `linear-gradient(135deg, ${mc}0C, ${mc}05)`, border: `1px solid ${mc}18`, height: 140 }}>
                      {topRef.img ? (
                        <div className="w-full h-full relative">
                          <img src={topRef.img} alt={topRef.title} className="w-full h-full object-cover" />
                          <div className="absolute inset-0" style={{ background: `linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 60%)` }} />
                          <div className="absolute bottom-0 left-0 right-0 p-3 z-10">
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', letterSpacing: '0.04em', marginBottom: 2, textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>{topRef.title}</div>
                            <div style={{ fontSize: 10, fontWeight: 300, fontStyle: 'italic', color: 'rgba(255,255,255,0.8)', lineHeight: 1.4, fontFamily: "'IBM Plex Serif', Georgia, serif" }}>{topRef.style}</div>
                          </div>
                        </div>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center relative">
                          <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% 40%, ${mc}18 0%, transparent 70%)` }} />
                          <div className="relative z-10 text-center px-3">
                            <div style={{ fontSize: 15, fontWeight: 600, color: mc, letterSpacing: '0.04em', marginBottom: 4 }}>{topRef.title}</div>
                            <div style={{ fontSize: 11, fontWeight: 300, fontStyle: 'italic', color: `${mc}90`, lineHeight: 1.4, fontFamily: "'IBM Plex Serif', Georgia, serif" }}>{topRef.style}</div>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: mc }} />
                      <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.15em', color: mc }}>{el}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: mc, fontFamily: "'IBM Plex Mono', monospace" }}>{Math.round(pct as number)}%</span>
                    </div>
                    <p style={{ fontSize: 11, fontWeight: 300, color: '#999', lineHeight: 1.5, textAlign: 'center', fontFamily: "'IBM Plex Sans', sans-serif" }}>
                      {topRef.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {divePhase > 0 && (
        <div className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center">
          <div style={{ position: 'absolute', borderRadius: '50%', width: divePhase >= 2 ? '300vmax' : nR * 2, height: divePhase >= 2 ? '300vmax' : nR * 2, background: nGrad, opacity: divePhase >= 2 ? 1 : 0.8, transition: divePhase >= 2 ? 'all 1.3s cubic-bezier(0.22,0.61,0.36,1)' : 'none', boxShadow: `0 0 80px ${dc}25` }}>
            <div className="absolute inset-0 rounded-full overflow-hidden">
              <div className="absolute grad-blob-1" style={{ width: '130%', height: '130%', top: '-15%', left: '-15%', background: `radial-gradient(ellipse at 40% 35%, ${nColors[0]}60 0%, transparent 60%)`, mixBlendMode: 'soft-light' }} />
              <div className="absolute grad-blob-2" style={{ width: '110%', height: '110%', top: '-5%', left: '-5%', background: `radial-gradient(ellipse at 60% 65%, ${nColors[1]}45 0%, transparent 55%)`, mixBlendMode: 'soft-light' }} />
            </div>
          </div>
          <div className="relative z-10 flex flex-col items-center gap-3" style={{ opacity: divePhase >= 3 ? 1 : 0, transform: divePhase >= 3 ? 'scale(1)' : 'scale(0.85)', transition: 'all 0.7s cubic-bezier(0.22,0.61,0.36,1)' }}>
            <div className="w-10 h-10 rounded-full border-2 border-white/15 flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)' }}><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /></div>
            <span className="text-white/60 text-[13px] uppercase tracking-[0.3em] font-light">Generating...</span>
          </div>
        </div>
      )}

    </div>
  );
};

export default CoreDiagram;
