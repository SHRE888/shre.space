/**
 * SHRE · 4E Universal Generation Prompt — v1.0
 *
 * Single-source-of-truth for the SHRE prompt-body format the user mandated.
 *
 * Spec summary (the user-supplied v1.0 doc):
 *   STEP 1 — Read elements: dominant = highest %, secondary = second.
 *            Ignore elements below 15%.
 *   STEP 2 — Material selection by element:
 *            Dominant  → 2 materials + 1 brand each
 *            Secondary → 1 material + 1 brand
 *            Else      → 1 accent detail only (no brand expected)
 *   STEP 3 — Furniture + lighting: 1 piece each (brand + collection mandatory)
 *   STEP 4 — Atmosphere (3 phrases) + technical (K + light type + finish)
 *            both pulled from the DOMINANT element.
 *   STEP 5 — Assemble in fixed line order. Ending must be the canonical
 *            clean-photograph tail (see SHRE_CLOSING_LINE / V4_REQUIRED_PROMPT_TAIL).
 *
 * Material-priority policy chosen by the user:
 *   USER-WINS — user-selected catalog materials fill the primary/secondary/
 *   accent slots first; SHRE element pools only fill any remaining slots.
 *
 * Banned adjectives (enforced by services/bannedTokens.ts):
 *   modern / elegant / cozy / stylish / beautiful / luxury
 */

import type { Element, MaterialDef, Vector4, Diagnosis, DiagnosisMaterial } from '../types';
import { MATERIAL_PRODUCT_MAP, MATERIAL_SURFACE_AFFINITY } from './promptEngine';
import { getMaterialCategory, type MaterialCategory } from '../materialsCatalog';
import { SHRE_STYLE_DEFINITIONS, SHRE_PALETTE_DEFINITIONS } from './shreDiagnosis';

// ════════════════════════════════════════════════════════════
// STEP 2 — element → material list
// ════════════════════════════════════════════════════════════

export interface SHREMaterialSpec {
  /** Short readable name as it appears in the SHRE prompt body, e.g.
   *  "oxidized copper panel", "nero marquina", "smoked walnut". */
  label: string;
  /** Brand or fabrication string — "Margraf", "Dinesen / Listone Giordano",
   *  "custom fabrication", "Ideal Work", etc. */
  brand: string;
  /** Architectural application — "floor and paneling", "feature wall full
   *  height", "bar counter monolithic", "hardware and detail". Keep it
   *  short — the prompt builder concatenates label + brand + application
   *  on a single line. */
  application: string;
  /** Surface family used by the stone-cap policy. The user mandated at
   *  most TWO stone surfaces visible per render so the room doesn't read
   *  as a "marble box" — once two stone slots are filled, the remaining
   *  slots must fall back to non-stone families (wood / plaster / metal
   *  / glass / textile / composite) regardless of user picks. */
  category: MaterialCategory;
}

/**
 * IMPORTANT — application strings are SCOPED to honest surfaces only.
 *
 * Stone, wood, microcement and large-panel materials are written with
 * explicit "(never ceiling, never wrap whole room)" qualifiers because
 * the image model otherwise reads "wall and floor" as a license to clad
 * every surface — the bug visible in the user feedback (white marble
 * ceiling). Each material owns ONE primary surface family in the prompt
 * so the rendered room reads as a real interior with multiple materials,
 * not a single-material wrap.
 */
// SHRE v2 elemental material rosters — aligned with the user-mandated
// "Elemental Material Mapping" spec. Each entry has a per-surface honesty
// qualifier (never ceiling / never wrap whole room / etc.) because the
// image model otherwise reads "wall + floor" as a license to clad every
// surface — the classic "marble box" failure mode. Non-stone families are
// listed FIRST so the generation-index cycle picks them early and the
// stone cap rarely has to be force-applied.
//
// Brand attributions follow the SHRE catalog convention: a single
// recognisable maker (Dinesen, Margraf, Matteo Brioni, Ideal Work,
// Antolini…) so the image model treats each material as a real specifiable
// product, not a stock-photo texture.
export const SHRE_ELEMENT_MATERIALS: Record<Element, SHREMaterialSpec[]> = {
  // EARTH — grounded, tactile, monolithic, mineral, restrained warmth.
  // Materials read as thermal mass and time-layered weight: stone, raw
  // wood, clay plaster, oxidized warm metal, structural concrete.
  earth: [
    { label: 'raw oak',                brand: 'Dinesen',              application: 'wide-plank floor and selective wall paneling (never ceiling)',                    category: 'wood' },
    { label: 'aged walnut',            brand: 'Listone Giordano',     application: 'floor planks and joinery (never wall or ceiling cladding)',                       category: 'wood' },
    { label: 'clay plaster',           brand: 'Matteo Brioni',        application: 'wall finish on perimeter walls (never floor)',                                    category: 'plaster' },
    { label: 'limewash plaster',       brand: 'Pure & Original',      application: 'wall and ceiling finish, breathable matte body (never feature)',                  category: 'plaster' },
    { label: 'textured concrete',      brand: 'Ideal Work',           application: 'floor slab and structural columns (ceiling stays plaster)',                       category: 'concrete' },
    { label: 'weathered bronze',       brand: 'custom fabrication',   application: 'hardware, frames, joinery edges only (small surface area, never wall)',           category: 'metal' },
    { label: 'travertine',             brand: 'Margraf / Salvatori',  application: 'floor slab and single feature wall (never ceiling, never wrap whole room)',       category: 'stone' },
    { label: 'limestone',              brand: 'Jura Stone',           application: 'floor slab and bar / counter face (never ceiling)',                               category: 'stone' },
  ],
  // FIRE — cinematic, intense, oxidized, dramatic restraint, focused
  // contrast, activated shadow. Dark woods, dark stones, oxidized and
  // burnished metals, dark lacquer cabinetry — never literal flames.
  fire: [
    { label: 'oxidized steel',         brand: 'custom fabrication',   application: 'single feature wall full height or fireplace surround (never ceiling, never floor)', category: 'metal' },
    { label: 'brushed bronze',         brand: 'custom fabrication',   application: 'cabinetry edges, hardware, light fixture trim (small surface area)',               category: 'metal' },
    { label: 'copper patina',          brand: 'custom fabrication',   application: 'single accent feature panel or backsplash (never wall envelope)',                 category: 'metal' },
    { label: 'smoked oak',             brand: 'Listone Giordano',     application: 'floor planks and joinery fronts (never wall or ceiling)',                          category: 'wood' },
    { label: 'blackened steel',        brand: 'custom fabrication',   application: 'window mullions, screen frames, door surrounds (frame elements only)',             category: 'metal' },
    { label: 'dark lacquer',           brand: 'custom millwork',      application: 'cabinetry fronts and joinery (never wall cladding)',                               category: 'composite' },
    { label: 'dark marble',            brand: 'Margraf · Nero Marquina', application: 'bar counter front and one accent wall (never ceiling)',                         category: 'stone' },
    { label: 'burnt metal',            brand: 'custom fabrication',   application: 'screen panels, single feature insert (never large clad surface)',                  category: 'metal' },
  ],
  // WATER — reflective, fluid, seamless, emotionally soft, continuous,
  // immersive. Mirror and satin metals, polished stone, smoked / mirrored
  // glass, resinous and reflective plaster finishes.
  water: [
    { label: 'satin stainless steel',  brand: 'custom fabrication',   application: 'bar counter front and one accent column or kitchen volume (never ceiling)',       category: 'metal' },
    { label: 'mirrored glass',         brand: 'AGC',                  application: 'single feature wall insert or cabinet fronts (never wall envelope, never ceiling)', category: 'glass' },
    { label: 'smoked glass',           brand: 'AGC Lacobel',          application: 'partition panels and cabinet fronts (never wall cladding)',                       category: 'glass' },
    { label: 'reflective plaster',     brand: 'Stucco Veneziano',     application: 'feature wall finish with subtle sheen (never floor)',                              category: 'plaster' },
    { label: 'resin floor',            brand: 'Senso Gietvloeren',    application: 'seamless poured floor only (never wall or ceiling)',                               category: 'composite' },
    { label: 'polished quartzite',     brand: 'Antolini',             application: 'kitchen counter and one feature surface (never ceiling)',                          category: 'stone' },
    { label: 'liquid metal finish',    brand: 'custom fabrication',   application: 'single sculptural element or feature niche (small surface area)',                  category: 'metal' },
    { label: 'satin aluminum',         brand: 'custom fabrication',   application: 'door frames, hardware, fixture housings (small surface area only)',               category: 'metal' },
  ],
  // AIR — luminous, breathable, translucent, minimal, visually silent,
  // open. Frosted / ribbed / iridescent glass, pale lacquers, thin
  // aluminum profiles, light microcement, soft resin.
  air: [
    { label: 'frosted glass',          brand: 'AGC / custom',         application: 'partition panels and facade fins (never wall envelope cladding)',                  category: 'glass' },
    { label: 'translucent acrylic',    brand: 'custom fabrication',   application: 'screen panel or single backlit feature (never wall envelope)',                    category: 'composite' },
    { label: 'ribbed glass',           brand: 'AGC',                  application: 'partition fins and feature niche fronts (never wall cladding)',                   category: 'glass' },
    { label: 'pale lacquer',           brand: 'custom millwork',      application: 'cabinetry fronts and joinery in soft chalk-white (never wall cladding)',           category: 'composite' },
    { label: 'soft resin',             brand: 'Senso Gietvloeren',    application: 'seamless poured floor in pale tone only (never wall or ceiling)',                  category: 'composite' },
    { label: 'thin aluminum profile',  brand: 'custom fabrication',   application: 'window mullions, screen frames, louvres (frame elements only)',                    category: 'metal' },
    { label: 'light microcement',      brand: 'Topciment',            application: 'floor and lower wall in pale tone (never ceiling)',                                category: 'plaster' },
    { label: 'iridescent panels',      brand: 'custom dichroic film', application: 'single screen or partition insert (small accent surface, never wall envelope)',    category: 'glass' },
  ],
};

