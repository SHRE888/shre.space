/**
 * Procedural SVG thumbnail generator for material chips.
 *
 * Goal: every material in the catalog gets a believable, color-correct,
 * **photo-realistic** sample — even when no local PNG exists in
 * /public/materials/. The procedural samples should read as the actual
 * material (Calacatta Viola → white slab with oxblood veining, Corten →
 * rust patina, Cognac leather → warm grain, etc.) at small thumbnail sizes
 * AND at 88–108 px orbit-bead sizes.
 *
 * Design choices:
 *  - viewBox is 200×200 (was 100). At display sizes 24–108 px the doubled
 *    coordinate space gives crisper veins, finer grain, and tighter dimples.
 *  - Each pattern adds a subtle radial highlight + bottom vignette so the
 *    chip reads as a *sphere*, not a flat sticker, even before any parent
 *    drop-shadow.
 *  - Output is `data:image/svg+xml;base64,…` to sidestep the CSS `url()`
 *    parser interaction with inner `url(#id)` filter references that was
 *    causing blank orbit beads previously.
 *  - btoa is fed UTF-8 bytes via TextEncoder — naive `btoa(svg)` throws
 *    `InvalidCharacterError` on labels with non-ASCII characters (e.g. the
 *    en dash in "Glass mosaic tile (10–25 mm cool)") and would crash the
 *    entire module init.
 */

import { CANONICAL_MATERIAL_BY_LABEL, type MaterialCategory } from '../materialsCatalog';

interface ColorStops {
  /** Hero color — most prominent in the sample. */
  base: string;
  /** Secondary tone (veining, grain accent, brush highlight, weave high). */
  accent: string;
  /** Tertiary deep tone (shadow, knot, deep vein). */
  deep: string;
}

/**
 * Color palettes by material id. We keep this targeted — only listed materials
 * use a custom palette, the rest fall back to a sensible category default.
 */
