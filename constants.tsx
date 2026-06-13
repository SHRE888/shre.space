import { Question, MaterialDef, AdjectiveDef, Element } from './types';
import { CANONICAL_MATERIAL_CATALOG, CANONICAL_MATERIAL_GROUPS, getPrimaryElementForMaterial } from './materialsCatalog';
import { CANONICAL_ADJECTIVES_CATALOG, CANONICAL_ADJECTIVE_GROUPS, getPrimaryElementForAdjective } from './adjectivesCatalog';
// (materialThumbnails kept only for type compatibility; the real source of
//  truth is MAT_TEXTURE_SPEC below.)

// Strict Order for Tie-Breaking: Earth > Fire > Water > Air
export const ELEMENTS: Element[] = ['earth', 'fire', 'water', 'air'];

// Element palette — sharp, refined, unmistakable
export const ELEMENT_COLORS: Record<Element, string> = {
  earth: '#8C6D3F',
  fire: '#BF5B3A',
  water: '#2E89A6',
  air: '#5A7FA3',
};

// Muted tones — distinct but refined, each element clearly identifiable
export const ELEMENT_COLORS_MUTED: Record<Element, string> = {
  earth: '#A89068',
  fire: '#C07A65',
  water: '#5E9DB2',
  air: '#9590B5',
};

// Placeholder utility (also used for material thumbnails)
const p = (text: string) =>
  `https://placehold.co/100x100/f4f4f5/52525b?text=${encodeURIComponent(text.replace(' ', '+'))}`;

// Wheel palette derived from element colors
export const WHEEL_PALETTE: Record<Element, { inner: string; middle: string; outer: string; text: string }> = {
  earth: { inner: '#8C6D3F', middle: '#A88C60', outer: '#C8B08A', text: '#1a1a1a' },
  fire:  { inner: '#BF5B3A', middle: '#D08060', outer: '#E0A890', text: '#1a1a1a' },
  water: { inner: '#2E89A6', middle: '#5AA4BA', outer: '#8CC0D0', text: '#1a1a1a' },
  air:   { inner: '#5A7FA3', middle: '#809CB8', outer: '#A8BCD0', text: '#1a1a1a' },
};

/**
 * Photographic texture spec per catalog label.
 *
 * Every one of the 78 canonical materials maps to a real PBR PNG under
 * /public/materials/ plus an optional CSS filter that retints the photo so
 * materials sharing the same base file still look visually distinct
 * (Calacatta Viola → white-marble.png with an oxblood sepia, Sodalite Blue
 * → dark-marble.png pushed deep cobalt, Mohair velvet → wool-textile.png
 * shifted rust, etc.).
 *
 * Why this shape:
 *  - The previous 1:1 mapping left ~46 labels with no photo, so the orbit
 *    showed plain colored balls for them ("nothing is visible").
 *  - The procedural SVG fallback drew hand-stylised veining the user
 *    rejected as "ხაზები" (lines).
 *  - Sharing a base PNG + per-label filter gives us photographic surface
 *    quality on every bead while preserving distinct identity by tint.
 */
interface MaterialTextureSpec {
  src: string;
  /** CSS `filter` string applied to the <img>; omit for materials whose
   *  base PNG already matches the desired look (Travertine, Dark marble,
   *  Dolomite snow-white, etc.). */
  filter?: string;
  /** Optional colour overlay applied on top of the photo via
   *  `mix-blend-mode`. Use for materials whose target colour is too far
   *  from the base PNG for `filter` alone to reach — e.g. Sodalite Blue
   *  on dark-marble, Calacatta Viola on white-marble, Oxidised copper on
   *  bronze. Format: any valid CSS colour. */
  tintColor?: string;
  /** Blend mode for `tintColor`. `'color'` keeps photo luminance and
   *  replaces hue+saturation (best for deeply pigmented variants).
   *  `'multiply'` is best for darkening (Shou-sugi-ban). Defaults to
   *  `'color'`. */
  tintMode?: 'color' | 'multiply' | 'overlay' | 'soft-light';
  /** Override the opacity of the tint overlay. Defaults to `0.85`. */
  tintAlpha?: number;
  /** CSS `object-position` for the texture <img>. Materials that share a
   *  base PNG MUST use different crops so the bead doesn't show the same
   *  veining swirl on every marble — e.g. all white-base marbles use
   *  `white-marble.png` but Calacatta / Thassos / Bianco Statuario /
   *  Calacatta Viola / Bianco Lasa / Onice Acqua each sample a different
   *  region. Format: `'30% 20%'`, `'center'`, etc. Defaults to
   *  `'center'`. */
  objectPosition?: string;
  /** CSS scale factor for the texture <img>. Defaults to `1.14` (the
   *  legacy bead overscan). Larger values zoom IN on the veining so a
   *  bead reads as heavily marked (used for grounded Earth/Fire stones
   *  the user wants visually loaded); values close to `1` show the
   *  whole sample so the bead reads as clean / quiet (Air whites). */
  zoom?: number;
}