// ════════════════════════════════════════════════════════════
// STEP 3 — furniture + lighting (brand + model + collection)
// ════════════════════════════════════════════════════════════
//
// PREMIUM BRAND + MODEL ENGINE — these rosters are the authoritative
// elemental furniture/lighting catalogs the prompt body draws from.
// Every entry is a real, currently-produced designer piece by a maker
// the image model recognises, so the rendered space reads as a real
// specification, not a generic mood-board. Lifting from these lists is
// MANDATORY — the prompt builder never invents brand or model names.
//
// BRAND DISTRIBUTION QUOTA (enforced by buildSHREPromptBody):
//   primary element   → 2-3 furniture + lighting references
//   secondary element → 1-2 references
//   tertiary element  → 0-1 reference
//   weak / absent     → no references

export const SHRE_FURNITURE_BY_ELEMENT: Record<Element, string[]> = {
  earth: [
    'Minotti Lawrence sofa',
    'Minotti Aston sofa',
    'Baxter Chester Moon sofa',
    'B&B Italia Maxalto lounge series',
    'Tacchini Sesann sofa',
    'Poliform Tribeca sofa',
    'Molteni&C 7th sofa',
  ],
  fire: [
    'Baxter Nausicaa cognac leather sofa',
    'Baxter Viktor armchair',
    'Baxter Tactile sofa',
    'B&B Italia Papilio armchair',
    'Molteni&C D.154.2 armchair',
    'Tacchini Cosmic seating',
  ],
  water: [
    'Living Divani Extra Wall sofa',
    'Living Divani Rolf sofa',
    'B&B Italia Camaleonda modular sofa',
    'Baxter Aura sofa',
    'Tacchini Julep sofa',
    'Poliform Mad Chair',
  ],
  air: [
    'Living Divani Extrasoft sofa',
    'Living Divani Hip sofa',
    'Poliform Mondrian sofa',
    'Molteni&C Gliss wardrobe system',
    'Minotti Tape modular sofa',
    'B&B Italia Metropolitan armchair',
  ],
};

export const SHRE_LIGHTING_BY_ELEMENT: Record<Element, string[]> = {
  earth: [
    'Bocci 14 pendant cluster',
    'Bocci 73 pendant cluster',
    'Vibia Warm pendant',
    'Vibia Puck pendant',
    'Apparatus Cane brass pendant',
    'Flos Tatou table lamp',
    'Davide Groppi Tetatet table lamp',
  ],
  fire: [
    'Bocci 84 chandelier',
    'Bocci 73 pendant cluster',
    'Apparatus Tube linear pendant',
    'Apparatus Cane brass pendant cluster',
    'Flos 265 wall lamp',
    'Michael Anastassiades Brass Architectural Collection pendant',
  ],
  water: [
    'Bocci 57 pendant cluster',
    'Bocci 14 pendant cluster',
    'Brokis Mona pendant',
    'Brokis Balloons pendant',
    'Davide Groppi Nulla recessed light',
    'Vibia Match pendant',
    'Flos Aim pendant',
  ],
  air: [
    'Flos Coordinates ceiling system',
    'Flos String pendant',
    'Flos Noctambule pendant',
    'Davide Groppi Infinito linear light',
    'Davide Groppi Mite floor lamp',
    'Michael Anastassiades Mobile Chandelier',
    'Michael Anastassiades Pipe wall lamp',
    'Vibia Lin linear pendant',
    'Brokis Puro tube pendant',
    'Bocci 22 pendant cluster',
  ],
};

// ════════════════════════════════════════════════════════════
// STEP 4 — atmosphere + technical (3 phrases + K range + light type + finish)
// ════════════════════════════════════════════════════════════
//
// ELEMENTAL ATMOSPHERE LOCKS — the keyword set per element that the prompt
// body emits verbatim. These are NOT mood descriptions, they are control
// vectors: the image model treats them as compositional / lighting / surface
// instructions tied to the dominant element. Order is meaningful — the
// first phrase carries the strongest weight in image-prompt sequencing.

export const SHRE_ATMOSPHERE_BY_ELEMENT: Record<Element, string[]> = {
  earth: ['grounded', 'tactile', 'monolithic', 'mineral', 'restrained warmth', 'structural calm'],
  fire:  ['cinematic', 'intense', 'oxidized', 'dramatic restraint', 'focused contrast', 'activated shadow'],
  water: ['reflective', 'fluid', 'seamless', 'emotionally soft', 'continuous', 'immersive'],
  air:   ['luminous', 'breathable', 'translucent', 'minimal', 'visually silent', 'open'],
};

export interface SHRETechnical {
  /** Single K value picked from the catalog range — the prompt body needs
   *  a concrete number (the spec example writes "2800K", not "2700-3200K"). */
  kelvin: number;
  /** Light-type descriptor (matte / spot / diffuse / indirect) plus a short
   *  qualifier — appears immediately after the K value in the prompt. */
  lightType: string;
  /** Surface-finish directive on its own line — describes how light meets
   *  matter on the dominant material surfaces. */
  surfaceFinish: string;
}

export const SHRE_TECHNICAL_BY_ELEMENT: Record<Element, SHRETechnical> = {
  earth: { kelvin: 2900, lightType: 'matte downlight with deep shadows',        surfaceFinish: 'matte tactile base with raw grain and visible texture' },
  fire:  { kelvin: 2800, lightType: 'spot lighting with high contrast',          surfaceFinish: 'matte base with selective metallic reflection' },
  water: { kelvin: 4000, lightType: 'diffuse reflective light',                  surfaceFinish: 'polished base with fluid mirrored reflections' },
  air:   { kelvin: 3600, lightType: 'indirect ambient daylight, open spacing',   surfaceFinish: 'matte pale base with weightless open volumes' },
};

// ════════════════════════════════════════════════════════════
// LIFE & DAYLIGHT — element-tied daylight quality
// ════════════════════════════════════════════════════════════

