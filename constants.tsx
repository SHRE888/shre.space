import { Question, MaterialDef, AdjectiveDef, Element, DiagnosticDimension } from './types';
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
  water: '#2B62A8', // ლურჯი — true blue
  air: '#5CB8D6',   // ცისფერი — sky cyan
};

// Muted tones — distinct but refined, each element clearly identifiable
export const ELEMENT_COLORS_MUTED: Record<Element, string> = {
  earth: '#A89068',
  fire: '#C07A65',
  water: '#5B8FC4',
  air: '#8CC9DC',
};

// Placeholder utility (also used for material thumbnails)
const p = (text: string) =>
  `https://placehold.co/100x100/f4f4f5/52525b?text=${encodeURIComponent(text.replace(' ', '+'))}`;

// Wheel palette derived from element colors
export const WHEEL_PALETTE: Record<Element, { inner: string; middle: string; outer: string; text: string }> = {
  earth: { inner: '#8C6D3F', middle: '#A88C60', outer: '#C8B08A', text: '#1a1a1a' },
  fire:  { inner: '#BF5B3A', middle: '#D08060', outer: '#E0A890', text: '#1a1a1a' },
  water: { inner: '#2B62A8', middle: '#4A82C0', outer: '#7BA8D4', text: '#1a1a1a' },
  air:   { inner: '#5CB8D6', middle: '#82CBE3', outer: '#AEDCEA', text: '#1a1a1a' },
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
  //   Marrón Emperador (Levantina)             — dark reddish-brown, loaded beige veining
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
  'Marrón Emperador (warm brown marble)':     { src: '/materials/dark-marble.png',   tintColor: '#7A3A22', tintMode: 'overlay',    tintAlpha: 0.58, filter: 'sepia(0.55) hue-rotate(-12deg) saturate(1.5) contrast(1.34) brightness(0.88)', zoom: 1.38, objectPosition: '42% 38%' },
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

// ── Visual calibration: several image variants per question, drawn per session ──

// Pure randomness happily serves the same variant twice or three times in a
// row, which makes the test feel static. Remembering the recently shown
// indices per question keeps every retake visibly different.
// Versioned: earlier builds stored a single index per key instead of a list,
// and keyed pools that no longer exist. Rather than migrate that, the version
// suffix simply starts returning visitors on a clean rotation.
const LAST_VARIANT_KEY = 'shre:lastVariant:v2';

/** Recently shown variant indices per question key, most recent first. */
const readLastVariants = (): Record<string, number[]> => {
  try {
    const stored = JSON.parse(localStorage.getItem(LAST_VARIANT_KEY) || '{}') || {};
    return Object.fromEntries(
      Object.entries(stored).map(([k, v]) => [k, Array.isArray(v) ? v.filter((n) => typeof n === 'number') : []]),
    );
  } catch {
    return {};
  }
};

const writeLastVariant = (key: string, recent: number[]) => {
  try {
    localStorage.setItem(LAST_VARIANT_KEY, JSON.stringify({ ...readLastVariants(), [key]: recent }));
  } catch {
    /* storage unavailable — fall back to plain randomness */
  }
};

/** How many recent draws to avoid for a pool of this size. */
const memoryFor = (poolSize: number) => Math.max(1, Math.floor(poolSize / 3));

/**
 * Choose a variant index at random while avoiding the ones most recently
 * shown. Deliberately pure: see `rememberSurveyVariants` for why the result
 * is recorded separately rather than here.
 *
 * Remembering only the single previous pick is not enough once a pool grows.
 * With five variants a plain "not the last one" rule still repeats roughly
 * every fourth retake, which is exactly what a returning visitor notices, so
 * the recent third of the pool is excluded instead.
 */
const pickVariantIndex = (key: string, poolSize: number): number => {
  if (poolSize < 2) return 0;
  const avoid = (readLastVariants()[key] ?? []).slice(0, memoryFor(poolSize));
  const all = Array.from({ length: poolSize }, (_, i) => i);
  const candidates = all.filter((i) => !avoid.includes(i));
  const pool = candidates.length ? candidates : all;
  return pool[Math.floor(Math.random() * pool.length)];
};

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

// ── Q1 — PLACE / THE ENVIRONMENT AROUND YOU ─────────────────────────────────
// Human-scale places a person could actually walk into and feel differently.
//
// Three rules keep this step honest, and all three are easy to break by accident:
//
// 1. No literal element. Lava is not Fire, a lake is not Water, a boulder is
//    not Earth and open sky is not Air — those read as pictures of a thing
//    instead of a place you would stand in, and they make the mapping guessable.
// 2. Equal pull. All four have to be comparably beautiful and comparably
//    dramatic. The moment one option is the spectacular one, the step stops
//    measuring what a person needs and starts measuring which photograph won.
//    An earlier variant was removed for exactly that reason: a glowing lava
//    seam next to a quiet quarry is not a fair choice.
// 3. One clear leader per element, per variant. Most real places carry two
//    elements at once — a cliff house is stone and sea, a salt flat at dusk is
//    heat and mirror — and the weights below say so. But each variant still
//    needs exactly one option that leads on each element, or a person who
//    consistently wants the same thing cannot reliably land on it.
//
// Two earlier variants were deleted outright rather than reworked. They were
// the last generated/stock sets in this step — a mossy forest, a red cliff at
// sunset, a bench by a lake — and they read as wallpaper next to the client's
// own references, which is exactly the "one photograph won" failure rule 2
// warns about. Every option in this pool is now from the client's reference
// batch.
const Q1_VARIANTS: Question[] = [
  {
    id: 'q1', text: 'Which of these would you go out of your way to reach?', subtitle: 'Distance is the honest test of what pulls you', visual: true,
    options: [
      { text: 'Ploughed hills',      weights: { earth: 70, water: 30 }, image: '/survey-photos/q1v3-earth.png' },
      { text: 'A road at last light',weights: { fire: 70, earth: 30 },  image: '/survey-photos/q1v3-fire.png' },
      { text: 'Lagoons in the dunes',weights: { water: 65, air: 35 },   image: '/survey-photos/q1v3-water.png' },
      { text: 'A ridge above cloud', weights: { air: 70, earth: 30 },   image: '/survey-photos/q1v3-air.png' },
    ]
  },
  {
    id: 'q1', text: 'Which horizon could you look at every morning?', subtitle: 'The one you would not get tired of', visual: true,
    options: [
      { text: 'An avenue of trees',  weights: { earth: 70, fire: 30 },  image: '/survey-photos/q1v4-earth.png' },
      { text: 'A burning sky',       weights: { fire: 60, water: 40 },  image: '/survey-photos/q1v4-fire.png' },
      { text: 'Still water on grass',weights: { water: 55, earth: 45 }, image: '/survey-photos/q1v4-water.png' },
      { text: 'Dunes under wide sky',weights: { air: 65, earth: 35 },   image: '/survey-photos/q1v4-air.png' },
    ]
  },
  // A built variant. The layer is the same — the environment you want around
  // you — and all four are a building and its land read as one thing, so the
  // comparison stays fair inside the screen.
  {
    id: 'q1', text: 'Which of these would you want to wake up inside?', subtitle: 'The building and the land it stands in, as one thing', visual: true,
    options: [
      { text: 'Stone above the sea',  weights: { earth: 60, water: 40 }, image: '/survey-photos/q1v5-earth.png' },
      { text: 'Glass in the desert',  weights: { fire: 70, earth: 30 },  image: '/survey-photos/q1v5-fire.png' },
      { text: 'A pool cut in rock',   weights: { water: 70, air: 30 },   image: '/survey-photos/q1v5-water.png' },
      { text: 'A ribbon on the land', weights: { air: 55, earth: 45 },   image: '/survey-photos/q1v5-air.png' },
    ]
  },
  // The quietest set in the pool — nothing here is spectacular, so the choice
  // is made on temperature and openness rather than on drama.
  {
    id: 'q1', text: 'Which of these quiets you down fastest?', subtitle: 'Before you decide anything — where does the noise stop', visual: true,
    options: [
      { text: 'A valley between rock', weights: { earth: 65, air: 35 },  image: '/survey-photos/q1v6-earth.png' },
      { text: 'Hills in raking light', weights: { fire: 55, earth: 45 }, image: '/survey-photos/q1v6-fire.png' },
      { text: 'A river through grass', weights: { water: 55, air: 45 },  image: '/survey-photos/q1v6-water.png' },
      { text: 'A flat that mirrors sky', weights: { air: 60, water: 40 }, image: '/survey-photos/q1v6-air.png' },
    ]
  },
];

// ── Q2 — TEXTURES / MATERIALS ───────────────────────────────────────────────
// Full-bleed macros from /public/survey-textures/. Each variant is Earth →
// Fire → Water → Air, and the four tiles on one screen have to be different
// *kinds* of surface — not four close cousins of the same colour.
//
// The previous set failed that: liquid chrome read as water rather than a
// material, and brushed copper sat next to terracotta clay so Fire and Earth
// were the same warm orange. The twelve client slabs replace that:
//   air   — pale stone (calacatta, green-veined marble, silver grain)
//   fire  — warm metal (hammered copper, molten bronze, gold leaf)
//   water — cool material, never a pool (stainless, sage agate, silver vein)
//   earth — mineral mass (granite, dark grain, red travertine)
// Pairings mix families so a metal never sits next to a metal of the same
// temperature, and an orange stone never sits next to copper.
//
// Captions stay: a macro crop of stone is ambiguous on its own, and naming
// the material is part of the answer rather than a hint about the element.
const Q2_VARIANTS: Question[] = [
  {
    id: 'q2', text: 'Which material would you live with?', subtitle: 'A surface for daily contact', visual: true, showLabels: true,
    options: [
      { text: 'Speckled granite',  weights: { earth: 80, air: 20 },  image: '/survey-textures/q2-earth-granite.png' },
      { text: 'Gold leaf',         weights: { fire: 80, air: 20 },   image: '/survey-textures/q2-fire-gold-leaf.png' },
      { text: 'Brushed stainless', weights: { water: 75, air: 25 },  image: '/survey-textures/q2-water-stainless.png' },
      { text: 'Pale silver grain', weights: { air: 80, earth: 20 },  image: '/survey-textures/q2-air-silver-grain.png' },
    ]
  },
  {
    id: 'q2', text: 'Which texture would you specify?', subtitle: 'The one that belongs in the room', visual: true, showLabels: true,
    options: [
      { text: 'Dark timber grain', weights: { earth: 80, fire: 20 }, image: '/survey-textures/q2-earth-dark-grain.png' },
      { text: 'Hammered copper',   weights: { fire: 80, earth: 20 }, image: '/survey-textures/q2-fire-hammered-copper.png' },
      { text: 'Sage agate',        weights: { water: 70, earth: 30 }, image: '/survey-textures/q2-water-sage-agate.png' },
      { text: 'White marble',      weights: { air: 80, water: 20 },  image: '/survey-textures/q2-air-calacatta.png' },
    ]
  },
  {
    id: 'q2', text: 'Which finish would you keep?', subtitle: 'Choose the material, not the look', visual: true, showLabels: true,
    options: [
      { text: 'Red travertine',  weights: { earth: 75, fire: 25 }, image: '/survey-textures/q2-earth-travertine.png' },
      { text: 'Molten bronze',   weights: { fire: 80, earth: 20 }, image: '/survey-textures/q2-fire-molten-bronze.png' },
      { text: 'Silver vein',     weights: { water: 70, air: 30 },  image: '/survey-textures/q2-water-silver-vein.png' },
      { text: 'Green marble',    weights: { air: 70, earth: 30 },  image: '/survey-textures/q2-air-verde.png' },
    ]
  },
];

// ── Q3 — INTERIOR ATMOSPHERE ────────────────────────────────────────────────
// Built entirely from the client's own reference set (public/survey-photos/int),
// which replaced the previous mix of stock and generated interiors. The set was
// supplied pre-sorted by element, and that sorting is the definition we score
// against — it is the client's own reading of each element in built space:
//
//   fire  (8 refs) — dark envelope lit from within: oxidised copper and corten,
//                    black stone, rust and cognac velvet, concealed warm glow
//   water (8 refs) — surfaces that behave like liquid: mirror and brushed metal,
//                    rippled glass, caustics on a ceiling, deep blue velvet
//   earth (7 refs) — mass and age: rough stone, travertine, green marble, lime
//                    plaster, heavy timber, bouclé and terracotta
//   air  (16 refs) — white-dominant volume and curve: plaster caves, glossy
//                    floors, sheer layers, opal globes, sculptural pastel objects
//
// Eight variants, so the interior step almost never repeats. Each variant is
// grouped by register — living rooms against living rooms, public rooms against
// public rooms — so no tile wins simply by being a grander kind of space.
//
// Weights carry a secondary wherever the reference genuinely holds two elements
// (a corten panel inside warm plaster is not pure Fire), which is what makes the
// dual-element references readable instead of flattened into one score.
//
// Eight air references are held in the folder unused, as spare stock for
// further variants.
const Q3_VARIANTS: Question[] = [
  {
    id: 'q3', text: 'Which of these would you stay in longest?', subtitle: 'Not the one you admire — the one you would not leave', visual: true,
    options: [
      { text: 'Dark, with the garden pressing in', weights: { fire: 75, earth: 25 },  image: '/survey-photos/int/int-fire-2.png' },
      { text: 'Deep blue, low and soft',           weights: { water: 70, earth: 30 }, image: '/survey-photos/int/int-water-2.png' },
      { text: 'Old stone under a high roof',       weights: { earth: 65, water: 35 }, image: '/survey-photos/int/int-earth-3.png' },
      { text: 'White, curved, unfilled',           weights: { air: 80, water: 20 },   image: '/survey-photos/int/int-air-11.png' },
    ]
  },
  {
    id: 'q3', text: 'Which one lets you exhale?', subtitle: 'The first breath tells you more than the second look', visual: true,
    options: [
      { text: 'A copper wall, warm and low', weights: { fire: 70, earth: 30 }, image: '/survey-photos/int/int-fire-3.png' },
      { text: 'Glass that catches the light',weights: { water: 55, air: 45 },  image: '/survey-photos/int/int-water-1.png' },
      { text: 'Plaster, beams, a hearth',    weights: { earth: 70, air: 30 },  image: '/survey-photos/int/int-earth-4.png' },
      { text: 'Pale, tall and quiet',        weights: { air: 70, earth: 30 },  image: '/survey-photos/int/int-air-12.png' },
    ]
  },
  {
    id: 'q3', text: 'Where would you go to be left alone?', subtitle: 'The version of you that no one is watching', visual: true,
    options: [
      { text: 'Concrete and burnished gold', weights: { fire: 60, earth: 40 },  image: '/survey-photos/int/int-fire-4.png' },
      { text: 'A mirrored form on raw floor',weights: { water: 60, earth: 40 }, image: '/survey-photos/int/int-water-5.png' },
      { text: 'Grey mass, green and shade',  weights: { earth: 70, air: 30 },   image: '/survey-photos/int/int-earth-2.png' },
      { text: 'Daylight from every side',    weights: { air: 65, earth: 35 },   image: '/survey-photos/int/int-air-13.png' },
    ]
  },
  {
    id: 'q3', text: 'Which of these would you want to wake up in?', subtitle: 'Morning is honest — it has no audience', visual: true,
    options: [
      { text: 'A rusted panel behind the bed', weights: { fire: 55, earth: 45 },  image: '/survey-photos/int/int-fire-6.png' },
      { text: 'Glass block, light broken up',  weights: { water: 60, earth: 40 }, image: '/survey-photos/int/int-water-8.png' },
      { text: 'Lime plaster and clay tones',   weights: { earth: 65, fire: 35 },  image: '/survey-photos/int/int-earth-7.png' },
      { text: 'A soft white hollow',           weights: { air: 70, water: 30 },   image: '/survey-photos/int/int-air-3.png' },
    ]
  },
  {
    id: 'q3', text: 'Which one would you still want in ten years?', subtitle: 'Attraction fades; recognition does not', visual: true,
    options: [
      { text: 'Black and copper, no daylight', weights: { fire: 70, earth: 30 }, image: '/survey-photos/int/int-fire-1.png' },
      { text: 'Silver surfaces, everything doubled', weights: { water: 65, air: 35 }, image: '/survey-photos/int/int-water-6.png' },
      { text: 'Dark timber against raw stone', weights: { earth: 75, fire: 25 }, image: '/survey-photos/int/int-earth-1.png' },
      { text: 'A white curve turning upward',  weights: { air: 60, water: 40 },  image: '/survey-photos/int/int-air-16.png' },
    ]
  },
  {
    id: 'q3', text: 'Where would a long conversation happen?', subtitle: 'Some spaces make people talk, others make them perform', visual: true,
    options: [
      { text: 'Deep leather, low lamps',      weights: { fire: 60, earth: 40 },  image: '/survey-photos/int/int-fire-8.png' },
      { text: 'A metal wall holding the fire',weights: { water: 60, fire: 40 },  image: '/survey-photos/int/int-water-4.png' },
      { text: 'Walnut and veined stone',      weights: { earth: 70, water: 30 }, image: '/survey-photos/int/int-earth-5.png' },
      { text: 'One oval of sky overhead',     weights: { air: 75, earth: 25 },   image: '/survey-photos/int/int-air-2.png' },
    ]
  },
  {
    id: 'q3', text: 'Which one do you want to walk into right now?', subtitle: 'Answer before you explain it to yourself', visual: true,
    options: [
      { text: 'Rust, brick and black steel', weights: { fire: 60, earth: 40 }, image: '/survey-photos/int/int-fire-7.png' },
      { text: 'Water moving on the ceiling', weights: { water: 70, air: 30 },  image: '/survey-photos/int/int-water-3.png' },
      { text: 'Travertine in late sun',      weights: { earth: 60, fire: 40 }, image: '/survey-photos/int/int-earth-6.png' },
      { text: 'Silver tile and round light', weights: { air: 70, water: 30 },  image: '/survey-photos/int/int-air-1.png' },
    ]
  },
  {
    id: 'q3', text: 'Which of these feels like it was made for you?', subtitle: 'Not the most beautiful — the most yours', visual: true,
    options: [
      { text: 'A glowing wall in a dark room', weights: { fire: 80, earth: 20 },  image: '/survey-photos/int/int-fire-5.png' },
      { text: 'A curved metal shell',          weights: { water: 55, earth: 45 }, image: '/survey-photos/int/int-water-7.png' },
      { text: 'Concrete, plants, warm lamps',  weights: { earth: 70, air: 30 },   image: '/survey-photos/int/int-earth-2.png' },
      { text: 'White stone under a cloud',     weights: { air: 65, water: 35 },   image: '/survey-photos/int/int-air-5.png' },
    ]
  },
];

// ── Q4 — LIGHT / STATE ──────────────────────────────────────────────────────
// This step asks which light a person wants *inside a room*. Every tile is an
// interior (or a threshold looking in). Building exteriors, landscapes and
// seasons belong to other layers and were pulled out: they answer "which
// object" instead of "which light".
//
//   earth → light absorbed by mass; soft dapple, matte surfaces, no glare
//   fire  → light aimed and hard; blades, a saturated glow, high contrast
//   water → light arriving off a surface; caustics, ripple, no fixed edge
//   air   → light diffused evenly; luminous panels, shadow near zero
//
// The two variants mix palettes on purpose so four beige rooms do not sit
// together: a warm dapple next to a sharp colonnade, a grey caustic, a white
// luminous wall.
const Q4_LIGHT: Question[] = [
  {
    id: 'q4', text: 'How should light enter a room?', subtitle: 'The light you live in, not the building you look at', visual: true,
    options: [
      { text: 'Soft dapple on a matt wall', weights: { earth: 70, fire: 30 },  image: '/survey-photos/q4v2-earth.png' },
      { text: 'Hard blades across the floor', weights: { fire: 70, earth: 30 }, image: '/survey-photos/q4v2-fire.png' },
      { text: 'A ripple on concrete',       weights: { water: 60, earth: 40 }, image: '/survey-photos/q4v1-water.png' },
      { text: 'An even luminous wall',      weights: { air: 75, water: 25 },   image: '/survey-photos/q4v1-air.png' },
    ]
  },
  {
    id: 'q4', text: 'Which of these would you want falling into your room?', subtitle: 'Shadow is a material too', visual: true,
    options: [
      { text: 'Absorbed, without glare',  weights: { earth: 60, air: 40 },   image: '/survey-photos/q4v1-earth.png' },
      { text: 'A saturated glow',         weights: { fire: 80, air: 20 },    image: '/survey-photos/q4v1-fire.png' },
      { text: 'Moving, with no edge',     weights: { water: 70, earth: 30 }, image: '/survey-photos/q4v2-water.png' },
      { text: 'Daylight filling the volume', weights: { air: 70, earth: 30 }, image: '/survey-photos/q4v2-air.png' },
    ]
  },
];

// ── Q5 — COLOUR PALETTE ─────────────────────────────────────────────────────
// Final calibration: 12 swatches (3 per element) × 3 palette variants.
//   EARTH → warm earth tones    FIRE → reds / rust / charcoal
//   WATER → blues / teals       AIR  → whites / pale light tones
// Colours are taken from real pigments and building materials (fired clay,
// raw ochre, oxidised copper, basalt, patinated bronze, limewash) rather than
// screen-primaries, and each element's three tones are spread across hue,
// saturation and value so no two swatches in the grid read as the same colour.
const Q5_VARIANTS: Question[] = [
  {
    id: 'q5', text: 'Which colours belong in your space?', subtitle: 'Pick up to 4 — the ones you would still want in ten years', visual: true, showLabels: true,
    options: [
      { text: 'Fired clay',   weights: { earth: 80, fire: 20 },  color: '#9C5B3C' },
      { text: 'Raw ochre',    weights: { earth: 100 },           color: '#C08E37' },
      { text: 'Dark walnut',  weights: { earth: 100 },           color: '#4B3524' },
      { text: 'Oxblood',      weights: { fire: 100 },            color: '#6A1D20' },
      { text: 'Live ember',   weights: { fire: 80, earth: 20 },  color: '#CE5622' },
      { text: 'Charred oak',  weights: { fire: 70, water: 30 },  color: '#2B2624' },
      { text: 'Deep teal',    weights: { water: 100 },           color: '#15616D' },
      { text: 'Slate blue',   weights: { water: 80, air: 20 },   color: '#54718D' },
      { text: 'Midnight ink', weights: { water: 100 },           color: '#14243D' },
      { text: 'Chalk white',  weights: { air: 100 },             color: '#F1EEE5' },
      { text: 'Ash grey',     weights: { air: 80, water: 20 },   color: '#C4C9CB' },
      { text: 'Open sky',     weights: { air: 80, water: 20 },   color: '#A6C4DB' },
    ],
  },
  {
    id: 'q5', text: 'Which tones would you still choose in ten years?', subtitle: 'Pick up to 4 — mood outlasts fashion', visual: true, showLabels: true,
    options: [
      { text: 'Sandstone',    weights: { earth: 80, fire: 20 },  color: '#C3A47A' },
      { text: 'Raw umber',    weights: { earth: 100 },           color: '#6D5843' },
      { text: 'Dry moss',     weights: { earth: 100 },           color: '#7A7C55' },
      { text: 'Old brick',    weights: { fire: 100 },            color: '#8C3A29' },
      { text: 'Hot copper',   weights: { fire: 80, earth: 20 },  color: '#B4661C' },
      { text: 'Basalt',       weights: { fire: 70, water: 30 },  color: '#34302D' },
      { text: 'Lagoon',       weights: { water: 100 },           color: '#1D7876' },
      { text: 'Steel blue',   weights: { water: 80, air: 20 },   color: '#496A87' },
      { text: 'Deep abyss',   weights: { water: 100 },           color: '#122A43' },
      { text: 'Limewash',     weights: { air: 100 },             color: '#F3F1EA' },
      { text: 'Pale linen',   weights: { air: 80, water: 20 },   color: '#CDCEC7' },
      { text: 'Frost',        weights: { air: 80, water: 20 },   color: '#BCD5E3' },
    ],
  },
  {
    id: 'q5', text: 'Which colours would you live with every day?', subtitle: 'Pick up to 4 — let colour finish the reading', visual: true, showLabels: true,
    options: [
      { text: 'Cinnamon',     weights: { earth: 80, fire: 20 },  color: '#A0653A' },
      { text: 'Wheat',        weights: { earth: 100 },           color: '#CBB27E' },
      { text: 'Espresso',     weights: { earth: 100 },           color: '#41301F' },
      { text: 'Madder red',   weights: { fire: 100 },            color: '#7C2325' },
      { text: 'Burnt orange', weights: { fire: 80, earth: 20 },  color: '#C05A27' },
      { text: 'Graphite',     weights: { fire: 70, water: 30 },  color: '#2C2C2E' },
      { text: 'Petrol green', weights: { water: 100 },           color: '#13565D' },
      { text: 'Dusk blue',    weights: { water: 80, air: 20 },   color: '#3E5B7C' },
      { text: 'Marine',       weights: { water: 100 },           color: '#0E2440' },
      { text: 'Bone ivory',   weights: { air: 100 },             color: '#EFEBDF' },
      { text: 'Cool silver',  weights: { air: 80, water: 20 },   color: '#BEC3C6' },
      { text: 'Glacier',      weights: { air: 80, water: 20 },   color: '#D3E3EE' },
    ],
  },
  // A sixteen-swatch, four-per-element set in a noticeably softer register than
  // the three above: chalky, greyed-off pigments rather than saturated ones.
  // Each element gets one pure tone, two at 70 and one at 60, so no element is
  // easier to score highly on than another when four swatches are picked.
  {
    id: 'q5', text: 'Which of these could you live inside for years?', subtitle: 'Pick up to 4 — the ones that would not tire you', visual: true, showLabels: true,
    options: [
      { text: 'Peat',         weights: { earth: 100 },           color: '#7B6B5C' },
      { text: 'Mushroom',     weights: { earth: 70, air: 30 },   color: '#B6A895' },
      { text: 'Dry olive',    weights: { earth: 70, air: 30 },   color: '#6F7255' },
      { text: 'Graphite',     weights: { earth: 60, fire: 40 },  color: '#50504F' },
      { text: 'Deep madder',  weights: { fire: 100 },            color: '#7A3239' },
      { text: 'Clay rose',    weights: { fire: 70, earth: 30 },  color: '#BC7561' },
      { text: 'Amber ochre',  weights: { fire: 70, earth: 30 },  color: '#D3A358' },
      { text: 'Pollen',       weights: { fire: 60, air: 40 },    color: '#F1CE8F' },
      { text: 'Indigo denim', weights: { water: 100 },           color: '#43678E' },
      { text: 'Duck egg',     weights: { water: 70, air: 30 },   color: '#B0CCC9' },
      { text: 'Dusty plum',   weights: { water: 70, earth: 30 }, color: '#7F7287' },
      { text: 'Sea mist',     weights: { water: 60, air: 40 },   color: '#A9C3CF' },
      { text: 'Eggshell',     weights: { air: 100 },             color: '#EBE6D9' },
      { text: 'Raw oat',      weights: { air: 70, earth: 30 },   color: '#DDD4C0' },
      { text: 'Stone grey',   weights: { air: 70, earth: 30 },   color: '#A9A39D' },
      { text: 'Sage ash',     weights: { air: 60, earth: 40 },   color: '#A6A692' },
    ],
  },
];

/**
 * Every variant is authored in canonical Earth → Fire → Water → Air order so
 * the source stays reviewable, but presenting it that way makes the test
 * readable: the top-left tile is always Earth, the grid teaches its own key
 * after one round, and a habitual "first option" tapper is scored as Earth.
 * Shuffling at draw time keeps the authoring order and removes the tell.
 */
const shuffleOptions = (question: Question): Question => {
  const options = [...question.options];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return { ...question, options };
};

/**
 * THE QUESTION BANK
 *
 * The test is no longer a fixed chain of five slots. It is a bank of pools,
 * each pool measuring one latent variable, and an adaptive selector
 * (services/adaptiveDiagnostic.ts) decides at runtime which pool to ask next
 * and which variant inside it best separates the hypotheses in play.
 *
 * The contract this bank owes the engine:
 *
 *   - Every variant inside one entry measures the SAME dimension. Rewording a
 *     question or swapping its photographs is allowed; changing what it scores
 *     is not, because the engine treats two variants of one entry as a repeat
 *     measurement that raises confidence rather than as new evidence.
 *   - `key` is stable and is what the cross-session rotation memory is keyed
 *     on, so renaming it resets which references a returning visitor sees.
 *   - Adding a pool here is the only step needed to give the engine a new
 *     layer to probe. Nothing in the engine enumerates dimensions.
 *
 * The layers currently stocked, in the order a person forms an impression:
 *
 *   atmosphere     — the environment they want around them (landscape)
 *   material       — the surface sensation they trust (macro texture)
 *   spatialComfort — the interior they could genuinely live in
 *   contrastFocus  — how light and shadow should behave
 *   tone           — the colour they could keep for years
 */
export interface BankEntry {
  key: string;
  dimension: DiagnosticDimension;
  /** Short neutral word for the progress bar. Never names an element. */
  label: string;
  /** May this pool open a run? The first question sets the tone of the whole
   *  test, so it has to be a fast, instinctive four-tile choice rather than a
   *  considered one. */
  canOpen?: boolean;
  /** Reserve this pool for the closing question. A pool marked this way is
   *  never asked earlier, and once one exists the run always ends on it. */
  closesRun?: boolean;
  variants: Question[];
}

/** Stamp the dimension onto every variant and give each one a unique id.
 *  Ids must be unique across the whole bank: answers are stored per question
 *  id, and the engine is allowed to ask two variants of the same pool in one
 *  session, which would collide on the old shared 'q3'-style ids. */
const registerPool = (
  key: string,
  dimension: DiagnosticDimension,
  label: string,
  variants: Question[],
  options: { canOpen?: boolean; closesRun?: boolean } = {},
): BankEntry => ({
  key,
  dimension,
  label,
  canOpen: options.canOpen ?? false,
  closesRun: options.closesRun ?? false,
  variants: variants.map((q, i) => ({ ...q, id: `${key}#${i}`, dimension })),
});

export const QUESTION_BANK: BankEntry[] = [
  // Any of the three four-tile scene pools can open a run, so the first screen
  // is not always the same one, and it is always a glance rather than a task.
  registerPool('atmosphere', 'atmosphere', 'Place', Q1_VARIANTS, { canOpen: true }),
  registerPool('material', 'material', 'Touch', Q2_VARIANTS, { canOpen: true }),
  registerPool('spatialComfort', 'spatialComfort', 'Room', Q3_VARIANTS, { canOpen: true }),
  // Light reads narrowly and the pool is small — useful as a discriminator
  // mid-run, too pointed to open with.
  registerPool('contrastFocus', 'contrastFocus', 'Light', Q4_LIGHT),
  // Always the closing question. Colour is the one thing here a person is
  // used to having opinions about, so asking it early invites a considered,
  // decorative answer that then colours everything after it. Held to the end,
  // it lands as a summary of a reading already taken from instinct.
  //
  // The placement also settles two practical things: twelve swatches and a
  // Continue button is the slowest screen in the test, and it is the bank's
  // only multi-select, so a run that used it twice would have nowhere to save
  // the second set of picks.
  registerPool('tone', 'tone', 'Tone', Q5_VARIANTS, { closesRun: true }),
];

/** Shuffle a variant's options at draw time, keeping the authoring order in
 *  source. Exported because the engine draws questions, not this module. */
export const drawVariant = (entry: BankEntry, index: number): Question =>
  shuffleOptions(entry.variants[index]);

/** Which pool slot each drawn question came from, for the rotation memory. */
const drawOrigin = new WeakMap<Question, { key: string; index: number; poolSize: number }>();

/** Record a draw so `rememberSurveyVariants` can persist it once the question
 *  has actually been shown. */
export const noteDraw = (question: Question, key: string, index: number, poolSize: number): void => {
  drawOrigin.set(question, { key, index, poolSize });
};

/** Variant indices to avoid for this pool, newest first — the cross-session
 *  memory that stops a returning visitor seeing the same references. */
export const recentVariantsFor = (key: string, poolSize: number): number[] =>
  (readLastVariants()[key] ?? []).slice(0, memoryFor(poolSize));

/**
 * Legacy fixed draw: one variant from every pool, in bank order.
 *
 * The app no longer uses this — the adaptive engine chooses steps one at a
 * time — but the fairness probes still call it to score the pools in
 * isolation, where a fixed one-per-pool sweep is exactly what is wanted.
 */
export const generateSurveyQuestions = (): Question[] =>
  QUESTION_BANK.map((entry) => {
    const index = pickVariantIndex(entry.key, entry.variants.length);
    const question = drawVariant(entry, index);
    noteDraw(question, entry.key, index, entry.variants.length);
    return question;
  });

/**
 * Record which variants were drawn, so the next visit shows different
 * references. Call this once the set is actually on screen.
 *
 * This is deliberately separate from the draw. React runs state initialisers
 * twice in development, so a write inside `generateSurveyQuestions` recorded
 * the second, discarded draw and left the visible one unprotected — which is
 * why the same references kept reappearing on refresh.
 */
export const rememberSurveyVariants = (questions: Question[]): void => {
  questions.forEach((question) => {
    const origin = drawOrigin.get(question);
    if (!origin) return;
    const recent = readLastVariants()[origin.key] ?? [];
    writeLastVariant(
      origin.key,
      [origin.index, ...recent.filter((i) => i !== origin.index)].slice(0, memoryFor(origin.poolSize)),
    );
  });
};

/**
 * A fixed reference set: the first variant of each pool, drawn without touching
 * the rotation memory.
 *
 * This must NOT call generateSurveyQuestions(). Doing so ran a second draw on
 * every page load and wrote it to the rotation memory, so the "don't repeat"
 * rule ended up protecting a throwaway set instead of the one the visitor was
 * actually shown — which is why the same references kept coming back.
 *
 * Scoring reads the persisted question set from the user's state; this constant
 * is only a shape reference and a fallback for states saved before that field
 * existed.
 */
export const SHORT_QUESTIONS: Question[] = QUESTION_BANK.map((entry) => entry.variants[0]);

export const DEEP_QUESTIONS: Question[] = [
  { id: 'dq1', text: 'How ordered should the space feel?', options: [
    { text:'Tight and composed',  weights:{ air: 75, water: 25 } },
    { text:'Alive, a little wild',weights:{ fire: 100 } },
    { text:'Worn and honest',     weights:{ earth: 100 } },
    { text:'Soft and changing',   weights:{ water: 100 } },
  ] },
  { id: 'dq2', text: 'How much of the outside should you see?', options: [
    { text:'An open, unbroken view',  weights:{ air: 100 } },
    { text:'A framed, chosen view',   weights:{ fire: 70, earth: 30 } },
    { text:'Almost none — turned in', weights:{ earth: 100 } },
    { text:'Broken and reflected',    weights:{ water: 100 } },
  ] },
  { id: 'dq3', text: 'How heavy should the space feel?', options: [
    { text:'Heavy, pressing down', weights:{ earth: 100 } },
    { text:'Almost weightless',    weights:{ air: 100 } },
    { text:'Held, as if in water', weights:{ water: 70, air: 30 } },
    { text:'Tense and moving',     weights:{ fire: 100 } },
  ] },
  { id: 'dq4', text: 'How should time feel in the space?', options: [
    { text:'Slow, almost still', weights:{ earth: 75, air: 25 } },
    { text:'Fast and charged',   weights:{ fire: 100 } },
    { text:'Cyclical, returning',weights:{ water: 100 } },
    { text:'Passing quickly',    weights:{ air: 100 } },
  ] },
  { id: 'dq5', text: 'How does the space meet the ground?', options: [
    { text:'Cut into it',      weights:{ earth: 100 } },
    { text:'Lifted above it',  weights:{ air: 100 } },
    { text:'Firmly planted',   weights:{ earth: 70, fire: 30 } },
    { text:'Blurring into it', weights:{ water: 75, air: 25 } },
  ] },
  { id: 'dq6', text: 'What temperature should the space hold?', options: [
    { text:'Cool and crisp',           weights:{ air: 75, water: 25 } },
    { text:'Soft and humid',           weights:{ water: 100 } },
    { text:'Warm, like radiant heat',  weights:{ fire: 100 } },
    { text:'Steady, like thick walls', weights:{ earth: 100 } },
  ] },
  { id: 'dq7', text: 'Which geometry should lead?', options: [
    { text:'Straight lines and grids', weights:{ earth: 70, air: 30 } },
    { text:'Sharp angles and breaks',  weights:{ fire: 100 } },
    { text:'Curves and flow',          weights:{ water: 100 } },
    { text:'Loose, almost formless',   weights:{ air: 100 } },
  ] },
  { id: 'dq8', text: 'How should light behave?', options: [
    { text:'It reflects',              weights:{ water: 100 } },
    { text:'It scatters and refracts', weights:{ air: 100 } },
    { text:'It is absorbed',           weights:{ earth: 100 } },
    { text:'It glows from within',     weights:{ fire: 100 } },
  ] },
  { id: 'dq9', text: 'How large should the space feel against your body?', options: [
    { text:'Intimate, close',     weights:{ earth: 70, water: 30 } },
    { text:'Monumental',          weights:{ fire: 70, air: 30 } },
    { text:'Wide and expansive',  weights:{ air: 100 } },
    { text:'Compressed, enclosing',weights:{ earth: 100 } },
  ] },
  { id: 'dq10', text: 'What would you remember first?', options: [
    { text:'A specific image',    weights:{ fire: 100 } },
    { text:'A vague feeling',     weights:{ water: 100 } },
    { text:'How it felt to touch',weights:{ earth: 100 } },
    { text:'A thought it left',   weights:{ air: 100 } },
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
  ...Q4_LIGHT, ...Q5_VARIANTS,
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
