import { Question, MaterialDef, AdjectiveDef, Element } from './types';
import { CANONICAL_MATERIAL_CATALOG, CANONICAL_MATERIAL_GROUPS, getPrimaryElementForMaterial } from './materialsCatalog';
import { CANONICAL_ADJECTIVES_CATALOG, CANONICAL_ADJECTIVE_GROUPS, getPrimaryElementForAdjective } from './adjectivesCatalog';
import { buildMaterialThumbnailMap } from './lib/materialThumbnails';

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

// Photographic PBR textures shipped under /public/materials/.
//
// STRICT 1:1 — every PNG goes to exactly ONE catalog label. Reusing the same
// photo across multiple labels (e.g. white-marble.png for Calacatta + Thassos
// + Statuario) made the orbit look like duplicate beads with different
// captions. Labels without a dedicated PNG render as a clean element-coloured
// sphere — no procedural lines, no rim, no faux veining — keeping the visual
// distinct from photographic materials.
const LOCAL_MAT_OVERRIDES: Record<string, string> = {
  // ── EARTH ────────────────────────────────────────────────────
  'Travertine (honed)':                  '/materials/travertine.png',
  'Jura limestone (golden)':             '/materials/limestone.png',
  'Natural oak (horizontal)':            '/materials/natural-oak-horizontal.png',
  'Walnut veneer':                       '/materials/walnut-veneer.png',
  'Clay plaster':                        '/materials/clay-plaster.png',
  'Lime plaster (warm mineral)':         '/materials/lime-plaster.png',
  'Industrial brick':                    '/materials/industrial-brick.png',
  // ── FIRE ─────────────────────────────────────────────────────
  'Dark marble (high contrast)':         '/materials/dark-marble.png',
  'Dark quartzite':                      '/materials/tuff.png',
  'Basalt':                              '/materials/basalt.png',
  'Venetian plaster (polished)':         '/materials/venetian-plaster.png',
  'Blackened steel':                     '/materials/blackened-steel.png',
  'Bronze accents':                      '/materials/bronze.png',
  // ── WATER ────────────────────────────────────────────────────
  'Microcement (continuous)':            '/materials/microcement.png',
  'Smooth mineral plaster':              '/materials/smooth-mineral.png',
  'Diffused glass':                      '/materials/diffused-glass.png',
  'Matte ceramic':                       '/materials/matte-ceramic.png',
  'Linen / wool textile surfaces':       '/materials/wool-textile.png',
  // ── AIR ──────────────────────────────────────────────────────
  'White marble (Calacatta)':            '/materials/white-marble.png',
  'Dolomite snow-white marble':          '/materials/dolomite-snow.png',
  'White terrazzo':                      '/materials/white-terrazzo.png',
  'Light oak / ash':                     '/materials/light-oak.png',
  'Bleached birch':                      '/materials/bleached-birch.png',
  'Limewash (bright)':                   '/materials/limewash.png',
  'White mineral plaster':               '/materials/white-plaster.png',
  'Pale concrete (smooth)':              '/materials/pale-concrete.png',
  'Clear glass (low-iron)':              '/materials/clear-glass.png',
  // ── SHARED ───────────────────────────────────────────────────
  'Textured concrete (matte)':           '/materials/textured-concrete.png',
  'Brushed metal':                       '/materials/brushed-metal.png',
  'Solid oak':                           '/materials/solid-oak.png',
  'Walnut (natural finish)':             '/materials/walnut.png',
};

export const MATERIAL_SPHERE_IMAGES: Record<string, string> = buildMaterialThumbnailMap(LOCAL_MAT_OVERRIDES);

/**
 * Single-shot helper for ad-hoc thumbnail lookups. Returns the local PNG URL
 * if one exists for the label, otherwise an empty string so callers can fall
 * back to a clean element-coloured sphere instead of a procedural pattern.
 */
export const getMaterialThumbnail = (label: string): string =>
  MATERIAL_SPHERE_IMAGES[label] || '';

// Canonical Materials by group (for layer selection panel)
export const CANONICAL_MATERIALS: Record<Element | 'shared', string[]> = CANONICAL_MATERIAL_GROUPS;

// Canonical Atmosphere keywords by element (for layer selection panel)
export const CANONICAL_ATMOSPHERE: Record<Element | 'shared', string[]> = CANONICAL_ADJECTIVE_GROUPS;

// ── Visual calibration: 3 image variants per question, randomized each session ──

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** Square macro crop for material-step options (2×2 grid); keeps framing symmetric on all viewports. */
const surveyTex = (photoId: string) =>
  `https://images.unsplash.com/${photoId}?auto=format&w=720&h=720&fit=crop&q=85`;