/**
 * Daylight quality keyed to the DOMINANT element. The LIFE & DAYLIGHT
 * preamble block uses this to make natural daylight match the dominant
 * element's emotional register — warm afternoon for earth, golden hour
 * for fire, cool diffused for water, bright morning for air. This is
 * what the user calls the "joy + gravitas" axis the prompt was missing.
 */
export const ELEMENT_DAYLIGHT_QUALITY: Record<Element, string> = {
  earth: 'warm afternoon daylight entering low through a tall side window, long horizontal shadows raking across the floor, honey-amber warmth on raw materials — calm gravitas, not flat',
  fire:  'late afternoon golden-hour daylight in dramatic warm shafts through tall windows or shutters, deep chiaroscuro between sunlit and shadow zones — cinematic but clearly daytime, clean air with no visible floating particles',
  water: 'cool diffused daylight from a tall full-height window or curtain wall, gentle caustic reflections on polished surfaces, soft blue-grey luminance with warmth at human level — emotionally soft, not cold',
  air:   'bright clear morning daylight through large clear-glass windows, sky at the top of frame, even diffuse ambient with smooth tonal gradation — breathable silence, immaculate clean air, no dust specks or floating dots',
};

/**
 * Per-room atmosphere refinement — tells the image model how this specific
 * space type should FEEL beyond elemental locks. Prevents a bar from reading
 * as a living room or a bedroom from reading as a lobby.
 */
export const ROOM_ATMOSPHERE_REFINEMENT: Record<string, string> = {
  'Living Room': 'domestic conversation zone — layered textiles, art on walls, personal objects, warm pools of light at seating height, intimate not staged',
  'Bedroom': 'private restful sanctuary — soft bedding layers, low glare, bedside warmth, calm enclosure, no task lighting harshness',
  'Kitchen': 'working kitchen with visible prep life — task light on counters, steam or ingredients, lived-in open-plan connection to dining if visible',
  'Bathroom': 'architecturally believable wet/dry bathroom — glass shower screen, integrated vanity lighting, folded towels, stone or brass surfaces, optional built-in hearth when Fire is active — NO curtains anywhere (including mirror reflections), NO spa fantasy, NO indoor trees',
  'Dining': 'gathering table as focal point — set table, pendant pool over plates, convivial warmth, circulation for chairs pulled back',
  'Study': 'focused literary calm — desk lamp pool, book stacks, leather and wood gravitas, minimal distraction',
  'Office': 'professional focus — monitor glow, paper trays, acoustic calm, daylight without glare, credible corporate scale',
  'Bar': 'evening-ready hospitality rail — back-bar glow, bottles catching light, stools with knee space, moody but legible service zone',
  'Restaurant': 'service theatre — multiple table pools, banquettes, candles, wine on tables, bustle implied without crowd clutter',
  'Cafe': 'morning coffee ritual — barista steam, pastry case glow, chalkboard warmth, indie-creative not chain-fast-food',
  'Coffee Shop': 'third-wave craft — hand-brew station visible, ceramic cups, plants, window-counter light, specialty culture not residential lounge',
  'Lobby': 'arrival gravitas — reception focal, vertical volume, feature light, luggage and flowers, institutional calm',
  'Lounge': 'social intimacy — multiple seating pools, low tables, cocktail traces, evening warmth without darkness',
  'Guest Room': 'hotel quiet luxury — crisp linens, minibar tray, desk lamp, luggage hint, five-star restraint',
  'Meeting Room': 'collaborative clarity — table symmetry, screen wall, even acoustic light, professional not domestic',
  'Coworking': 'creative community — hot desks, plants, phone pods, coffee corner, flexible zones',
  'Shop': 'retail focus — product lit at eye level, clear path to checkout, display discipline not residential clutter',
  'Wine Room': 'cellar intimacy — bottle wall glow, tasting counter, subdued warmth, cool depth',
  'Restroom': 'on-brand guest WC — statement mirror, quality tile, soft accent light',
  'Reception': 'first impression — branded desk, waiting calm, directional clarity',
  'Hallway': 'transit calm — rhythm of light, one feature material, no furniture blocking path',
  'Terrace': 'outdoor dining or lounge — weather furniture, planters, view orientation, golden outdoor light',
  'Kids Room': 'playful order — soft color through materials not paint chaos, low-scale furniture, gentle daylight',
  'Balcony': 'outdoor pause — planters, small table setting, sky and railing, morning or golden light',
  'VIP Lounge': 'exclusive hush — velvet/brass pools, low lamp light, decanter trace, private scale',
  'Exhibition': 'gallery silence — even wall wash, art spacing, bench mid-room, reverent light',
  'Counter': 'service efficiency — POS, cup stacks, queue strip clear, warm counter glow',
  'Seating': 'waiting or dining micro-zone — set tables, menu, candle, calm circulation',
  'Entrance': 'threshold transition — console, mirror, coat hints, welcoming light pool',
  'Laundry': 'domestic utility — folded linens, clean order, soft overhead, tactile materials',
};

/**
 * Calibrated atmosphere paragraph — merges elemental locks, room typology,
 * user adjectives, and the active daylight scenario into one directive the
 * image model treats as the emotional target for the frame.
 */
export function buildAtmosphereCalibrationBlock(args: {
  primary: Element;
  secondary: Element | null;
  activeDist: Vector4;
  roomLabel: string;
  roomAtmosphereHint?: string;
  userAdjectives: string[];
  lightTime: string;
  lightDesc: string;
}): string {
  const { primary, secondary, activeDist, roomLabel, roomAtmosphereHint, userAdjectives, lightTime, lightDesc } = args;
  const primaryLock = SHRE_ATMOSPHERE_BY_ELEMENT[primary].slice(0, 4).join(', ');
  const secondaryLock = secondary && activeDist[secondary] >= 15
    ? SHRE_ATMOSPHERE_BY_ELEMENT[secondary].slice(0, 3).join(', ')
    : null;
  const e = Math.round(activeDist.earth);
  const f = Math.round(activeDist.fire);
  const w = Math.round(activeDist.water);
  const a = Math.round(activeDist.air);

  const lines = [
    `ATMOSPHERE CALIBRATION — refined target for this ${roomLabel} (not generic, not loud, not Pinterest):`,
    `- ROOM CHARACTER: ${roomAtmosphereHint || 'proportional to the stated room program — furniture, objects, and light must match this space type exactly'}`,
    `- ELEMENTAL REGISTER (${primary} leads): ${primaryLock}${secondaryLock ? `; secondary (${secondary}): ${secondaryLock}` : ''}`,
    `- ENERGY BALANCE in frame: Earth ${e}% tactile mass · Fire ${f}% contrast · Water ${w}% reflectivity · Air ${a}% openness — each readable through material and light, never as symbols`,
    `- DAYLIGHT (${lightTime}): ${lightDesc}`,
    userAdjectives.length > 0
      ? `- CLIENT ADJECTIVES (mandatory experiential cues): ${userAdjectives.join(', ')} — translate through buildable material, light, and proportion only`
      : '- TONE: restrained luxury, emotional intelligence, quiet gravitas + warmth together — never sterile showroom, never decorative chaos',
    '- REFINEMENT RULE: atmosphere is layered and edited — one dominant light story, one dominant material story, supporting accents subtle; the frame feels photographed by a world-class architectural photographer — clean, noise-free, no speckle dots or film grain',
  ];
  return lines.join('\n');
}

// ════════════════════════════════════════════════════════════
// ELEMENTAL ACCENT LAYER — proportional decor from non-dominant elements
// ════════════════════════════════════════════════════════════

/**
 * Decor + lighting accents that each element brings INTO the room as
 * tertiary or quaternary presence (i.e. when the element is NOT the
 * primary or secondary). The ELEMENTAL ACCENT LAYER preamble block
 * builds a proportional accent line for every element with ≥5% weight
 * that isn't already represented as a primary material — this is the
 * user's explicit method: "dominant and secondary create context, the
 * rest enter as supporting decor and accent details proportional to
 * their %". Accents NEVER clad walls or floors — they appear as decor
 * pieces, lighting fixtures, textiles, or in-use details only.
 */
