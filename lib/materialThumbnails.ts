/**
 * Procedural SVG thumbnail generator for material chips.
 *
 * Goal: every material in the catalog gets a believable, color-correct sample
 * even when no local PNG exists in /public/materials/.
 *
 * The generator uses the material's category (stone, wood, metal, plaster…)
 * to pick the right base pattern (veining, grain, brush, weave, ripple, etc.)
 * and the material id/label to pick a color palette tuned to the real material
 * (green for green onyx, rust for corten, etc.).
 *
 * Output is a `data:image/svg+xml;base64,…` URL that works in any
 * `background: url(...)` without escaping concerns. (The earlier `utf8,…`
 * variant silently broke when the SVG body contained `url(#id)` references —
 * the outer CSS `url(...)` parser closed at the first inner `)`. Base64 has
 * none of that risk.)
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
  'mirror-polished-steel':      { base: '#D4D8DC', accent: '#A0A4A8', deep: '#646870' },
  'hammered-metal':             { base: '#B0B5BA', accent: '#838890', deep: '#4D5258' },
  'satin-chrome':               { base: '#C0C5CA', accent: '#959AA0', deep: '#62666C' },
  'polished-nickel':            { base: '#C9CDD2', accent: '#8E9298', deep: '#525660' },
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
  'white-marble-calacatta':     { base: '#F2EEE8', accent: '#C2BAB0', deep: '#7E776E' },
  'thassos-marble':             { base: '#F4F2EE', accent: '#C8C5BE', deep: '#86837C' },
  'dolomite-snow':              { base: '#F6F6F2', accent: '#CDCDC5', deep: '#8B8B82' },
  'bianco-statuario':           { base: '#F0EEE8', accent: '#BFBCB4', deep: '#7B786F' },
  'white-terrazzo':             { base: '#EDEAE2', accent: '#C0BCB0', deep: '#7E7A6E' },
  'light-oak-ash':              { base: '#E0CFA8', accent: '#B8A57A', deep: '#7C6A40' },
  'bleached-birch':             { base: '#EAE0CB', accent: '#C2B590', deep: '#86795A' },
  'limewash-bright':            { base: '#F4EFE5', accent: '#CDC6B6', deep: '#8E8772' },
  'white-mineral-plaster':      { base: '#F0EBE0', accent: '#C5BFB0', deep: '#88836F' },
  'pale-concrete':              { base: '#D0CFC8', accent: '#A5A49C', deep: '#6F6F66' },
  'metallic-silver-surface':    { base: '#D6D8DC', accent: '#A8AAB0', deep: '#6E7078' },
  'anodized-champagne-aluminium':{ base: '#D8C9A8', accent: '#AC9C7C', deep: '#74664E' },
  'clear-glass':                { base: '#E2EAEC', accent: '#B6C0C4', deep: '#7E8A8E' },
  'dichroic-iridescent-glass':  { base: '#C8A4D6', accent: '#7C5AAC', deep: '#3F2A6E' },
  'tinted-translucent-glass':   { base: '#C5A5C2', accent: '#8E6694', deep: '#54395A' },
  'frosted-satin-glass':        { base: '#E5EBEC', accent: '#BFC6C8', deep: '#88908E' },
  'white-corian-curved':        { base: '#F4F4F0', accent: '#CECDC6', deep: '#8E8D86' },
  'fluted-white-panel':         { base: '#EEEAE2', accent: '#C5C0B5', deep: '#85806F' },
  '3d-textured-white-panel':    { base: '#EFECE5', accent: '#C8C3B7', deep: '#86826F' },
  'sheer-linen-voile':          { base: '#F0EBE0', accent: '#D5D0C3', deep: '#A09B8E' },
  'iridescent-satin':           { base: '#D5D0E2', accent: '#B0AAC8', deep: '#6E6786' },

  // ── SHARED ───────────────────────────────────────────────────
  'textured-concrete-matte':    { base: '#B5B2AC', accent: '#8B8884', deep: '#5A5854' },
  'brushed-metal':              { base: '#B8BAC0', accent: '#8E9094', deep: '#5C5E64' },
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
 */
