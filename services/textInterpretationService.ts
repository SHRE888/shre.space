import { Element, AdjectiveDef, MaterialDef } from '../types';
import { ELEMENTS, ADJECTIVES_DB, MATERIALS_DB } from '../constants';

// ---------------------------------------------------------------------------
// KEYWORD → ELEMENT MAPPING (semantic weights for free text)
// Each term adds to the corresponding element score. Weights 1–3 by strength.
// ---------------------------------------------------------------------------
const ELEMENT_KEYWORDS: Record<Element, { term: string; weight: number }[]> = {
  air: [
    { term: 'air', weight: 3 }, { term: 'light', weight: 2 }, { term: 'open', weight: 2 },
    { term: 'minimal', weight: 2 }, { term: 'ethereal', weight: 3 }, { term: 'transparent', weight: 2 },
    { term: 'pristine', weight: 2 }, { term: 'clear', weight: 1 }, { term: 'bright', weight: 1 },
    { term: 'floating', weight: 2 }, { term: 'airy', weight: 2 },
    { term: 'glass', weight: 1 }, { term: 'white', weight: 1 }, { term: 'plaster', weight: 1 },
    { term: 'suspension', weight: 2 }, { term: 'clarity', weight: 1 }, { term: 'void', weight: 1 },
    { term: 'empty', weight: 1 }, { term: 'breath', weight: 1 }, { term: 'sky', weight: 1 },
  ],
  fire: [
    { term: 'fire', weight: 3 }, { term: 'warm', weight: 2 }, { term: 'bold', weight: 2 },
    { term: 'dynamic', weight: 2 }, { term: 'intense', weight: 2 }, { term: 'radiant', weight: 2 },
    { term: 'energy', weight: 1 }, { term: 'contrast', weight: 1 }, { term: 'dramatic', weight: 1 },
    { term: 'corten', weight: 1 }, { term: 'burnt', weight: 2 }, { term: 'copper', weight: 1 },
    { term: 'brick', weight: 1 }, { term: 'transformation', weight: 1 }, { term: 'focal', weight: 1 },
    { term: 'angular', weight: 1 }, { term: 'heat', weight: 1 }, { term: 'sun', weight: 1 },
  ],
  water: [
    { term: 'water', weight: 3 }, { term: 'fluid', weight: 2 }, { term: 'reflective', weight: 2 },
    { term: 'calm', weight: 2 }, { term: 'deep', weight: 1 }, { term: 'adaptive', weight: 2 },
    { term: 'silent', weight: 1 }, { term: 'flow', weight: 1 }, { term: 'mirror', weight: 1 },
    { term: 'polished', weight: 1 }, { term: 'steel', weight: 1 }, { term: 'resin', weight: 1 },
    { term: 'lacquer', weight: 1 }, { term: 'smooth', weight: 1 }, { term: 'continuity', weight: 1 },
    { term: 'rhythm', weight: 1 }, { term: 'surface', weight: 1 }, { term: 'reflection', weight: 1 },
  ],
  earth: [
    { term: 'earth', weight: 3 }, { term: 'grounded', weight: 2 }, { term: 'heavy', weight: 2 },
    { term: 'raw', weight: 2 }, { term: 'textured', weight: 2 }, { term: 'solid', weight: 2 },
    { term: 'monolithic', weight: 2 }, { term: 'stone', weight: 1 }, { term: 'concrete', weight: 1 },
    { term: 'rammed', weight: 2 }, { term: 'granite', weight: 1 }, { term: 'oak', weight: 1 },
    { term: 'mass', weight: 1 }, { term: 'permanent', weight: 1 }, { term: 'rough', weight: 1 },
    { term: 'weight', weight: 1 }, { term: 'ground', weight: 1 }, { term: 'dense', weight: 1 },
  ],
};

// Normalize scores to percentages (sum = 100)
function normalizeToPercentages(scores: Record<Element, number>): Record<Element, number> {
  const total = ELEMENTS.reduce((sum, el) => sum + scores[el], 0) || 1;
  const result: Record<Element, number> = {} as Record<Element, number>;
  ELEMENTS.forEach(el => {
    result[el] = Math.round((scores[el] / total) * 1000) / 10;
  });
  // Fix rounding so sum is exactly 100
  const sum = ELEMENTS.reduce((s, el) => s + result[el], 0);
  if (sum !== 100 && ELEMENTS.length > 0) {
    result[ELEMENTS[0]] = Math.round((result[ELEMENTS[0]] + (100 - sum)) * 10) / 10;
  }
  return result;
}