/** Landscape / nature step — outdoor scenes only, square crop for survey grid. */
const surveyScene = (photoId: string) =>
  `https://images.unsplash.com/${photoId}?auto=format&w=900&h=900&fit=crop&q=85`;

/** Interior / room step — real indoor spaces only (never building exteriors for “room” copy). */
const surveyRoom = (photoId: string) =>
  `https://images.unsplash.com/${photoId}?auto=format&w=800&h=800&fit=crop&q=85`;

/** Architecture / season step — exteriors, buildings, or seasonal landscapes. */
const surveyArch = (photoId: string) =>
  `https://images.unsplash.com/${photoId}?auto=format&w=800&h=520&fit=crop&q=85`;

const Q1_VARIANTS: Question[] = [
  {
    id: 'q1', text: 'Which nature calls to you?', subtitle: 'Feel the energy — each landscape holds an element', visual: true,
    options: [
      { text: 'Canyon & clay', weights: { earth: 5, fire: 1 }, image: surveyScene('photo-1474044159687-1ee9f3a51722') },
      { text: 'Volcanic glow', weights: { fire: 5, earth: 1 }, image: surveyScene('photo-1476390893418-4c88ecc5a945') },
      { text: 'Still lake', weights: { water: 5, air: 1 }, image: surveyScene('photo-1439066615861-d1af74d74000') },
      { text: 'Misty peaks', weights: { air: 5, water: 1 }, image: surveyScene('photo-1464822759023-fed622ff2c3b') },
    ]
  },
  {
    id: 'q1', text: 'Where does your soul rest?', subtitle: 'Nature reveals your inner element', visual: true,
    options: [
      { text: 'Desert dunes', weights: { earth: 5, air: 1 }, image: surveyScene('photo-1509316785289-025f5b846b35') },
      { text: 'Sunset cliffs', weights: { fire: 5, earth: 2 }, image: surveyScene('photo-1506929562872-bb421503ef21') },
      { text: 'Ocean horizon', weights: { water: 5, air: 2 }, image: surveyScene('photo-1507525428034-b723cf961d3e') },
      { text: 'Cloud forest', weights: { air: 5, water: 1, earth: 1 }, image: surveyScene('photo-1501785888041-af3ef285b470') },
    ]
  },
  {
    id: 'q1', text: 'Which landscape is yours?', subtitle: 'The place that feels like home', visual: true,
    options: [
      { text: 'Ancient forest', weights: { earth: 5, water: 1 }, image: surveyScene('photo-1448375240586-882707db888b') },
      { text: 'Savanna heat', weights: { fire: 5, air: 1 }, image: surveyScene('photo-1516026672322-bc52d61a55d5') },
      { text: 'Fjord silence', weights: { water: 5, earth: 1 }, image: surveyScene('photo-1513519245088-0e12902e35ca') },
      { text: 'Alpine air', weights: { air: 5, fire: 1 }, image: surveyScene('photo-1506905925346-21bda4d32df4') },
    ]
  },
];

const Q2_VARIANTS: Question[] = [
  {
    id: 'q2', text: 'Which surface do you want to touch?', subtitle: 'The material that resonates with your nature', visual: true,
    options: [
      { text: 'Natural stone', weights: { earth: 5, water: 1 }, image: surveyTex('photo-1618220179428-22790b461013') },
      { text: 'Oxidized metal', weights: { fire: 5, earth: 2 }, image: surveyTex('photo-1523447704114-37cea08ee064') },
      { text: 'Dark walnut', weights: { earth: 5, water: 1 }, image: surveyTex('photo-1631889993954-87b1b128edfe') },
      { text: 'White marble', weights: { air: 5, water: 1 }, image: surveyTex('photo-1600210491892-03d3c28da189') },
    ]
  },
  {
    id: 'q2', text: 'Which texture speaks to you?', subtitle: 'Close your eyes and feel', visual: true,
    options: [
      { text: 'Raw clay', weights: { earth: 5, fire: 1 }, image: surveyTex('photo-1615529328331-f8917597711f') },
      { text: 'Brushed copper', weights: { fire: 5, air: 1 }, image: surveyTex('photo-1594896733292-9a77b5809c63') },
      { text: 'Aged oak', weights: { earth: 4, water: 2 }, image: surveyTex('photo-1586075010923-2dd4570fb338') },
      { text: 'Polished concrete', weights: { air: 5, earth: 1 }, image: surveyTex('photo-1536566482680-fca31930a0bd') },
    ]
  },
  {
    id: 'q2', text: 'Pick a material palette', subtitle: 'What your hands want to feel', visual: true,
    options: [
      { text: 'Terracotta', weights: { earth: 5, fire: 2 }, image: surveyTex('photo-1585314062340-f1a5a7c9328d') },
      { text: 'Black steel', weights: { fire: 5, water: 1 }, image: surveyTex('photo-1533035353720-f1c6a75cd8ab') },
      { text: 'Smooth wood', weights: { earth: 3, water: 3 }, image: surveyTex('photo-1546484396-fb3fc6f95f98') },
      { text: 'Frosted glass', weights: { air: 5, water: 2 }, image: surveyTex('photo-1543393716-375f47996a77') },
    ]
  },
];