const PALETTE_BY_ID: Record<string, ColorStops> = {
  // ── EARTH ────────────────────────────────────────────────────
  'travertine-honed':           { base: '#D7C5A2', accent: '#C2A87E', deep: '#9A7E55' },
  'limestone-jura':             { base: '#D6CBAB', accent: '#BFA97D', deep: '#8E7548' },
  'pietra-serena':              { base: '#9CA39A', accent: '#7E867F', deep: '#5A625C' },
  'cipollino-marble':           { base: '#C8C8A8', accent: '#86946A', deep: '#4F5A3A' },
  'green-onyx-marble':          { base: '#7BA77B', accent: '#3E6E48', deep: '#21422B' },
  'marron-emperador':           { base: '#74563B', accent: '#5A3F28', deep: '#2F1F12' },
  'volcanic-stone':             { base: '#5A554F', accent: '#3D3935', deep: '#22201E' },
  'rough-granite':              { base: '#B8AC93', accent: '#8B7E66', deep: '#5C523E' },
  'natural-oak-horizontal':     { base: '#C9A06A', accent: '#A07946', deep: '#6E4F28' },
  'herringbone-parquet':        { base: '#BD8C57', accent: '#8E6437', deep: '#5C3E1F' },
  'walnut-veneer':              { base: '#7E5232', accent: '#5C381F', deep: '#321E10' },
  'reclaimed-timber':           { base: '#A99076', accent: '#7E6855', deep: '#4F4137' },
  'clay-plaster':               { base: '#D9B79A', accent: '#B58D6E', deep: '#7E5A40' },
  'lime-plaster-warm':          { base: '#E5D7BE', accent: '#C2AE8E', deep: '#8E7958' },
  'rammed-earth':               { base: '#C99A6F', accent: '#A0744C', deep: '#6A4520' },
  'tadelakt-warm':              { base: '#C8A287', accent: '#9F7960', deep: '#6A4E38' },
  'board-formed-concrete':      { base: '#A8A39A', accent: '#84807A', deep: '#54514C' },
  'industrial-brick':           { base: '#9E5640', accent: '#7C3F2C', deep: '#4A2114' },
  'zellige-tile-warm':          { base: '#B98B5C', accent: '#8E6238', deep: '#5C3D20' },
  'jute-rug':                   { base: '#C4A37C', accent: '#9A7E58', deep: '#62492C' },
  'boucle-oat':                 { base: '#E0CDA9', accent: '#BFA882', deep: '#8B7654' },
  'mohair-velvet-warm':         { base: '#A65C3A', accent: '#7C4023', deep: '#4A220E' },

  // ── FIRE ─────────────────────────────────────────────────────
  'dark-marble-high-contrast':  { base: '#1B1B1F', accent: '#E8E5DA', deep: '#0A0A0C' },
  'port-laurent':               { base: '#2A1E12', accent: '#C9A876', deep: '#0F0A06' },
  'calacatta-viola':            { base: '#E5DCD0', accent: '#7A2F3D', deep: '#3A1620' },
  'patagonia-quartzite':        { base: '#3E2A2A', accent: '#A15C5C', deep: '#1C1010' },
  'sodalite-blue':              { base: '#1A2C5A', accent: '#3C5495', deep: '#0A1230' },
  'red-travertine':             { base: '#9C5439', accent: '#6E3622', deep: '#3A1A0E' },
  'bardiglio-imperiale':        { base: '#3E3F44', accent: '#6E6F76', deep: '#1B1C20' },
  'dark-quartzite':             { base: '#2D2E33', accent: '#5C5E66', deep: '#141518' },
  'basalt':                     { base: '#36383C', accent: '#5C5E66', deep: '#1A1B1E' },
  'shou-sugi-ban':              { base: '#1B1715', accent: '#3A2F2A', deep: '#0A0807' },
  'smoked-oak':                 { base: '#3E2E22', accent: '#5C463A', deep: '#1F140C' },
  'dark-herringbone-parquet':   { base: '#2E1F14', accent: '#4F3A28', deep: '#140C06' },
  'venetian-plaster-polished':  { base: '#7A2A22', accent: '#A8463E', deep: '#3D110B' },
  'corten-steel':               { base: '#9C4E2C', accent: '#6E3018', deep: '#2F140A' },
  'oxidized-copper':            { base: '#6FA496', accent: '#3F6F60', deep: '#1F3D34' },
  'burnished-brass':            { base: '#A48156', accent: '#7E5E36', deep: '#4A3520' },
  'aged-brass-polished':        { base: '#C19850', accent: '#8E6E32', deep: '#4F3814' },
  'blackened-steel':            { base: '#27292E', accent: '#454850', deep: '#0F1014' },
  'bronze-accents':             { base: '#7E5832', accent: '#5C3F22', deep: '#2D1E10' },
  'oxblood-velvet':             { base: '#5C1F1A', accent: '#7E2E26', deep: '#2D0C09' },
  'cognac-leather':             { base: '#A05E2E', accent: '#7C411E', deep: '#42220C' },
  'charcoal-velvet':            { base: '#2C2C30', accent: '#454548', deep: '#141416' },

  // ── WATER ────────────────────────────────────────────────────
  'bianco-lasa':                { base: '#E0E2E0', accent: '#9CA0A2', deep: '#6A6E72' },
  'smoke-quartzite':            { base: '#9CA1A8', accent: '#6E737A', deep: '#3F4248' },
  'onice-acqua':                { base: '#A8C5CE', accent: '#5E8A98', deep: '#2C5562' },
  'travertine-silver-polished': { base: '#C2C5C8', accent: '#9598A0', deep: '#62656B' },
  'microcement-continuous':     { base: '#B8B5AE', accent: '#928F88', deep: '#5E5C57' },
  'smooth-mineral-plaster':     { base: '#C8C5BE', accent: '#9F9C95', deep: '#6A6863' },
  'tadelakt-cool':              { base: '#A8B0B2', accent: '#7E8688', deep: '#535A5C' },
  'mirror-polished-steel':      { base: '#E4E7EA', accent: '#A8ACB2', deep: '#5C616A' },
  'hammered-metal':             { base: '#C0C5CA', accent: '#83888F', deep: '#4D5258' },
  'satin-chrome':               { base: '#CCD0D5', accent: '#959AA0', deep: '#62666C' },
  'polished-nickel':            { base: '#D2D6DA', accent: '#8E9298', deep: '#525660' },
  'diffused-glass':             { base: '#DDE7E9', accent: '#B0BCC0', deep: '#7E8A8E' },
  'glass-blocks':               { base: '#C5DCE0', accent: '#8FB0B5', deep: '#587078' },
  'curved-bent-glass':          { base: '#D5E2E5', accent: '#A6BDC2', deep: '#6F8489' },
  'reeded-ribbed-glass':        { base: '#CDDDE0', accent: '#8AA5AB', deep: '#536B70' },
  'matte-ceramic':              { base: '#D8D4CA', accent: '#A6A29A', deep: '#6E6B65' },
  'glass-mosaic':               { base: '#9CB8C0', accent: '#3E6068', deep: '#1F3036' },
  'silk-satin-champagne':       { base: '#D8C9A8', accent: '#A89A7E', deep: '#6E6450' },
  'cream-boucle':               { base: '#E4DACA', accent: '#BCB199', deep: '#7E7560' },
  'linen-wool-textile':         { base: '#D8C9A2', accent: '#AA9C76', deep: '#6E6448' },
  'pale-grey-wool-felt':        { base: '#BCC0BE', accent: '#8E928F', deep: '#5C5F5C' },

  // ── AIR ──────────────────────────────────────────────────────
  'white-marble-calacatta':     { base: '#F2EEE8', accent: '#B5ACA0', deep: '#7E776E' },
  'thassos-marble':             { base: '#F4F2EE', accent: '#C8C5BE', deep: '#86837C' },
  'dolomite-snow':              { base: '#F6F6F2', accent: '#CDCDC5', deep: '#8B8B82' },
  'bianco-statuario':           { base: '#F0EEE8', accent: '#BFBCB4', deep: '#7B786F' },
  'white-terrazzo':             { base: '#EDEAE2', accent: '#C0BCB0', deep: '#7E7A6E' },
  'light-oak-ash':              { base: '#E0CFA8', accent: '#B8A57A', deep: '#7C6A40' },
  'bleached-birch':             { base: '#EAE0CB', accent: '#C2B590', deep: '#86795A' },
  'limewash-bright':            { base: '#F4EFE5', accent: '#CDC6B6', deep: '#8E8772' },
  'white-mineral-plaster':      { base: '#F0EBE0', accent: '#C5BFB0', deep: '#88836F' },
  'pale-concrete':              { base: '#D0CFC8', accent: '#A5A49C', deep: '#6F6F66' },
  'metallic-silver-surface':    { base: '#DCDEE2', accent: '#A8AAB0', deep: '#6E7078' },
  'anodized-champagne-aluminium':{ base: '#D8C9A8', accent: '#AC9C7C', deep: '#74664E' },
  'clear-glass':                { base: '#E8EEEF', accent: '#B6C0C4', deep: '#7E8A8E' },
  'dichroic-iridescent-glass':  { base: '#C8A4D6', accent: '#7C5AAC', deep: '#3F2A6E' },
  'tinted-translucent-glass':   { base: '#C5A5C2', accent: '#8E6694', deep: '#54395A' },
  'frosted-satin-glass':        { base: '#EAEFEF', accent: '#BFC6C8', deep: '#88908E' },
  'white-corian-curved':        { base: '#F4F4F0', accent: '#CECDC6', deep: '#8E8D86' },
  'fluted-white-panel':         { base: '#EEEAE2', accent: '#C5C0B5', deep: '#85806F' },
  '3d-textured-white-panel':    { base: '#EFECE5', accent: '#C8C3B7', deep: '#86826F' },
  'sheer-linen-voile':          { base: '#F0EBE0', accent: '#D5D0C3', deep: '#A09B8E' },
  'iridescent-satin':           { base: '#D5D0E2', accent: '#B0AAC8', deep: '#6E6786' },

  // ── SHARED ───────────────────────────────────────────────────
  'textured-concrete-matte':    { base: '#B5B2AC', accent: '#8B8884', deep: '#5A5854' },
  'brushed-metal':              { base: '#BFC2C8', accent: '#8E9094', deep: '#5C5E64' },
  'solid-oak':                  { base: '#C9A672', accent: '#9C7E48', deep: '#664F26' },
  'walnut-natural':             { base: '#8C5E36', accent: '#6E4524', deep: '#3D2410' },
};