const MAT_TEXTURE_SPEC: Record<string, MaterialTextureSpec> = {
  // ── EARTH ─────────────────────────────────────────────────────
  // stones — each one tinted to its real-world hue so the thumbnails
  // don't collapse into "another beige" / "another grey-white".
  //
  // SHRE 4E catalog target:
  //   Travertine Classic (Margraf / Salvatori) — warm cream-beige, vug texture
  //   Jura Limestone (Jura Stone)              — golden-beige with fossil interest
  //   Pietra Serena (Tuscan)                   — matte grey-green Tuscan sandstone
  //   Cipollino marble (Margraf)               — wavy warm green-and-gold veins on cream
  //   Bianco Lasa (custom stone)               — cool grey-white with subtle gold veining
  //   White marble book-matched (Margraf)      — crisp grey-to-warm-gold veining on white
  //   Dark marble / Nero Marquina (Margraf)    — black with crisp white calcite veining
  //
  // VEINING CHARACTER PER ELEMENT (user requirement):
  //   Earth = heavier / more loaded veining → zoom 1.30–1.40, high
  //           contrast/saturation so the veins read loudly
  //   Air   = clean / quiet → zoom 1.00–1.10, low saturation, soft contrast
  //   Water = cool fluid character → zoom 1.20–1.35, cool tint, mid contrast
  //   Fire  = dark/burnt (no white-base marbles at all)
  //
  // Two materials sharing a base PNG MUST use different `objectPosition`
  // so the bead doesn't show the identical veining swirl on every marble.
  //
  // tintMode 'color' replaces the photo's hue+saturation and at high alpha
  // kills the marble veining (the bead reads as a flat coloured ball — bug
  // shown in earlier user feedback). For pigmented variants we use
  // 'soft-light' / 'overlay' which preserve the photo veining while
  // pushing the bead toward the catalog target colour.
  'Travertine (honed)':                       { src: '/materials/travertine.png',    tintColor: '#D9C0A0', tintMode: 'soft-light', tintAlpha: 0.45, zoom: 1.22, objectPosition: '35% 45%' },
  'Jura limestone (golden)':                  { src: '/materials/limestone.png',     tintColor: '#C8995A', tintMode: 'overlay',    tintAlpha: 0.55, filter: 'saturate(1.32) brightness(1.06) contrast(1.1)',  zoom: 1.32, objectPosition: '40% 35%' },
  'Pietra Serena (Tuscan)':                   { src: '/materials/limestone.png',     tintColor: '#7B848A', tintMode: 'soft-light', tintAlpha: 0.7,  filter: 'saturate(0.45) brightness(0.94) contrast(1.06)', zoom: 1.18, objectPosition: '70% 60%' },
  'Cipollino marble (warm green-veined)':     { src: '/materials/white-marble.png',  tintColor: '#9CA85A', tintMode: 'overlay',    tintAlpha: 0.55, filter: 'saturate(1.35) contrast(1.28) brightness(1.0)', zoom: 1.38, objectPosition: '30% 25%' },
  'Green onyx / marble (veined)':             { src: '/materials/white-marble.png',  tintColor: '#2F6A42', tintMode: 'overlay',    tintAlpha: 0.7,  filter: 'saturate(1.45) contrast(1.3) brightness(0.96)', zoom: 1.42, objectPosition: '70% 75%' },
  'Marrón Emperador (warm brown marble)':     { src: '/materials/walnut-veneer.png', filter: 'saturate(1.15) contrast(1.1) brightness(0.92)' },
  'Volcanic stone (basalt rough)':            { src: '/materials/basalt.png' },
  'Sand-blasted granite (warm)':              { src: '/materials/limestone.png',     tintColor: '#A38570', tintMode: 'color',      tintAlpha: 0.55, filter: 'contrast(1.08)' },
  // woods
  'Natural oak (horizontal)':                 { src: '/materials/natural-oak-horizontal.png' },
  'Herringbone parquet (warm oak)':           { src: '/materials/solid-oak.png',     filter: 'saturate(1.15) brightness(1.04)' },
  'Walnut veneer':                            { src: '/materials/walnut-veneer.png' },
  'Reclaimed weathered timber':               { src: '/materials/walnut.png',        filter: 'saturate(0.55) brightness(1.04) contrast(0.96)' },
  // plasters
  'Clay plaster':                             { src: '/materials/clay-plaster.png' },
  'Lime plaster (warm mineral)':              { src: '/materials/lime-plaster.png' },
  'Rammed earth / terracotta plaster':        { src: '/materials/clay-plaster.png',  tintColor: '#C99A6F', tintAlpha: 0.5 },
  'Tadelakt (warm pigmented Moroccan)':       { src: '/materials/clay-plaster.png',  filter: 'hue-rotate(-15deg) saturate(0.85) brightness(1.02)' },
  // concrete + brick
  'Board-formed concrete':                    { src: '/materials/textured-concrete.png', filter: 'saturate(0.85) brightness(0.98)' },
  'Industrial brick':                         { src: '/materials/industrial-brick.png' },
  'Zellige tile (warm ochre / olive)':        { src: '/materials/matte-ceramic.png', tintColor: '#B98B5C', tintAlpha: 0.65 },
  // textiles
  'Jute / sisal rug':                         { src: '/materials/wool-textile.png',  filter: 'hue-rotate(-10deg) saturate(0.9) brightness(0.95)' },
  'Bouclé (oat / cream)':                     { src: '/materials/wool-textile.png',  filter: 'brightness(1.18) saturate(0.65)' },
  'Mohair velvet (warm rust / olive)':        { src: '/materials/wool-textile.png',  tintColor: '#A65C3A', tintAlpha: 0.7 },

  // ── FIRE ──────────────────────────────────────────────────────
  // stones
  // SHRE: Nero Marquina (Margraf) — polished black with crisp white calcite
  // veining. Slight desaturation neutralises any green/blue cast from the
  // base PNG; contrast pulls the white veins out of the black ground.
  'Dark marble (high contrast)':              { src: '/materials/dark-marble.png',   filter: 'saturate(0.35) contrast(1.28) brightness(0.92)' },
  'Port Laurent / Saint Laurent marble':      { src: '/materials/dark-marble.png',   filter: 'sepia(0.3) hue-rotate(-15deg) saturate(1.25)' },
  // NOTE: Calacatta Viola moved to AIR (white-base marble) — spec entry
  // lives in the AIR block below. Sodalite Blue moved to WATER (deep
  // blue stone) — spec entry lives in the WATER block below.
  'Patagonia quartzite (smoky burgundy)':     { src: '/materials/dark-marble.png',   tintColor: '#5C2E2E', tintMode: 'soft-light', tintAlpha: 0.85 },
  'Red travertine (Persian)':                 { src: '/materials/travertine.png',    filter: 'sepia(0.4) hue-rotate(-25deg) saturate(1.5) brightness(0.94)' },
  'Bardiglio Imperiale (deep grey-black)':    { src: '/materials/dark-marble.png',   filter: 'saturate(0.35) brightness(0.92)' },
  'Dark quartzite':                           { src: '/materials/tuff.png' },
  'Basalt':                                   { src: '/materials/basalt.png' },
  // woods
  'Shou-sugi-ban (charred timber)':           { src: '/materials/walnut.png',        tintColor: '#0A0807', tintMode: 'multiply', tintAlpha: 0.7, filter: 'contrast(1.3)' },
  'Smoked / fumed oak':                       { src: '/materials/walnut-veneer.png', filter: 'brightness(0.72) saturate(0.85)' },
  'Dark herringbone parquet':                 { src: '/materials/walnut.png',        filter: 'brightness(0.85)' },
  // plaster
  'Venetian plaster (polished)':              { src: '/materials/venetian-plaster.png' },
  // metals
  'Corten steel (weathering)':                { src: '/materials/bronze.png',        tintColor: '#9C4E2C', tintAlpha: 0.7 },
  'Oxidized copper':                          { src: '/materials/bronze.png',        tintColor: '#6FA496', tintAlpha: 0.7 },
  'Burnished antique brass':                  { src: '/materials/bronze.png',        filter: 'brightness(0.92) saturate(0.95)' },
  'Aged brass (polished)':                    { src: '/materials/bronze.png',        filter: 'brightness(1.08) saturate(1.05) contrast(1.05)' },
  'Blackened steel':                          { src: '/materials/blackened-steel.png' },
  'Bronze accents':                           { src: '/materials/bronze.png' },
  // textiles
  'Oxblood / rust velvet upholstery':         { src: '/materials/wool-textile.png',  tintColor: '#5C1F1A', tintAlpha: 0.85 },
  'Cognac saddle leather':                    { src: '/materials/walnut-veneer.png', filter: 'saturate(1.25) brightness(1.05) contrast(1.05)' },
  'Charcoal / smoke velvet':                  { src: '/materials/wool-textile.png',  tintColor: '#2C2C30', tintAlpha: 0.85 },

  // ── WATER ─────────────────────────────────────────────────────
  // stones — cool fluid character. Each one crops a DIFFERENT part of
  // white-marble.png with a cool hue rotation so they don't read as the
  // same texture as the Air or Earth marbles.
  'Bianco Lasa marble (cool grey-white)':     { src: '/materials/white-marble.png',  tintColor: '#C2CAD2', tintMode: 'soft-light', tintAlpha: 0.7,  filter: 'hue-rotate(-12deg) saturate(0.55) brightness(1.02) contrast(1.06)', zoom: 1.24, objectPosition: '55% 35%' },
  'Smoke quartzite (silver-grey)':            { src: '/materials/tuff.png',          tintColor: '#6F7680', tintMode: 'overlay',    tintAlpha: 0.55, filter: 'brightness(1.06) hue-rotate(-8deg)',                                     zoom: 1.2,  objectPosition: '40% 60%' },
  'Onice Acqua (translucent water-blue onyx)':{ src: '/materials/white-marble.png',  tintColor: '#5897AC', tintMode: 'overlay',    tintAlpha: 0.6,  filter: 'hue-rotate(-18deg) saturate(1.4) contrast(1.22) brightness(1.05)',     zoom: 1.34, objectPosition: '25% 70%' },
  // Sodalite Blue moved from FIRE → WATER: deep cobalt mineral, base-
  // colour logic puts it with the cool/blue palette, not Fire.
  'Sodalite Blue (deep midnight stone)':      { src: '/materials/dark-marble.png',   tintColor: '#1A2C5A', tintAlpha: 0.85, zoom: 1.18, objectPosition: '50% 50%' },
  'Silver travertine (polished)':             { src: '/materials/travertine.png',    tintColor: '#9DA3A8', tintMode: 'overlay',    tintAlpha: 0.55, filter: 'hue-rotate(-10deg) saturate(0.5) brightness(1.06)',                       zoom: 1.16, objectPosition: '65% 25%' },
  // plasters
  'Microcement (continuous)':                 { src: '/materials/microcement.png' },
  'Smooth mineral plaster':                   { src: '/materials/smooth-mineral.png' },
  'Tadelakt (cool pigmented Moroccan)':       { src: '/materials/smooth-mineral.png',filter: 'hue-rotate(180deg) saturate(0.5) brightness(0.98)' },
  // metals
  'Mirror-polished stainless steel':          { src: '/materials/brushed-metal.png', filter: 'brightness(1.15) saturate(0.5) contrast(1.12)' },
  'Hammered metal (rippled)':                 { src: '/materials/brushed-metal.png', filter: 'contrast(1.15)' },
  'Satin chrome':                             { src: '/materials/brushed-metal.png', filter: 'brightness(1.08) saturate(0.7)' },
  'Polished nickel':                          { src: '/materials/brushed-metal.png', filter: 'hue-rotate(180deg) saturate(0.3) brightness(1.02)' },
  // glass
  'Diffused glass':                           { src: '/materials/diffused-glass.png' },
  'Glass blocks (translucent)':               { src: '/materials/diffused-glass.png',filter: 'saturate(1.12) brightness(0.97)' },
  'Curved bent glass':                        { src: '/materials/clear-glass.png',   filter: 'brightness(1.05)' },
  'Reeded / ribbed fluted glass':             { src: '/materials/diffused-glass.png',filter: 'contrast(1.12)' },
  // ceramic
  'Matte ceramic':                            { src: '/materials/matte-ceramic.png' },
  'Glass mosaic tile (10–25 mm cool)':        { src: '/materials/matte-ceramic.png', tintColor: '#3E6068', tintAlpha: 0.65 },
  // textiles
  'Silk satin (champagne / smoke)':           { src: '/materials/wool-textile.png',  filter: 'brightness(1.1) saturate(0.7) contrast(1.05)' },
  'Cream bouclé':                             { src: '/materials/wool-textile.png',  filter: 'brightness(1.22) saturate(0.5)' },
  'Linen / wool textile surfaces':            { src: '/materials/wool-textile.png' },
  'Pale grey wool felt':                      { src: '/materials/wool-textile.png',  filter: 'saturate(0.2) brightness(1.05)' },

  // ── AIR ───────────────────────────────────────────────────────
  // stones — ALL clearly white, but with QUIET veining (less drama than
  // Earth, less cool-cast than Water). Each white-marble.png variant
  // crops a different region so the beads aren't identical swirls.
  //   Thassos        — pure white, near vein-free       (zoom 1.02)
  //   Calacatta      — soft greyish veining             (zoom 1.10)
  //   Bianco Statuario — delicate medium veining        (zoom 1.08)
  //   Calacatta Viola — sole exception: dramatic oxblood vein on white
  //                     body (zoom 1.22) — the drama belongs in the
  //                     veining, not the bead's overall character
  'White marble (Calacatta)':                 { src: '/materials/white-marble.png',  filter: 'contrast(1.06) saturate(0.55) brightness(1.04)', zoom: 1.1,  objectPosition: '50% 50%' },
  'Thassos marble (pure white)':              { src: '/materials/white-marble.png',  filter: 'brightness(1.12) saturate(0.15) contrast(0.92)', zoom: 1.02, objectPosition: '25% 50%' },
  'Dolomite snow-white marble':               { src: '/materials/dolomite-snow.png',                                                             zoom: 1.08 },
  'Bianco Statuario (luminous white)':        { src: '/materials/white-marble.png',  filter: 'brightness(1.06) saturate(0.4) contrast(1.0)',   zoom: 1.08, objectPosition: '75% 50%' },
  // Calacatta Viola moved from FIRE → AIR (white base); overlay tint at
  // low alpha lets the white survive while the oxblood reads as veining.
  'Calacatta Viola (white + oxblood veining)':{ src: '/materials/white-marble.png',  tintColor: '#8E3140', tintMode: 'overlay',    tintAlpha: 0.42, filter: 'contrast(1.22) saturate(1.18) brightness(1.04)', zoom: 1.22, objectPosition: '40% 80%' },
  'White terrazzo':                           { src: '/materials/white-terrazzo.png',                                                          zoom: 1.1 },
  // woods
  'Light oak / ash':                          { src: '/materials/light-oak.png' },
  'Bleached birch':                           { src: '/materials/bleached-birch.png' },
  // plasters
  'Limewash (bright)':                        { src: '/materials/limewash.png' },
  'White mineral plaster':                    { src: '/materials/white-plaster.png' },
  // concrete
  'Pale concrete (smooth)':                   { src: '/materials/pale-concrete.png' },
  // metals
  'Metallic silver surface':                  { src: '/materials/brushed-metal.png', filter: 'brightness(1.12)' },
  'Anodized champagne aluminium':             { src: '/materials/brushed-metal.png', filter: 'hue-rotate(-30deg) saturate(1.3) brightness(1.05)' },
  // glass
  'Clear glass (low-iron)':                   { src: '/materials/clear-glass.png' },
  'Dichroic / iridescent glass':              { src: '/materials/clear-glass.png',   tintColor: '#A464E5', tintMode: 'overlay', tintAlpha: 0.55 },
  'Tinted translucent glass':                 { src: '/materials/clear-glass.png',   tintColor: '#8E6694', tintAlpha: 0.55 },
  'Frosted satin glass':                      { src: '/materials/diffused-glass.png',filter: 'brightness(1.08)' },
  // composites
  'White Corian (curved seamless)':           { src: '/materials/white-plaster.png', filter: 'brightness(1.08) saturate(0.45) contrast(1.05)' },
  'Fluted white panel':                       { src: '/materials/white-plaster.png', filter: 'contrast(1.08)' },
  '3D textured white panel':                  { src: '/materials/white-plaster.png', filter: 'contrast(1.1) saturate(0.6)' },
  // textiles
  'Sheer linen voile drapery':                { src: '/materials/wool-textile.png',  filter: 'brightness(1.2) saturate(0.4)' },
  'Iridescent satin / lurex':                 { src: '/materials/wool-textile.png',  tintColor: '#B0AAC8', tintMode: 'overlay', tintAlpha: 0.6 },

  // ── SHARED ────────────────────────────────────────────────────
  'Textured concrete (matte)':                { src: '/materials/textured-concrete.png' },
  'Brushed metal':                            { src: '/materials/brushed-metal.png' },
  'Solid oak':                                { src: '/materials/solid-oak.png' },
  'Walnut (natural finish)':                  { src: '/materials/walnut.png' },
};