function svgToDataUri(svg: string): string {
  // Collapse whitespace for compactness; SVG tolerates it.
  const compact = svg.replace(/\s+/g, ' ').trim();
  // btoa requires latin-1 input; our SVGs are pure ASCII, so this is safe.
  // In Node-style SSR (no `btoa`) fall back to Buffer.
  const b64 =
    typeof btoa === 'function'
      ? btoa(compact)
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).Buffer?.from(compact, 'utf-8').toString('base64') || '';
  return `data:image/svg+xml;base64,${b64}`;
}

function wrap(inner: string, label: string): string {
  const safe = label.replace(/[<>&]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice"><title>${safe}</title>${inner}</svg>`;
  return svgToDataUri(svg);
}

// ── Pattern primitives — small, self-contained SVG snippets. ────────────────
// IMPORTANT: keep all attribute values double-quoted; do NOT URL-encode `#`,
// `(`, or `)` here — the encoder owns escaping.

function stoneVeining({ base, accent, deep }: ColorStops): string {
  return `
    <defs>
      <filter id="n" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3"/>
        <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.18 0"/>
      </filter>
    </defs>
    <rect width="100" height="100" fill="${base}"/>
    <rect width="100" height="100" filter="url(#n)"/>
    <path d="M-5 30 Q25 20 50 40 T110 35" stroke="${accent}" stroke-width="1.2" fill="none" opacity="0.55"/>
    <path d="M-10 60 Q15 68 38 55 T80 70 T120 55" stroke="${deep}" stroke-width="1.6" fill="none" opacity="0.5"/>
    <path d="M-5 82 Q22 76 45 88 T100 80" stroke="${accent}" stroke-width="0.8" fill="none" opacity="0.4"/>
    <path d="M20 -5 Q35 30 22 55 T35 108" stroke="${deep}" stroke-width="0.7" fill="none" opacity="0.35"/>`;
}

function woodGrain({ base, accent, deep }: ColorStops): string {
  return `
    <defs>
      <filter id="n" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="turbulence" baseFrequency="0.025 1.4" numOctaves="2" seed="5"/>
        <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.30 0"/>
      </filter>
    </defs>
    <rect width="100" height="100" fill="${base}"/>
    <rect width="100" height="100" filter="url(#n)"/>
    <path d="M0 30 Q50 38 100 30" stroke="${accent}" stroke-width="1.2" fill="none" opacity="0.45"/>
    <path d="M0 52 Q50 46 100 55" stroke="${deep}" stroke-width="1" fill="none" opacity="0.4"/>
    <path d="M0 72 Q50 80 100 70" stroke="${accent}" stroke-width="1.4" fill="none" opacity="0.45"/>
    <ellipse cx="28" cy="50" rx="3.5" ry="1.4" fill="${deep}" opacity="0.55"/>
    <ellipse cx="75" cy="38" rx="2.6" ry="1.1" fill="${deep}" opacity="0.45"/>`;
}

function plasterTrowel({ base, accent, deep }: ColorStops): string {
  return `
    <defs>
      <filter id="n" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="2" seed="9"/>
        <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.10 0"/>
      </filter>
    </defs>
    <rect width="100" height="100" fill="${base}"/>
    <rect width="100" height="100" filter="url(#n)"/>
    <path d="M-5 18 L105 30" stroke="${accent}" stroke-width="1.3" fill="none" opacity="0.18"/>
    <path d="M-5 46 L105 38" stroke="${deep}" stroke-width="0.9" fill="none" opacity="0.16"/>
    <path d="M-5 68 L105 75" stroke="${accent}" stroke-width="1.6" fill="none" opacity="0.16"/>
    <path d="M-5 90 L105 84" stroke="${deep}" stroke-width="1" fill="none" opacity="0.14"/>`;
}

function concreteForm({ base, accent, deep }: ColorStops): string {
  return `
    <defs>
      <filter id="n" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="2.5" numOctaves="2" seed="2"/>
        <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.13 0"/>
      </filter>
    </defs>
    <rect width="100" height="100" fill="${base}"/>
    <rect width="100" height="100" filter="url(#n)"/>
    <line x1="0" y1="25" x2="100" y2="25" stroke="${deep}" stroke-width="0.4" opacity="0.35"/>
    <line x1="0" y1="50" x2="100" y2="50" stroke="${deep}" stroke-width="0.4" opacity="0.35"/>
    <line x1="0" y1="75" x2="100" y2="75" stroke="${deep}" stroke-width="0.4" opacity="0.35"/>
    <circle cx="28" cy="38" r="1.3" fill="${accent}" opacity="0.55"/>
    <circle cx="72" cy="65" r="1.4" fill="${accent}" opacity="0.55"/>`;
}

function metalBrushed({ base, accent, deep }: ColorStops, brushed = true): string {
  return `
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="40%">
        <stop offset="0%" stop-color="${deep}"/>
        <stop offset="50%" stop-color="${base}"/>
        <stop offset="100%" stop-color="${accent}"/>
      </linearGradient>
      <filter id="b">
        <feTurbulence type="turbulence" baseFrequency="${brushed ? '5 0.15' : '0.6 0.6'}" numOctaves="1" seed="4"/>
        <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.18 0"/>
      </filter>
    </defs>
    <rect width="100" height="100" fill="url(#g)"/>
    <rect width="100" height="100" filter="url(#b)"/>`;
}

function metalHammered({ base, accent, deep }: ColorStops): string {
  let dimples = '';
  for (let y = 8; y < 100; y += 14) {
    for (let x = 8; x < 100; x += 14) {
      const ox = (Math.floor(y / 14) % 2) * 7;
      dimples += `<circle cx="${x + ox}" cy="${y}" r="5" fill="${accent}" opacity="0.45"/>`;
      dimples += `<circle cx="${x + ox}" cy="${y}" r="2.5" fill="${deep}" opacity="0.5"/>`;
    }
  }
  return `
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${base}"/>
        <stop offset="100%" stop-color="${accent}"/>
      </linearGradient>
    </defs>
    <rect width="100" height="100" fill="url(#g)"/>
    ${dimples}`;
}

function metalCorroded({ base, accent, deep }: ColorStops): string {
  return `
    <defs>
      <filter id="r" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="4" seed="7"/>
        <feColorMatrix values="0 0 0 0 0.6  0 0 0 0 0.3  0 0 0 0 0.15  0 0 0 0.5 0"/>
      </filter>
    </defs>
    <rect width="100" height="100" fill="${deep}"/>
    <rect width="100" height="100" fill="${base}" opacity="0.6"/>
    <rect width="100" height="100" filter="url(#r)"/>
    <circle cx="30" cy="36" r="15" fill="${accent}" opacity="0.35"/>
    <circle cx="72" cy="66" r="20" fill="${accent}" opacity="0.30"/>`;
}

function glassFlat({ base, accent, deep }: ColorStops, frosted = false): string {
  return `
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${base}" stop-opacity="${frosted ? '0.95' : '0.7'}"/>
        <stop offset="100%" stop-color="${accent}" stop-opacity="${frosted ? '0.95' : '0.6'}"/>
      </linearGradient>
      ${frosted ? `<filter id="f"><feGaussianBlur stdDeviation="1.5"/></filter>` : ''}
    </defs>
    <rect width="100" height="100" fill="url(#g)"/>
    ${frosted
      ? `<rect width="100" height="100" fill="${base}" opacity="0.18" filter="url(#f)"/>`
      : `<path d="M-5 -5 L60 30 L-5 60 Z" fill="#ffffff" opacity="0.22"/>
         <path d="M105 40 L40 80 L105 105 Z" fill="${deep}" opacity="0.10"/>`}`;
}

function glassReeded({ base, accent, deep }: ColorStops): string {
  let ribs = '';
  for (let x = 0; x < 100; x += 7) {
    ribs += `<rect x="${x}" y="0" width="3.5" height="100" fill="${accent}" opacity="0.35"/>`;
    ribs += `<rect x="${x + 3.5}" y="0" width="3.5" height="100" fill="${deep}" opacity="0.20"/>`;
  }
  return `<rect width="100" height="100" fill="${base}"/>${ribs}`;
}

function glassBlocks({ base, accent, deep }: ColorStops): string {
  let cells = '';
  for (let y = 0; y < 100; y += 25) {
    for (let x = 0; x < 100; x += 25) {
      cells += `<rect x="${x + 1}" y="${y + 1}" width="23" height="23" fill="${base}" opacity="0.85" stroke="${deep}" stroke-width="0.6"/>`;
      cells += `<path d="M${x + 1} ${y + 1} L${x + 12} ${y + 12} L${x + 1} ${y + 24}" fill="${accent}" opacity="0.4"/>`;
    }
  }
  return `<rect width="100" height="100" fill="${deep}"/>${cells}`;
}

function dichroic(_p: ColorStops): string {
  return `
    <defs>
      <linearGradient id="d" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%"   stop-color="#A464E5"/>
        <stop offset="25%"  stop-color="#E47A9E"/>
        <stop offset="50%"  stop-color="#F6C76A"/>
        <stop offset="75%"  stop-color="#76E3C9"/>
        <stop offset="100%" stop-color="#4E8AE6"/>
      </linearGradient>
      <filter id="b"><feGaussianBlur stdDeviation="3"/></filter>
    </defs>
    <rect width="100" height="100" fill="url(#d)" filter="url(#b)"/>
    <rect width="100" height="100" fill="#ffffff" opacity="0.06"/>`;
}

function ceramicTile({ base, accent, deep }: ColorStops): string {
  let cells = '';
  for (let y = 0; y < 100; y += 20) {
    for (let x = 0; x < 100; x += 20) {
      const t = ((x + y) / 20) % 3;
      const fill = t === 0 ? base : t === 1 ? accent : deep;
      cells += `<rect x="${x + 0.6}" y="${y + 0.6}" width="18.8" height="18.8" fill="${fill}" opacity="0.92"/>`;
    }
  }
  return `<rect width="100" height="100" fill="${deep}"/>${cells}`;
}

function ceramicMosaic({ base, accent, deep }: ColorStops): string {
  let cells = '';
  for (let y = 0; y < 100; y += 8) {
    for (let x = 0; x < 100; x += 8) {
      const r = ((x * 31 + y * 17) % 7) / 10;
      const fill = r < 0.33 ? base : r < 0.66 ? accent : deep;
      cells += `<rect x="${x + 0.3}" y="${y + 0.3}" width="7.4" height="7.4" fill="${fill}" opacity="0.95"/>`;
    }
  }
  return `<rect width="100" height="100" fill="${deep}"/>${cells}`;
}

function brick({ base, accent, deep }: ColorStops): string {
  let bricks = '';
  for (let y = 0; y < 100; y += 14) {
    const off = (Math.floor(y / 14) % 2) * 14;
    for (let x = -14; x < 100; x += 28) {
      bricks += `<rect x="${x + off + 1}" y="${y + 1}" width="26" height="12" fill="${base}" opacity="0.95"/>`;
      bricks += `<rect x="${x + off + 1}" y="${y + 1}" width="26" height="12" fill="${accent}" opacity="0.18"/>`;
    }
  }
  return `<rect width="100" height="100" fill="${deep}"/>${bricks}`;
}

function textileWeave(
  { base, accent, deep }: ColorStops,
  kind: 'plain' | 'boucle' | 'velvet' | 'sheer',
): string {
  if (kind === 'sheer') {
    return `
      <defs><filter id="f"><feGaussianBlur stdDeviation="1.4"/></filter></defs>
      <rect width="100" height="100" fill="${base}" opacity="0.8"/>
      <rect width="100" height="100" fill="${accent}" opacity="0.25" filter="url(#f)"/>`;
  }
  if (kind === 'boucle') {
    let dots = '';
    for (let i = 0; i < 70; i++) {
      const x = (i * 17) % 100;
      const y = (i * 29) % 100;
      const r = 1.6 + ((i * 13) % 5) * 0.4;
      dots += `<circle cx="${x}" cy="${y}" r="${r}" fill="${accent}" opacity="0.55"/>`;
    }
    return `<rect width="100" height="100" fill="${base}"/>${dots}`;
  }
  if (kind === 'velvet') {
    return `
      <defs>
        <linearGradient id="v" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${deep}"/>
          <stop offset="50%" stop-color="${base}"/>
          <stop offset="100%" stop-color="${accent}"/>
        </linearGradient>
        <filter id="s"><feGaussianBlur stdDeviation="1.0"/></filter>
      </defs>
      <rect width="100" height="100" fill="url(#v)"/>
      <rect width="100" height="100" fill="${accent}" opacity="0.08" filter="url(#s)"/>`;
  }
  // plain weave
  let weave = '';
  for (let y = 0; y < 100; y += 4) {
    weave += `<line x1="0" y1="${y}" x2="100" y2="${y}" stroke="${deep}" stroke-width="0.3" opacity="0.30"/>`;
  }
  for (let x = 0; x < 100; x += 4) {
    weave += `<line x1="${x}" y1="0" x2="${x}" y2="100" stroke="${accent}" stroke-width="0.3" opacity="0.28"/>`;
  }
  return `<rect width="100" height="100" fill="${base}"/>${weave}`;
}

function leather({ base, accent, deep }: ColorStops): string {
  return `
    <defs>
      <filter id="l">
        <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="4"/>
        <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.16 0"/>
      </filter>
    </defs>
    <rect width="100" height="100" fill="${base}"/>
    <rect width="100" height="100" filter="url(#l)"/>
    <path d="M0 40 Q40 30 70 42 T110 38" stroke="${deep}" stroke-width="0.4" fill="none" opacity="0.40"/>
    <path d="M0 72 Q35 80 65 68 T110 72" stroke="${accent}" stroke-width="0.4" fill="none" opacity="0.40"/>`;
}

function compositeFluted({ base, accent, deep }: ColorStops): string {
  let ribs = '';
  for (let x = 0; x < 100; x += 6) {
    ribs += `<rect x="${x}" y="0" width="3" height="100" fill="${accent}" opacity="0.45"/>`;
    ribs += `<rect x="${x + 3}" y="0" width="3" height="100" fill="${deep}" opacity="0.18"/>`;
  }
  return `<rect width="100" height="100" fill="${base}"/>${ribs}`;
}

function compositeRelief({ base, accent, deep }: ColorStops): string {
  let cells = '';
  for (let y = 0; y < 100; y += 16) {
    for (let x = 0; x < 100; x += 16) {
      const ox = (Math.floor(y / 16) % 2) * 8;
      cells += `<polygon points="${x + ox + 8},${y + 2} ${x + ox + 14},${y + 8} ${x + ox + 8},${y + 14} ${x + ox + 2},${y + 8}" fill="${accent}" opacity="0.42"/>`;
      cells += `<polygon points="${x + ox + 8},${y + 4} ${x + ox + 12},${y + 8} ${x + ox + 8},${y + 12} ${x + ox + 4},${y + 8}" fill="${deep}" opacity="0.30"/>`;
    }
  }
  return `<rect width="100" height="100" fill="${base}"/>${cells}`;
}

function compositeCorian({ base, accent, deep }: ColorStops): string {
  return `
    <defs>
      <radialGradient id="c" cx="30%" cy="30%" r="80%">
        <stop offset="0%" stop-color="${base}"/>
        <stop offset="70%" stop-color="${accent}" stop-opacity="0.6"/>
        <stop offset="100%" stop-color="${deep}" stop-opacity="0.45"/>
      </radialGradient>
    </defs>
    <rect width="100" height="100" fill="url(#c)"/>`;
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