export const ELEMENT_ACCENT_DECOR: Record<Element, string> = {
  earth: 'EARTH lighting (a warm hand-blown ceramic table lamp with amber light, beeswax candles in clay holders, a clay sconce pooling honey-warm light) + EARTH decor (a woven seagrass basket, a terracotta vessel with dried branches, an unfinished oak side stool, a linen throw with raw selvedge, a small leather strap detail, an open clothbound book)',
  fire:  'FIRE lighting (a single brass library lamp with amber pleated shade pooling warm light at human-eye height, lit beeswax candles in brass holders, one warm-glow wall sconce, a small fireplace or candle hearth) + FIRE decor (a cognac leather cushion or bench detail, a small persian or kilim rug fragment, a brass tray with two glasses, a single oxblood velvet cushion, an open cigar box or whisky bottle)',
  water: 'WATER lighting (a glass-globe pendant in cool reflection, a mirror-finish reading lamp, a chrome arc floor lamp) + WATER decor (a polished steel hardware family, a frameless mirror fragment, a sea-blue glass vase or bottle, a small water vessel or table-fountain detail, a fluted-glass cabinet front, a single pearl-grey silk cushion)',
  air:   'AIR lighting (a glass-globe pendant cluster casting weightless points of light, a thin chrome arc lamp, a paper-lantern floor lamp diffusing softly, daylight diffusion through a sheer panel) + AIR decor (a sheer linen curtain at one window panel, a white ceramic vessel with eucalyptus or pampas grass, a hanging fern or trailing pothos, an etched-glass screen, a folded white linen throw, a stack of art books with white spines)',
};

// ════════════════════════════════════════════════════════════
// RULES
// ════════════════════════════════════════════════════════════

/** Adjectives the SHRE spec forbids — enforced via bannedTokens scrub. */
export const SHRE_BANNED_ADJECTIVES: string[] = [
  'modern', 'elegant', 'cozy', 'stylish', 'beautiful', 'luxury',
];

/** Canonical closing line. Mirrors V4_REQUIRED_PROMPT_TAIL in bannedTokens.ts. */
export const SHRE_CLOSING_LINE = 'clean editorial architectural photograph, photorealistic, smooth surfaces, no film grain, no render noise, no speckle dots';

/**
 * Universal anti-utopian architectural control — mandatory quality gate for
 * every generation. Prevents cinematic fantasy interiors, spa clichés, and
 * AI-luxury exaggerations. Injected into promptEngine + gemini systemInstruction.
 */
export const ANTI_UTOPIAN_ARCHITECTURAL_CONTROL = `UNIVERSAL ANTI-UTOPIAN ARCHITECTURAL CONTROL (mandatory — overrides decorative drift):

CRITICAL RULE: Do NOT generate cinematic fantasy interiors, spa clichés, utopian luxury scenes, or unrealistic atmospheric exaggerations. The space must feel architecturally believable, technically possible, materially intelligent, spatially coherent, emotionally controlled — NOT dreamy, NOT theatrical, NOT AI-luxury fantasy.

SPATIAL REALISM: Every element needs functional logic, structural plausibility, realistic placement, believable proportions, proper circulation. Never add random curtains, impossible windows, fake openings, glowing light leaks, floating elements, decorative objects without function, unnecessary hotel/spa styling. If a window exists: believable exterior light behavior, proper wall thickness, realistic daylight direction, logical relation to room geometry. Never place curtains in impossible locations, openings behind bathtubs without architectural justification, decorative lighting without visible source logic.

MATERIAL INTELLIGENCE: Materials behave realistically. Avoid over-smoothed surfaces, fake glossy luxury textures, hyper-reflective materials, artificial perfection, CGI-looking marble, exaggerated warm glow. Materials must feel tactile, weighted, natural, grounded, physically accurate. Texture scale stays realistic.

LIGHTING CONTROL: Follow real architectural lighting physics. Avoid cinematic haze, excessive volumetric light, fantasy shadows, dramatic glow effects, overexposed windows, artificial orange ambience. Use soft realistic indirect lighting, physically believable contrast, natural daylight balance, subtle shadow transitions, controlled illumination. The render must feel photographed, not AI-generated.

COMPOSITION CONTROL: Clean spatial hierarchy, realistic camera height, believable lens proportions, architectural framing. Avoid exaggerated perspective, ultra-wide distortion, unrealistic depth, staged luxury composition.

SHRE ELEMENT RULE: Materials, forms, lighting, and atmosphere follow the elemental distribution strictly. Express energetic balance, material hierarchy, atmospheric precision — NOT decoration. Every object justifies its existence through energy, function, material logic, spatial composition.

FINAL GOAL: A real built architectural project photographed by an architectural photographer — emotionally intelligent, materially disciplined, minimal yet powerful, highly detailed and conceptually precise. NOT AI fantasy, NOT Pinterest luxury, NOT cinematic utopia, NOT overdesigned spa scene, NOT decorative rendering.`;

/** Room-specific anti-utopian addenda layered on top of the universal block. */
export const ANTI_UTOPIAN_ROOM_ADDENDA: Record<string, string> = {
  Bathroom: `BATHROOM REALISM (mandatory):
- NO curtains, drapery, voile, sheers, or any window soft treatment ANYWHERE — not on windows, not behind tubs, NOT visible in mirror reflections, NOT in glimpses of adjacent rooms. Bathrooms use tile, stone, plaster, or frosted glass — never living-room textiles.
- NO spa-resort fantasy: no wine glasses, bath caddies, excessive candles, random indoor trees, or theatrical haze.
- Wet zone = glass shower screen or glass partition only. Mirror reflects bathroom architecture (tile/plaster/stone) — never a fantasy window with curtains.
- When FIRE element is active: ONE built-in architectural hearth is allowed in the dry zone (recessed linear gas insert or ethanol niche in dark marble/brass) — real product, proper ventilation, separated from wet zone. Low controlled ember glow only — NOT campfire theatrics.`,
};

/** Bathroom-safe elemental accent decor — no curtains, no spa props, no irrelevant living-room textiles. */
export const BATHROOM_ACCENT_DECOR: Record<Element, string> = {
  earth: 'EARTH: warm integrated vanity sconce + folded terry towels on open rail, stone soap dish, matte ceramic vessel',
  fire:  'FIRE: brushed brass vanity hardware, integrated mirror lighting with warm Kelvin, heated towel rail, dark marble hearth niche with controlled ember glow in dry zone (when Fire ≥ 30%)',
  water: 'WATER: frameless mirror with cool integrated light, chrome or satin faucet family, glass soap dispenser, polished metal hook',
  air:   'AIR: thin integrated mirror-light profile, soft indirect cove, white ceramic soap pump, folded white towels — minimal and breathable, zero drapery',
};

/**
 * Bathroom-specific architectural program — fireplace for Fire, zero curtains,
 * functional fixtures only. Injected when primary room is Bathroom.
 */
export const buildBathroomArchitecturalBlock = (
  primary: Element,
  firePct: number,
): string => {
  const fireHearth =
    primary === 'fire' || firePct >= 30
      ? `- FIRE HEARTH (required when Fire is primary or ≥ 30%): ONE built-in architectural hearth in the DRY zone — recessed linear gas insert or wall ethanol niche clad in dark marble (Nero Marquina) or brushed bronze, with proper ventilation gap from wet zone. Real insert product (Focus, Planika, or equivalent). Controlled low ember glow — NOT decorative fake flames, NOT campfire theatrics. Hearth on low plinth or feature wall beside vanity, never inside shower.`
      : `- No hearth required when Fire share is below 30%; express Fire through dark stone, oxidized/brass metal, and warm integrated lighting only.`;

  return `BATHROOM ARCHITECTURAL PROGRAM (mandatory — overrides all generic interior defaults):

CURTAINS & TEXTILES — ABSOLUTELY FORBIDDEN:
- Zero curtains, drapery, voile, sheers, blinds with fabric, or window soft treatments anywhere in the frame.
- Mirror must NOT reflect curtains, living-room windows, or bedroom-style drapery — reflection shows tile, plaster, stone, or frosted glass only.
- No rugs with living-room character; bath mat only if functionally placed at vanity or shower threshold.

FUNCTIONAL FIXTURES ONLY:
- Vanity with basin, mirror with integrated architectural lighting (LED strips or sconces — not theatrical glow).
- Glass shower screen or walk-in glass partition in wet zone.
- Towel rail or open shelving with folded towels.
- Waterproof surfaces: porcelain tile, natural stone, microcement, matte ceramic.

${fireHearth}

ANTI-SPA: No wine, bath caddy, candle clusters, large indoor trees, or hotel-resort staging. Photographed calm — architecturally believable, not Pinterest fantasy.`;
};