/** `label → PNG URL`. Every canonical material has an entry. */
export const MATERIAL_SPHERE_IMAGES: Record<string, string> = Object.fromEntries(
  Object.entries(MAT_TEXTURE_SPEC).map(([k, v]) => [k, v.src]),
);

/**
 * `label → CSS filter` for materials that reuse a shared base PNG. Apply on
 * the texture <img>. Returns `undefined` when no filter is required (the
 * base PNG already matches the material).
 */
export const MATERIAL_TEXTURE_FILTER: Record<string, string | undefined> = Object.fromEntries(
  Object.entries(MAT_TEXTURE_SPEC).map(([k, v]) => [k, v.filter]),
);

/** Per-label colour overlay spec for materials whose target colour is too
 *  far from the base PNG for `filter` alone — applied as an absolutely
 *  positioned div with `mix-blend-mode` on top of the texture <img>. */
export interface MaterialTintOverlay {
  color: string;
  mode: 'color' | 'multiply' | 'overlay' | 'soft-light';
  alpha: number;
}

export const MATERIAL_TEXTURE_TINT: Record<string, MaterialTintOverlay | undefined> = Object.fromEntries(
  Object.entries(MAT_TEXTURE_SPEC).map(([k, v]) => [
    k,
    v.tintColor
      ? { color: v.tintColor, mode: v.tintMode ?? 'color', alpha: v.tintAlpha ?? 0.85 }
      : undefined,
  ]),
);