// Build a single list of unique { term, weight, element } for scanning
function buildFlatKeywordList(): { term: string; weight: number; element: Element }[] {
  const list: { term: string; weight: number; element: Element }[] = [];
  (ELEMENTS as Element[]).forEach(el => {
    ELEMENT_KEYWORDS[el].forEach(({ term, weight }) => {
      list.push({ term: term.toLowerCase(), weight, element: el });
    });
  });
  return list;
}

const FLAT_KEYWORDS = buildFlatKeywordList();

// ---------------------------------------------------------------------------
// CREATIVE CONCEPT → ELEMENTS + ADJECTIVES (semantic, associative)
// Phrases in text trigger element boosts and suggested adjectives from our DB.
// ---------------------------------------------------------------------------
interface ConceptRule {
  phrases: string[];           // trigger phrases (lowercase, substring match)
  elements: Partial<Record<Element, number>>;  // element score boost
  adjectiveWords: string[];    // words from ADJECTIVES_DB to add (e.g. 'Dynamic', 'Fluid')
}

const CONCEPT_RULES: ConceptRule[] = [
  // Brazilian football, sport, dynamism → Air + Fire, beauty & flow
  {
    phrases: ['brazilian', 'football', 'soccer', 'futebol', 'sport', 'stadium', 'match', 'game', 'athletic'],
    elements: { air: 3, fire: 3, water: 1 },
    adjectiveWords: ['Dynamic', 'Bold', 'Fluid', 'Radiant', 'Open', 'Adaptive'],
  },
  // Beauty, softness, elegance
  {
    phrases: ['beauty', 'beautiful', 'soft', 'softness', 'elegant', 'elegance', 'gentle', 'delicate'],
    elements: { water: 3, air: 2, fire: 0.5 },
    adjectiveWords: ['Calm', 'Reflective', 'Ethereal', 'Fluid', 'Pristine', 'Light'],
  },
  // Dance, rhythm, samba, carnival
  {
    phrases: ['samba', 'dance', 'dancing', 'carnival', 'rhythm', 'music', 'movement'],
    elements: { fire: 2, water: 2, air: 1 },
    adjectiveWords: ['Dynamic', 'Fluid', 'Radiant', 'Adaptive', 'Bold'],
  },
  // Meditation, zen, peace, quiet
  {
    phrases: ['meditation', 'zen', 'peace', 'peaceful', 'quiet', 'tranquil', 'mindful'],
    elements: { water: 3, earth: 2, air: 1 },
    adjectiveWords: ['Calm', 'Silent', 'Grounded', 'Deep', 'Fluid', 'Pristine'],
  },
  // Nature, forest, organic, garden
  {
    phrases: ['nature', 'forest', 'organic', 'garden', 'green', 'natural', 'outdoor'],
    elements: { earth: 3, water: 2, air: 1 },
    adjectiveWords: ['Grounded', 'Raw', 'Fluid', 'Adaptive', 'Open', 'Textured'],
  },
  // Minimalist, Scandinavian, Nordic, clean
  {
    phrases: ['minimalist', 'minimal', 'scandinavian', 'nordic', 'clean', 'simple', 'reduced'],
    elements: { air: 4, water: 1 },
    adjectiveWords: ['Minimal', 'Pristine', 'Light', 'Open', 'Ethereal', 'Calm'],
  },
  // Industrial, loft, raw, urban
  {
    phrases: ['industrial', 'loft', 'urban', 'warehouse', 'factory', 'brutalist'],
    elements: { fire: 2, earth: 3, air: 0.5 },
    adjectiveWords: ['Raw', 'Bold', 'Dynamic', 'Heavy', 'Textured', 'Solid'],
  },
  // Luxury, high-end, premium, refined
  {
    phrases: ['luxury', 'luxurious', 'premium', 'refined', 'high-end', 'sophisticated'],
    elements: { water: 3, air: 1, fire: 0.5 },
    adjectiveWords: ['Reflective', 'Pristine', 'Calm', 'Radiant', 'Minimal', 'Deep'],
  },
  // Cozy, hygge, warm, home
  {
    phrases: ['cozy', 'hygge', 'warm', 'homely', 'comfort', 'comfortable', 'inviting'],
    elements: { fire: 2, earth: 2, water: 0.5 },
    adjectiveWords: ['Warm', 'Grounded', 'Calm', 'Solid', 'Radiant', 'Textured'],
  },
  // Spa, wellness, relaxation
  {
    phrases: ['spa', 'wellness', 'relax', 'relaxation', 'retreat', 'healing'],
    elements: { water: 4, earth: 1, air: 0.5 },
    adjectiveWords: ['Calm', 'Fluid', 'Reflective', 'Deep', 'Pristine', 'Adaptive'],
  },
  // Gallery, art, museum, exhibition
  {
    phrases: ['gallery', 'art', 'museum', 'exhibition', 'white cube', 'curated'],
    elements: { air: 4, water: 0.5 },
    adjectiveWords: ['Minimal', 'Pristine', 'Open', 'Ethereal', 'Light', 'Silent'],
  },
  // Ocean, sea, beach, coastal
  {
    phrases: ['ocean', 'sea', 'beach', 'coastal', 'marine', 'waves'],
    elements: { water: 4, air: 1 },
    adjectiveWords: ['Fluid', 'Reflective', 'Calm', 'Deep', 'Open', 'Adaptive'],
  },
  // Mountain, stone, cave, solid
  {
    phrases: ['mountain', 'stone', 'cave', 'cliff', 'rock', 'solid'],
    elements: { earth: 4, fire: 0.5 },
    adjectiveWords: ['Grounded', 'Heavy', 'Solid', 'Raw', 'Monolithic', 'Textured'],
  },
  // Sunset, golden hour, warm light
  {
    phrases: ['sunset', 'golden hour', 'warm light', 'sunlight', 'golden'],
    elements: { fire: 3, air: 1, water: 0.5 },
    adjectiveWords: ['Radiant', 'Warm', 'Dynamic', 'Intense', 'Ethereal', 'Reflective'],
  },
  // Night, dark, moody, intimate
  {
    phrases: ['night', 'dark', 'moody', 'intimate', 'mysterious', 'shadow'],
    elements: { earth: 2, water: 2, fire: 0.5 },
    adjectiveWords: ['Deep', 'Calm', 'Heavy', 'Reflective', 'Silent', 'Grounded'],
  },
  // Playful, fun, vibrant, colorful
  {
    phrases: ['playful', 'fun', 'vibrant', 'colorful', 'joy', 'happy', 'lively'],
    elements: { fire: 2, air: 2, water: 0.5 },
    adjectiveWords: ['Dynamic', 'Radiant', 'Open', 'Bold', 'Fluid', 'Light'],
  },
  // Timeless, classic, permanent
  {
    phrases: ['timeless', 'classic', 'permanent', 'enduring', 'traditional'],
    elements: { earth: 3, fire: 0.5, water: 0.5 },
    adjectiveWords: ['Solid', 'Grounded', 'Pristine', 'Heavy', 'Monolithic', 'Calm'],
  },
  // --- BIRDS, FLIGHT, SKY — lightness, freedom, openness ---
  {
    phrases: ['bird', 'birds', 'birdwatching', 'watching birds', 'wings', 'flight', 'flying', 'sky', 'avian', 'feather'],
    elements: { air: 4, water: 1, fire: 0.5 },
    adjectiveWords: ['Ethereal', 'Light', 'Open', 'Fluid', 'Pristine', 'Adaptive'],
  },
  // --- HORROR, DARK, SUSPENSE — tension, depth, intensity ---
  {
    phrases: ['horror', 'horrors', 'horror movie', 'horror film', 'scary', 'scared', 'fear', 'thriller', 'suspense', 'creepy', 'haunted', 'gothic', 'noir', 'dark film'],
    elements: { earth: 2, water: 2, fire: 2, air: 0.5 },
    adjectiveWords: ['Deep', 'Heavy', 'Intense', 'Bold', 'Dynamic', 'Reflective'],
  },
  // --- WATCHING, LOVE, ENJOY — receptive, emotional pull ---
  {
    phrases: ['love', 'loves', 'loving', 'enjoy', 'enjoys', 'enjoying', 'watching', 'adore', 'favourite', 'favorite', 'passion', 'passionate'],
    elements: { water: 2, fire: 1.5, air: 0.5 },
    adjectiveWords: ['Radiant', 'Deep', 'Calm', 'Fluid', 'Warm', 'Intense'],
  },
  // --- CINEMA, FILM, MOVIES — dramatic + immersive ---
  {
    phrases: ['cinema', 'film', 'films', 'movie', 'movies', 'watching film', 'screen', 'director', 'cinematic'],
    elements: { fire: 2, water: 2, air: 1 },
    adjectiveWords: ['Dynamic', 'Bold', 'Reflective', 'Deep', 'Radiant', 'Open'],
  },
  // --- READING, BOOKS, LITERATURE ---
  {
    phrases: ['reading', 'books', 'book', 'literature', 'novel', 'poetry', 'library', 'story', 'stories'],
    elements: { water: 2, earth: 1.5, air: 1 },
    adjectiveWords: ['Calm', 'Deep', 'Silent', 'Grounded', 'Pristine', 'Fluid'],
  },
  // --- TRAVEL, ADVENTURE, EXPLORING ---
  {
    phrases: ['travel', 'travelling', 'traveling', 'adventure', 'exploring', 'explore', 'journey', 'wander', 'nomad'],
    elements: { air: 3, fire: 1.5, water: 1 },
    adjectiveWords: ['Open', 'Fluid', 'Adaptive', 'Dynamic', 'Light', 'Radiant'],
  },
  // --- CATS, FELINE — mysterious, calm, sharp ---
  {
    phrases: ['cat', 'cats', 'feline', 'kitten'],
    elements: { water: 2, earth: 1, air: 1 },
    adjectiveWords: ['Calm', 'Fluid', 'Silent', 'Reflective', 'Pristine', 'Adaptive'],
  },
  // --- DOGS, CANINE — warmth, loyalty, grounded ---
  {
    phrases: ['dog', 'dogs', 'puppy', 'canine'],
    elements: { earth: 2, fire: 1.5, water: 0.5 },
    adjectiveWords: ['Warm', 'Grounded', 'Solid', 'Radiant', 'Heavy', 'Textured'],
  },
  // --- STORM, RAIN, WIND, WEATHER ---
  {
    phrases: ['storm', 'storms', 'rain', 'rainy', 'wind', 'windy', 'thunder', 'lightning', 'weather'],
    elements: { water: 2, fire: 1, air: 2 },
    adjectiveWords: ['Dynamic', 'Fluid', 'Intense', 'Radiant', 'Open', 'Deep'],
  },
  // --- SNOW, WINTER, COLD ---
  {
    phrases: ['snow', 'winter', 'cold', 'ice', 'frost', 'frozen'],
    elements: { air: 2, water: 1.5, earth: 0.5 },
    adjectiveWords: ['Pristine', 'Silent', 'Minimal', 'Calm', 'Light', 'Ethereal'],
  },
  // --- SUMMER, HEAT, SUN ---
  {
    phrases: ['summer', 'sunny', 'heat', 'hot', 'bright sun', 'sunshine'],
    elements: { fire: 3, air: 1 },
    adjectiveWords: ['Radiant', 'Warm', 'Dynamic', 'Open', 'Intense', 'Light'],
  },
  // --- AUTUMN, FALL, LEAVES ---
  {
    phrases: ['autumn', 'fall', 'leaves', 'harvest', 'rust', 'amber'],
    elements: { fire: 1.5, earth: 2, water: 0.5 },
    adjectiveWords: ['Warm', 'Grounded', 'Textured', 'Raw', 'Radiant', 'Deep'],
  },
  // --- CITY, URBAN, METROPOLIS ---
  {
    phrases: ['city', 'cities', 'urban', 'metropolis', 'downtown', 'street', 'skyscraper'],
    elements: { fire: 1.5, air: 2, earth: 1 },
    adjectiveWords: ['Dynamic', 'Bold', 'Open', 'Heavy', 'Radiant', 'Solid'],
  },
  // --- ISLAND, REMOTE, ESCAPE ---
  {
    phrases: ['island', 'islands', 'remote', 'escape', 'getaway', 'solitude'],
    elements: { water: 2, air: 2, earth: 0.5 },
    adjectiveWords: ['Open', 'Calm', 'Pristine', 'Fluid', 'Ethereal', 'Silent'],
  },
  // --- JAZZ, IMPROVISATION ---
  {
    phrases: ['jazz', 'improvisation', 'improvised', 'blues', 'saxophone'],
    elements: { water: 2, fire: 1.5, air: 0.5 },
    adjectiveWords: ['Fluid', 'Dynamic', 'Adaptive', 'Deep', 'Radiant', 'Calm'],
  },
  // --- CLASSICAL, ORCHESTRA, PIANO ---
  {
    phrases: ['classical', 'orchestra', 'piano', 'symphony', 'concerto', 'composer'],
    elements: { water: 2, air: 1.5, earth: 0.5 },
    adjectiveWords: ['Calm', 'Deep', 'Pristine', 'Radiant', 'Fluid', 'Silent'],
  },
  // --- ROCK, ELECTRIC, LOUD ---
  {
    phrases: ['rock', 'rock music', 'electric', 'guitar', 'loud', 'concert', 'band'],
    elements: { fire: 3, earth: 1, air: 0.5 },
    adjectiveWords: ['Dynamic', 'Bold', 'Intense', 'Radiant', 'Heavy', 'Raw'],
  },
  // --- ELECTRONIC, AMBIENT, SYNTH ---
  {
    phrases: ['electronic', 'ambient', 'synth', 'techno', 'digital', 'electronic music'],
    elements: { air: 2, water: 1.5, fire: 0.5 },
    adjectiveWords: ['Minimal', 'Fluid', 'Ethereal', 'Open', 'Calm', 'Adaptive'],
  },
  // --- COOKING, KITCHEN, FOOD ---
  {
    phrases: ['cooking', 'kitchen', 'food', 'cuisine', 'recipe', 'chef', 'taste'],
    elements: { fire: 2, earth: 1.5, water: 0.5 },
    adjectiveWords: ['Warm', 'Radiant', 'Grounded', 'Textured', 'Raw', 'Dynamic'],
  },
  // --- FREEDOM, LIBERTY, ESCAPE ---
  {
    phrases: ['freedom', 'free', 'liberty', 'escape', 'unbound', 'limitless'],
    elements: { air: 4, fire: 0.5 },
    adjectiveWords: ['Open', 'Light', 'Ethereal', 'Fluid', 'Minimal', 'Adaptive'],
  },
  // --- DREAMS, DREAMING, SURREAL ---
  {
    phrases: ['dream', 'dreams', 'dreaming', 'surreal', 'fantasy', 'imagination', 'imagine'],
    elements: { air: 2, water: 2, fire: 0.5 },
    adjectiveWords: ['Ethereal', 'Fluid', 'Open', 'Reflective', 'Deep', 'Light'],
  },
  // --- MEMORY, NOSTALGIA, PAST ---
  {
    phrases: ['memory', 'memories', 'nostalgia', 'nostalgic', 'past', 'remember', 'retro'],
    elements: { water: 2, earth: 1, air: 0.5 },
    adjectiveWords: ['Deep', 'Calm', 'Grounded', 'Reflective', 'Pristine', 'Silent'],
  },
  // --- CHAOS, WILD, UNPREDICTABLE ---
  {
    phrases: ['chaos', 'chaotic', 'wild', 'unpredictable', 'messy', 'raw energy'],
    elements: { fire: 3, water: 1, air: 0.5 },
    adjectiveWords: ['Dynamic', 'Bold', 'Raw', 'Intense', 'Fluid', 'Radiant'],
  },
  // --- ORDER, STRUCTURE, DISCIPLINE ---
  {
    phrases: ['order', 'orderly', 'structure', 'structured', 'discipline', 'organized', 'precise'],
    elements: { air: 2, earth: 2, water: 0.5 },
    adjectiveWords: ['Minimal', 'Pristine', 'Grounded', 'Solid', 'Open', 'Calm'],
  },
  // --- MYSTERY, SECRET, HIDDEN ---
  {
    phrases: ['mystery', 'mysterious', 'secret', 'hidden', 'enigma', 'puzzle'],
    elements: { water: 2, earth: 1.5, air: 0.5 },
    adjectiveWords: ['Deep', 'Silent', 'Reflective', 'Grounded', 'Calm', 'Heavy'],
  },
  // --- SPEED, FAST, RACING ---
  {
    phrases: ['speed', 'fast', 'racing', 'race', 'quick', 'velocity', 'run', 'running'],
    elements: { fire: 2.5, air: 1.5 },
    adjectiveWords: ['Dynamic', 'Bold', 'Radiant', 'Open', 'Intense', 'Fluid'],
  },
  // --- SLEEP, REST, BED ---
  {
    phrases: ['sleep', 'sleeping', 'rest', 'resting', 'bed', 'bedroom', 'tired'],
    elements: { water: 3, earth: 1, air: 0.5 },
    adjectiveWords: ['Calm', 'Silent', 'Deep', 'Grounded', 'Fluid', 'Pristine'],
  },
  // --- CHILDREN, PLAY, INNOCENCE ---
  {
    phrases: ['children', 'kids', 'child', 'play', 'playing', 'innocence', 'playful'],
    elements: { air: 2, fire: 1, water: 1 },
    adjectiveWords: ['Light', 'Open', 'Radiant', 'Fluid', 'Dynamic', 'Calm'],
  },
  // --- OLD, ANTIQUE, VINTAGE ---
  {
    phrases: ['old', 'antique', 'vintage', 'retro', 'aged', 'patina', 'historical'],
    elements: { earth: 3, fire: 0.5, water: 0.5 },
    adjectiveWords: ['Grounded', 'Textured', 'Raw', 'Heavy', 'Solid', 'Deep'],
  },
  // --- NEW, FRESH, MODERN ---
  {
    phrases: ['new', 'fresh', 'modern', 'contemporary', 'current', 'innovative'],
    elements: { air: 2.5, fire: 0.5, water: 0.5 },
    adjectiveWords: ['Minimal', 'Pristine', 'Light', 'Open', 'Dynamic', 'Adaptive'],
  },
  // --- SILENCE, QUIET, STILL ---
  {
    phrases: ['silence', 'silent', 'quiet', 'still', 'hush', 'no sound'],
    elements: { water: 3, earth: 1, air: 0.5 },
    adjectiveWords: ['Silent', 'Calm', 'Deep', 'Pristine', 'Grounded', 'Reflective'],
  },
  // --- LAUGHTER, JOY, SMILE ---
  {
    phrases: ['laughter', 'laugh', 'joy', 'joyful', 'smile', 'happy', 'happiness', 'cheerful'],
    elements: { fire: 2, air: 1.5, water: 0.5 },
    adjectiveWords: ['Radiant', 'Open', 'Dynamic', 'Light', 'Warm', 'Fluid'],
  },
  // --- RAINFOREST, JUNGLE, TROPICAL ---
  {
    phrases: ['rainforest', 'jungle', 'tropical', 'lush', 'verdant', 'wilderness'],
    elements: { earth: 2, water: 2, air: 0.5 },
    adjectiveWords: ['Fluid', 'Grounded', 'Raw', 'Deep', 'Adaptive', 'Textured'],
  },
  // --- DESERT, SAND, ARID ---
  {
    phrases: ['desert', 'sand', 'arid', 'dunes', 'dry', 'barren'],
    elements: { earth: 2, fire: 2, air: 0.5 },
    adjectiveWords: ['Raw', 'Minimal', 'Open', 'Heavy', 'Radiant', 'Textured'],
  },
  // --- CLOUDS, SKY, HIGH ---
  {
    phrases: ['clouds', 'cloud', 'sky', 'high', 'altitude', 'above'],
    elements: { air: 4, water: 0.5 },
    adjectiveWords: ['Ethereal', 'Light', 'Open', 'Pristine', 'Fluid', 'Minimal'],
  },
  // --- FOG, MIST, HAZE ---
  {
    phrases: ['fog', 'mist', 'haze', 'hazy', 'vapor', 'steam'],
    elements: { air: 2, water: 2 },
    adjectiveWords: ['Ethereal', 'Calm', 'Fluid', 'Silent', 'Reflective', 'Open'],
  },
  // --- FIREPLACE, HEARTH, EMBER ---
  {
    phrases: ['fireplace', 'hearth', 'ember', 'candle', 'candles', 'glow'],
    elements: { fire: 3, earth: 0.5 },
    adjectiveWords: ['Warm', 'Radiant', 'Intense', 'Bold', 'Dynamic', 'Calm'],
  },
  // --- RAIN ON GLASS, WINDOW, VIEW ---
  {
    phrases: ['rain on glass', 'window', 'view', 'panorama', 'vista'],
    elements: { water: 1.5, air: 2 },
    adjectiveWords: ['Reflective', 'Open', 'Calm', 'Light', 'Pristine', 'Fluid'],
  },
];