const CATEGORY_DEFAULT_PALETTE: Record<MaterialCategory, ColorStops> = {
  stone:     { base: '#C8C0B5', accent: '#9C9388', deep: '#625D54' },
  wood:      { base: '#B58A5C', accent: '#8B6638', deep: '#5A411F' },
  plaster:   { base: '#D8CFBE', accent: '#B5AB95', deep: '#7C7460' },
  concrete:  { base: '#B0AEA8', accent: '#86847F', deep: '#56554F' },
  metal:     { base: '#B5B8BC', accent: '#888B90', deep: '#54565B' },
  glass:     { base: '#D8E0E2', accent: '#A8B2B5', deep: '#6E787C' },
  ceramic:   { base: '#D5D0C5', accent: '#A8A398', deep: '#6E6A60' },
  textile:   { base: '#C8B89C', accent: '#9C8E72', deep: '#665C48' },
  composite: { base: '#E2E0D8', accent: '#B8B6AE', deep: '#7C7A72' },
};

function getPalette(label: string, category: MaterialCategory): ColorStops {
  const entry = CANONICAL_MATERIAL_BY_LABEL[label];
  if (entry && PALETTE_BY_ID[entry.id]) return PALETTE_BY_ID[entry.id];
  return CATEGORY_DEFAULT_PALETTE[category];
}

/**
 * Encode a raw SVG string as a base64 data URI.
 *
 * Base64 sidesteps every quoting/parsing pitfall that `data:…;utf8,…` inline
 * SVGs run into when used inside CSS `background: url(...)`. (Notably: any
 * `url(#id)` reference inside the SVG would close the outer CSS `url(...)` at
 * the first inner `)` and silently produce no background — exactly how the
 * orbit material beads went blank.)
 *
 * `btoa` accepts latin-1 only — feeding it a non-ASCII codepoint
 * (e.g. an en dash inside "10–25 mm") throws `InvalidCharacterError` and
 * crashes the entire module-init. We encode to UTF-8 bytes first, then map
 * bytes to a binary string for `btoa`. Same idiom works in browsers and
 * Node ≥18.
 */
function svgToDataUri(svg: string): string {
  const compact = svg.replace(/\s+/g, ' ').trim();
  let b64 = '';

  if (typeof TextEncoder !== 'undefined' && typeof btoa === 'function') {
    const bytes = new TextEncoder().encode(compact);
    let bin = '';
    // Avoid String.fromCharCode(...bytes) — stack overflow on long inputs.
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    b64 = btoa(bin);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const NodeBuffer = (globalThis as any).Buffer;
    if (NodeBuffer && typeof NodeBuffer.from === 'function') {
      b64 = NodeBuffer.from(compact, 'utf-8').toString('base64');
    } else {
      return `data:image/svg+xml;utf8,${encodeURIComponent(compact)}`;
    }
  }

  return `data:image/svg+xml;base64,${b64}`;
}

/**
 * Standard sphere overlay: just a barely-there top-left specular highlight.
 *
 * The dark rim vignette we used to apply at the texture's edges was reading
 * as a literal "black contour" around every chip — especially noticeable on
 * lighter materials (white marbles, plasters). We now let the parent
 * container provide the sphere illusion via its element-colored ring and a
 * soft box-shadow, and keep the texture itself flat, crisp, and unmuddied.
 */
const SPHERE_OVERLAY = `
  <defs>
    <radialGradient id="sphHi" cx="32%" cy="26%" r="42%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.22"/>
      <stop offset="60%" stop-color="#ffffff" stop-opacity="0.04"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="200" height="200" fill="url(#sphHi)"/>`;

function wrap(inner: string, label: string): string {
  const safe = label.replace(/[<>&]/g, '');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice">` +
    `<title>${safe}</title>` +
    inner +
    SPHERE_OVERLAY +
    `</svg>`;
  return svgToDataUri(svg);
}