/**
 * Per-material crop + zoom for the texture <img>. Used by CoreDiagram so two
 * materials sharing the same base PNG (e.g. white-marble.png across Calacatta /
 * Thassos / Bianco Statuario / Bianco Lasa / Onice Acqua / Cipollino) don't
 * render the identical veining swirl on every bead — the user explicitly
 * called this out as "same texture across elements" and asked for visual
 * distinction per element (Earth = heavy veining, Air = clean / quiet,
 * Water = cool fluid character).
 */
export interface MaterialTextureTransform {
  objectPosition: string;
  zoom: number;
}

export const MATERIAL_TEXTURE_TRANSFORM: Record<string, MaterialTextureTransform> = Object.fromEntries(
  Object.entries(MAT_TEXTURE_SPEC).map(([k, v]) => [
    k,
    { objectPosition: v.objectPosition ?? 'center', zoom: v.zoom ?? 1.14 },
  ]),
);

/**
 * Single-shot helper for ad-hoc thumbnail lookups. Returns the local PNG URL
 * if one exists for the label, otherwise an empty string.
 */
export const getMaterialThumbnail = (label: string): string =>
  MATERIAL_SPHERE_IMAGES[label] || '';

// Canonical Materials by group (for layer selection panel)
export const CANONICAL_MATERIALS: Record<Element | 'shared', string[]> = CANONICAL_MATERIAL_GROUPS;