// Apply concept rules: return element score deltas and suggested adjective words (from our DB)
function getConceptBoosts(text: string): {
  elementScores: Record<Element, number>;
  suggestedAdjectiveWords: Set<string>;
} {
  const lower = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const elementScores: Record<Element, number> = { air: 0, fire: 0, water: 0, earth: 0 };
  const suggestedAdjectiveWords = new Set<string>();

  for (const rule of CONCEPT_RULES) {
    const matched = rule.phrases.some(phrase => lower.includes(phrase));
    if (matched) {
      (ELEMENTS as Element[]).forEach(el => {
        elementScores[el] += rule.elements[el] ?? 0;
      });
      rule.adjectiveWords.forEach(w => suggestedAdjectiveWords.add(w));
    }
  }

  return { elementScores, suggestedAdjectiveWords };
}

// Resolve adjective words to AdjectiveDef from ADJECTIVES_DB (case-insensitive match)
function adjectivesFromWords(words: Set<string>): AdjectiveDef[] {
  const result: AdjectiveDef[] = [];
  const seen = new Set<string>();
  const wordList = Array.from(words);
  for (const word of wordList) {
    if (result.length >= 8) break;
    const adj = ADJECTIVES_DB.find(a => a.label.toLowerCase() === String(word).toLowerCase());
    if (adj && !seen.has(adj.id)) {
      result.push(adj);
      seen.add(adj.id);
    }
  }
  return result;
}