// ════════════════════════════════════════════════════════════════════════════
// PATTERN PRIMITIVES — high-quality procedural textures (viewBox 0–200)
// ════════════════════════════════════════════════════════════════════════════
// IMPORTANT: keep attribute values double-quoted; do NOT URL-encode anything
// here — `svgToDataUri` owns escaping.
//
// Style rules:
//  - Always paint a base rect first so the chip is never transparent.
//  - Add a subtle `feTurbulence` overlay rect at low opacity for organic noise.
//  - Vary stroke widths and opacities — uniform lines read as CG.
//  - End with a tiny inner shadow ring (handled by SPHERE_OVERLAY).
// ════════════════════════════════════════════════════════════════════════════

function stoneVeining({ base, accent, deep }: ColorStops): string {
  return `
    <defs>
      <filter id="sg" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.95" numOctaves="3" seed="3"/>
        <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.17 0"/>
      </filter>
      <radialGradient id="sgLite" cx="34%" cy="30%" r="78%">
        <stop offset="0%" stop-color="${base}"/>
        <stop offset="100%" stop-color="${base}"/>
      </radialGradient>
      <filter id="sgBlur"><feGaussianBlur stdDeviation="0.4"/></filter>
    </defs>
    <rect width="200" height="200" fill="url(#sgLite)"/>
    <rect width="200" height="200" filter="url(#sg)"/>
    <g filter="url(#sgBlur)">
      <path d="M-10 50 Q35 35 80 58 Q120 78 160 55 T215 60" stroke="${deep}"   stroke-width="3.0" fill="none" opacity="0.78" stroke-linecap="round"/>
      <path d="M-10 50 Q35 35 80 58 Q120 78 160 55 T215 60" stroke="${accent}" stroke-width="1.4" fill="none" opacity="0.65" stroke-linecap="round"/>
      <path d="M-20 95 Q25 115 65 95 Q105 75 145 115 T235 100" stroke="${deep}" stroke-width="2.6" fill="none" opacity="0.7" stroke-linecap="round"/>
      <path d="M-10 152 Q40 138 82 158 Q120 175 160 145 T215 150" stroke="${deep}"   stroke-width="2.2" fill="none" opacity="0.6" stroke-linecap="round"/>
      <path d="M-10 152 Q40 138 82 158 Q120 175 160 145 T215 150" stroke="${accent}" stroke-width="1.0" fill="none" opacity="0.55" stroke-linecap="round"/>
      <path d="M42 -10 Q62 55 48 110 Q34 165 62 220" stroke="${deep}"   stroke-width="1.8" fill="none" opacity="0.55" stroke-linecap="round"/>
      <path d="M152 -10 Q138 55 168 110 Q148 165 138 220" stroke="${deep}"   stroke-width="1.5" fill="none" opacity="0.5" stroke-linecap="round"/>
      <path d="M-10 28 Q22 30 56 25 Q80 22 102 32" stroke="${deep}" stroke-width="0.9" fill="none" opacity="0.6"/>
      <path d="M115 18 Q150 26 188 20" stroke="${deep}" stroke-width="1.0" fill="none" opacity="0.55"/>
      <path d="M-10 178 Q35 170 70 185 Q108 198 150 180 T215 185" stroke="${deep}" stroke-width="1.2" fill="none" opacity="0.5"/>
      <path d="M100 60 Q108 95 95 130 Q88 158 105 195" stroke="${accent}" stroke-width="0.7" fill="none" opacity="0.5"/>
      <path d="M30 80 Q42 95 38 115" stroke="${deep}" stroke-width="0.6" fill="none" opacity="0.45"/>
      <path d="M170 130 Q160 150 175 170" stroke="${deep}" stroke-width="0.6" fill="none" opacity="0.45"/>
    </g>`;
}

function woodGrain({ base, accent, deep }: ColorStops): string {
  // Tight horizontal anisotropic noise + soft growth-ring arcs + a few knots.
  return `
    <defs>
      <filter id="wg" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="turbulence" baseFrequency="0.018 2.0" numOctaves="3" seed="6"/>
        <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.36 0"/>
      </filter>
      <linearGradient id="wgBase" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="${base}"/>
        <stop offset="100%" stop-color="${deep}" stop-opacity="0.7"/>
      </linearGradient>
    </defs>
    <rect width="200" height="200" fill="url(#wgBase)"/>
    <rect width="200" height="200" filter="url(#wg)"/>
    <path d="M0 50 Q100 62 200 50" stroke="${accent}" stroke-width="2.2" fill="none" opacity="0.45"/>
    <path d="M0 84 Q100 75 200 88" stroke="${deep}"   stroke-width="1.5" fill="none" opacity="0.5"/>
    <path d="M0 118 Q100 130 200 116" stroke="${accent}" stroke-width="2.6" fill="none" opacity="0.5"/>
    <path d="M0 150 Q100 142 200 154" stroke="${deep}"   stroke-width="1.4" fill="none" opacity="0.46"/>
    <path d="M0 180 Q100 188 200 176" stroke="${accent}" stroke-width="2"   fill="none" opacity="0.4"/>
    <ellipse cx="58"  cy="98"  rx="6"   ry="2.4" fill="${deep}"   opacity="0.62"/>
    <ellipse cx="58"  cy="98"  rx="3.2" ry="1.4" fill="${accent}" opacity="0.55"/>
    <ellipse cx="150" cy="74"  rx="4.6" ry="1.9" fill="${deep}"   opacity="0.55"/>
    <ellipse cx="150" cy="74"  rx="2.4" ry="1.0" fill="${accent}" opacity="0.5"/>
    <ellipse cx="120" cy="156" rx="3.4" ry="1.5" fill="${deep}"   opacity="0.4"/>`;
}

