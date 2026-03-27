import React, { useMemo, useState, useEffect, useRef, useCallback, memo } from 'react';
import { Element, AdjectiveDef, MaterialDef } from '../types';
import { ELEMENT_COLORS, ELEMENT_COLORS_MUTED, CANONICAL_MATERIALS, CANONICAL_ATMOSPHERE, MATERIAL_SPHERE_IMAGES } from '../constants';
import { tick, snap, toggleAmbient, isAmbientPlaying, warmupSpeech } from '../services/soundService';

const ANIM_STYLE = document.createElement('style');
ANIM_STYLE.textContent = `
  @keyframes levitate{0%{transform:translate(-50%,-50%) translateY(0)}25%{transform:translate(-50%,-50%) translateY(-8px)}50%{transform:translate(-50%,-50%) translateY(-3px)}75%{transform:translate(-50%,-50%) translateY(-10px)}100%{transform:translate(-50%,-50%) translateY(0)}}
  @keyframes shadowPulse{0%,100%{transform:translateX(-50%) scale(1);opacity:.5}40%{transform:translateX(-50%) scale(.88);opacity:.3}70%{transform:translateX(-50%) scale(.92);opacity:.38}}
  @keyframes blobDrift1{0%{transform:translate(0,0) scale(1)}33%{transform:translate(5%,-4%) scale(1.04)}66%{transform:translate(-2%,5%) scale(.97)}100%{transform:translate(0,0) scale(1)}}
  @keyframes blobDrift2{0%{transform:translate(0,0) scale(1)}50%{transform:translate(-6%,4%) scale(1.06)}100%{transform:translate(0,0) scale(1)}}
  @keyframes spherePulse{0%,100%{opacity:.18}50%{opacity:.4}}
  @keyframes haloBreath{0%,100%{opacity:.4;transform:scale(1)}50%{opacity:.65;transform:scale(1.03)}}
  @keyframes specDrift{0%,100%{transform:translate(0,0)}40%{transform:translate(3%,-2%)}80%{transform:translate(-2%,1%)}}
  @keyframes sphereBreath{0%,100%{transform:translate(-50%,-50%) scale(1)}50%{transform:translate(-50%,-50%) scale(1.015)}}
  @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
  @keyframes orbFloat{0%,100%{transform:translate(-50%,-50%) translateY(0)}50%{transform:translate(-50%,-50%) translateY(-2.5px)}}
  @keyframes atmoGlow{0%,100%{box-shadow:0 1px 5px var(--mc30),0 0 8px var(--mc15)}50%{box-shadow:0 2px 10px var(--mc30),0 0 16px var(--mc15)}}
  .nucleus-levitate{animation:levitate 7s cubic-bezier(0.45,0,0.55,1) infinite,sphereBreath 5s ease-in-out infinite;will-change:transform}
  .nucleus-shadow{animation:shadowPulse 7s cubic-bezier(0.45,0,0.55,1) infinite;will-change:transform,opacity}
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
}

export interface PresetCombo {
  id: number; name: string; dist: Record<Element, number>; brilliant: boolean;
  prompt: string; angle: number; dominant?: Element; reinforcer?: Element; supporter?: Element;
}

const MAT_TEX: Record<string, string> = MATERIAL_SPHERE_IMAGES;

const EL_ANGLE: Record<Element, number> = { air: -90, fire: 0, earth: 90, water: 180 };
const ELEMENTS: Element[] = ['earth', 'fire', 'water', 'air'];

const MUTED_COLORS = ELEMENT_COLORS_MUTED;

const CONCEPT_HEADLINES: Record<Element, string[]> = {
  earth: ['Grounded Raw Warmth', 'Rooted Natural Craft', 'Textured Earth Living'],
  fire: ['Oxidized Warmth Drama', 'Moody Cinematic Luxury', 'Dark Material Intensity'],
  water: ['Liquid Chrome Immersion', 'Reflective Fluid Luxury', 'Sculptural Metal Flow'],
  air: ['Futuristic Ethereal Light', 'Iridescent Forward Vision', 'Cosmic Translucent Clarity'],
};

const ATMO_REFS: Record<Element, { title: string; style: string; desc: string; img?: string }[]> = {
  earth: [
    { title: 'Wabi-Sabi Retreat', style: 'Aged patina, reclaimed timber, raw plaster', desc: 'Weathered wood beams, cracked plaster walls, jute rugs, handmade ceramics — imperfect beauty', img: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=600&q=80&fit=crop' },
    { title: 'Green Stone Kitchen', style: 'Dramatic veined marble with warm walnut', desc: 'Green onyx island, walnut cabinetry, woven pendants, sage velvet stools, aged brass', img: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600&q=80&fit=crop' },
    { title: 'Desert Earth Villa', style: 'Rammed earth, terracotta, desert planting', desc: 'Warm ochre plaster walls, cacti courtyard, teak loungers, lap pool — primal warmth', img: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=600&q=80&fit=crop' },
    { title: 'Restored Stone Palazzo', style: 'Ancient walls with modern intervention', desc: 'Double-height rough stone, heavy timber beams, linen sofas, glass table — time layered', img: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=600&q=80&fit=crop' },
    { title: 'Nordic Earth Living', style: 'Polished concrete, reclaimed wood, warm plaster', desc: 'Steel-frame windows, walnut display cabinet, ceramic collection, olive cushions — refined warmth', img: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=600&q=80&fit=crop' },
    { title: 'Rustic Wabi-Sabi', style: 'Rough-hewn timber, aged ceramics, warm light', desc: 'Reclaimed wood columns, raw plaster patches, branch arrangements, warm amber glow', img: 'https://images.unsplash.com/photo-1618220179428-22790b461013?w=600&q=80&fit=crop' },
  ],
  fire: [
    { title: 'Corten Living Room', style: 'Corten steel wall, dark marble, rust velvet', desc: 'Full-height corten rust panel, nero marquina marble accent, deep cognac velvet sofa, blackened steel shelving with warm LED glow', img: 'https://images.unsplash.com/photo-1616486029423-aaa4789e8c9a?w=600&q=80&fit=crop' },
    { title: 'Dark Copper Kitchen', style: 'Oxidized copper fronts, dark herringbone, brass pendants', desc: 'Copper-clad island, dark wood herringbone floor, polished copper sphere pendants, matte black cabinet wall — warm industrial luxury', img: 'https://images.unsplash.com/photo-1556909172-54557c7e4fb7?w=600&q=80&fit=crop' },
    { title: 'Corten Exterior Portal', style: 'Monumental corten facade, deep entry portal', desc: 'Full-facade corten cladding with natural rust patina, tall slot windows, dark wood portal entry, reflecting pool — monumental warmth', img: 'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=600&q=80&fit=crop' },
    { title: 'Moody Brass Living', style: 'Polished brass tables, concrete, rust sofa', desc: 'Cylindrical polished brass coffee tables, exposed concrete wall, gold leaf panel, brown leather sofa, warm directional light — cinematic moody', img: 'https://images.unsplash.com/photo-1600210492493-0946911123ea?w=600&q=80&fit=crop' },
    { title: 'Dramatic Fireplace Lounge', style: 'Statement fireplace, dark tones, warm amber', desc: 'Oversized linear fireplace, charcoal plaster walls, cognac leather seating, warm pendant lights — intense evening atmosphere', img: 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=600&q=80&fit=crop' },
    { title: 'Industrial Loft', style: 'Exposed brick, steel beams, Edison bulbs', desc: 'Raw brick walls, blackened steel staircase, warm filament bulbs, concrete floor, vintage leather — bold urban warmth', img: 'https://images.unsplash.com/photo-1600607687644-c7171b42498f?w=600&q=80&fit=crop' },
  ],
  water: [
    { title: 'Reflective Spa Lounge', style: 'Polished surfaces, calm pools, soft light', desc: 'Mirror-polished stone floors, still water features, diffused ambient light, cream bouclé sofas — immersive reflective serenity', img: 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=600&q=80&fit=crop' },
    { title: 'Minimal Pool Villa', style: 'Infinity edge, white stone, blue reflection', desc: 'Clean-edged infinity pool, white limestone deck, sheer curtains, Mediterranean blue — fluid calm luxury', img: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=600&q=80&fit=crop&crop=bottom' },
    { title: 'Glass & Steel Bathroom', style: 'Floor-to-ceiling glass, polished chrome, rain shower', desc: 'Frameless glass enclosure, polished stainless fixtures, microcement walls, floating vanity — sculptural water ritual', img: 'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=600&q=80&fit=crop' },
    { title: 'Coastal Living Room', style: 'Ocean tones, natural linen, driftwood', desc: 'Pale blue-grey walls, linen sofas, shell accents, panoramic ocean view, bleached wood — serene coastal living', img: 'https://images.unsplash.com/photo-1615529328331-f8917597711f?w=600&q=80&fit=crop' },
    { title: 'Marble & Water Feature', style: 'Flowing water wall, veined marble, ambient glow', desc: 'Floor-to-ceiling water cascade over honed marble, recessed LED coves, floating bench — meditative fluid space', img: 'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?w=600&q=80&fit=crop' },
    { title: 'Nordic Blue Kitchen', style: 'Deep blue cabinetry, brass hardware, cool tones', desc: 'Midnight blue lacquer fronts, veined marble counters, brushed brass pulls, pendant globes — calm sophisticated depth', img: 'https://images.unsplash.com/photo-1556909114-44e3e70034e2?w=600&q=80&fit=crop' },
  ],
  air: [
    { title: 'White Gallery Space', style: 'Pure white volumes, natural light, minimal art', desc: 'Double-height white walls, skylights, polished concrete floor, single sculptural piece — ethereal gallery silence', img: 'https://images.unsplash.com/photo-1600607688969-a5bfcd646154?w=600&q=80&fit=crop' },
    { title: 'Futuristic Silver Lounge', style: 'Metallic silver furniture, neon LED, clean lines', desc: 'Silver metallic armchairs, stainless steel table, neon accent light, indoor plant — futuristic living with organic life', img: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=600&q=80&fit=crop' },
    { title: 'Glass Pavilion', style: 'Floor-to-ceiling glass, floating roof, garden view', desc: 'Minimal steel frame, full glass walls, cantilevered roof, zen garden view — transparent weightless architecture', img: 'https://images.unsplash.com/photo-1600585153490-76fb20a32601?w=600&q=80&fit=crop' },
    { title: 'Scandinavian Minimal', style: 'White walls, light wood, clean geometry', desc: 'Ash flooring, white plaster, single pendant, linen curtains, daylight — pure Nordic clarity', img: 'https://images.unsplash.com/photo-1616137466211-f939a420be84?w=600&q=80&fit=crop' },
    { title: 'Floating Staircase', style: 'Cantilevered treads, glass balustrade, light well', desc: 'White oak floating treads, frameless glass rail, overhead skylight pouring light — ascending weightlessness', img: 'https://images.unsplash.com/photo-1600566753086-00f18f6b0049?w=600&q=80&fit=crop' },
    { title: 'Sheer Curtain Living', style: 'Billowing sheers, pale tones, diffused daylight', desc: 'Floor-to-ceiling sheer linen, pale oak, white marble, soft diffused light everywhere — breath of open space', img: 'https://images.unsplash.com/photo-1600210491892-03d54c0aaf87?w=600&q=80&fit=crop' },
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

function sectorPos(el: Element, idx: number, total: number, orbit: number) {
  const baseAngle = EL_ANGLE[el] * Math.PI / 180;
  const spreadPerItem = 0.32;
  const spreadAngle = Math.min(total - 1, 6) * spreadPerItem;
  const offset = total <= 1 ? 0 : ((idx / (total - 1)) - 0.5) * spreadAngle * 2;
  const a = baseAngle + offset;
  return { x: Math.cos(a) * orbit, y: Math.sin(a) * orbit };
}

const CoreDiagram: React.FC<CoreDiagramProps> = ({
  distribution, selectedAdjectives, selectedMaterials, lockedElements,
  onAdjust, onToggleLock, onToggleMaterial, onToggleAtmosphere, isMuted = false,
  onBrilliantChange, isMatrixOpen = false, onRotationSnap, onGenerate,
  onToggleDiagnostic, onToggleGuide, onTutorialComplete, spaceCategory, rooms, domain,
  gathering = false, onGatherComplete,
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
  const [divePhase, setDivePhase] = useState<0 | 1 | 2 | 3>(0);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

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
  const symOrbR = nR + 50;
  const matOrbR = nR + 140;
  const atmoOrbR = nR + 250;
  const canvasSize = atmoOrbR * 2 + 80; // 816

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
  const nGrad = useMemo(() => `radial-gradient(circle at 36% 32%, ${dc}D0 0%, ${dc}80 30%, ${nColors[1]}50 55%, ${nColors[2]}28 78%, ${nColors[3]}12 100%)`, [dc, nColors]);
  const bgGrad = useMemo(() => `radial-gradient(ellipse at center, ${dc}06 0%, ${dc}03 35%, #FAFAFA 65%, #F7F7F5 100%)`, [dc]);

  const matsByEl = useMemo(() => {
    const g: Record<Element, MaterialDef[]> = { earth: [], fire: [], water: [], air: [] };
    selectedMaterials.forEach(m => g[m.element].push(m));
    return g;
  }, [selectedMaterials]);

  const matPositions = useMemo(() => {
    const map: Record<string, { x: number; y: number }> = {};
    ELEMENTS.forEach(el => {
      matsByEl[el].forEach((m, i) => { map[m.name] = sectorPos(el, i, matsByEl[el].length, matOrbR); });
    });
    return map;
  }, [matsByEl, matOrbR]);

  const adjsByEl = useMemo(() => {
    const g: Record<Element, AdjectiveDef[]> = { earth: [], fire: [], water: [], air: [] };
    selectedAdjectives.forEach(a => g[a.element].push(a));
    return g;
  }, [selectedAdjectives]);

  const atmoPositions = useMemo(() => {
    const map: Record<string, { x: number; y: number }> = {};
    ELEMENTS.forEach(el => {
      adjsByEl[el].forEach((a, i) => { map[`${a.label}-${a.element}`] = sectorPos(el, i, adjsByEl[el].length, atmoOrbR); });
    });
    return map;
  }, [adjsByEl, atmoOrbR]);

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
    let t: Element;
    if (ang >= 315 || ang < 45) t = 'fire';
    else if (ang >= 45 && ang < 135) t = 'earth';
    else if (ang >= 135 && ang < 225) t = 'water';
    else t = 'air';
    const c = distribution[t];
    if (c < 60) { onAdjust(t, Math.min(65, c + 1.5)); tick(isMuted); }
  }, [dragging, distribution, onAdjust, isMuted]);

  const handleNucleusPointerUp = useCallback(() => { dragStartRef.current = null; setDragging(false); }, []);

  return (
    <div ref={cRef}
      className={`w-full h-full flex items-center justify-center select-none relative overflow-hidden ${gathering ? 'core-gathering' : ''}`}
      style={{ background: bgGrad, opacity: mounted ? 1 : 0, transition: 'opacity 0.8s ease' }}
      onClick={() => { warmupSpeech(); setMatPicker(null); setAtmoPicker(null); setExpMat(null); setShowAllMats(false); setFullMat(null); setShowAtmoRefs(false); setNucleusTooltip(false); setExpandedRing(null); }}
    >
      {/* ═══ Outer scene container — scales to fit viewport ═══ */}
      <div className="relative" style={{ width: canvasSize, height: canvasSize, transform: diagramScale < 1 ? `scale(${diagramScale})` : undefined, transformOrigin: 'center center', flexShrink: 0 }}>

        {/* ═══ SVG orbit rings + sector guides ═══ */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none orbit-svg" viewBox={`${-canvasSize/2} ${-canvasSize/2} ${canvasSize} ${canvasSize}`}>
          {/* Faint sector divider lines — 4 sectors at 45°/135°/225°/315° */}
          {[45, 135, 225, 315].map(deg => {
            const rad = deg * Math.PI / 180;
            const r1 = nR + 20, r2 = atmoOrbR + 10;
            return <line key={deg} x1={Math.cos(rad) * r1} y1={Math.sin(rad) * r1} x2={Math.cos(rad) * r2} y2={Math.sin(rad) * r2} stroke={dc} strokeWidth="0.5" opacity={0.08} />;
          })}

          {/* Faint sector zone fills — 4 element zones */}
          {ELEMENTS.map(el => {
            const mc = MUTED_COLORS[el];
            const baseA = EL_ANGLE[el] * Math.PI / 180;
            const a1 = baseA - Math.PI / 4;
            const a2 = baseA + Math.PI / 4;
            const ri = nR + 20;
            const ro = atmoOrbR - 10;
            const largeArc = 0;
            const d = [
              `M ${Math.cos(a1) * ri} ${Math.sin(a1) * ri}`,
              `A ${ri} ${ri} 0 ${largeArc} 1 ${Math.cos(a2) * ri} ${Math.sin(a2) * ri}`,
              `L ${Math.cos(a2) * ro} ${Math.sin(a2) * ro}`,
              `A ${ro} ${ro} 0 ${largeArc} 0 ${Math.cos(a1) * ro} ${Math.sin(a1) * ro}`,
              'Z',
            ].join(' ');
            return <path key={`zone-${el}`} d={d} fill={mc} opacity={0.03} />;
          })}

          {/* Nucleus boundary ring */}
          <circle cx="0" cy="0" r={nR + 4} fill="none" stroke={dc} strokeWidth="0.6" opacity={0.18} />

          {/* Material orbit ring */}
          <circle cx="0" cy="0" r={matOrbR} fill="none" stroke={dc} strokeWidth="1" opacity={0.16} />

          {/* Atmosphere orbit ring */}
          <circle cx="0" cy="0" r={atmoOrbR} fill="none" stroke={dc} strokeWidth="0.8" opacity={0.12} />
        </svg>

        {/* ═══ Orbit rings — interactive: hover glow + click to expand ═══ */}
        <div className="absolute rounded-full"
          style={{
            left: atmoOrbR + 40 - matOrbR - 8, top: atmoOrbR + 40 - matOrbR - 8,
            width: matOrbR * 2 + 16, height: matOrbR * 2 + 16,
            cursor: 'pointer', zIndex: 5,
          }}
          onMouseEnter={() => setHoveredRing('mat')}
          onMouseLeave={() => setHoveredRing(null)}
          onClick={(e) => { e.stopPropagation(); setExpandedRing(expandedRing === 'mat' ? null : 'mat'); }}
        >
          <div className="absolute rounded-full transition-all duration-400" style={{
            inset: 8,
            border: hoveredRing === 'mat' || expandedRing === 'mat'
              ? `2px solid ${dc}60`
              : `1.2px solid ${dc}30`,
            boxShadow: hoveredRing === 'mat' || expandedRing === 'mat'
              ? `0 0 20px ${dc}18, inset 0 0 20px ${dc}08`
              : 'none',
          }} />
        </div>
        <div className="absolute rounded-full"
          style={{
            left: 32, top: 32,
            width: atmoOrbR * 2 + 16, height: atmoOrbR * 2 + 16,
            cursor: 'pointer', zIndex: 4,
          }}
          onMouseEnter={() => setHoveredRing('atmo')}
          onMouseLeave={() => setHoveredRing(null)}
          onClick={(e) => { e.stopPropagation(); setExpandedRing(expandedRing === 'atmo' ? null : 'atmo'); }}
        >
          <div className="absolute rounded-full transition-all duration-400" style={{
            inset: 8,
            border: hoveredRing === 'atmo' || expandedRing === 'atmo'
              ? `2px solid ${dc}50`
              : `1px solid ${dc}22`,
            boxShadow: hoveredRing === 'atmo' || expandedRing === 'atmo'
              ? `0 0 24px ${dc}14, inset 0 0 24px ${dc}06`
              : 'none',
          }} />
        </div>

        {/* ═══ Orbit ring labels — offset ABOVE ring line ═══ */}
        <span className="absolute pointer-events-none transition-all duration-300" style={{
          left: atmoOrbR + 40, top: atmoOrbR + 40 - matOrbR - 18, transform: 'translateX(-50%)',
          fontSize: hoveredRing === 'mat' || expandedRing === 'mat' ? 10 : 8,
          fontWeight: hoveredRing === 'mat' || expandedRing === 'mat' ? 600 : 500,
          letterSpacing: '0.22em', textTransform: 'uppercase',
          color: hoveredRing === 'mat' || expandedRing === 'mat' ? `${dc}CC` : `${dc}80`,
        }}>materials</span>
        <span className="absolute pointer-events-none transition-all duration-300" style={{
          left: atmoOrbR + 40, top: 40 - 18, transform: 'translateX(-50%)',
          fontSize: hoveredRing === 'atmo' || expandedRing === 'atmo' ? 10 : 8,
          fontWeight: hoveredRing === 'atmo' || expandedRing === 'atmo' ? 600 : 500,
          letterSpacing: '0.22em', textTransform: 'uppercase',
          color: hoveredRing === 'atmo' || expandedRing === 'atmo' ? `${dc}AA` : `${dc}60`,
        }}>atmosphere</span>

        {/* ═══ Element symbol triangles — uniform size ═══ */}
        {ELEMENTS.map(el => {
          const a = EL_ANGLE[el] * Math.PI / 180;
          const mc = MUTED_COLORS[el];
          const cx = atmoOrbR + 40 + Math.cos(a) * symOrbR;
          const cy = atmoOrbR + 40 + Math.sin(a) * symOrbR;
          const isAct = matPicker === el;
          const isDom = el === dom;
          const SZ = 32;
          const op = isAct ? 0.9 : isDom ? 0.65 : 0.38;
          const sw = isAct ? 2.2 : 1.6;
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
              style={{ left: cx, top: cy, transform: `translate(-50%, -50%) scale(${scale})`, zIndex: 20, transition: 'all 0.3s ease' }}
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
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: mc, opacity: isAct ? 0.85 : isDom ? 0.55 : 0.35, lineHeight: 1, transition: 'all 0.3s ease', background: 'rgba(255,255,255,0.75)', padding: '1px 4px', borderRadius: 4 }}>{el}</span>
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
          const p = matPositions[mat.name]; if (!p) return null;
          const mc = MUTED_COLORS[mat.element];
          const isDom = mat.element === dom;
          const tex = MAT_TEX[mat.name];
          const isExp = expMat === mat.name;
          const ringExp = expandedRing === 'mat';
          const baseSz = isDom ? 58 : 50;
          const sz = isExp ? 100 : ringExp ? baseSz + 16 : baseSz;
          const cx = atmoOrbR + 40 + p.x;
          const cy = atmoOrbR + 40 + p.y;
          const ang = Math.atan2(p.y, p.x);
          const labelInward = { x: -Math.cos(ang) * (baseSz / 2 + 14), y: -Math.sin(ang) * (baseSz / 2 + 14) };
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
          const floatDelay = `${(Math.abs(p.x * 7 + p.y * 3) % 5).toFixed(1)}s`;
          const showLabel = isExp || ringExp;
          return (
            <div key={mat.name} className="absolute group orb-item"
              style={{ left: cx, top: cy, transform: 'translate(-50%, -50%)', transition: 'all 0.4s cubic-bezier(0.34,1.56,0.64,1)', zIndex: isExp ? 26 : ringExp ? 18 : 15, cursor: 'pointer', animation: gathering ? 'none' : `orbFloat ${8 + (Math.abs(p.x) % 4)}s ease-in-out infinite`, animationDelay: floatDelay }}
              onClick={handleMatClick}
              onMouseEnter={e => { if (!isExp) { (e.currentTarget as HTMLElement).style.transform = 'translate(-50%, -50%) scale(1.18)'; (e.currentTarget as HTMLElement).style.zIndex = '25'; } }}
              onMouseLeave={e => { if (!isExp) { (e.currentTarget as HTMLElement).style.transform = 'translate(-50%, -50%)'; (e.currentTarget as HTMLElement).style.zIndex = ringExp ? '18' : '15'; } }}>
              <div style={{
                width: sz, height: sz, borderRadius: '50%', position: 'relative', flexShrink: 0,
                border: isExp ? `3px solid ${mc}` : ringExp ? `2.5px solid ${mc}` : `2.5px solid ${mc}`,
                boxShadow: isExp
                  ? `0 6px 24px rgba(0,0,0,0.18), 0 0 0 3px ${mc}40`
                  : ringExp
                    ? `0 4px 20px rgba(0,0,0,0.15), 0 0 12px ${mc}25`
                    : `0 4px 16px rgba(0,0,0,0.12), 0 0 0 1px ${mc}20`,
                transition: 'all 0.4s cubic-bezier(0.34,1.56,0.64,1)',
              }}>
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', overflow: 'hidden' }}>
                  <div style={{
                    position: 'absolute', inset: '-15%', width: '130%', height: '130%', borderRadius: '50%',
                    background: tex ? `url(${tex}) center/cover` : `radial-gradient(circle at 32% 28%, ${mc}CC, ${mc}60)`,
                  }} />
                  <div className="absolute pointer-events-none" style={{ width: '38%', height: '32%', top: '8%', left: '12%', background: 'radial-gradient(ellipse at 42% 36%, rgba(255,255,255,0.32) 0%, transparent 75%)', borderRadius: '50%' }} />
                </div>
              </div>
              <span className={`absolute px-2 py-0.5 rounded-full whitespace-nowrap transition-all ${showLabel ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                style={{ fontSize: ringExp ? 11 : 10, fontWeight: 500, color: mc, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(4px)', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', pointerEvents: 'none', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center',
                  left: '50%', top: '50%', transform: `translate(calc(-50% + ${labelInward.x}px), calc(-50% + ${labelInward.y}px))` }}>
                {mat.name.split('(')[0].trim()}
              </span>
            </div>
          );
        })}

        {/* ═══ Atmosphere — visible labels, hover glow + animate enlarge ═══ */}
        {selectedAdjectives.map((adj, i) => {
          const key = `${adj.label}-${adj.element}`;
          const p = atmoPositions[key]; if (!p) return null;
          const mc = MUTED_COLORS[adj.element];
          const ec = ELEMENT_COLORS[adj.element];
          const cx = atmoOrbR + 40 + p.x;
          const cy = atmoOrbR + 40 + p.y;
          const floatDelay = `${(i * 1.3 % 5).toFixed(1)}s`;
          const ang = Math.atan2(p.y, p.x);
          const labelDist = 34;
          const lblX = Math.cos(ang) * labelDist;
          const lblY = Math.sin(ang) * labelDist;
          const atmoRingExp = expandedRing === 'atmo';
          const sphereSz = atmoRingExp ? 28 : 20;
          return (
            <div key={`${key}-${i}`} className="absolute cursor-pointer orb-item"
              style={{ left: cx, top: cy, transform: `translate(-50%, -50%)${atmoRingExp ? ' scale(1.35)' : ''}`, zIndex: atmoRingExp ? 12 : 8, transition: 'all 0.4s cubic-bezier(0.34,1.56,0.64,1)', animation: gathering ? 'none' : `orbFloat ${10 + (i % 4)}s ease-in-out infinite`, animationDelay: floatDelay }}
              onClick={e => { e.stopPropagation(); snap(isMuted); setAtmoPicker(atmoPicker === adj.element ? null : adj.element); setMatPicker(null); }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.transform = 'translate(-50%, -50%) scale(1.8)';
                el.style.zIndex = '25';
                const sphere = el.querySelector('[data-atmo-sphere]') as HTMLElement;
                if (sphere) { sphere.style.boxShadow = `0 3px 16px ${mc}70, 0 0 24px ${ec}50`; sphere.style.borderColor = `${ec}90`; }
                const lbl = el.querySelector('[data-atmo-label]') as HTMLElement;
                if (lbl) { lbl.style.opacity = '1'; lbl.style.color = ec; lbl.style.transform = 'translate(-50%, -50%) scale(1.1)'; lbl.style.fontWeight = '600'; }
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.transform = `translate(-50%, -50%)${atmoRingExp ? ' scale(1.35)' : ''}`;
                el.style.zIndex = atmoRingExp ? '12' : '8';
                const sphere = el.querySelector('[data-atmo-sphere]') as HTMLElement;
                if (sphere) {
                  sphere.style.boxShadow = atmoRingExp ? `0 2px 10px ${mc}50, 0 0 14px ${mc}20` : `0 1px 5px ${mc}30, 0 0 6px ${mc}12`;
                  sphere.style.borderColor = atmoRingExp ? `${mc}70` : `${mc}40`;
                }
                const lbl = el.querySelector('[data-atmo-label]') as HTMLElement;
                if (lbl) {
                  lbl.style.opacity = atmoRingExp ? '0.85' : '0.6';
                  lbl.style.color = atmoRingExp ? ec : mc;
                  lbl.style.transform = 'translate(-50%, -50%) scale(1)';
                  lbl.style.fontWeight = atmoRingExp ? '500' : '400';
                }
              }}>
              <div data-atmo-sphere="" style={{
                width: sphereSz, height: sphereSz, borderRadius: '50%', position: 'relative', overflow: 'hidden',
                background: `radial-gradient(circle at 35% 30%, ${mc}B0, ${mc}70)`,
                boxShadow: atmoRingExp ? `0 2px 10px ${mc}50, 0 0 14px ${mc}20` : `0 1px 5px ${mc}30, 0 0 6px ${mc}12`,
                border: atmoRingExp ? `2px solid ${mc}70` : `1.5px solid ${mc}40`,
                transition: 'all 0.4s ease',
              }}>
                <div style={{ position: 'absolute', width: '45%', height: '40%', top: '12%', left: '18%', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(255,255,255,0.4) 0%, transparent 80%)' }} />
              </div>
              <span data-atmo-label="" className="absolute pointer-events-none" style={{
                fontSize: atmoRingExp ? 14 : 13, fontWeight: atmoRingExp ? 500 : 400, fontStyle: 'italic',
                color: atmoRingExp ? ec : mc, fontFamily: "'IBM Plex Serif', Georgia, serif",
                whiteSpace: 'nowrap', letterSpacing: '0.03em', opacity: atmoRingExp ? 0.85 : 0.6,
                transition: 'all 0.4s cubic-bezier(0.34,1.56,0.64,1)',
                left: `calc(50% + ${lblX}px)`, top: `calc(50% + ${lblY}px)`, transform: 'translate(-50%, -50%) scale(1)',
              }}>{adj.label}</span>
            </div>
          );
        })}

        {/* ═══ Central Nucleus — zIndex 30 to stay above everything ═══ */}
        <div ref={nucleusRef} className="absolute nucleus-levitate"
          style={{ left: atmoOrbR + 40, top: atmoOrbR + 40, width: nR * 2, height: nR * 2, transform: 'translate(-50%, -50%)', cursor: dragging ? NUCLEUS_CURSOR.replace('pointer', 'grabbing') : NUCLEUS_CURSOR, zIndex: 30 }}
          onPointerDown={handleNucleusPointerDown} onPointerMove={handleNucleusPointerMove} onPointerUp={handleNucleusPointerUp} onPointerCancel={handleNucleusPointerUp}
        >
          <div className="absolute pointer-events-none nucleus-shadow" style={{ width: nR * 1.2, height: nR * 0.12, bottom: -nR * 0.2, left: '50%', transform: 'translateX(-50%)', borderRadius: '50%', background: `radial-gradient(ellipse, ${dc}12 0%, transparent 70%)`, opacity: 0.5 }} />
          <div className="absolute rounded-full pointer-events-none halo-breathe" style={{ inset: -20, background: `radial-gradient(circle, ${dc}0A 0%, ${dc}04 50%, transparent 70%)` }} />
          <div className="absolute inset-0 rounded-full overflow-hidden" style={{ boxShadow: `0 4px 28px ${dc}20, 0 0 48px ${dc}0C`, contain: 'paint' }}>
            <div className="absolute inset-0" style={{ background: nGrad }} />
            <div className="absolute grad-blob-1 pointer-events-none" style={{ width: '130%', height: '130%', top: '-15%', left: '-15%', background: `radial-gradient(ellipse at 38% 32%, ${nColors[0]}70 0%, ${nColors[0]}18 40%, transparent 68%)`, opacity: 0.5 }} />
            <div className="absolute grad-blob-2 pointer-events-none" style={{ width: '110%', height: '110%', top: '-5%', left: '-5%', background: `radial-gradient(ellipse at 62% 65%, ${nColors[1]}50 0%, ${nColors[1]}12 35%, transparent 62%)`, opacity: 0.5 }} />
            <div className="absolute sphere-pulse pointer-events-none" style={{ inset: 0, background: `radial-gradient(circle, ${nColors[0]}10 0%, transparent 55%)` }} />
          </div>
          <div className="absolute rounded-full pointer-events-none specular-drift" style={{ width: '44%', height: '42%', top: '9%', left: '14%', background: 'radial-gradient(ellipse at 42% 35%, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.04) 50%, transparent 100%)' }} />
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
                const s = 42;
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
              <span className="uppercase tracking-[0.4em] font-light mt-1" style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.35em' }}>{dom}</span>
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
                <button className="mt-4 uppercase transition-all hover:scale-105 active:scale-95"
                  style={{
                    fontSize: 9, letterSpacing: '0.35em', fontWeight: 600, padding: '6px 20px',
                    borderRadius: 20, color: 'rgba(255,255,255,0.85)',
                    background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
                    backdropFilter: 'blur(4px)',
                    animation: nucleusTooltip ? 'nucleusFadeUp 0.4s ease-out 0.4s both' : 'none',
                  }}
                  onClick={e => { e.stopPropagation(); setNucleusTooltip(false); handleGenerate(); }}>
                  Generate
                </button>
              )}
            </div>
          </div>
        </div>
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
                              width: isExp ? 100 : 78, height: isExp ? 100 : 78,
                              borderRadius: '50%', position: 'relative', overflow: 'hidden',
                              border: `2px solid ${mc}${isExp ? '50' : '20'}`,
                              boxShadow: isExp ? `0 8px 32px rgba(0,0,0,0.18), 0 0 0 2px ${mc}20` : `0 3px 12px rgba(0,0,0,0.10)`,
                              transition: 'all 0.35s ease',
                            }}>
                              <div style={{ position: 'absolute', inset: '-15%', width: '130%', height: '130%', borderRadius: '50%', background: tex ? `url(${tex}) center/cover` : `radial-gradient(circle, ${mc}CC, ${mc}60)` }} />
                              <div className="absolute pointer-events-none" style={{ width: '38%', height: '32%', top: '8%', left: '12%', background: 'radial-gradient(ellipse, rgba(255,255,255,0.3) 0%, transparent 75%)', borderRadius: '50%' }} />
                            </div>
                            <span className="px-2 py-0.5 rounded-md text-center" style={{ fontSize: 11, fontWeight: 500, color: '#555', background: 'rgba(255,255,255,0.9)', maxWidth: 100, lineHeight: '1.35', whiteSpace: 'normal', wordBreak: 'break-word' as const }}>
                              {mat.name.split('(')[0].trim()}
                            </span>
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
        const a = EL_ANGLE[matPicker] * Math.PI / 180;
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
                      <div className="w-10 h-10 rounded-full shrink-0 relative overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.14)' }}>
                        <div style={{ position: 'absolute', inset: '-15%', width: '130%', height: '130%', borderRadius: '50%', background: tex ? `url(${tex}) center/cover` : `linear-gradient(135deg, ${mc}28, ${mc}0C)` }} />
                        <div className="absolute pointer-events-none" style={{ width: '38%', height: '32%', top: '8%', left: '12%', background: 'radial-gradient(ellipse, rgba(255,255,255,0.3) 0%, transparent 75%)', borderRadius: '50%' }} />
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
        const a = EL_ANGLE[atmoPicker] * Math.PI / 180;
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
            <span className="text-[11px] uppercase tracking-[0.12em] font-medium">{selectedMaterials.length} materials</span>
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
                        <div style={{ width: 42, height: 42, borderRadius: '50%', position: 'relative', overflow: 'hidden', border: `2px solid ${mc}${isViewing ? '60' : '20'}`, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', transition: 'all 0.3s ease' }}>
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