// Score text for each element using keyword matches (case-insensitive, word-boundary aware)
function scoreElementsFromKeywords(text: string): Record<Element, number> {
  const scores: Record<Element, number> = { air: 0, fire: 0, water: 0, earth: 0 };
  const lower = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!lower) return scores;

  FLAT_KEYWORDS.forEach(({ term, weight, element }) => {
    // Match whole word or as part of a longer word (e.g. "grounded" contains "ground")
    const regex = new RegExp(`\\b${escapeRegex(term)}|${escapeRegex(term)}`, 'gi');
    const matches = lower.match(regex);
    if (matches) scores[element] += weight * matches.length;
  });

  return scores;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Find adjectives mentioned in text (whole-word match, case-insensitive), order by first occurrence
function findAdjectivesInText(text: string): AdjectiveDef[] {
  const lower = text.toLowerCase();
  const result: AdjectiveDef[] = [];
  const seen = new Set<string>();
  // Sort by word length desc so "clear glass" doesn't steal "clear" before we match longer phrases
  const byLength = [...ADJECTIVES_DB].sort((a, b) => b.label.length - a.label.length);
  for (const adj of byLength) {
    if (seen.has(adj.id) || result.length >= 8) continue;
    const word = adj.label.toLowerCase();
    const re = new RegExp(`\\b${escapeRegex(word)}\\b`, 'i');
    if (re.test(text)) {
      result.push(adj);
      seen.add(adj.id);
    }
  }
  return result;
}