function plasterTrowel({ base, accent, deep }: ColorStops): string {
  return `
    <defs>
      <filter id="pl" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="2" seed="9"/>
        <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.10 0"/>
      </filter>
      <radialGradient id="plLite" cx="38%" cy="36%" r="80%">
        <stop offset="0%"  stop-color="${base}"/>
        <stop offset="100%" stop-color="${deep}" stop-opacity="0.65"/>
      </radialGradient>
    </defs>
    <rect width="200" height="200" fill="url(#plLite)"/>
    <rect width="200" height="200" filter="url(#pl)"/>
    <path d="M-10 30 Q60 40 130 24 T210 32" stroke="${accent}" stroke-width="1.6" fill="none" opacity="0.18"/>
    <path d="M-10 78 Q70 70 140 84 T210 76" stroke="${deep}"   stroke-width="1"   fill="none" opacity="0.18"/>
    <path d="M-10 124 Q60 134 130 122 T210 132" stroke="${accent}" stroke-width="2" fill="none" opacity="0.16"/>
    <path d="M-10 168 Q70 162 140 174 T210 170" stroke="${deep}"   stroke-width="1.2" fill="none" opacity="0.16"/>`;
}

function concreteForm({ base, accent, deep }: ColorStops): string {
  return `
    <defs>
      <filter id="cc" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="2.2" numOctaves="2" seed="2"/>
        <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.13 0"/>
      </filter>
      <linearGradient id="ccBase" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="${base}"/>
        <stop offset="100%" stop-color="${deep}" stop-opacity="0.55"/>
      </linearGradient>
    </defs>
    <rect width="200" height="200" fill="url(#ccBase)"/>
    <rect width="200" height="200" filter="url(#cc)"/>
    <line x1="0" y1="50"  x2="200" y2="50"  stroke="${deep}" stroke-width="0.7" opacity="0.35"/>
    <line x1="0" y1="100" x2="200" y2="100" stroke="${deep}" stroke-width="0.7" opacity="0.35"/>
    <line x1="0" y1="150" x2="200" y2="150" stroke="${deep}" stroke-width="0.7" opacity="0.35"/>
    <circle cx="42"  cy="58"  r="2"   fill="${accent}" opacity="0.55"/>
    <circle cx="138" cy="108" r="2.4" fill="${accent}" opacity="0.55"/>
    <circle cx="78"  cy="158" r="1.6" fill="${accent}" opacity="0.5"/>`;
}

function metalBrushed({ base, accent, deep }: ColorStops, brushed = true): string {
  // Anisotropic horizontal turbulence + soft directional gradient.
  return `
    <defs>
      <linearGradient id="mb" x1="0%" y1="0%" x2="100%" y2="30%">
        <stop offset="0%"   stop-color="${deep}"/>
        <stop offset="42%"  stop-color="${base}"/>
        <stop offset="58%"  stop-color="${base}"/>
        <stop offset="100%" stop-color="${accent}"/>
      </linearGradient>
      <filter id="mbb">
        <feTurbulence type="turbulence" baseFrequency="${brushed ? '6 0.1' : '0.5 0.5'}" numOctaves="2" seed="4"/>
        <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.22 0"/>
      </filter>
    </defs>
    <rect width="200" height="200" fill="url(#mb)"/>
    <rect width="200" height="200" filter="url(#mbb)"/>
    ${brushed ? `<rect width="200" height="200" fill="url(#mb)" opacity="0.18"/>` : ''}`;
}

function metalHammered({ base, accent, deep }: ColorStops): string {
  // Honeycomb-ish dimple grid for hand-hammered ripples.
  let dimples = '';
  const step = 22;
  for (let y = 0; y < 200; y += step) {
    for (let x = 0; x < 200; x += step) {
      const ox = (Math.floor(y / step) % 2) * (step / 2);
      const cx = x + ox + step / 2;
      const cy = y + step / 2;
      dimples += `<circle cx="${cx}" cy="${cy}" r="9" fill="${accent}" opacity="0.55"/>`;
      dimples += `<circle cx="${cx - 1}" cy="${cy - 1}" r="5" fill="${deep}" opacity="0.55"/>`;
      dimples += `<circle cx="${cx + 2}" cy="${cy + 2}" r="2.5" fill="#ffffff" opacity="0.22"/>`;
    }
  }
  return `
    <defs>
      <linearGradient id="hm" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${base}"/>
        <stop offset="100%" stop-color="${accent}"/>
      </linearGradient>
    </defs>
    <rect width="200" height="200" fill="url(#hm)"/>
    ${dimples}`;
}