const Q3_VARIANTS: Question[] = [
  {
    id: 'q3', text: 'Where would you feel at home?', subtitle: 'The interior that speaks your language', visual: true,
    options: [
      { text: 'Warm & textured', weights: { earth: 5, fire: 1 }, image: surveyRoom('photo-1600210492486-724fe5c67fb0') },
      { text: 'Bold & dramatic', weights: { fire: 5, earth: 1 }, image: surveyRoom('photo-1600607687939-ce8a6c25118c') },
      { text: 'Soft & fluid', weights: { water: 5, air: 2 }, image: surveyRoom('photo-1616486338812-3dadae4b4ace') },
      { text: 'Bright & open', weights: { air: 5, water: 1 }, image: surveyRoom('photo-1600566753190-17f0baa2a6c3') },
    ]
  },
  {
    id: 'q3', text: 'Which room draws you in?', subtitle: 'Imagine spending a day here', visual: true,
    options: [
      { text: 'Rustic retreat', weights: { earth: 5, water: 2 }, image: surveyRoom('photo-1618219908412-a29a1bb7b86e') },
      { text: 'Dark elegance', weights: { fire: 5, water: 1 }, image: surveyRoom('photo-1615874694520-474822394e73') },
      { text: 'Serene comfort', weights: { water: 5, earth: 1 }, image: surveyRoom('photo-1617325247661-675ab4b64ae2') },
      { text: 'Airy loft', weights: { air: 5, fire: 1 }, image: surveyRoom('photo-1502672260266-1c1ef2d93688') },
    ]
  },
  {
    id: 'q3', text: 'Which space is your sanctuary?', subtitle: 'The atmosphere you crave', visual: true,
    options: [
      { text: 'Earth tones', weights: { earth: 5, fire: 1, water: 1 }, image: surveyRoom('photo-1600585154526-990dced4db0d') },
      { text: 'Moody contrast', weights: { fire: 5, earth: 2 }, image: surveyRoom('photo-1600607687920-4e2a09cf159d') },
      { text: 'Calm waters', weights: { water: 5, air: 1 }, image: surveyRoom('photo-1540555700478-4be289fbecef') },
      { text: 'Pure light', weights: { air: 5, earth: 1 }, image: surveyRoom('photo-1595526114035-0d45ed16cfbc') },
    ]
  },
];

const Q4_ARCHITECTURE: Question[] = [
  {
    id: 'q4', text: 'Which form inspires you?', subtitle: 'Architecture as frozen energy', visual: true,
    options: [
      { text: 'Grounded mass', weights: { earth: 5, fire: 1 }, image: surveyArch('photo-1600596542815-ffad4c1539a9') },
      { text: 'Dynamic edge', weights: { fire: 5, air: 2 }, image: surveyArch('photo-1511818966892-d7d671e672a2') },
      { text: 'Organic curve', weights: { water: 5, earth: 1 }, image: surveyArch('photo-1510554318937-cd0860bf68c2') },
      { text: 'Glass & sky', weights: { air: 5, water: 1 }, image: surveyArch('photo-1486406146926-c627a92ad1ab') },
    ]
  },
  {
    id: 'q4', text: 'Which building would you enter?', subtitle: 'Structure reveals character', visual: true,
    options: [
      { text: 'Stone fortress', weights: { earth: 5, water: 1 }, image: surveyArch('photo-1564013799919-ab600027ffc6') },
      { text: 'Steel & fire', weights: { fire: 5, earth: 1 }, image: surveyArch('photo-1487958449943-2427ede8e615') },
      { text: 'Flowing form', weights: { water: 5, air: 2 }, image: surveyArch('photo-1510554318937-cd0860bf68c2') },
      { text: 'Open frame', weights: { air: 5, fire: 1 }, image: surveyArch('photo-1486406146926-c627a92ad1ab') },
    ]
  },
];