// Find materials mentioned in text (name match, case-insensitive, multi-word ok)
function findMaterialsInText(text: string): MaterialDef[] {
  const lower = text.toLowerCase();
  const result: MaterialDef[] = [];
  const seen = new Set<string>();

  // Sort by name length descending so "rammed earth" is tried before "earth"
  const byLength = [...MATERIALS_DB].sort((a, b) => b.name.length - a.name.length);
  for (const mat of byLength) {
    if (seen.has(mat.id)) continue;
    const name = mat.name.toLowerCase();
    if (lower.includes(name)) {
      result.push(mat);
      seen.add(mat.id);
    }
  }
  return result.slice(0, 6);
}

// Add element scores from selected adjectives and materials (each item adds to its element)
function scoreElementsFromSelections(
  adjectives: AdjectiveDef[],
  materials: MaterialDef[]
): Record<Element, number> {
  const scores: Record<Element, number> = { air: 0, fire: 0, water: 0, earth: 0 };
  adjectives.forEach(a => { scores[a.element] += 2; });
  materials.forEach(m => {
    const w = m.elementWeights;
    if (!w) return;
    scores.earth += 2 * (w.earth || 0);
    scores.fire += 2 * (w.fire || 0);
    scores.water += 2 * (w.water || 0);
    scores.air += 2 * (w.air || 0);
  });
  return scores;
}