function metalCorroded({ base, accent, deep }: ColorStops): string {
  return `
    <defs>
      <filter id="rs" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.45" numOctaves="4" seed="7"/>
        <feColorMatrix values="0 0 0 0 0.55  0 0 0 0 0.28  0 0 0 0 0.14  0 0 0 0.55 0"/>
      </filter>
      <filter id="rs2" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="2" seed="11"/>
        <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.18 0"/>
      </filter>
      <radialGradient id="rsBase" cx="40%" cy="38%" r="80%">
        <stop offset="0%" stop-color="${base}"/>
        <stop offset="100%" stop-color="${deep}"/>
      </radialGradient>
    </defs>
    <rect width="200" height="200" fill="url(#rsBase)"/>
    <rect width="200" height="200" filter="url(#rs)"/>
    <circle cx="56"  cy="62"  r="34" fill="${accent}" opacity="0.32"/>
    <circle cx="148" cy="132" r="40" fill="${accent}" opacity="0.28"/>
    <rect width="200" height="200" filter="url(#rs2)"/>`;
}

function glassFlat({ base, accent, deep }: ColorStops, frosted = false): string {
  return `
    <defs>
      <linearGradient id="gf" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%"   stop-color="${base}"   stop-opacity="${frosted ? '0.95' : '0.78'}"/>
        <stop offset="100%" stop-color="${accent}" stop-opacity="${frosted ? '0.95' : '0.62'}"/>
      </linearGradient>
      ${frosted ? `<filter id="gff"><feGaussianBlur stdDeviation="2.5"/></filter>` : ''}
    </defs>
    <rect width="200" height="200" fill="url(#gf)"/>
    ${frosted
      ? `<rect width="200" height="200" fill="${base}" opacity="0.16" filter="url(#gff)"/>`
      : `<path d="M-20 -20 L110 60 L-20 130 Z" fill="#ffffff" opacity="0.18"/>
         <path d="M220 70 L80 160 L220 220 Z" fill="${deep}" opacity="0.12"/>`}`;
}

function glassReeded({ base, accent, deep }: ColorStops): string {
  let ribs = '';
  for (let x = 0; x < 200; x += 14) {
    ribs += `<rect x="${x}" y="0" width="7" height="200" fill="${accent}" opacity="0.4"/>`;
    ribs += `<rect x="${x + 7}" y="0" width="7" height="200" fill="${deep}" opacity="0.22"/>`;
    ribs += `<rect x="${x + 1}" y="0" width="2" height="200" fill="#ffffff" opacity="0.22"/>`;
  }
  return `<rect width="200" height="200" fill="${base}"/>${ribs}`;
}

function glassBlocks({ base, accent, deep }: ColorStops): string {
  let cells = '';
  for (let y = 0; y < 200; y += 50) {
    for (let x = 0; x < 200; x += 50) {
      cells += `<rect x="${x + 2}" y="${y + 2}" width="46" height="46" fill="${base}" opacity="0.9" stroke="${deep}" stroke-width="1.2"/>`;
      cells += `<path d="M${x + 2} ${y + 2} L${x + 26} ${y + 26} L${x + 2} ${y + 48} Z" fill="${accent}" opacity="0.42"/>`;
      cells += `<path d="M${x + 8} ${y + 8} L${x + 16} ${y + 16}" stroke="#ffffff" stroke-width="1.4" opacity="0.35"/>`;
    }
  }
  return `<rect width="200" height="200" fill="${deep}"/>${cells}`;
}

function dichroic(_p: ColorStops): string {
  // Iridescent shifting gradient — color independent of the palette.
  return `
    <defs>
      <linearGradient id="dc" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%"   stop-color="#A464E5"/>
        <stop offset="20%"  stop-color="#E47A9E"/>
        <stop offset="40%"  stop-color="#F6C76A"/>
        <stop offset="60%"  stop-color="#9BE07A"/>
        <stop offset="80%"  stop-color="#5FB7E0"/>
        <stop offset="100%" stop-color="#4E5AE6"/>
      </linearGradient>
      <filter id="dcb"><feGaussianBlur stdDeviation="4"/></filter>
    </defs>
    <rect width="200" height="200" fill="url(#dc)" filter="url(#dcb)"/>
    <rect width="200" height="200" fill="#ffffff" opacity="0.06"/>
    <path d="M-20 80 L220 30" stroke="#ffffff" stroke-width="3" opacity="0.16"/>
    <path d="M-20 160 L220 110" stroke="#ffffff" stroke-width="2" opacity="0.10"/>`;
}

function ceramicTile({ base, accent, deep }: ColorStops): string {
  let cells = '';
  for (let y = 0; y < 200; y += 40) {
    for (let x = 0; x < 200; x += 40) {
      const t = ((x + y) / 40) % 3;
      const fill = t === 0 ? base : t === 1 ? accent : deep;
      cells += `<rect x="${x + 1.2}" y="${y + 1.2}" width="37.6" height="37.6" fill="${fill}" opacity="0.95"/>`;
      cells += `<rect x="${x + 1.2}" y="${y + 1.2}" width="37.6" height="6" fill="#ffffff" opacity="0.06"/>`;
    }
  }
  return `<rect width="200" height="200" fill="${deep}"/>${cells}`;
}

function ceramicMosaic({ base, accent, deep }: ColorStops): string {
  let cells = '';
  for (let y = 0; y < 200; y += 16) {
    for (let x = 0; x < 200; x += 16) {
      const r = ((x * 31 + y * 17) % 7) / 10;
      const fill = r < 0.33 ? base : r < 0.66 ? accent : deep;
      cells += `<rect x="${x + 0.6}" y="${y + 0.6}" width="14.8" height="14.8" fill="${fill}" opacity="0.95"/>`;
    }
  }
  return `<rect width="200" height="200" fill="${deep}"/>${cells}`;
}