const Q4_SEASONS: Question[] = [
  {
    id: 'q4', text: 'Which season feels like you?', subtitle: 'Your energy has a rhythm', visual: true,
    options: [
      { text: 'Autumn warmth', weights: { earth: 5, fire: 2 }, image: surveyArch('photo-1508193638397-1c4234db14d8') },
      { text: 'Summer blaze', weights: { fire: 5, air: 1 }, image: surveyArch('photo-1504300718067-1b364ea51846') },
      { text: 'Winter stillness', weights: { water: 5, earth: 1 }, image: surveyArch('photo-1457269449834-928af64c684d') },
      { text: 'Spring breeze', weights: { air: 5, water: 2 }, image: surveyArch('photo-1490750967868-88aa4f44baee') },
    ]
  },
  {
    id: 'q4', text: 'Your time of year?', subtitle: 'Seasons mirror elemental energy', visual: true,
    options: [
      { text: 'Golden autumn', weights: { earth: 5, water: 1 }, image: surveyArch('photo-1508193638397-1c4234db14d8') },
      { text: 'Burning summer', weights: { fire: 5, earth: 2 }, image: surveyArch('photo-1504300718067-1b364ea51846') },
      { text: 'Deep winter', weights: { water: 5, air: 1 }, image: surveyArch('photo-1457269449834-928af64c684d') },
      { text: 'Fresh spring', weights: { air: 5, earth: 1 }, image: surveyArch('photo-1490750967868-88aa4f44baee') },
    ]
  },
];

export const generateSurveyQuestions = (): Question[] => {
  const useSeason = Math.random() < 0.4;
  const q4Pool = useSeason ? Q4_SEASONS : Q4_ARCHITECTURE;
  return [pick(Q1_VARIANTS), pick(Q2_VARIANTS), pick(Q3_VARIANTS), pick(q4Pool)];
};

export const SHORT_QUESTIONS: Question[] = generateSurveyQuestions();

export const DEEP_QUESTIONS: Question[] = [
  { id: 'dq1', text: 'Does the space embrace entropy or order?', options: [{text:'Absolute Order', weights:{air:3, water:1}}, {text:'Controlled Chaos', weights:{fire:3}}, {text:'Organic Decay', weights:{earth:3}}, {text:'Fluid Adaptation', weights:{water:3}}] },
  { id: 'dq2', text: 'Is the horizon line visible or obscured?', options: [{text:'Infinite/Unbroken', weights:{air:3}}, {text:'Framed/Selective', weights:{fire:2, earth:1}}, {text:'Denied/Internal', weights:{earth:3}}, {text:'Distorted/Reflected', weights:{water:3}}] },
  { id: 'dq3', text: 'Gravity feels...', options: [{text:'Oppressive', weights:{earth:4}}, {text:'Non-existent', weights:{air:4}}, {text:'Suspended', weights:{water:3}}, {text:'Dynamic', weights:{fire:3}}] },
  { id: 'dq4', text: 'Time perception in the space:', options: [{text:'Timeless/Static', weights:{earth:3, air:1}}, {text:'Accelerated', weights:{fire:3}}, {text:'Cyclical', weights:{water:3}}, {text:'Fleeting', weights:{air:3}}] },
  { id: 'dq5', text: 'Relationship to the ground:', options: [{text:'Excavated', weights:{earth:4}}, {text:'Hovering', weights:{air:4}}, {text:'Anchored', weights:{fire:2, earth:2}}, {text:'Dissolving', weights:{water:3, air:1}}] },
  { id: 'dq6', text: 'Temperature sensation:', options: [{text:'Cold/Crisp', weights:{air:3, water:1}}, {text:'Humid/Temperate', weights:{water:3}}, {text:'Radiant Heat', weights:{fire:3}}, {text:'Thermal Mass', weights:{earth:3}}] },
  { id: 'dq7', text: 'Dominant geometric logic:', options: [{text:'Orthogonal/Grid', weights:{air:2, earth:2}}, {text:'Fractal/Jagged', weights:{fire:3}}, {text:'Curvilinear', weights:{water:3}}, {text:'Amorphous', weights:{air:3}}] },
  { id: 'dq8', text: 'Light interaction:', options: [{text:'Reflection', weights:{water:3}}, {text:'Refraction', weights:{air:3}}, {text:'Absorption', weights:{earth:3}}, {text:'Emission', weights:{fire:3}}] },
  { id: 'dq9', text: 'Scale relative to human body:', options: [{text:'Intimate', weights:{earth:2, water:2}}, {text:'Monumental', weights:{air:2, fire:2}}, {text:'Expansive', weights:{air:3}}, {text:'Compressed', weights:{earth:3}}] },
  { id: 'dq10', text: 'Memory of the space:', options: [{text:'A specific image', weights:{fire:3}}, {text:'A vague feeling', weights:{water:3}}, {text:'A tactile sensation', weights:{earth:3}}, {text:'A thought', weights:{air:3}}] },
];

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