// Combine keyword scores and selection scores with weights, then normalize
function combineAndNormalize(
  keywordScores: Record<Element, number>,
  selectionScores: Record<Element, number>
): Record<Element, number> {
  const totalKw = ELEMENTS.reduce((s, el) => s + keywordScores[el], 0);
  const totalSel = ELEMENTS.reduce((s, el) => s + selectionScores[el], 0);
  const hasKw = totalKw > 0;
  const hasSel = totalSel > 0;

  const combined: Record<Element, number> = { air: 0, fire: 0, water: 0, earth: 0 };
  ELEMENTS.forEach(el => {
    let v = 0;
    if (hasKw) v += 0.5 * keywordScores[el];
    if (hasSel) v += 0.5 * selectionScores[el];
    if (!hasKw && !hasSel) {
      combined[el] = 25; // default equal
      return;
    }
    combined[el] = v;
  });
  return normalizeToPercentages(combined);
}

export interface InterpretedRefinement {
  refinedPercentages: Record<Element, number>;
  selectedAdjectives: AdjectiveDef[];
  selectedMaterials: MaterialDef[];
}

/**
 * Interprets free-form text and maps it to energies (element %), adjectives, and materials.
 * Formula:
 * 1. Keyword scan → element scores (ELEMENT_KEYWORDS).
 * 2. Creative concept rules (CONCEPT_RULES) → extra element scores + suggested adjectives (e.g. "brazilian football" → Air+Fire, Dynamic, Fluid, Bold).
 * 3. Match adjectives/materials by name in text → selected lists (capped at 6 each).
 * 4. Merge explicit adjectives + concept-suggested adjectives (dedupe, cap 6).
 * 5. Selection-based element scores from merged adjectives + materials.
 * 6. Combine (keyword + concept + selection) scores, normalize to 100%.
 */