// Canonical Atmosphere keywords by element (for layer selection panel)
export const CANONICAL_ATMOSPHERE: Record<Element | 'shared', string[]> = CANONICAL_ADJECTIVE_GROUPS;

// ── Visual calibration: 3 image variants per question, randomized each session ──

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// All survey imagery is now served locally from /public/survey-photos/ and
// /public/survey-textures/ (generated + curated). External Unsplash hotlinks
// were removed because dead IDs kept falling back to element-tinted gradients.

// ─────────────────────────────────────────────────────────────────────────────
// SHRE SURVEY — WEIGHTED PERCENTAGE SCORING
// ─────────────────────────────────────────────────────────────────────────────
// Every answer's `weights` is a percentage share per element and MUST sum to
// exactly 100. The runtime validator `assertWeightsSumTo100` (below) enforces
// this on module init.
//
// SHRE weighting rule:
//   - Primary element:   60–100 (the element the answer maps to)
//   - Secondary element: 20–30  (only when the answer is genuinely two-toned)
//   - Tertiary element:  10     (only when the answer is genuinely three-toned)
//   - Others:            0      (no artificial sprinkling; 0% is allowed)
// ─────────────────────────────────────────────────────────────────────────────

// ── Q1 — LANDSCAPE / NATURE ─────────────────────────────────────────────────
// Local, human-accessible nature photos (generated, served from
// /public/survey-photos/). Six images cover the four elements and rotate
// across the three variants so a session never shows a broken hotlink.
//   earth → desert dunes        fire → volcanic glow / sunset cliffs
//   water → fjord silence       air  → misty peaks / cloud forest
const Q1_VARIANTS: Question[] = [
  {
    id: 'q1', text: 'Which nature calls to you?', subtitle: 'Feel the energy — each landscape holds an element', visual: true,
    options: [
      { text: 'Canyon & clay', weights: { earth: 80, fire: 20 }, image: '/survey-photos/q1-desert-dunes.png' },
      { text: 'Volcanic glow', weights: { fire: 80, earth: 20 }, image: '/survey-photos/q1-volcanic-glow.png' },
      { text: 'Still water',   weights: { water: 80, air: 20 },  image: '/survey-photos/q1-fjord-silence.png' },
      { text: 'Misty peaks',   weights: { air: 80, water: 20 },  image: '/survey-photos/q1-misty-peaks.png' },
    ]
  },
  {
    id: 'q1', text: 'Where does your soul rest?', subtitle: 'Nature reveals your inner element', visual: true,
    options: [
      { text: 'Desert dunes', weights: { earth: 75, air: 25 }, image: '/survey-photos/q1-desert-dunes.png' },
      { text: 'Sunset cliffs', weights: { fire: 70, earth: 30 }, image: '/survey-photos/q1-sunset-cliffs.png' },
      { text: 'Calm fjord', weights: { water: 70, air: 30 }, image: '/survey-photos/q1-fjord-silence.png' },
      { text: 'Cloud forest', weights: { air: 70, water: 20, earth: 10 }, image: '/survey-photos/q1-cloud-forest.png' },
    ]
  },
  {
    id: 'q1', text: 'Which landscape is yours?', subtitle: 'The place that feels like home', visual: true,
    options: [
      { text: 'Ancient forest', weights: { earth: 80, water: 20 }, image: '/survey-photos/q1-cloud-forest.png' },
      { text: 'Volcanic heat',  weights: { fire: 75, air: 25 },    image: '/survey-photos/q1-volcanic-glow.png' },
      { text: 'Fjord silence',  weights: { water: 75, earth: 25 }, image: '/survey-photos/q1-fjord-silence.png' },
      { text: 'Alpine air',     weights: { air: 75, fire: 25 },    image: '/survey-photos/q1-misty-peaks.png' },
    ]
  },
];