/**
 * FUNCTIONAL PLACEMENT LOGIC — every fixture, opening, and focal element must
 * answer "why is this here?". Targets two real failure modes flagged by the
 * user: pendant lights floating in random air, and windows placed without
 * façade logic. Injected globally on every render.
 */
export const FUNCTIONAL_PLACEMENT_LOGIC = `FUNCTIONAL PLACEMENT LOGIC (mandatory — every light, opening, and focal element must justify its position):

LIGHTING ANCHOR RULE:
- Pendant / chandelier lights are ANCHORED to a functional surface below them: a dining table, a kitchen island, a coffee-table cluster, a bedside, a bar counter, a reception desk, or a service counter. NEVER floating mid-room with empty floor underneath. NEVER centered on a room when there is no functional surface beneath the drop point.
- Wall sconces appear ONLY in functional contexts: flanking a bed, beside a mirror, framing a door or archway, on an art wall (one sconce per artwork), beside a fireplace, in a hallway rhythm, beside a vanity. NEVER on random blank walls with no door, no art, no mirror, and no architectural feature beside them.
- Recessed downlights / spots align to functional zones (work surface, dining table, art wall, circulation) on an orthogonal grid — not scattered randomly across the ceiling.
- Floor and table lamps sit beside seating, at a reading nook, or next to a console — never alone in an empty corner with no chair, no console, and no use case.
- Total visible fixture count must be RESTRAINED for the room size: a small lounge gets 1 pendant + 1 floor lamp + 1 sconce family — not 4+ pendants competing for attention.

WINDOW & OPENING LOGIC:
- Every window has believable façade logic: rhythm, alignment, sill height, head height, and proportion consistent across the visible elevation. Windows in the same wall share head height and sill height unless a real architectural reason breaks the line.
- Window placement responds to FUNCTION inside the room: above kitchen sinks, beside seating for views, behind a desk only when sun angle won't cause screen glare, above bath vanity only when it makes structural sense. Never random punched openings centered on blank walls.
- No openings behind bathtubs, behind beds, or behind sofas without a real architectural justification (corner detail, picture window with framed view). No window where a TV or media wall is the focal point on the same wall.
- Frame, mullion, and glazing system stays consistent across the room — never mix domestic sash with curtain wall in the same shot.

FOCAL POINT LOGIC:
- Every primary seating arrangement (Living Room, Lounge, Lobby, Reception, VIP, Hotel Suite) faces ONE clear focal point: wall-mounted TV with media console, fireplace, curated art-wall composition, a feature window framing a real view, or a sculptural feature. Sofa never faces a blank wall with nothing on it.
- Living Rooms specifically: sofa MUST face one of (a) wall-mounted TV with media console, (b) fireplace, (c) art wall, (d) feature window with view. The focal-point wall is the hero surface of the frame.
- Bedrooms: bed faces a TV wall, a fireplace, or a window — not a blank wall.
- Bars, restaurants, cafés: focal point = back-bar / barista station / open kitchen / wine wall. Stools/seats orient toward it.

CANDLES, VOTIVES & SMALL DECOR ANCHOR RULE:
- Candles ALWAYS sit ON a physical surface: a table, a side table, a console, a mantel, a tray, a windowsill, a wall-mounted shelf, a wall niche, or a wall sconce holder with a visible bracket. NEVER floating in mid-air. NEVER glowing dots suspended in space with no holder.
- Wall-mounted candle holders MUST show their bracket / shelf / metalwork visibly mounted to the wall — if the holder isn't visible, the candle does not appear.
- Candles read as REAL candles: wax body, wick, drip evidence where appropriate, scaled to the holder. Not abstract glowing points of light.
- Decorative objects (vases, books, sculptures, trays, small ceramics) sit on real surfaces with contact shadows. Never floating, never embedded in walls without a niche or bracket.

RUG & TEXTILE STYLE MATCH RULE:
- Rugs must match the STYLE REGISTER of the brief, not undermine it. A contemporary editorial bar / minimalist lounge / sleek hospitality interior takes plain hand-loomed wool, neutral flatweave, jute, sisal, mohair, or low-pile contract rugs — never a Persian, Oriental, Turkish, Kilim, Anatolian, or tribal-pattern rug unless the brief specifically calls for that register.
- Persian / Oriental / Kilim / heavy patterned domestic rugs are reserved for projects whose adjectives, materials, or program explicitly call for "traditional", "eclectic", "tribal", "ethnic", "vintage textile", "library", "study", or similar registers. Default modern hospitality and contemporary residential renders use plain or geometric low-pile rugs.
- Rug size matches the zone: living-room rug stops 20-30 cm short of the sofa front legs OR runs fully under the seating group; bar lounge area rug anchors a clear conversation cluster — no random domestic rug shoved under a working bar with no seating cluster above it.
- Rug colour and tone supports the active palette — not a clashing strong red Persian under a cool stone bar with cognac leather.

EVERY OBJECT JUSTIFIES ITSELF: chandeliers, sconces, pendants, lamps, candles, votives, mirrors, art, plants, rugs, windows, doors — each must answer "what function or sightline does this serve here, and does it fit the style register of the brief?". If no answer, the object is removed rather than scattered as decoration.`;

export const buildAntiUtopianControlBlock = (roomKey?: string | null): string => {
  const addendum = roomKey ? ANTI_UTOPIAN_ROOM_ADDENDA[roomKey] : undefined;
  return addendum
    ? `${ANTI_UTOPIAN_ARCHITECTURAL_CONTROL}\n\n${addendum}`
    : ANTI_UTOPIAN_ARCHITECTURAL_CONTROL;
};

// ════════════════════════════════════════════════════════════
// Builder — user-wins material selection + SHRE 5-step assembly
// ════════════════════════════════════════════════════════════

interface SHREMaterialSlot {
  /** Short label used in the prompt (e.g. "smoked walnut", or for user
   *  picks the catalog label like "Smoked / fumed oak"). */
  label: string;
  brand: string;
  application: string;
  /** Surface family the slot belongs to — used by the stone-cap policy. */
  category: MaterialCategory;
  /** Where the pick came from — used by callers for debugging only.
   *  'user'      — picked on the wheel by the user (highest priority).
   *  'diagnosis' — chosen by services/shreDiagnosis.ts (report-authoritative).
   *  'shre'      — fallback from the SHRE element pool. */
  source: 'user' | 'diagnosis' | 'shre';
}

/** Categories that count toward the "stone cap" — the user-mandated rule
 *  that at most TWO stone surfaces may appear in a render so the room
 *  doesn't read as a marble box. */
const STONE_CATEGORIES: ReadonlySet<MaterialCategory> = new Set<MaterialCategory>(['stone']);
const STONE_CAP = 2;

const isStoneCategory = (c: MaterialCategory): boolean => STONE_CATEGORIES.has(c);

/**
 * Map a user-selected MaterialDef to a SHRE-style slot by pulling brand
 * and application from the existing prompt-engine catalog (MATERIAL_PRODUCT_MAP
 * and MATERIAL_SURFACE_AFFINITY). Falls back to neutral strings if the
 * catalog doesn't know the material yet.
 */
