import { Question, MaterialDef, AdjectiveDef, Element } from './types';
import { CANONICAL_MATERIAL_CATALOG, CANONICAL_MATERIAL_GROUPS, getPrimaryElementForMaterial } from './materialsCatalog';
import { CANONICAL_ADJECTIVES_CATALOG, CANONICAL_ADJECTIVE_GROUPS, getPrimaryElementForAdjective } from './adjectivesCatalog';

// Strict Order for Tie-Breaking: Earth > Fire > Water > Air
export const ELEMENTS: Element[] = ['earth', 'fire', 'water', 'air'];

// Element palette — sharp, refined, unmistakable
export const ELEMENT_COLORS: Record<Element, string> = {
  earth: '#8C6D3F',
  fire: '#BF5B3A',
  water: '#2E89A6',
  air: '#5A7FA3',
};

// Muted tones for orbital rings, sphere borders, subtle backgrounds
export const ELEMENT_COLORS_MUTED: Record<Element, string> = {
  earth: '#B09870',
  fire: '#C8806A',
  water: '#5A9EB5',
  air: '#9A94BE',
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

// Material Sphere images keyed by material name (matching MATERIALS_DB names)
const MAT_IMG: Record<string, string> = {
  'Travertine (honed)': '/materials/travertine.png',
  'Clay plaster': '/materials/clay-plaster.png',
  'Lime plaster (warm mineral)': '/materials/lime-plaster.png',
  'Natural oak (horizontal)': '/materials/natural-oak-horizontal.png',
  'Walnut veneer': '/materials/walnut-veneer.png',
  'Industrial brick': '/materials/industrial-brick.png',
  'Dark quartzite': '/materials/tuff.png',
  'Basalt': '/materials/basalt.png',
  'Blackened steel': '/materials/blackened-steel.png',
  'Venetian plaster (polished)': '/materials/venetian-plaster.png',
  'Bronze accents': '/materials/bronze.png',
  'Microcement (continuous)': '/materials/microcement.png',
  'Smooth mineral plaster': '/materials/smooth-mineral.png',
  'Matte ceramic': '/materials/matte-ceramic.png',
  'Linen / wool textile surfaces': '/materials/wool-textile.png',
  'Diffused glass': '/materials/diffused-glass.png',
  'Mirror-polished stainless steel': '/materials/mirror-steel.png',
  'Hammered metal (rippled)': '/materials/hammered-metal.png',
  'Satin chrome': '/materials/satin-chrome.png',
  'Glass blocks (translucent)': '/materials/glass-blocks.png',
  'Curved bent glass': '/materials/curved-glass.png',
  'Corten steel (weathering)': '/materials/corten-steel.png',
  'Oxidized copper': '/materials/oxidized-copper.png',
  'Aged brass (polished)': '/materials/bronze.png',
  'Dark herringbone parquet': '/materials/dark-herringbone.png',
  'Dark marble (high contrast)': '/materials/dark-marble.png',
  'Limewash (bright)': '/materials/limewash.png',
  'White mineral plaster': '/materials/white-plaster.png',
  'Light oak / ash': '/materials/light-oak.png',
  'White marble (Calacatta)': '/materials/white-marble.png',
  'Clear glass (low-iron)': '/materials/clear-glass.png',
  'Bleached birch': '/materials/bleached-birch.png',
  'White terrazzo': '/materials/white-terrazzo.png',
  'Pale concrete (smooth)': '/materials/pale-concrete.png',
  'Board-formed concrete': '/materials/board-formed-concrete.png',
  'Volcanic stone (basalt rough)': '/materials/volcanic-stone.png',
  'Green onyx / marble (veined)': '/materials/green-onyx.png',
  'Rammed earth / terracotta plaster': '/materials/rammed-earth.png',
  'Reclaimed weathered timber': '/materials/reclaimed-timber.png',
  'Herringbone parquet (warm oak)': '/materials/herringbone-parquet.png',
  'Textured concrete (matte)': '/materials/textured-concrete.png',
  'Brushed metal': '/materials/brushed-metal.png',
  'Solid oak': '/materials/solid-oak.png',
  'Walnut (natural finish)': '/materials/walnut.png',
  'White Corian (curved seamless)': '/materials/white-corian.png',
  'Fluted white panel': '/materials/fluted-white.png',
  'Dichroic / iridescent glass': '/materials/dichroic-glass.png',
  'Tinted translucent glass': '/materials/tinted-glass.png',
  'Metallic silver surface': '/materials/metallic-silver.png',
  '3D textured white panel': '/materials/3d-textured-white.png',
};
export const MATERIAL_SPHERE_IMAGES: Record<string, string> = Object.fromEntries(
  CANONICAL_MATERIAL_CATALOG.map((m) => [m.label, MAT_IMG[m.label] || p(m.label)])
);

// Canonical Materials by group (for layer selection panel)
export const CANONICAL_MATERIALS: Record<Element | 'shared', string[]> = CANONICAL_MATERIAL_GROUPS;

// Canonical Atmosphere keywords by element (for layer selection panel)
export const CANONICAL_ATMOSPHERE: Record<Element | 'shared', string[]> = CANONICAL_ADJECTIVE_GROUPS;

// ── Visual calibration: 3 image variants per question, randomized each session ──

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const Q1_VARIANTS: Question[] = [
  {
    id: 'q1', text: 'Which nature calls to you?', subtitle: 'Feel the energy — each landscape holds an element', visual: true,
    options: [
      { text: 'Canyon & clay', weights: { earth: 5, fire: 1 }, image: 'https://images.unsplash.com/photo-1474044159687-1ee9f3a51722?w=480&h=360&fit=crop&q=80' },
      { text: 'Volcanic glow', weights: { fire: 5, earth: 1 }, image: 'https://images.unsplash.com/photo-1476390893418-4c88ecc5a945?w=480&h=360&fit=crop&q=80' },
      { text: 'Still lake', weights: { water: 5, air: 1 }, image: 'https://images.unsplash.com/photo-1439066615861-d1af74d74000?w=480&h=360&fit=crop&q=80' },
      { text: 'Misty peaks', weights: { air: 5, water: 1 }, image: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=480&h=360&fit=crop&q=80' },
    ]
  },
  {
    id: 'q1', text: 'Where does your soul rest?', subtitle: 'Nature reveals your inner element', visual: true,
    options: [
      { text: 'Desert dunes', weights: { earth: 5, air: 1 }, image: 'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=480&h=360&fit=crop&q=80' },
      { text: 'Sunset cliffs', weights: { fire: 5, earth: 2 }, image: 'https://images.unsplash.com/photo-1506929562872-bb421503ef21?w=480&h=360&fit=crop&q=80' },
      { text: 'Ocean horizon', weights: { water: 5, air: 2 }, image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=480&h=360&fit=crop&q=80' },
      { text: 'Cloud forest', weights: { air: 5, water: 1, earth: 1 }, image: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=480&h=360&fit=crop&q=80' },
    ]
  },
  {
    id: 'q1', text: 'Which landscape is yours?', subtitle: 'The place that feels like home', visual: true,
    options: [
      { text: 'Ancient forest', weights: { earth: 5, water: 1 }, image: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=480&h=360&fit=crop&q=80' },
      { text: 'Savanna heat', weights: { fire: 5, air: 1 }, image: 'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=480&h=360&fit=crop&q=80' },
      { text: 'Fjord silence', weights: { water: 5, earth: 1 }, image: 'https://images.unsplash.com/photo-1513519245088-0e12902e35ca?w=480&h=360&fit=crop&q=80' },
      { text: 'Alpine air', weights: { air: 5, fire: 1 }, image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=480&h=360&fit=crop&q=80' },
    ]
  },
];

const Q2_VARIANTS: Question[] = [
  {
    id: 'q2', text: 'Which surface do you want to touch?', subtitle: 'The material that resonates with your nature', visual: true,
    options: [
      { text: 'Natural stone', weights: { earth: 5, water: 1 }, image: 'https://images.unsplash.com/photo-1584184200374-73d7f6c6a175?w=480&h=360&fit=crop&q=80' },
      { text: 'Oxidized metal', weights: { fire: 5, earth: 2 }, image: 'https://images.unsplash.com/photo-1523447704114-37cea08ee064?w=480&h=360&fit=crop&q=80' },
      { text: 'Dark walnut', weights: { water: 5, earth: 2 }, image: 'https://images.unsplash.com/photo-1577226298604-ef918f9733e2?w=480&h=360&fit=crop&q=80' },
      { text: 'White marble', weights: { air: 5, water: 1 }, image: 'https://images.unsplash.com/photo-1544967082-d9d25d867d66?w=480&h=360&fit=crop&q=80' },
    ]
  },
  {
    id: 'q2', text: 'Which texture speaks to you?', subtitle: 'Close your eyes and feel', visual: true,
    options: [
      { text: 'Raw clay', weights: { earth: 5, fire: 1 }, image: 'https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=480&h=360&fit=crop&q=80' },
      { text: 'Brushed copper', weights: { fire: 5, air: 1 }, image: 'https://images.unsplash.com/photo-1594896733292-9a77b5809c63?w=480&h=360&fit=crop&q=80' },
      { text: 'Aged oak', weights: { water: 5, earth: 1 }, image: 'https://images.unsplash.com/photo-1644931551533-02906718127f?w=480&h=360&fit=crop&q=80' },
      { text: 'Polished concrete', weights: { air: 5, earth: 1 }, image: 'https://images.unsplash.com/photo-1536566482680-fca31930a0bd?w=480&h=360&fit=crop&q=80' },
    ]
  },
  {
    id: 'q2', text: 'Pick a material palette', subtitle: 'What your hands want to feel', visual: true,
    options: [
      { text: 'Terracotta', weights: { earth: 5, fire: 2 }, image: 'https://images.unsplash.com/photo-1585314062340-f1a5a7c9328d?w=480&h=360&fit=crop&q=80' },
      { text: 'Black steel', weights: { fire: 5, water: 1 }, image: 'https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?w=480&h=360&fit=crop&q=80' },
      { text: 'Smooth wood', weights: { water: 5, air: 1 }, image: 'https://images.unsplash.com/photo-1546484396-fb3fc6f95f98?w=480&h=360&fit=crop&q=80' },
      { text: 'Frosted glass', weights: { air: 5, water: 2 }, image: 'https://images.unsplash.com/photo-1543393716-375f47996a77?w=480&h=360&fit=crop&q=80' },
    ]
  },
];

const Q3_VARIANTS: Question[] = [
  {
    id: 'q3', text: 'Where would you feel at home?', subtitle: 'The interior that speaks your language', visual: true,
    options: [
      { text: 'Warm & textured', weights: { earth: 5, fire: 1 }, image: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=480&h=360&fit=crop&q=80' },
      { text: 'Bold & dramatic', weights: { fire: 5, earth: 1 }, image: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=480&h=360&fit=crop&q=80' },
      { text: 'Soft & fluid', weights: { water: 5, air: 2 }, image: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=480&h=360&fit=crop&q=80' },
      { text: 'Bright & open', weights: { air: 5, water: 1 }, image: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=480&h=360&fit=crop&q=80' },
    ]
  },
  {
    id: 'q3', text: 'Which room draws you in?', subtitle: 'Imagine spending a day here', visual: true,
    options: [
      { text: 'Rustic retreat', weights: { earth: 5, water: 2 }, image: 'https://images.unsplash.com/photo-1618219908412-a29a1bb7b86e?w=480&h=360&fit=crop&q=80' },
      { text: 'Dark elegance', weights: { fire: 5, water: 1 }, image: 'https://images.unsplash.com/photo-1615874694520-474822394e73?w=480&h=360&fit=crop&q=80' },
      { text: 'Serene comfort', weights: { water: 5, earth: 1 }, image: 'https://images.unsplash.com/photo-1617325247661-675ab4b64ae2?w=480&h=360&fit=crop&q=80' },
      { text: 'Airy loft', weights: { air: 5, fire: 1 }, image: 'https://images.unsplash.com/photo-1741394546743-2d64519ba0d3?w=480&h=360&fit=crop&q=80' },
    ]
  },
  {
    id: 'q3', text: 'Which space is your sanctuary?', subtitle: 'The atmosphere you crave', visual: true,
    options: [
      { text: 'Earth tones', weights: { earth: 5, fire: 1, water: 1 }, image: 'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=480&h=360&fit=crop&q=80' },
      { text: 'Moody contrast', weights: { fire: 5, earth: 2 }, image: 'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?w=480&h=360&fit=crop&q=80' },
      { text: 'Calm waters', weights: { water: 5, air: 1 }, image: 'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=480&h=360&fit=crop&q=80' },
      { text: 'Pure light', weights: { air: 5, earth: 1 }, image: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=480&h=360&fit=crop&q=80' },
    ]
  },
];

const Q4_ARCHITECTURE: Question[] = [
  {
    id: 'q4', text: 'Which form inspires you?', subtitle: 'Architecture as frozen energy', visual: true,
    options: [
      { text: 'Grounded mass', weights: { earth: 5, fire: 1 }, image: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=480&h=360&fit=crop&q=80' },
      { text: 'Dynamic edge', weights: { fire: 5, air: 2 }, image: 'https://images.unsplash.com/photo-1511818966892-d7d671e672a2?w=480&h=360&fit=crop&q=80' },
      { text: 'Organic curve', weights: { water: 5, earth: 1 }, image: 'https://images.unsplash.com/photo-1510554318937-cd0860bf68c2?w=480&h=360&fit=crop&q=80' },
      { text: 'Glass & sky', weights: { air: 5, water: 1 }, image: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=480&h=360&fit=crop&q=80' },
    ]
  },
  {
    id: 'q4', text: 'Which building would you enter?', subtitle: 'Structure reveals character', visual: true,
    options: [
      { text: 'Stone fortress', weights: { earth: 5, water: 1 }, image: 'https://images.unsplash.com/photo-1760294750243-600533dfc8c0?w=480&h=360&fit=crop&q=80' },
      { text: 'Steel & fire', weights: { fire: 5, earth: 1 }, image: 'https://images.unsplash.com/photo-1759828089087-8f71d977b11e?w=480&h=360&fit=crop&q=80' },
      { text: 'Flowing form', weights: { water: 5, air: 2 }, image: 'https://images.unsplash.com/photo-1510554318937-cd0860bf68c2?w=480&h=360&fit=crop&q=80' },
      { text: 'Open frame', weights: { air: 5, fire: 1 }, image: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=480&h=360&fit=crop&q=80' },
    ]
  },
];

const Q4_SEASONS: Question[] = [
  {
    id: 'q4', text: 'Which season feels like you?', subtitle: 'Your energy has a rhythm', visual: true,
    options: [
      { text: 'Autumn warmth', weights: { earth: 5, fire: 2 }, image: 'https://images.unsplash.com/photo-1508193638397-1c4234db14d8?w=480&h=360&fit=crop&q=80' },
      { text: 'Summer blaze', weights: { fire: 5, air: 1 }, image: 'https://images.unsplash.com/photo-1504701954957-2010ec3bcec1?w=480&h=360&fit=crop&q=80' },
      { text: 'Winter stillness', weights: { water: 5, earth: 1 }, image: 'https://images.unsplash.com/photo-1457269449834-928af64c684d?w=480&h=360&fit=crop&q=80' },
      { text: 'Spring breeze', weights: { air: 5, water: 2 }, image: 'https://images.unsplash.com/photo-1490750967868-88aa4f44baee?w=480&h=360&fit=crop&q=80' },
    ]
  },
  {
    id: 'q4', text: 'Your time of year?', subtitle: 'Seasons mirror elemental energy', visual: true,
    options: [
      { text: 'Golden autumn', weights: { earth: 5, water: 1 }, image: 'https://images.unsplash.com/photo-1508193638397-1c4234db14d8?w=480&h=360&fit=crop&q=80' },
      { text: 'Burning summer', weights: { fire: 5, earth: 2 }, image: 'https://images.unsplash.com/photo-1504701954957-2010ec3bcec1?w=480&h=360&fit=crop&q=80' },
      { text: 'Deep winter', weights: { water: 5, air: 1 }, image: 'https://images.unsplash.com/photo-1457269449834-928af64c684d?w=480&h=360&fit=crop&q=80' },
      { text: 'Fresh spring', weights: { air: 5, earth: 1 }, image: 'https://images.unsplash.com/photo-1490750967868-88aa4f44baee?w=480&h=360&fit=crop&q=80' },
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
  image: p(m.label),
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