function brick({ base, accent, deep }: ColorStops): string {
  let bricks = '';
  for (let y = 0; y < 200; y += 28) {
    const off = (Math.floor(y / 28) % 2) * 28;
    for (let x = -28; x < 200; x += 56) {
      bricks += `<rect x="${x + off + 2}" y="${y + 2}" width="52" height="24" fill="${base}" opacity="0.95"/>`;
      bricks += `<rect x="${x + off + 2}" y="${y + 2}" width="52" height="24" fill="${accent}" opacity="0.18"/>`;
      bricks += `<rect x="${x + off + 2}" y="${y + 2}" width="52" height="6" fill="#ffffff" opacity="0.07"/>`;
    }
  }
  return `<rect width="200" height="200" fill="${deep}"/>${bricks}`;
}

function textileWeave(
  { base, accent, deep }: ColorStops,
  kind: 'plain' | 'boucle' | 'velvet' | 'sheer',
): string {
  if (kind === 'sheer') {
    return `
      <defs>
        <filter id="sh"><feGaussianBlur stdDeviation="2.5"/></filter>
        <linearGradient id="shg" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="${base}" stop-opacity="0.85"/>
          <stop offset="100%" stop-color="${accent}" stop-opacity="0.95"/>
        </linearGradient>
      </defs>
      <rect width="200" height="200" fill="url(#shg)"/>
      <rect width="200" height="200" fill="${accent}" opacity="0.18" filter="url(#sh)"/>`;
  }
  if (kind === 'boucle') {
    let dots = '';
    for (let i = 0; i < 220; i++) {
      const x = (i * 17.3) % 200;
      const y = (i * 29.7) % 200;
      const r = 2.4 + ((i * 13) % 6) * 0.55;
      dots += `<circle cx="${x}" cy="${y}" r="${r}" fill="${accent}" opacity="0.55"/>`;
      dots += `<circle cx="${x + 0.8}" cy="${y + 0.8}" r="${r * 0.45}" fill="${deep}" opacity="0.35"/>`;
    }
    return `<rect width="200" height="200" fill="${base}"/>${dots}`;
  }
  if (kind === 'velvet') {
    return `
      <defs>
        <linearGradient id="vv" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stop-color="${deep}"/>
          <stop offset="45%"  stop-color="${base}"/>
          <stop offset="100%" stop-color="${accent}"/>
        </linearGradient>
        <filter id="vvb"><feGaussianBlur stdDeviation="1.6"/></filter>
        <filter id="vvn">
          <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="2" seed="5"/>
          <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.10 0"/>
        </filter>
      </defs>
      <rect width="200" height="200" fill="url(#vv)"/>
      <rect width="200" height="200" filter="url(#vvn)"/>
      <rect width="200" height="200" fill="${accent}" opacity="0.06" filter="url(#vvb)"/>`;
  }
  // plain weave (linen, wool felt)
  let weave = '';
  for (let y = 0; y < 200; y += 8) {
    weave += `<line x1="0" y1="${y}" x2="200" y2="${y}" stroke="${deep}" stroke-width="0.6" opacity="0.32"/>`;
  }
  for (let x = 0; x < 200; x += 8) {
    weave += `<line x1="${x}" y1="0" x2="${x}" y2="200" stroke="${accent}" stroke-width="0.6" opacity="0.30"/>`;
  }
  return `<rect width="200" height="200" fill="${base}"/>${weave}`;
}

function leather({ base, accent, deep }: ColorStops): string {
  return `
    <defs>
      <filter id="lr">
        <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="3" seed="4"/>
        <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.20 0"/>
      </filter>
      <radialGradient id="lrBase" cx="38%" cy="34%" r="80%">
        <stop offset="0%" stop-color="${base}"/>
        <stop offset="100%" stop-color="${deep}"/>
      </radialGradient>
    </defs>
    <rect width="200" height="200" fill="url(#lrBase)"/>
    <rect width="200" height="200" filter="url(#lr)"/>
    <path d="M0 80 Q70 60 130 85 T220 78" stroke="${deep}" stroke-width="0.9" fill="none" opacity="0.4"/>
    <path d="M0 140 Q60 158 130 132 T220 142" stroke="${accent}" stroke-width="0.9" fill="none" opacity="0.4"/>
    <path d="M50 -10 Q70 80 50 200" stroke="${deep}" stroke-width="0.7" fill="none" opacity="0.3"/>
    <path d="M150 -10 Q140 100 160 200" stroke="${accent}" stroke-width="0.7" fill="none" opacity="0.3"/>`;
}

function compositeFluted({ base, accent, deep }: ColorStops): string {
  let ribs = '';
  for (let x = 0; x < 200; x += 12) {
    ribs += `<rect x="${x}" y="0" width="6" height="200" fill="${accent}" opacity="0.5"/>`;
    ribs += `<rect x="${x + 6}" y="0" width="6" height="200" fill="${deep}" opacity="0.18"/>`;
    ribs += `<rect x="${x + 1}" y="0" width="2" height="200" fill="#ffffff" opacity="0.20"/>`;
  }
  return `<rect width="200" height="200" fill="${base}"/>${ribs}`;
}