function userMaterialToSlot(m: MaterialDef): SHREMaterialSlot {
  const products = MATERIAL_PRODUCT_MAP[m.name];
  const brand = products && products.length > 0
    ? products[0].brand
    : 'custom specification';
  const application = MATERIAL_SURFACE_AFFINITY[m.name] || 'feature surface';
  // Trim the application string to its leading clause — the catalog stores
  // long descriptive strings, but the SHRE line wants something short.
  const shortApplication = application.split(/[—–-]/, 1)[0].trim().split(',').slice(0, 2).join(',').trim();
  // Category lookup falls back to 'composite' so unknown user picks don't
  // get accidentally classified as stone (which would over-trigger the cap).
  const category: MaterialCategory = getMaterialCategory(m.name) ?? 'composite';
  return { label: m.name, brand, application: shortApplication, category, source: 'user' };
}

function shreMaterialToSlot(m: SHREMaterialSpec): SHREMaterialSlot {
  return { label: m.label, brand: m.brand, application: m.application, category: m.category, source: 'shre' };
}

/**
 * Map a SHRE-diagnosis-picked material to a slot. The diagnosis stores
 * canonical-catalog labels, so we look up the same brand/application
 * tables the user-pick adapter uses; that way the diagnostic and the
 * user wheel route to the same prompt-line vocabulary.
 */
function diagnosisMaterialToSlot(m: DiagnosisMaterial): SHREMaterialSlot {
  const products = MATERIAL_PRODUCT_MAP[m.label];
  const brand = products && products.length > 0 ? products[0].brand : 'custom specification';
  const application = MATERIAL_SURFACE_AFFINITY[m.label] || 'feature surface';
  const shortApplication = application.split(/[—–-]/, 1)[0].trim().split(',').slice(0, 2).join(',').trim();
  const category: MaterialCategory = getMaterialCategory(m.label) ?? 'composite';
  return { label: m.label, brand, application: shortApplication, category, source: 'diagnosis' };
}

/**
 * Returns dominant + secondary elements per the SHRE dominance rule.
 *
 * The original v1 rule used a hard 15% floor for the secondary. The user
 * has since clarified that dominance is about ATMOSPHERIC LEADERSHIP, not
 * numerical majority: even a 5-10% lead may control identity, and when
 * the top two are within ~5 they share identity as a dual-core. Mirrors
 * the report-side logic in promptEngine.ts `detectComposition` so the
 * image prompt and the client report agree on who is primary/secondary.
 *
 *   - Primary: the highest %, always returned.
 *   - Secondary: returned whenever the second element carries ≥ 10%.
 *     Below 10% it's treated as a tertiary accent, not a secondary —
 *     the ELEMENTAL ACCENT LAYER preamble block handles those.
 */
export function readElements(activeDist: Vector4): { primary: Element; secondary: Element | null } {
  const tiebreak: Element[] = ['earth', 'fire', 'water', 'air'];
  const entries: Array<[Element, number]> = [
    ['earth', activeDist.earth],
    ['fire',  activeDist.fire],
    ['water', activeDist.water],
    ['air',   activeDist.air],
  ];
  entries.sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return tiebreak.indexOf(a[0]) - tiebreak.indexOf(b[0]);
  });
  const primary = entries[0][0];
  const secondaryCandidate = entries[1];
  // Lowered threshold from 15 → 10. With the new SHRE rule a 10-12%
  // secondary is no longer noise — it shapes the atmosphere meaningfully
  // and must be reflected as a secondary material in the prompt body.
  const secondary = secondaryCandidate && secondaryCandidate[1] >= 10 ? secondaryCandidate[0] : null;
  return { primary, secondary };
}

/**
 * Spec-mandated material count per ELEMENT RANK.
 *
 * The user's MATERIAL DISTRIBUTION LOGIC:
 *   rank 1 (primary)   → 3 dominant materials
 *   rank 2 (secondary) → 2 supporting (when ≥15% — see secondaryCount)
 *   rank 3 (tertiary)  → 1–2 subtle materials (1 standard, 2 when ≥20%)
 *   rank 4 (weak)      → 0–1 only if ≥8% (otherwise 0)
 *   absent (0%)        → no material usage
 *
 * Never give equal material presence to unequal elements — this function
 * returns the exact count grant per element so the rank-based picker
 * downstream emits the correct number of material lines.
 */
function shreMaterialCountForRank(rank: 0 | 1 | 2 | 3, pct: number): number {
  if (pct <= 0) return 0;
  switch (rank) {
    case 0: return 3;                 // primary
    case 1: return pct >= 15 ? 2 : (pct >= 10 ? 1 : 0); // secondary
    case 2: return pct >= 20 ? 2 : (pct >= 10 ? 1 : 0); // tertiary
    case 3: return pct >= 8 ? 1 : 0;  // weak
  }
}

/**
 * Spec-mandated furniture/lighting reference quota per element rank.
 *
 * The user's BRAND DISTRIBUTION LOGIC:
 *   primary    → 2–3 furniture/lighting references
 *   secondary  → 1–2 references
 *   tertiary   → 0–1 reference
 *   weak/abs.  → no references
 *
 * The number on the high end of each range is granted only when the share
 * is generous (primary ≥60% → 3, ≥40% → 2; secondary ≥25% → 2; tertiary
 * ≥15% → 1). Sub-threshold ranks return 0.
 */
function shreBrandCountForRank(rank: 0 | 1 | 2 | 3, pct: number): number {
  if (pct <= 0) return 0;
  switch (rank) {
    case 0: return pct >= 60 ? 3 : (pct >= 40 ? 2 : 2); // primary always 2+
    case 1: return pct >= 25 ? 2 : (pct >= 12 ? 1 : 0); // secondary
    case 2: return pct >= 15 ? 1 : 0;                   // tertiary
    case 3: return 0;                                   // weak / absent
  }
}

/**
 * Rank elements by share, descending. Tie-break canon: earth → fire →
 * water → air (matches `readElements` + `calculateAnalysis`).
 */
export function rankElementsByDistribution(activeDist: Vector4): Array<{ element: Element; pct: number; rank: 0 | 1 | 2 | 3 }> {
  const tiebreak: Element[] = ['earth', 'fire', 'water', 'air'];
  const entries: Array<[Element, number]> = [
    ['earth', activeDist.earth],
    ['fire',  activeDist.fire],
    ['water', activeDist.water],
    ['air',   activeDist.air],
  ];
  entries.sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return tiebreak.indexOf(a[0]) - tiebreak.indexOf(b[0]);
  });
  return entries.map(([element, pct], i) => ({ element, pct, rank: i as 0 | 1 | 2 | 3 }));
}

/**
 * Rank-based SHRE material allocation — produces up to 8 slots ordered
 * by descending element rank, honouring the spec's material distribution
 * logic and the stone-cap discipline.
 *
 * INPUT — the active distribution + user picks + diagnosis picks (if a
 * diagnosis was built).
 *
 * OUTPUT — `slots` ordered: all primary-element picks first, then all
 * secondary-element picks, then tertiary, then weak. Each slot carries
 * the source element + rank so the prompt body can group lines by
 * element heading and emit the correct brand quota alongside.
 *
 * PRIORITY (per element pool):
 *   1. User picks       — wheel selections (the user's voice)
 *   2. Diagnosis picks  — report-authoritative recommendations
 *   3. SHRE pool        — fallback, generation-index-cycled for variety
 *
 * STONE CAP — at most STONE_CAP (2) stone-category materials across the
 * entire selection. Prevents the "marble box" failure mode. The cap
 * spans all elements: a primary-earth render that already used two
 * Earth stones will not pick a stone from the Water pool for the
 * secondary slot — the picker promotes the next non-stone candidate.
 */
export interface RankedSHREMaterialSlot extends SHREMaterialSlot {
  element: Element;
  rank: 0 | 1 | 2 | 3;
}