// ── Q2 — TEXTURES / MATERIALS ───────────────────────────────────────────────
// Full-bleed macro texture photos served locally from /public/survey-textures/
// (generated high-res material samples — the old Unsplash hotlinks kept dying
// and falling back to element-tinted gradients).
const Q2_VARIANTS: Question[] = [
  {
    id: 'q2', text: 'Which surface do you want to touch?', subtitle: 'The material that resonates with your nature', visual: true,
    options: [
      // Local high-quality macro textures — the previous Unsplash IDs were
      // dead or pointed at wrong subjects (house exterior / colorful render),
      // so the cards fell back to element-tinted gradients.
      { text: 'Natural stone',   weights: { earth: 80, water: 20 }, image: '/survey-textures/natural-stone.png' },
      { text: 'Oxidized metal',  weights: { fire: 70, earth: 30 },  image: '/survey-textures/oxidized-metal.png' },
      { text: 'Dark walnut',     weights: { earth: 80, water: 20 }, image: '/survey-textures/dark-walnut.png' },
      { text: 'White marble',    weights: { air: 70, water: 30 },   image: '/survey-textures/white-marble.png' },
    ]
  },
  {
    id: 'q2', text: 'Which texture speaks to you?', subtitle: 'Close your eyes and feel', visual: true,
    options: [
      { text: 'Raw clay',          weights: { earth: 75, fire: 25 },  image: '/survey-textures/raw-clay.png' },
      { text: 'Brushed copper',    weights: { fire: 75, air: 25 },    image: '/survey-textures/brushed-copper.png' },
      { text: 'Aged oak',          weights: { earth: 70, water: 30 }, image: '/survey-textures/aged-oak.png' },
      { text: 'Polished concrete', weights: { air: 70, earth: 30 },   image: '/survey-textures/polished-concrete.png' },
    ]
  },
  {
    id: 'q2', text: 'What your hands want to feel', subtitle: 'Pick the material palette closest to you', visual: true,
    options: [
      { text: 'Terracotta',   weights: { earth: 70, fire: 30 },  image: '/survey-textures/terracotta.png' },
      { text: 'Black steel',  weights: { fire: 80, water: 20 },  image: '/survey-textures/black-steel.png' },
      { text: 'Smooth wood',  weights: { earth: 70, water: 30 }, image: '/survey-textures/smooth-wood.png' },
      { text: 'Frosted glass',weights: { air: 75, water: 25 },   image: '/survey-textures/frosted-glass.png' },
    ]
  },
];

// ── Q3 — INTERIOR ATMOSPHERE ────────────────────────────────────────────────
// Local interior photos (generated + curated, /public/survey-photos/). Six
// images cover the four elements and rotate across the variants:
//   earth → warm & textured     fire → bold dramatic / dark elegance
//   water → soft fluid / serene comfort   air → bright & open
const Q3_VARIANTS: Question[] = [
  {
    id: 'q3', text: 'Where would you feel at home?', subtitle: 'The interior that speaks your language', visual: true,
    options: [
      { text: 'Warm & textured', weights: { earth: 80, fire: 20 }, image: '/survey-photos/q3-warm-textured.jpg' },
      { text: 'Bold & dramatic', weights: { fire: 80, earth: 20 }, image: '/survey-photos/q3-bold-dramatic.png' },
      { text: 'Soft & fluid', weights: { water: 75, air: 25 }, image: '/survey-photos/q3-soft-fluid-water.png' },
      { text: 'Bright & open', weights: { air: 80, water: 20 }, image: '/survey-photos/q3-bright-open.png' },
    ]
  },
  {
    id: 'q3', text: 'Which room draws you in?', subtitle: 'Imagine spending a day here', visual: true,
    options: [
      { text: 'Rustic retreat', weights: { earth: 75, water: 25 }, image: '/survey-photos/q3-warm-textured.jpg' },
      { text: 'Dark elegance', weights: { fire: 80, water: 20 }, image: '/survey-photos/q3-dark-elegance.png' },
      { text: 'Serene comfort', weights: { water: 80, earth: 20 }, image: '/survey-photos/q3-serene-comfort.jpg' },
      { text: 'Airy loft', weights: { air: 80, fire: 20 }, image: '/survey-photos/q3-bright-open.png' },
    ]
  },
  {
    id: 'q3', text: 'Which space is your sanctuary?', subtitle: 'The atmosphere you crave', visual: true,
    options: [
      { text: 'Earth tones',    weights: { earth: 70, fire: 15, water: 15 }, image: '/survey-photos/q3-warm-textured.jpg' },
      { text: 'Moody contrast', weights: { fire: 75, earth: 25 },            image: '/survey-photos/q3-bold-dramatic.png' },
      { text: 'Calm waters',    weights: { water: 80, air: 20 },             image: '/survey-photos/q3-soft-fluid-water.png' },
      { text: 'Pure light',     weights: { air: 80, earth: 20 },             image: '/survey-photos/q3-bright-open.png' },
    ]
  },
];

// ── Q4 — ARCHITECTURE ───────────────────────────────────────────────────────
// Six distinct, element-true exterior photos (generated + curated) that rotate
// across the two variants — each image now genuinely reads as its element:
//   earth → heavy stone mass / warm stone fortress
//   fire  → warm dramatic corten building at sunset / glowing steel skyline
//   water → flowing curved building mirrored in still water
//   air   → bright glass towers against open sky
const Q4_ARCHITECTURE: Question[] = [
  {
    id: 'q4', text: 'Which form inspires you?', subtitle: 'Architecture as frozen energy', visual: true,
    options: [
      { text: 'Grounded mass', weights: { earth: 80, fire: 20 }, image: '/survey-photos/q4-stone-mass.png' },
      { text: 'Dynamic edge', weights: { fire: 75, air: 25 }, image: '/survey-photos/q4-fire-dramatic.png' },
      { text: 'Organic curve', weights: { water: 80, earth: 20 }, image: '/survey-photos/q4-water-flowing.png' },
      { text: 'Glass & sky', weights: { air: 80, water: 20 }, image: '/survey-photos/q4-glass-sky.jpg' },
    ]
  },
  {
    id: 'q4', text: 'Which building would you enter?', subtitle: 'Structure reveals character', visual: true,
    options: [
      { text: 'Stone fortress', weights: { earth: 80, water: 20 }, image: '/survey-photos/q4-stone-fortress.jpg' },
      { text: 'Steel & fire',   weights: { fire: 80, earth: 20 },  image: '/survey-photos/q4-steel-fire.jpg' },
      { text: 'Flowing form',   weights: { water: 75, air: 25 },   image: '/survey-photos/q4-water-flowing.png' },
      { text: 'Open frame',     weights: { air: 80, fire: 20 },    image: '/survey-photos/q4-glass-sky.jpg' },
    ]
  },
];