export function interpretTextToRefinement(text: string): InterpretedRefinement {
  const trimmed = (text || '').trim();

  const keywordScores = scoreElementsFromKeywords(trimmed);
  const { elementScores: conceptScores, suggestedAdjectiveWords } = getConceptBoosts(trimmed);

  const explicitAdjectives = findAdjectivesInText(trimmed);
  const conceptAdjectives = adjectivesFromWords(suggestedAdjectiveWords);
  const selectedAdjectives = mergeAdjectives(explicitAdjectives, conceptAdjectives);

  const selectedMaterials = findMaterialsInText(trimmed);
  const selectionScores = scoreElementsFromSelections(selectedAdjectives, selectedMaterials);

  const combinedKeywordAndConcept: Record<Element, number> = { air: 0, fire: 0, water: 0, earth: 0 };
  ELEMENTS.forEach(el => {
    combinedKeywordAndConcept[el] = keywordScores[el] + conceptScores[el];
  });
  const refinedPercentages = combineAndNormalize(combinedKeywordAndConcept, selectionScores);

  return {
    refinedPercentages,
    selectedAdjectives,
    selectedMaterials,
  };
}

function mergeAdjectives(explicit: AdjectiveDef[], fromConcepts: AdjectiveDef[]): AdjectiveDef[] {
  const seen = new Set<string>();
  const result: AdjectiveDef[] = [];
  for (const a of explicit) {
    if (!seen.has(a.id)) {
      result.push(a);
      seen.add(a.id);
    }
  }
  for (const a of fromConcepts) {
    if (result.length >= 8) break;
    if (!seen.has(a.id)) {
      result.push(a);
      seen.add(a.id);
    }
  }
  return result;
}