export function pickSHREMaterialsRanked(args: {
  activeDist: Vector4;
  userMaterials: MaterialDef[];
  generationIndex: number;
  diagnosisMaterials?: DiagnosisMaterial[];
}): { slots: RankedSHREMaterialSlot[]; ranked: ReturnType<typeof rankElementsByDistribution> } {
  const { activeDist, userMaterials, generationIndex } = args;
  const diagnosisMaterials = args.diagnosisMaterials ?? [];
  const ranked = rankElementsByDistribution(activeDist);

  // Partition user / diagnosis picks by element so each pool can be drawn
  // from independently — preserves "user > diagnosis > pool" priority
  // *within* an element rather than mixing across elements.
  const userByElement: Record<Element, MaterialDef[]> = { earth: [], fire: [], water: [], air: [] };
  for (const m of userMaterials) userByElement[m.element].push(m);

  const diagByElement: Record<Element, DiagnosisMaterial[]> = { earth: [], fire: [], water: [], air: [] };
  for (const m of diagnosisMaterials) diagByElement[m.primaryElement].push(m);

  // Cycle SHRE pools so successive generations don't repeat picks.
  const cyclePool = (pool: SHREMaterialSpec[], skip: number): SHREMaterialSpec[] => {
    const n = pool.length;
    if (n === 0) return [];
    const start = ((generationIndex + skip) % n + n) % n;
    return pool.slice(start).concat(pool.slice(0, start));
  };

  let stoneCount = 0;
  const usedLabels = new Set<string>();

  const takeOne = (candidates: SHREMaterialSlot[]): SHREMaterialSlot | null => {
    const available = candidates.filter((c) => !usedLabels.has(c.label));
    if (available.length === 0) return null;
    let pick: SHREMaterialSlot;
    if (stoneCount >= STONE_CAP) {
      pick = available.find((c) => !isStoneCategory(c.category)) ?? available[0];
    } else {
      pick = available[0];
    }
    usedLabels.add(pick.label);
    if (isStoneCategory(pick.category)) stoneCount++;
    return pick;
  };

  const slots: RankedSHREMaterialSlot[] = [];
  for (const r of ranked) {
    const need = shreMaterialCountForRank(r.rank, r.pct);
    if (need === 0) continue;
    const pool = cyclePool(SHRE_ELEMENT_MATERIALS[r.element], r.rank);
    const candidates: SHREMaterialSlot[] = [
      ...userByElement[r.element].map(userMaterialToSlot),
      ...diagByElement[r.element].map(diagnosisMaterialToSlot),
      ...pool.map(shreMaterialToSlot),
    ];
    for (let i = 0; i < need; i++) {
      const pick = takeOne(candidates);
      if (!pick) break;
      slots.push({ ...pick, element: r.element, rank: r.rank });
    }
  }

  // Guarantee at least one slot — if every rank reported 0 (e.g. all
  // elements at 0% which should never happen) fall back to the primary
  // pool's first entry. This is a defensive safety net, not a real path.
  if (slots.length === 0) {
    const fallback = shreMaterialToSlot(SHRE_ELEMENT_MATERIALS[ranked[0].element][0]);
    slots.push({ ...fallback, element: ranked[0].element, rank: 0 });
  }

  return { slots, ranked };
}

/**
 * Legacy 4-slot picker — preserved for backward compatibility with any
 * external caller that still expects the v1 shape. New code should
 * prefer `pickSHREMaterialsRanked` which honours the spec's rank-based
 * material distribution and supports up to 8 slots.
 */
export function pickSHREMaterials(args: {
  primary: Element;
  secondary: Element | null;
  userMaterials: MaterialDef[];
  generationIndex: number;
  diagnosisMaterials?: DiagnosisMaterial[];
}): { primary1: SHREMaterialSlot; primary2: SHREMaterialSlot; secondary: SHREMaterialSlot | null; accent: SHREMaterialSlot | null } {
  const { primary, secondary, userMaterials, generationIndex } = args;

  // Reuse the ranked picker by synthesising a distribution that puts
  // primary first and secondary second (so they fill in that order),
  // then map the resulting slots back to the legacy shape.
  const synthDist: Vector4 = { earth: 0, fire: 0, water: 0, air: 0 };
  synthDist[primary] = 60;
  if (secondary) synthDist[secondary] = 25;
  const others: Element[] = (['earth', 'fire', 'water', 'air'] as Element[])
    .filter((e) => e !== primary && e !== secondary);
  if (others[0]) synthDist[others[0]] = 10;
  if (others[1]) synthDist[others[1]] = 5;
  const { slots } = pickSHREMaterialsRanked({
    activeDist: synthDist,
    userMaterials,
    generationIndex,
    diagnosisMaterials: args.diagnosisMaterials,
  });

  const primarySlots = slots.filter((s) => s.element === primary);
  const secondarySlot = secondary ? slots.find((s) => s.element === secondary) ?? null : null;
  const accentSlot = slots.find((s) => s.element !== primary && s.element !== secondary) ?? null;

  return {
    primary1: primarySlots[0] ?? shreMaterialToSlot(SHRE_ELEMENT_MATERIALS[primary][0]),
    primary2: primarySlots[1] ?? shreMaterialToSlot(SHRE_ELEMENT_MATERIALS[primary][1] ?? SHRE_ELEMENT_MATERIALS[primary][0]),
    secondary: secondarySlot,
    accent: accentSlot,
  };
}

/**
 * Render a single material line. The accent slot drops the brand and
 * application and keeps only "label detail" to match the spec example
 * ("burnished brass shelf detail").
 */