// ── Q4 — SEASONS ───────────────────────────────────────────────────────────
// The original `photo-1504300718067-…` (summer) and `photo-1490750967868-…`
// (spring) IDs were dead on Unsplash's CDN — both returned 404 and so the
// summer/spring tiles were rendering as the element-tinted gradient
// fallback. Replaced with verified-live photos that are visually unambiguous
// for each season:
//   summer = warm golden-hour sun / sunset over water
//   spring = cherry blossom / soft meadow flowers
// V1 and V2 use *different* IDs for the same season so the user doesn't see
// the same image twice if both variants ever appear in a single session.
// ── Q4 — SEASONS ────────────────────────────────────────────────────────────
// Each season now uses a genuinely season-accurate local photo (no more "green
// forest as autumn"):
//   autumn → golden foliage forest   summer → warm sunset cliffs / volcanic glow
//   winter → snowy frozen lake        spring → fresh green misty valley
const Q4_SEASONS: Question[] = [
  {
    id: 'q4', text: 'Which season feels like you?', subtitle: 'Your energy has a rhythm', visual: true,
    options: [
      { text: 'Autumn warmth',    weights: { earth: 70, fire: 30 },  image: '/survey-photos/q-autumn-golden.png' },
      { text: 'Summer blaze',     weights: { fire: 80, air: 20 },    image: '/survey-photos/q1-volcanic-glow.png' },
      { text: 'Winter stillness', weights: { water: 80, earth: 20 }, image: '/survey-photos/q-winter-snow.png' },
      { text: 'Spring breeze',    weights: { air: 75, water: 25 },   image: '/survey-photos/q1-misty-peaks.png' },
    ]
  },
  {
    id: 'q4', text: 'Your time of year?', subtitle: 'Seasons mirror elemental energy', visual: true,
    options: [
      { text: 'Golden autumn',  weights: { earth: 75, fire: 25 },  image: '/survey-photos/q-autumn-golden.png' },
      { text: 'Burning summer', weights: { fire: 70, earth: 30 },  image: '/survey-photos/q1-sunset-cliffs.png' },
      { text: 'Deep winter',    weights: { water: 80, air: 20 },   image: '/survey-photos/q-winter-snow.png' },
      { text: 'Fresh spring',   weights: { air: 80, earth: 20 },   image: '/survey-photos/q1-misty-peaks.png' },
    ]
  },
];

// ── Q5 — COLOUR PALETTE ─────────────────────────────────────────────────────
// Final calibration step: 12 solid colour swatches (3 per element) rendered as
// a colour grid. Colour is a strong, direct elemental signal, so this question
// sharpens the final Earth/Fire/Water/Air distribution. Single canonical
// question (no random variant) so index-based scoring is always consistent.
//   EARTH → warm earth tones    FIRE → reds / rust / charcoal
//   WATER → blues / teals       AIR  → whites / pale light tones
const Q5_COLORS: Question = {
  id: 'q5', text: 'Which colours pull you in?', subtitle: 'Pick up to 4 — colour is the most direct read of your element', visual: true,
  options: [
    // EARTH
    { text: 'Terracotta',   weights: { earth: 80, fire: 20 },  color: '#B5532E' },
    { text: 'Warm ochre',   weights: { earth: 100 },           color: '#C7973F' },
    { text: 'Walnut brown', weights: { earth: 100 },           color: '#5E3D29' },
    // FIRE
    { text: 'Oxblood',      weights: { fire: 100 },            color: '#6E1F1A' },
    { text: 'Burnt rust',   weights: { fire: 80, earth: 20 },  color: '#A4521F' },
    { text: 'Charcoal',     weights: { fire: 70, water: 30 },  color: '#2A2724' },
    // WATER
    { text: 'Deep teal',    weights: { water: 100 },           color: '#1E5F6B' },
    { text: 'Slate blue',   weights: { water: 80, air: 20 },   color: '#4A6A86' },
    { text: 'Midnight navy',weights: { water: 100 },           color: '#1B2A4A' },
    // AIR
    { text: 'Soft white',   weights: { air: 100 },             color: '#EFEDE6' },
    { text: 'Pale grey',    weights: { air: 80, water: 20 },   color: '#C9CDD0' },
    { text: 'Sky light',    weights: { air: 80, water: 20 },   color: '#AEC9DE' },
  ],
};

export const generateSurveyQuestions = (): Question[] => {
  const useSeason = Math.random() < 0.4;
  const q4Pool = useSeason ? Q4_SEASONS : Q4_ARCHITECTURE;
  return [pick(Q1_VARIANTS), pick(Q2_VARIANTS), pick(Q3_VARIANTS), pick(q4Pool), Q5_COLORS];
};

export const SHORT_QUESTIONS: Question[] = generateSurveyQuestions();