function compositeRelief({ base, accent, deep }: ColorStops): string {
  let cells = '';
  for (let y = 0; y < 200; y += 32) {
    for (let x = 0; x < 200; x += 32) {
      const ox = (Math.floor(y / 32) % 2) * 16;
      const cx = x + ox + 16;
      const cy = y + 16;
      cells += `<polygon points="${cx},${cy - 12} ${cx + 12},${cy} ${cx},${cy + 12} ${cx - 12},${cy}" fill="${accent}" opacity="0.5"/>`;
      cells += `<polygon points="${cx},${cy - 7}  ${cx + 7},${cy}  ${cx},${cy + 7}  ${cx - 7},${cy}"  fill="${deep}" opacity="0.35"/>`;
      cells += `<polygon points="${cx - 4},${cy - 4} ${cx + 4},${cy - 4} ${cx},${cy - 7}" fill="#ffffff" opacity="0.18"/>`;
    }
  }
  return `<rect width="200" height="200" fill="${base}"/>${cells}`;
}

function compositeCorian({ base, accent, deep }: ColorStops): string {
  return `
    <defs>
      <radialGradient id="cor" cx="32%" cy="30%" r="85%">
        <stop offset="0%"   stop-color="#ffffff" stop-opacity="0.4"/>
        <stop offset="30%"  stop-color="${base}"/>
        <stop offset="80%"  stop-color="${accent}" stop-opacity="0.6"/>
        <stop offset="100%" stop-color="${deep}" stop-opacity="0.55"/>
      </radialGradient>
    </defs>
    <rect width="200" height="200" fill="url(#cor)"/>`;
}

// ── Top-level dispatch by id (custom patterns override the default) ─────────

const SPECIAL_PATTERN: Record<string, (p: ColorStops) => string> = {
  'corten-steel': metalCorroded,
  'oxidized-copper': metalCorroded,
  'hammered-metal': metalHammered,
  'mirror-polished-steel': (p) => metalBrushed(p, false),
  'satin-chrome': (p) => metalBrushed(p, true),
  'polished-nickel': (p) => metalBrushed(p, false),
  'metallic-silver-surface': (p) => metalBrushed(p, true),
  'anodized-champagne-aluminium': (p) => metalBrushed(p, true),
  'brushed-metal': (p) => metalBrushed(p, true),
  'blackened-steel': (p) => metalBrushed(p, true),
  'aged-brass-polished': (p) => metalBrushed(p, false),
  'burnished-brass': (p) => metalBrushed(p, true),
  'bronze-accents': (p) => metalBrushed(p, true),
  'glass-blocks': glassBlocks,
  'reeded-ribbed-glass': glassReeded,
  'curved-bent-glass': (p) => glassFlat(p, false),
  'diffused-glass': (p) => glassFlat(p, true),
  'frosted-satin-glass': (p) => glassFlat(p, true),
  'clear-glass': (p) => glassFlat(p, false),
  'tinted-translucent-glass': (p) => glassFlat(p, true),
  'dichroic-iridescent-glass': dichroic,
  'glass-mosaic': ceramicMosaic,
  'zellige-tile-warm': ceramicTile,
  'matte-ceramic': ceramicTile,
  'industrial-brick': brick,
  'fluted-white-panel': compositeFluted,
  '3d-textured-white-panel': compositeRelief,
  'white-corian-curved': compositeCorian,
  'cognac-leather': leather,
  'oxblood-velvet': (p) => textileWeave(p, 'velvet'),
  'charcoal-velvet': (p) => textileWeave(p, 'velvet'),
  'mohair-velvet-warm': (p) => textileWeave(p, 'velvet'),
  'silk-satin-champagne': (p) => textileWeave(p, 'velvet'),
  'iridescent-satin': (p) => textileWeave(p, 'velvet'),
  'boucle-oat': (p) => textileWeave(p, 'boucle'),
  'cream-boucle': (p) => textileWeave(p, 'boucle'),
  'pale-grey-wool-felt': (p) => textileWeave(p, 'plain'),
  'linen-wool-textile': (p) => textileWeave(p, 'plain'),
  'jute-rug': (p) => textileWeave(p, 'plain'),
  'sheer-linen-voile': (p) => textileWeave(p, 'sheer'),
};

const CATEGORY_DEFAULT_PATTERN: Record<MaterialCategory, (p: ColorStops) => string> = {
  stone: stoneVeining,
  wood: woodGrain,
  plaster: plasterTrowel,
  concrete: concreteForm,
  metal: (p) => metalBrushed(p, true),
  glass: (p) => glassFlat(p, true),
  ceramic: ceramicTile,
  textile: (p) => textileWeave(p, 'plain'),
  composite: compositeCorian,
};

/**
 * Build a self-contained data: SVG URL for the given material label.
 *
 * Returns a usable `src` even for materials missing from the catalog (uses
 * stone defaults). Pure function, safe in any React render path.
 */
export function buildMaterialThumbnail(label: string): string {
  const entry = CANONICAL_MATERIAL_BY_LABEL[label];
  const category: MaterialCategory = entry?.category ?? 'stone';
  const palette = getPalette(label, category);
  const id = entry?.id ?? 'unknown';
  const renderer = SPECIAL_PATTERN[id] ?? CATEGORY_DEFAULT_PATTERN[category];
  const inner = renderer(palette);
  return wrap(inner, label);
}

/**
 * Build a `label → src` map for every material in the catalog. Local PNGs win
 * if provided via `localOverrides`; otherwise the procedural SVG is used.
 */
export function buildMaterialThumbnailMap(localOverrides: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const label of Object.keys(CANONICAL_MATERIAL_BY_LABEL)) {
    out[label] = localOverrides[label] || buildMaterialThumbnail(label);
  }
  return out;
}