function renderMaterialLine(slot: SHREMaterialSlot, mode: 'full' | 'accent'): string {
  if (mode === 'accent') {
    // For accents, strip brand noise and keep a short detail descriptor.
    return `${slot.label} accent detail`.replace(/\s+/g, ' ').trim();
  }
  const parts = [slot.label, slot.brand, slot.application].filter((s) => s && s.trim().length > 0);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Returns the short noun phrase from a material label — used in the K-line
 * "{K}K {lightType} on {primary_short}" so the lighting reads as
 * specifically tuned to the dominant surface ("2800K spot on copper wall",
 * "2900K matte downlight on travertine") instead of an abstract directive.
 */
function shortPrimaryNoun(label: string): string {
  // Strip parenthetical qualifiers and finish modifiers.
  const cleaned = label.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  const tokens = cleaned.split(/\s+/);
  return tokens.slice(0, 3).join(' ');
}

/**
 * Compose a label naming the spec's composition mode for a ranked
 * distribution. Mirrors `detectComposition` from promptEngine.ts:
 *   - Single Dominant — top element ≥50% AND ≥15% over runner-up
 *   - Dual Core      — top two within ~5 of each other
 *   - Triadic        — three elements each ≥15% (and #4 < 15%)
 *   - Minimal        — only 1-2 elements carry meaningful share
 *
 * The image model uses this label to choose the right zoning strategy:
 * a Single Dominant render gives the full frame to one elemental
 * language, a Dual Core renders two adjacent zones, etc.
 */
function describeShreCompositionMode(ranked: ReturnType<typeof rankElementsByDistribution>): string {
  const [r0, r1, r2, r3] = ranked;
  const activeCount = ranked.filter((r) => r.pct >= 8).length;
  if (r0.pct >= 50 && r0.pct - r1.pct >= 15) return 'Single Dominant';
  if (r0.pct - r1.pct <= 5 && r1.pct >= 25) return 'Dual Core';
  if (r0.pct >= 15 && r1.pct >= 15 && r2.pct >= 15 && r3.pct < 15) return 'Triadic';
  if (activeCount <= 2) return 'Minimal';
  return 'Dual Core';
}

/** Pick N brand strings from a per-element pool, cycled by generationIndex
 *  so back-to-back renders don't keep showing the same model. */
function takeBrandPicks(pool: string[], count: number, generationIndex: number, skip: number): string[] {
  if (count <= 0 || pool.length === 0) return [];
  const out: string[] = [];
  const n = pool.length;
  for (let i = 0; i < count && i < n; i++) {
    const idx = ((generationIndex + skip + i) % n + n) % n;
    out.push(pool[idx]);
  }
  return out;
}

/**
 * Build the SHRE prompt body — the authoritative per-render material /
 * furniture / lighting / atmosphere directive the image model receives.
 *
 * The body now emits explicit SHRE v3 sections in fixed order:
 *
 *   1. STYLE DIRECTION + PALETTE (from diagnosis, if present)
 *   2. COMPOSITION MODE          (Single Dominant / Dual Core / etc.)
 *   3. ATMOSPHERE LOCK           (6 keywords for primary, 3 for secondary)
 *   4. MATERIAL DISTRIBUTION     (rank-grouped material lines with brand)
 *   5. FURNITURE                 (per-element quota — 2-3 / 1-2 / 0-1)
 *   6. LIGHTING                  (per-element quota — same proportions)
 *   7. TECHNICAL ENVELOPE        (K + light type + surface finish)
 *   8. ARCHITECTURAL DETAILING   (shadow gaps, joinery, integrated light)
 *   9. SHRE_CLOSING_LINE         (canonical photographic quality tail)
 *
 * The caller (buildGenerationPackage in promptEngine.ts) is responsible
 * for prepending contextual preamble (domain lock, space brief, m²,
 * ceiling) and for running the result through scrubBannedTokens — that
 * scrubber substitutes banned adjectives and appends the canonical tail
 * if a render-level closing line is missing.
 *
 * The wider visual-language directives (anti-AI detection, photography
 * standard, surface-coverage rules, furniture clearance, brand
 * authenticity) live in the geminiService SYSTEM_INSTRUCTION which is
 * ALWAYS prepended by the API layer — they're not duplicated here so
 * the body stays focused on the per-render specification.
 */
export function buildSHREPromptBody(args: {
  spaceLabel: string;
  primary: Element;
  secondary: Element | null;
  activeDist: Vector4;
  userMaterials: MaterialDef[];
  generationIndex: number;
  diagnosis?: Diagnosis;
  /** Primary room type (Living Room, Bar, etc.) — enables room-specific atmosphere refinement */
  primaryRoom?: string | null;
}): string {
  const { spaceLabel, activeDist, userMaterials, generationIndex, diagnosis, primaryRoom } = args;

  const { slots, ranked } = pickSHREMaterialsRanked({
    activeDist,
    userMaterials,
    generationIndex,
    diagnosisMaterials: diagnosis?.materials,
  });
  const compositionMode = describeShreCompositionMode(ranked);

  // Group material slots by element (preserving the rank-ordered
  // sequence) so each element's materials read together in the body.
  const slotsByElement: Record<Element, RankedSHREMaterialSlot[]> = { earth: [], fire: [], water: [], air: [] };
  for (const s of slots) slotsByElement[s.element].push(s);

  // Furniture + lighting quota per rank, drawn from the spec's catalogs.
  const furniturePicks: { element: Element; rank: number; items: string[] }[] = [];
  const lightingPicks:  { element: Element; rank: number; items: string[] }[] = [];
  for (const r of ranked) {
    const fCount = shreBrandCountForRank(r.rank, r.pct);
    if (fCount > 0) {
      const furn = takeBrandPicks(SHRE_FURNITURE_BY_ELEMENT[r.element], fCount, generationIndex, r.rank * 2);
      const lite = takeBrandPicks(SHRE_LIGHTING_BY_ELEMENT[r.element],  fCount, generationIndex, r.rank * 2 + 1);
      if (furn.length) furniturePicks.push({ element: r.element, rank: r.rank, items: furn });
      if (lite.length) lightingPicks.push({  element: r.element, rank: r.rank, items: lite });
    }
  }

  // Primary atmosphere lock (full keyword set); secondary contributes its
  // first three keywords as supporting register when ≥15%.
  const primaryEl = ranked[0].element;
  const primaryAtmos = SHRE_ATMOSPHERE_BY_ELEMENT[primaryEl].join(', ');
  const secondaryAtmos = ranked[1].pct >= 15
    ? SHRE_ATMOSPHERE_BY_ELEMENT[ranked[1].element].slice(0, 3).join(', ')
    : null;

  const tech = SHRE_TECHNICAL_BY_ELEMENT[primaryEl];
  const primaryFirstSlot = slotsByElement[primaryEl][0] ?? slots[0];
  const primaryNoun = shortPrimaryNoun(primaryFirstSlot.label);

  const lines: string[] = [];

  // 1. STYLE DIRECTION + PALETTE (diagnosis-authoritative)
  if (diagnosis) {
    lines.push(`STYLE DIRECTION: ${diagnosis.styleDirection} — ${SHRE_STYLE_DEFINITIONS[diagnosis.styleDirection]}`);
    lines.push(`PALETTE: ${diagnosis.palette} — ${SHRE_PALETTE_DEFINITIONS[diagnosis.palette]}`);
  }

  // 2. COMPOSITION MODE + percentages (the image model uses this to zone)
  const pctSummary = ranked
    .filter((r) => r.pct > 0)
    .map((r) => `${r.element[0].toUpperCase()}${r.element.slice(1)} ${r.pct}%`)
    .join(' · ');
  lines.push(`COMPOSITION: ${compositionMode} — ${pctSummary}`);

  lines.push(`Architectural visualization, ${spaceLabel}`);

  // 3. ATMOSPHERE LOCK — primary register first, secondary register as
  //    supporting layer when ≥15%. These are control vectors, not mood.
  lines.push(`ATMOSPHERE LOCK (${primaryEl}): ${primaryAtmos}`);
  if (secondaryAtmos) lines.push(`SECONDARY REGISTER (${ranked[1].element}): ${secondaryAtmos}`);
  const roomHint = primaryRoom ? ROOM_ATMOSPHERE_REFINEMENT[primaryRoom] : undefined;
  if (roomHint) {
    lines.push(`ROOM ATMOSPHERE (${primaryRoom}): ${roomHint}`);
  }

  // 4. MATERIAL DISTRIBUTION — grouped per element, primary first.
  //    Every line is "label, brand, application" so the image model
  //    treats the material as a real specifiable product.
  for (const r of ranked) {
    const elSlots = slotsByElement[r.element];
    if (elSlots.length === 0) continue;
    const heading = `${r.element[0].toUpperCase()}${r.element.slice(1)} materials (${r.pct}%)`;
    lines.push(`${heading}:`);
    for (const s of elSlots) {
      // Primary-element slots get the full line; lower-rank slots also
      // get full lines because the spec demands every listed material
      // be visibly present — accent-style truncation hides them from
      // the image model.
      lines.push(`  · ${renderMaterialLine(s, 'full')}`);
    }
  }

  // 5. FURNITURE — quota-controlled designer references per element.
  if (furniturePicks.length) {
    lines.push('FURNITURE (must appear physically in the render):');
    for (const fp of furniturePicks) {
      lines.push(`  · ${fp.element}: ${fp.items.join(', ')}`);
    }
  }

  // 6. LIGHTING — quota-controlled designer fixtures per element.
  if (lightingPicks.length) {
    lines.push('LIGHTING (visible fixtures from the elemental roster):');
    for (const lp of lightingPicks) {
      lines.push(`  · ${lp.element}: ${lp.items.join(', ')}`);
    }
  }

  // 7. TECHNICAL ENVELOPE — Kelvin + light type tied to the dominant
  //    surface so the lighting reads as tuned to the actual material.
  lines.push(`${tech.kelvin}K ${tech.lightType} on ${primaryNoun}`);
  lines.push(tech.surfaceFinish);

  // 8. ARCHITECTURAL DETAILING — concrete instruction set so the
  //    render carries premium, buildable detailing rather than CGI
  //    smoothness. The wider anti-AI directive lives in SYSTEM_INSTRUCTION
  //    so we keep this line tight + actionable.
  lines.push('Detailing: recessed shadow gaps, elegant integrated joinery, integrated linear lighting, refined edge conditions, premium stone detailing, realistic material transitions');

  // 9. Canonical photographic-quality tail.
  lines.push(SHRE_CLOSING_LINE);

  return lines.join(',\n');
}