export const DEEP_QUESTIONS: Question[] = [
  { id: 'dq1', text: 'Does the space embrace entropy or order?', options: [
    { text:'Absolute Order',     weights:{ air: 75, water: 25 } },
    { text:'Controlled Chaos',   weights:{ fire: 100 } },
    { text:'Organic Decay',      weights:{ earth: 100 } },
    { text:'Fluid Adaptation',   weights:{ water: 100 } },
  ] },
  { id: 'dq2', text: 'Is the horizon line visible or obscured?', options: [
    { text:'Infinite/Unbroken',  weights:{ air: 100 } },
    { text:'Framed/Selective',   weights:{ fire: 70, earth: 30 } },
    { text:'Denied/Internal',    weights:{ earth: 100 } },
    { text:'Distorted/Reflected',weights:{ water: 100 } },
  ] },
  { id: 'dq3', text: 'Gravity feels...', options: [
    { text:'Oppressive',         weights:{ earth: 100 } },
    { text:'Non-existent',       weights:{ air: 100 } },
    { text:'Suspended',          weights:{ water: 70, air: 30 } },
    { text:'Dynamic',            weights:{ fire: 100 } },
  ] },
  { id: 'dq4', text: 'Time perception in the space:', options: [
    { text:'Timeless/Static',    weights:{ earth: 75, air: 25 } },
    { text:'Accelerated',        weights:{ fire: 100 } },
    { text:'Cyclical',           weights:{ water: 100 } },
    { text:'Fleeting',           weights:{ air: 100 } },
  ] },
  { id: 'dq5', text: 'Relationship to the ground:', options: [
    { text:'Excavated',          weights:{ earth: 100 } },
    { text:'Hovering',           weights:{ air: 100 } },
    { text:'Anchored',           weights:{ earth: 70, fire: 30 } },
    { text:'Dissolving',         weights:{ water: 75, air: 25 } },
  ] },
  { id: 'dq6', text: 'Temperature sensation:', options: [
    { text:'Cold/Crisp',         weights:{ air: 75, water: 25 } },
    { text:'Humid/Temperate',    weights:{ water: 100 } },
    { text:'Radiant Heat',       weights:{ fire: 100 } },
    { text:'Thermal Mass',       weights:{ earth: 100 } },
  ] },
  { id: 'dq7', text: 'Dominant geometric logic:', options: [
    { text:'Orthogonal/Grid',    weights:{ earth: 70, air: 30 } },
    { text:'Fractal/Jagged',     weights:{ fire: 100 } },
    { text:'Curvilinear',        weights:{ water: 100 } },
    { text:'Amorphous',          weights:{ air: 100 } },
  ] },
  { id: 'dq8', text: 'Light interaction:', options: [
    { text:'Reflection',         weights:{ water: 100 } },
    { text:'Refraction',         weights:{ air: 100 } },
    { text:'Absorption',         weights:{ earth: 100 } },
    { text:'Emission',           weights:{ fire: 100 } },
  ] },
  { id: 'dq9', text: 'Scale relative to human body:', options: [
    { text:'Intimate',           weights:{ earth: 70, water: 30 } },
    { text:'Monumental',         weights:{ fire: 70, air: 30 } },
    { text:'Expansive',          weights:{ air: 100 } },
    { text:'Compressed',         weights:{ earth: 100 } },
  ] },
  { id: 'dq10', text: 'Memory of the space:', options: [
    { text:'A specific image',   weights:{ fire: 100 } },
    { text:'A vague feeling',    weights:{ water: 100 } },
    { text:'A tactile sensation',weights:{ earth: 100 } },
    { text:'A thought',          weights:{ air: 100 } },
  ] },
];

// ─────────────────────────────────────────────────────────────────────────────
// SURVEY VALIDATOR — runs once on module init.
// Asserts every option's weight map sums to EXACTLY 100. The SHRE diagnostic
// engine relies on this invariant: if a single answer is off, the final
// elemental distribution drifts away from 100% and the percentage rounding
// produces nonsense. Throws in dev so the developer sees it instantly;
// silently logs in production so the survey still loads.
// ─────────────────────────────────────────────────────────────────────────────
const assertWeightsSumTo100 = (q: Question): string[] => {
  const errors: string[] = [];
  q.options.forEach((opt, i) => {
    const total = Object.values(opt.weights).reduce((s, v) => s + (v || 0), 0);
    if (total !== 100) {
      errors.push(`Question "${q.text}" option ${i} ("${opt.text}") weights sum to ${total}, expected 100. Got ${JSON.stringify(opt.weights)}.`);
    }
  });
  return errors;
};

const _allSurveyQuestions: Question[] = [
  ...Q1_VARIANTS, ...Q2_VARIANTS, ...Q3_VARIANTS,
  ...Q4_ARCHITECTURE, ...Q4_SEASONS, Q5_COLORS,
  ...DEEP_QUESTIONS,
];
const _surveyValidationErrors = _allSurveyQuestions.flatMap(assertWeightsSumTo100);
if (_surveyValidationErrors.length > 0) {
  const msg = `SHRE survey weight validation failed:\n${_surveyValidationErrors.join('\n')}`;
  if (typeof process !== 'undefined' && (process as any).env && (process as any).env.NODE_ENV === 'production') {
    console.error(msg);
  } else {
    throw new Error(msg);
  }
}

export const COMBINATION_ARTICLES: Record<string, string> = {
  air: 'The logic of suspension and lightness.',
  fire: 'The logic of transformation and energy.',
  water: 'The logic of adaptability and flow.',
  earth: 'The logic of grounding and permanence.'
};

export const PROMPT_BANS = [
  'fire', 'flame', 'fireplace', 'ember', 'spark', 'burning',
  'water', 'wave', 'aquatic', 'pool', 'ocean', 'river',
  'floating', 'levitating', 'flying',
  'cave', 'dirt', 'mud', 'underground',
  'sky', 'cloud', 'smoke'
];

export const ELEMENT_ARCH_TERMS = {
  air: 'translucency, verticality, lightweight structure, glass, ether, suspension, clarity',
  fire: 'contrast, focal point, dynamic geometry, angularity, radiance, warmth, hierarchy',
  water: 'fluidity, continuity, smooth transitions, reflection, rhythm, calmness, surface',
  earth: 'mass, solidity, rough texture, stone, grounding, permanence, shadow, monolithic'
};

export const ADJECTIVES_DB: AdjectiveDef[] = CANONICAL_ADJECTIVES_CATALOG.map((a) => ({
  id: a.id,
  label: a.label,
  element: getPrimaryElementForAdjective(a),
  isShared: a.isShared,
  elementWeights: a.elementWeights,
}));

export const MATERIALS_DB: MaterialDef[] = CANONICAL_MATERIAL_CATALOG.map((m) => ({
  id: m.id,
  name: m.label,
  element: getPrimaryElementForMaterial(m),
  image: getMaterialThumbnail(m.label),
  isShared: m.isShared,
  elementWeights: m.elementWeights,
}));

// Texture site structure: base URL + path per material (e.g. /texture/slug/id). Set base to your site.
export const TEXTURE_SITE_BASE_URL = '';
export const MATERIAL_TEXTURE_PATHS: Record<string, { path: string; imageUrl?: string }> = {
  ...Object.fromEntries(
    CANONICAL_MATERIAL_CATALOG.map((m) => [
      m.id,
      {
        path: `https://ambientcg.com/list?search=${encodeURIComponent(m.label)}`,
        imageUrl: `https://ambientcg.com/list?search=${encodeURIComponent(m.label)}`,
      },
    ])
  ),
};
