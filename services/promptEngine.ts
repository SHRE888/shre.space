import { UserState, AnalysisResult, Element, PromptResult, PromptInput, GenerationPackage, Vector4, MaterialDef, ColorPalette, BudgetLevel, CompositionMode, DominanceStrength } from '../types';
import { SHORT_QUESTIONS, ELEMENTS, COMBINATION_ARTICLES, PROMPT_BANS, ELEMENT_ARCH_TERMS } from '../constants';
import { scrubBannedTokens } from './bannedTokens';
import { elementLanguageProfile } from './elementLanguage';
import { buildDesignSummary } from './designSummary';
import { getEnabledMaterials } from './refinementLogic';
import { buildBudgetBrandDirective } from '../lib/brandCatalog';
import { getMaterialCategory, type MaterialCategory } from '../materialsCatalog';
import {
  buildSHREPromptBody,
  buildAtmosphereCalibrationBlock,
  buildAntiUtopianControlBlock,
  buildBathroomArchitecturalBlock,
  BATHROOM_ACCENT_DECOR,
  FUNCTIONAL_PLACEMENT_LOGIC,
  readElements,
  ELEMENT_DAYLIGHT_QUALITY,
  ELEMENT_ACCENT_DECOR,
  ROOM_ATMOSPHERE_REFINEMENT,
} from './shrePrompt';

/** One-line summary of workspace space config; shown/edited in results footer and fed to the image prompt */
export const formatSpaceConfigOneLiner = (p: UserState['params']): string => {
  const domainLabel = p.domain === 'architecture' ? 'Architecture' : 'Interior';
  const cat = p.category || 'Space';
  const area = p.squareMeters ?? 120;
  const rooms = p.rooms && p.rooms.length > 0 ? p.rooms.join(', ') : null;
  const ctx = p.domain === 'architecture' && p.archContext ? p.archContext : null;
  const ceiling = typeof p.ceilingHeight === 'number' ? `${p.ceilingHeight} m ceil` : null;
  const light = p.naturalLight ? `${p.naturalLight} light` : null;
  const palette = p.colorPalette && p.colorPalette !== 'auto' ? p.colorPalette.replace(/-/g, ' ') : null;
  const parts: string[] = [domainLabel, cat];
  if (rooms) parts.push(rooms);
  if (ctx) parts.push(ctx);
  parts.push(p.rooms && p.rooms.length > 1 ? `${area} m² (this render — primary space)` : `${area} m²`);
  if (ceiling) parts.push(ceiling);
  if (light) parts.push(light);
  if (palette) parts.push(palette);
  return parts.join(' · ');
};

/** Stable sort: highest % first; ties follow catalog order earth → fire → water → air. */
const sortElementsByDistribution = (activeDist: Vector4): Element[] =>
  [...ELEMENTS].sort((a, b) => {
    const d = activeDist[b] - activeDist[a];
    if (Math.abs(d) < 0.01) return ELEMENTS.indexOf(a) - ELEMENTS.indexOf(b);
    return d;
  });

/**
 * Largest-remainder (Hare) rounding. Distributes integer percentage shares
 * across the four elements so the total is EXACTLY 100 after rounding —
 * naive Math.round can return 99 or 101, which breaks the SHRE invariant
 * that diagnostic percentages add to 100. Allows 0% per element.
 */
export const largestRemainderRound = (raw: Record<Element, number>): Record<Element, number> => {
  const order: Element[] = ['earth', 'fire', 'water', 'air'];
  const floors: Record<Element, number> = { earth: 0, fire: 0, water: 0, air: 0 };
  const remainders: Array<{ el: Element; rem: number }> = [];
  let assigned = 0;
  for (const el of order) {
    const v = Math.max(0, raw[el]);
    const f = Math.floor(v);
    floors[el] = f;
    assigned += f;
    remainders.push({ el, rem: v - f });
  }
  let shortfall = 100 - assigned;
  // Hand out the missing units to the largest fractional remainders,
  // breaking ties via catalog order so the result is deterministic.
  remainders.sort((a, b) => {
    if (b.rem !== a.rem) return b.rem - a.rem;
    return order.indexOf(a.el) - order.indexOf(b.el);
  });
  let i = 0;
  while (shortfall > 0 && i < remainders.length) {
    floors[remainders[i].el] += 1;
    shortfall -= 1;
    i += 1;
  }
  // If the raw vector was all zeros (shouldn't happen — calculateAnalysis
  // guards against it — but be safe), fall back to a flat 25-each.
  if (Object.values(floors).every((v) => v === 0)) {
    return { earth: 25, fire: 25, water: 25, air: 25 };
  }
  return floors;
};

/**
 * SHRE composition mode (type lives in types.ts). Determines how the
 * elemental distribution behaves as a SPATIAL IDENTITY, not just which
 * number is largest:
 *
 *   - 'SingleDominant' — one element clearly leads (gap to runner-up ≥ 10)
 *   - 'NarrowLead'     — primary leads by 5–9 (atmospheric leadership rule,
 *                        per user spec: a small gap can still control identity)
 *   - 'DualCore'       — top two are within 5 of each other (joint identity)
 *   - 'Triadic'        — three elements each ≥ 15, fourth < 10
 *   - 'Minimal'        — only two elements have meaningful presence (≥ 5)
 *
 * The image prompt and the client report both branch on this so they agree.
 */
export const detectComposition = (pct: Record<Element, number>): CompositionMode => {
  const sorted = (Object.entries(pct) as Array<[Element, number]>).sort((a, b) => b[1] - a[1]);
  const [p1, p2, p3, p4] = sorted.map(([, v]) => v);
  const gap12 = p1 - p2;
  const meaningfulCount = sorted.filter(([, v]) => v >= 5).length;

  // Minimal — only two elements have any presence at all
  if (meaningfulCount <= 2) return 'Minimal';

  // Triadic — top three all carry weight, fourth is a trace
  if (p3 >= 15 && p4 < 10) return 'Triadic';

  // Dual-core — top two within 5%; neither alone controls
  if (gap12 < 5) return 'DualCore';

  // Narrow lead — 5–9% gap; primary controls identity by atmospheric leadership
  // but the report explains the dual tension instead of suppressing the runner-up
  if (gap12 < 10) return 'NarrowLead';

  return 'SingleDominant';
};

export const dominanceStrengthFor = (composition: CompositionMode): DominanceStrength => {
  if (composition === 'DualCore') return 'dual';
  if (composition === 'NarrowLead') return 'narrow';
  return 'clear';
};

/**
 * Sum survey-answer weights into an integer-percentage distribution that
 * adds to EXACTLY 100. No floors, no forced balance — 0% is allowed. If
 * the user skipped the survey we return a flat 25/25/25/25 so downstream
 * code doesn't have to guard against undefined.
 */
export const calculateAnalysis = (state: UserState): AnalysisResult => {
  if (state.shortSurveySkipped) {
    const flat: Record<Element, number> = { earth: 25, fire: 25, water: 25, air: 25 };
    return {
      percentages: flat,
      primary: 'earth',
      secondary: 'air',
      composition: 'DualCore',
      dominanceStrength: 'dual',
      estimate: { cost: { low: 0, high: 0 }, timeline: { low: 0, high: 0 } },
    };
  }

  // Sum weighted-percentage contributions across all answered questions.
  // Each answer's weights already sum to 100, so totalScore = 100 × n
  // where n is the number of answered questions — normalization below
  // divides by totalScore to produce the final per-element percentage.
  const scores: Record<Element, number> = { earth: 0, fire: 0, water: 0, air: 0 };
  Object.entries(state.shortSurveyAnswers).forEach(([qId, answerIdx]) => {
    const question = SHORT_QUESTIONS.find((q) => q.id === qId);
    if (question && question.options[answerIdx]) {
      const weights = question.options[answerIdx].weights;
      Object.entries(weights).forEach(([el, weight]) => {
        if (weight) scores[el as Element] += weight;
      });
    }
  });

  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0) || 1;
  const raw: Record<Element, number> = {
    earth: (scores.earth / totalScore) * 100,
    fire:  (scores.fire  / totalScore) * 100,
    water: (scores.water / totalScore) * 100,
    air:   (scores.air   / totalScore) * 100,
  };
  const percentages = largestRemainderRound(raw);

  // Verify the invariant — should always be true after largest-remainder
  // rounding, but if a future bug breaks it we want to know loudly.
  const totalAfter = percentages.earth + percentages.fire + percentages.water + percentages.air;
  if (totalAfter !== 100) {
    console.error(`SHRE: largestRemainderRound produced sum ${totalAfter}, expected 100. Raw:`, raw);
  }

  const sorted = sortElementsByDistribution(percentages as Vector4);
  const composition = detectComposition(percentages);
  const dominanceStrength = dominanceStrengthFor(composition);

  const area = state.params.squareMeters || 100;
  const isInterior = state.params.domain === 'interior';
  const baseCost = isInterior ? 1500 : 2500;
  const complexityMultiplier = (percentages.fire + percentages.water) / 40 + 1;
  const estimatedTotal = area * baseCost * complexityMultiplier;

  return {
    percentages,
    primary: sorted[0],
    secondary: sorted[1],
    composition,
    dominanceStrength,
    estimate: {
      cost: {
        low: Math.round(estimatedTotal * 0.9),
        high: Math.round(estimatedTotal * 1.2),
      },
      timeline: {
        low: Math.round(Math.sqrt(area)),
        high: Math.round(Math.sqrt(area) * 1.5),
      },
    },
  };
};

// --- REAL-WORLD PRODUCT REFERENCES ---
// Maps each material in our catalog to specific real-world brands and product lines.
// Exported because services/shrePrompt.ts uses it to derive brand+finish for
// user-selected materials (user-wins logic in the SHRE prompt body).
export const MATERIAL_PRODUCT_MAP: Record<string, { brand: string; product: string; finish: string }[]> = {
  // ── EARTH ──────────────────────────────────────────────────────────────
  'Travertine (honed)':                       [{ brand: 'Stone Italiana', product: 'Navona travertine slab', finish: 'honed unfilled cross-cut, warm cream-beige' }],
  'Jura limestone (golden)':                  [{ brand: 'Solnhofen / Jura Marmor', product: 'Jura beige limestone slab', finish: 'honed with fossil inclusions, warm golden-beige' }],
  'Pietra Serena (Tuscan)':                   [{ brand: 'Il Casone', product: 'Pietra Serena Toscana slab', finish: 'sand-blasted matte grey-green Tuscan stone' }],
  'Cipollino marble (warm green-veined)':     [{ brand: 'Antolini', product: 'Cipollino Apuano marble slab', finish: 'polished with warm wavy green-and-gold veining on cream base' }],
  'Green onyx / marble (veined)':             [{ brand: 'Antolini', product: 'Rainforest Green marble slab', finish: 'polished full-height with dramatic emerald-green and white-gold veining' }],
  'Marrón Emperador (warm brown marble)':     [{ brand: 'Levantina', product: 'Emperador Dark marble slab', finish: 'polished warm chocolate-brown with light beige veining' }],
  'Volcanic stone (basalt rough)':            [{ brand: 'Stone Italiana', product: 'basalt volcanic stone slab', finish: 'rough split-face or bush-hammered, deep charcoal' }],
  'Sand-blasted granite (warm)':              [{ brand: 'Levantina', product: 'Giallo Veneziano granite slab', finish: 'sand-blasted warm beige-and-gold' }],
  'Natural oak (horizontal)':                 [{ brand: 'Kährs', product: 'Grande Collection engineered oak', finish: 'horizontal grain natural-oiled honey tone' }],
  'Herringbone parquet (warm oak)':           [{ brand: 'Kährs', product: 'Chevron Natural Oak parquet', finish: 'warm natural-oiled herringbone with aged patina' }],
  'Walnut veneer':                            [{ brand: 'Alpi', product: 'Walnut fine veneer panel', finish: 'satin vertical grain, deep cognac-chocolate' }],
  'Reclaimed weathered timber':               [{ brand: 'TerraMai', product: 'reclaimed barn-wood plank', finish: 'naturally weathered silver-brown patina with nail holes and split grain' }],
  'Clay plaster':                             [{ brand: 'Clayworks', product: 'natural clay plaster wall finish', finish: 'hand-troweled with tonal irregularity, warm clay-cream' }],
  'Lime plaster (warm mineral)':              [{ brand: 'Bauwerk', product: 'lime plaster', finish: 'warm mineral trowel finish, soft pink-cream undertone' }],
  'Rammed earth / terracotta plaster':        [{ brand: 'Clayworks', product: 'rammed earth effect clay plaster', finish: 'layered terracotta warm-ochre hand-applied with horizontal sediment lines' }],
  'Tadelakt (warm pigmented Moroccan)':       [{ brand: 'Tadelakt Maroc', product: 'pigmented lime tadelakt', finish: 'hand-burnished warm pigmented (clay-pink, ochre, cream) waterproof Moroccan plaster' }],
  'Board-formed concrete':                    [{ brand: 'Site cast', product: 'board-formed exposed concrete', finish: 'raw formwork texture with horizontal timber-grain imprint and tie-rod holes' }],
  'Industrial brick':                         [{ brand: 'Petersen Tegl', product: 'Kolumba long-format reclaimed brick', finish: 'red-rust pastoral rustic with mortar joints visible' }],
  'Zellige tile (warm ochre / olive)':        [{ brand: 'Mosaic del Sur', product: 'Zellige handmade Moroccan tile', finish: 'irregular handmade ochre / olive / clay glaze with subtle color variation' }],
  'Jute / sisal rug':                         [{ brand: 'Armadillo', product: 'Sahara jute rug', finish: 'natural hand-woven coarse fibre, warm honey tone' }],
  'Bouclé (oat / cream)':                     [{ brand: 'Dedar', product: 'Karakorum bouclé upholstery', finish: 'natural oatmeal looped weave, warm tactile' }],
  'Mohair velvet (warm rust / olive)':        [{ brand: 'Pierre Frey', product: 'Cygne mohair velvet', finish: 'rich pile in warm rust / olive tones with slight luster' }],

  // ── FIRE ───────────────────────────────────────────────────────────────
  'Dark marble (high contrast)':              [{ brand: 'Salvatori', product: 'Nero Marquina marble', finish: 'polished with crisp white calcite veining on black base' }],
  'Port Laurent / Saint Laurent marble':      [{ brand: 'Antolini', product: 'Port Laurent marble slab', finish: 'polished black with bold honey-gold veining' }],
  'Calacatta Viola (white + oxblood veining)':[{ brand: 'Antolini', product: 'Calacatta Viola marble slab', finish: 'polished white with dramatic oxblood-purple and rose veining' }],
  'Patagonia quartzite (smoky burgundy)':     [{ brand: 'Antolini', product: 'Patagonia quartzite slab', finish: 'polished smoky-burgundy with grey-cream cloud movement' }],
  'Sodalite Blue (deep midnight stone)':      [{ brand: 'Antolini', product: 'Sodalite Blue Royal slab', finish: 'polished deep midnight-blue with white calcite flecks' }],
  'Red travertine (Persian)':                 [{ brand: 'Stone Italiana', product: 'Persian Red travertine slab', finish: 'honed warm rust-orange with horizontal vug texture' }],
  'Bardiglio Imperiale (deep grey-black)':    [{ brand: 'Antolini', product: 'Bardiglio Imperiale marble slab', finish: 'polished deep grey-black with subtle silver veining' }],
  'Dark quartzite':                           [{ brand: 'Levantina', product: 'Black Pearl quartzite slab', finish: 'honed deep charcoal with dramatic white-silver veining' }],
  'Basalt':                                   [{ brand: 'Stone Federation', product: 'basalt slab', finish: 'honed matte volcanic charcoal' }],
  'Shou-sugi-ban (charred timber)':           [{ brand: 'Delta Millworks', product: 'Yakisugi cedar plank', finish: 'traditional Japanese charred-black timber with brushed black-silver finish' }],
  'Smoked / fumed oak':                       [{ brand: 'Kährs', product: 'Smoked Oak engineered plank', finish: 'ammonia-fumed dark chocolate oak with grey undertone' }],
  'Dark herringbone parquet':                 [{ brand: 'Kährs', product: 'Chevron Dark Smoke oak parquet', finish: 'deep fumed herringbone with matte lacquer' }],
  'Venetian plaster (polished)':              [{ brand: 'Marmorino', product: 'Marmorino Veneziano polished plaster', finish: 'polished lime-based deep saturated (oxblood / sienna / charcoal) with marbled depth' }],
  'Corten steel (weathering)':                [{ brand: 'SSAB', product: 'Weathering COR-TEN A steel panel', finish: 'natural oxidized rust-orange to oxblood patina, mottled' }],
  'Oxidized copper':                          [{ brand: 'Aurubis', product: 'Nordic Green copper sheet', finish: 'pre-oxidized verdigris green-blue patina with copper highlights' }],
  'Burnished antique brass':                  [{ brand: 'Rocky Mountain Hardware', product: 'antique brass sheet', finish: 'hand-burnished warm honey-gold with dark-rim aging' }],
  'Aged brass (polished)':                    [{ brand: 'Rocky Mountain Hardware', product: 'polished aged brass panel', finish: 'warm gold patina with living surface, subtle hand-rubbed marks' }],
  'Blackened steel':                          [{ brand: 'A. Zahner', product: 'blackened steel panel', finish: 'oxidized matte gun-metal with subtle warm bronze undertone' }],
  'Bronze accents':                           [{ brand: 'Nanz', product: 'cast bronze lever handle', finish: 'dark patinated wax seal, deep warm bronze' }],
  'Oxblood / rust velvet upholstery':         [{ brand: 'Dedar', product: 'Mantua mohair velvet — oxblood', finish: 'deep saturated oxblood pile with rich light absorption' }],
  'Cognac saddle leather':                    [{ brand: 'Edelman Leather', product: 'Cavallo natural cognac leather', finish: 'full-grain warm cognac saddle leather with visible pull-up patina' }],
  'Charcoal / smoke velvet':                  [{ brand: 'Pierre Frey', product: 'Velours Plombières charcoal velvet', finish: 'deep charcoal pile with subtle warm bronze undertone' }],

  // ── WATER ──────────────────────────────────────────────────────────────
  'Bianco Lasa marble (cool grey-white)':     [{ brand: 'Marmo Lasa', product: 'Bianco Lasa Vena Oro slab', finish: 'polished cool grey-white with subtle gold veining' }],
  'Smoke quartzite (silver-grey)':            [{ brand: 'Levantina', product: 'Silver Cloud quartzite slab', finish: 'honed silver-grey with cloudy soft movement' }],
  'Onice Acqua (translucent water-blue onyx)':[{ brand: 'Antolini', product: 'Onice Azul slab — backlit', finish: 'translucent backlit pale water-blue onyx with crystalline veining' }],
  'Silver travertine (polished)':             [{ brand: 'Stone Italiana', product: 'Silver travertine slab', finish: 'polished silver-grey cross-cut with cool reflective sheen' }],
  'Microcement (continuous)':                 [{ brand: 'Kerakoll', product: 'Cementoresina microcement', finish: 'seamless mineral coat in cool greige with cloudy soft variation' }],
  'Smooth mineral plaster':                   [{ brand: 'Kerakoll', product: 'Cementoresina smooth wall plaster', finish: 'venetian trowel micro-polished cool cream-grey' }],
  'Tadelakt (cool pigmented Moroccan)':       [{ brand: 'Tadelakt Maroc', product: 'pigmented lime tadelakt — cool tones', finish: 'hand-burnished cool pigmented (slate, dove, smoke) waterproof Moroccan plaster' }],
  'Mirror-polished stainless steel':          [{ brand: 'Rimex Metals', product: 'Super Mirror 304 stainless steel panel', finish: '8K mirror polish reflective silver, picks up colored room reflections' }],
  'Hammered metal (rippled)':                 [{ brand: 'De Castelli', product: 'Martellata hammered steel sheet', finish: 'rippled hand-hammered silver dimpled texture catching light' }],
  'Satin chrome':                             [{ brand: 'Rimex Metals', product: '304 stainless steel panel', finish: 'satin directional brush No.4 soft silver' }],
  'Polished nickel':                          [{ brand: 'P.E. Guerin', product: 'polished nickel panel / hardware', finish: 'cool silver-white polished nickel with crisp reflection' }],
  'Diffused glass':                           [{ brand: 'Saint-Gobain', product: 'Planilux acid-etched glass', finish: 'satin frost translucent diffusing soft cool light' }],
  'Glass blocks (translucent)':               [{ brand: 'Seves Glassblock', product: 'Pegasus Metallizzato glass block', finish: 'translucent pale-aqua with soft internal diffusion' }],
  'Curved bent glass':                        [{ brand: 'Cricursa', product: 'hot-bent curved glass panel', finish: 'extra-clear laminated curved with smooth fluid form' }],
  'Reeded / ribbed fluted glass':             [{ brand: 'Lambert & Fils / Reglit Glass', product: 'reeded fluted glass panel', finish: 'vertical fluted ribs with soft diffusion, cool neutral tone' }],
  'Matte ceramic':                            [{ brand: 'Mutina', product: 'Mews collection porcelain tile', finish: 'chalky matte cream / sand / grey surface' }],
  'Glass mosaic tile (10–25 mm cool)':        [{ brand: 'Bisazza', product: 'Bisazza Studio glass mosaic — cool palette', finish: '10–25 mm Italian glass mosaic in pale aqua / smoke / silver, hand-laid' }],
  'Silk satin (champagne / smoke)':           [{ brand: 'Jim Thompson', product: 'Bangkok Silk satin', finish: 'high-sheen woven silk in champagne / smoke with soft reflective drape' }],
  'Cream bouclé':                             [{ brand: 'Pierre Frey', product: 'Karakorum cream bouclé', finish: 'soft creamy looped weave, organic tactile' }],
  'Linen / wool textile surfaces':            [{ brand: 'Kvadrat', product: 'Hallingdal 65 wool upholstery', finish: 'mélange weave, oat / flax neutral' }, { brand: 'Dedar', product: 'Nuvola linen', finish: 'natural ivory slub' }],
  'Pale grey wool felt':                      [{ brand: 'Kvadrat', product: 'Divina Melange 3 wool felt', finish: 'dense pale-grey wool felt with subtle mottling' }],

  // ── AIR ────────────────────────────────────────────────────────────────
  'White marble (Calacatta)':                 [{ brand: 'Salvatori', product: 'Calacatta Oro marble slab', finish: 'polished white with crisp grey-to-warm-gold veining' }],
  'Thassos marble (pure white)':              [{ brand: 'Marble Trend', product: 'Thassos Crystal White marble slab', finish: 'polished pure crystalline white, near vein-free' }],
  'Dolomite snow-white marble':               [{ brand: 'Antolini', product: 'Dolomite slab', finish: 'polished snow-white with very fine subtle grey veining' }],
  'Bianco Statuario (luminous white)':        [{ brand: 'Henraux', product: 'Statuario Carrara marble slab', finish: 'polished luminous white with delicate grey veining' }],
  'White terrazzo':                           [{ brand: 'Huguet', product: 'Terrazzo Blanco precast slab', finish: 'polished white aggregate with subtle warm-brown / grey chips' }],
  'Light oak / ash':                          [{ brand: 'Kährs', product: 'Grande Collection engineered ash', finish: 'matte pale honey-blonde grain' }],
  'Bleached birch':                           [{ brand: 'Kährs', product: 'Nordic Naturals birch plank', finish: 'bleached whitewash matte' }],
  'Limewash (bright)':                        [{ brand: 'Bauwerk', product: 'limewash paint', finish: 'soft chalky bright mineral wash with very subtle warm undertone' }],
  'White mineral plaster':                    [{ brand: 'Marmorino', product: 'white mineral plaster', finish: 'matte lime-based pure cream-white with micro-texture' }],
  'Pale concrete (smooth)':                   [{ brand: 'LCDA', product: 'BFUP smooth concrete panel', finish: 'pale grey silk-smooth seamless cast' }],
  'Metallic silver surface':                  [{ brand: 'Rimex Metals', product: 'Brushed aluminium panel', finish: 'satin silver metallic with soft directional brush' }],
  'Anodized champagne aluminium':             [{ brand: 'Reynaers Aluminium', product: 'champagne anodized aluminium profile / panel', finish: 'soft warm champagne metallic finish, contemporary architectural skin' }],
  'Clear glass (low-iron)':                   [{ brand: 'Saint-Gobain', product: 'Diamant low-iron glass', finish: 'ultra-clear transparent structural with crisp room reflections' }],
  'Dichroic / iridescent glass':              [{ brand: '3M', product: 'Dichroic Glass Film on laminated glass panel', finish: 'color-shifting iridescent (amber-violet-green-blue spectrum), changes hue across panel and viewing angle' }],
  'Tinted translucent glass':                 [{ brand: 'Cricursa', product: 'laminated colored PVB glass panel', finish: 'tinted translucent in soft violet, amber, or rose-gold gradient' }],
  'Frosted satin glass':                      [{ brand: 'Saint-Gobain', product: 'SatinDeco satin glass', finish: 'soft uniform satin frost diffusing daylight' }],
  'White Corian (curved seamless)':           [{ brand: 'DuPont', product: 'Corian Glacier White solid surface', finish: 'thermoformed curved seamless, no visible joints, pure white' }],
  'Fluted white panel':                       [{ brand: 'Cosentino', product: 'Dekton Fiandra fluted profile', finish: 'pure white vertical fluted ridges, floor-to-ceiling architectural feature' }],
  '3D textured white panel':                  [{ brand: 'WallArt / Lithos Design', product: '3D wall panel in mineral composite', finish: 'geometric relief pattern, matte pure white, casts shadow play' }],
  'Sheer linen voile drapery':                [{ brand: 'Dedar', product: 'Aurea sheer linen voile', finish: 'lightweight sheer woven linen, ivory / soft cream, diffuses daylight' }],
  'Iridescent satin / lurex':                 [{ brand: 'Rubelli', product: 'Lurex iridescent satin', finish: 'shimmering iridescent satin with subtle violet / silver shift' }],

  // ── SHARED ─────────────────────────────────────────────────────────────
  'Textured concrete (matte)':                [{ brand: 'LCDA', product: 'BFUP concrete panel', finish: 'raw shuttered matte with soft tonal variation' }],
  'Brushed metal':                            [{ brand: 'Rimadesio', product: 'brushed metal profile', finish: 'satin anodization, neutral silver-grey' }],
  'Solid oak':                                [{ brand: 'Boen', product: 'Chaletino wide plank', finish: 'solid oak natural-oiled honey tone' }],
  'Walnut (natural finish)':                  [{ brand: 'Kährs', product: 'Lumen Collection American walnut', finish: 'satin oiled natural deep cognac' }],

  // ── Legacy aliases for backward compatibility with old saved states ────
  'Natural Oak':                              [{ brand: 'Kährs', product: 'Grande Collection engineered oak', finish: 'matte natural grain' }],
  'Walnut':                                   [{ brand: 'Kährs', product: 'Lumen Collection American walnut', finish: 'satin oiled natural' }],
  'Travertine':                               [{ brand: 'Stone Italiana', product: 'Navona travertine', finish: 'honed' }],
  'Clay Plaster':                             [{ brand: 'Clayworks', product: 'Clay plaster', finish: 'hand-troweled' }],
  'Microcement':                              [{ brand: 'Kerakoll', product: 'Cementoresina microcement', finish: 'seamless mineral coat' }],
  'Clear Glass':                              [{ brand: 'Vitrocsa', product: 'minimal frame glass', finish: 'low-iron ultra-clear' }],
};

// Expanded furniture pool — each generation cycles different items via generationIndex
const FURNITURE_BY_ELEMENT: Record<Element, string[]> = {
  earth: [
    'Baxter Damasco modular sofa in natural oatmeal linen — deep, low, ground-level',
    'Living Divani Extrawall modular in olive green velvet — chunky and sprawling',
    'Poliform Bristol sofa in sage green nubuck — low-slung with thick cushions',
    'Maxalto Lutetia sofa in warm cream linen with deep seat',
    'Cassina Maralunga sofa in natural linen with wabi-sabi ease',
    'Tom Dixon Fat armchair in olive velvet — rounded and substantial',
    'reclaimed solid wood coffee table — thick weathered oak slab on rough timber legs',
    'Molteni&C Tondo coffee table in green onyx marble — round, heavy, polished',
    'De Padova Yak table in solid walnut — thick slab top with live edge',
    'Carl Hansen CH25 lounge chair in oiled oak with natural cord seat',
    'Frama Shelf Library in raw blackened steel and solid ash — open display',
    'Vincenzo De Cotiis bench in cast concrete and aged brass',
    'handmade wooden stool in rough-hewn reclaimed timber',
    'Kettal Boma outdoor lounge in teak with warm sand cushions',
    'bar stools with rounded padded seats in sage/olive velvet on walnut legs',
  ],
  fire: [
    'Baxter Budapest sofa in deep rust-colored nubuck leather with low blackened steel frame',
    'Baxter Chester Moon armchair in aged cognac leather with brass-tipped legs',
    'Minotti Andersen sofa in warm terracotta velvet — low-profile, generous proportions',
    'Poliform Varenna kitchen island clad in oxidized copper panels with dark stone countertop',
    'Knoll Barcelona chair in dark cognac saddle leather on polished chrome frame',
    'Cassina LC2 in black aniline leather with chrome structure',
    'Living Divani Extrasoft sofa in deep amber velvet — modular L-shape',
    'Maxalto Febo armchair in burnt sienna wool with walnut shell',
    'Molteni&C Gio Ponti D.859.1 dining table in dark walnut with tapered legs',
    'Poliform Mondrian sideboard in dark eucalyptus veneer with aged brass handles',
    'Coffee table: polished aged brass cylindrical base with nero marquina marble top (like reference)',
    'Henge Stone-T side table in nero marquina marble with bronze base',
    'De Padova Yak dining chairs in dark leather with blackened steel frame',
    'low blackened steel bench with cognac leather cushion at entry',
  ],
  water: [
    'Edra Boa sofa in cream bouclé with serpentine organic form against polished steel wall',
    'De Sede DS-600 modular sofa in ivory leather with sculptural flowing curves',
    'Flexform Soft Dream curved modular sofa in warm white bouclé — low-profile organic silhouette',
    'Fendi Casa Camelot curved sofa in pearl white leather with chrome legs',
    'sculptural reception/bar counter in mirror-polished stainless steel with organic twisted fluid form',
    'Moroso Victoria and Albert sofa in cream fabric with rounded organic modules',
    'Arflex Marenco sofa in natural oatmeal linen with pillowy rounded modules',
    'polished chrome coffee table with organic kidney shape — mirror surface',
    'Glas Italia Shimmer coffee table in iridescent curved glass',
    'Zanotta Throw-Away armchair in cream bouclé with rounded organic shell',
    'caramel/tan leather sculptural armchair with rounded stacked forms — warm accent against chrome',
    'Zaha Hadid Design Liquid Glacial table in acrylic with fluid organic legs',
    'fluted satin metal column cladding — vertical ridges catching light',
    'hammered stainless steel bar island with rippled water-textured front panels',
  ],
  air: [
    'DuPont Corian curved reception counter in glacier white — seamless flowing organic form, no visible joints',
    'metallic silver upholstered lounge armchair with plump rounded tubular form — futuristic silver vinyl or silver leather',
    'stainless steel round pedestal dining/coffee table with brushed silver column base and marble top',
    'Fritz Hansen Series 7 chair in white lacquer — light and precise on slim chrome legs',
    'Kartell Louis Ghost chair in transparent polycarbonate — invisible, weightless',
    'MDF Italia Tense table in white resin — seamless curved edges',
    'Moroso Victoria and Albert sofa in pure white or pale silver fabric with flowing curved silhouette',
    'frosted colored glass desk in lime-green or lavender tint — translucent futuristic workstation',
    'Hay About A Chair in white polypropylene — clean and stackable',
    'Rimadesio Zenit shelving in transparent glass and white aluminum',
    'wire-frame metal dining chair in matte black or chrome — minimal industrial-future silhouette',
    'hammered metallic silver or lavender-tinted counter front panel — textured reflective surface for bar/reception',
    'Pedrali Nolita bar stool in white powder-coated steel with light fabric seat',
    'large round pouf in violet or metallic silver fabric — soft futuristic accent seating',
  ],
};

// Expanded lighting pool
const LIGHTING_BY_ELEMENT: Record<Element, string[]> = {
  earth: [
    'sculptural woven pendant light in dark rattan/palm fiber — organic leaf-like form casting pattern shadows',
    'Ay Illuminate Nama pendant in natural bamboo and cotton — warm diffused glow',
    'Isamu Noguchi Akari floor lamp in washi paper — soft amber sphere',
    'Flos IC pendant in brushed aged brass',
    'aged brass cylindrical range hood with natural patina',
    'recessed warm downlights (2700K) creating pools of amber light',
    'Santa & Cole Nagoya paper lantern — translucent warm sphere',
    'backlit display cabinet shelving with warm amber LED behind ceramics',
    'DCW Lampe Gras N°304 wall lamp in raw brass and black',
    'lantern-style candlelight fixture on side table for intimate warmth',
  ],
  fire: [
    'matte black minimal track spotlights on dark ceiling rails (2700K warm) — primary overhead lighting',
    '&Tradition Flowerpot VP7 pendant in dark copper/terracotta — bold hemispherical form',
    'Tom Dixon Melt pendant in polished copper with liquid-metal form',
    'Flos 2097 chandelier in dark oxidized brass — dramatic focal above dining',
    'Apparatus Studio Arrow sconce in blackened brass with warm directional beam',
    'Lindsey Adelman Branching Bubble in dark bronze with amber glass globes',
    'concealed LED strips (2700K warm) in shadow gaps between corten and ceiling, under floating shelves, grazing marble texture',
    'DCW In The Tube pendant in gold mesh — warm brass cylinder',
    'Roll & Hill Agnes chandelier in dark bronze with candle-like points',
    'Lee Broom Crystal Bulb pendant in brushed brass sphere',
    'Flos IC floor lamp in brass — sculptural sphere balanced on rod',
  ],
  water: [
    'Tom Dixon Mirror Ball pendant in chrome with liquid reflections — multiple sizes clustered',
    'Lee Broom Orion globe pendant in mirror-polished chrome sphere',
    'Ross Lovegrove Mercury suspension in chrome with liquid-metal organic silhouette',
    'Bocci 73 series blown glass pendant with internal silver coating in cascading cluster',
    'Lasvit Crystal Rock chandelier in hand-blown clear glass sculptural clusters',
    'vertical LED light bars in slim profile flanking stone or metal features — cold white grazing light',
    'concealed LED strips washing curved stainless steel walls and canopies with ambient glow',
    'Artemide Pirce ceiling in silver with fluid spiral form',
    'Foscarini Gregg suspension in white blown glass with organic rounded form',
    'cascading blown glass art installation on metal rods — sculptural room divider with light',
    'Flos Glo-Ball floor lamp in white opal glass sphere — soft ambient accent',
  ],
  air: [
    'white opal globe lights on slim white/chrome stems — clustered at varying heights like floating moons',
    'concealed LED strip tracing every curved white ceiling sculpture — soft ambient glow outlining wave-forms',
    'neon LED tube accent in soft violet/lavender — architectural art line integrated into wall reveal or bar counter edge',
    'LED ring/halo pendant in white or silver — futuristic circular geometry suspended overhead',
    'Flos IC Lights floor lamp in white with opal glass sphere — minimal and sculptural',
    'Artemide Alphabet of Light linear LED suspended in flowing white line across ceiling',
    'Luceplan Hope transparent pendant — crystalline and weightless',
    'concealed LED underlight in warm amber or soft violet beneath glass/translucent furniture — futuristic underglow',
    'Foscarini Rituals suspension in textured white glass — organic light lantern',
    'slim track spotlights on minimal white or silver rail — precise accent lighting for art and surfaces',
  ],
};

const SHARED_LIGHTING: string[] = [
  'Louis Poulsen PH 5 pendant — iconic Danish layered shade, warm diffused glow',
  'Flos IC Lights suspension — balanced opal sphere on brass or chrome rod',
  'Artemide Tolomeo desk lamp — adjustable aluminum arm, architectural precision',
  'Louis Poulsen Panthella table lamp — sculptural opal hemisphere on chrome stem',
  'Santa & Cole Cesta table lamp — woven cherry wood cage with opal diffuser',
  'Flos Taccia table lamp — inverted concave reflector in anodized aluminium, iconic silhouette',
  'Vibia Wireflow chandelier — geometric wire structure with LED nodes, minimal and precise',
  'Michael Anastassiades Mobile Chandelier — brass tubes with opal glass spheres, gravity-defying balance',
  'Flos Parentesi suspension — sliding adjustable spotlight on vertical wire, utilitarian chic',
  'Oluce Atollo 233 table lamp — gold hemisphere on cylinder, design icon since 1977',
];

/** Most passes (not every): one “everyone knows this” trust anchor — decor, lamp, chair, or tech — style-matched */
const ICONIC_TRUST_ANCHOR_ROTATIONS: string[] = [
  'Include ONE immediately readable design icon if it fits the program (correct scale, not forced): e.g. Eames Lounge & Ottoman (Herman Miller / Vitra), Barcelona chair (Knoll), Wassily or Cesca, Saarinen Tulip table, LC4 chaise, Camaleonda module, USM Haller unit, Noguchi Akari, Flos Arco, PH Artichoke or PH5 (Louis Poulsen), Atollo (Oluce), AJ lamp — single hero or coherent pair, not a collage.',
  'Add one or two cultural “trust” props where logical: Diptyque / Le Labo / Aesop on tray, Alessi kettle or Juicy Salif, Vitra Eames House Bird, George Nelson Ball Clock, Smeg small appliance in kitchen/café, Bang & Olufsen or Devialet / high-end sculptural speaker, Apple Studio Display or iMac in office — nothing random; each must earn its place in frame.',
  'Anchor the light or seating story with one famous silhouette: Panthella, IC Lights, Parentesi, Flowerpot (&Tradition), Tom Dixon Beat/Melt, Foscarini Caboche, Hay PC Portable, Random Light (Moooi) — pick ONE fixture family suited to ceiling height and energy; readable shape, real proportions.',
  'Hospitality / kitchen / tech credibility when relevant: La Marzocco Linea or Victoria Arduino (café/bar), SMEG FAB or Gaggenau-style oven bank (kitchen), Fellow or Chemex barista pieces, Dyson on wall dock only if room fits — never a shelf of random unrelated gadgets.',
];

// ── DECOR & STYLING ITEMS by element ──
const DECOR_BY_ELEMENT: Record<Element, string[]> = {
  earth: [
    'branches of flowering or autumn foliage in a handmade ceramic vase on reclaimed wood shelf',
    'collection of handmade ceramic vessels (different sizes, earthy glazes) on open shelving',
    'large woven basket with dried branches or pampas grass on concrete floor',
    'Aesop products on travertine or stone tray',
    'large format coffee table book (Phaidon Architecture) on solid wood surface',
    'handmade ceramic bowl from Astier de Villatte with seasonal fruit',
    'wooden cutting board and olive oil bottle on stone countertop',
    'calligraphy artwork or abstract earth-tone painting in simple frame',
    'potted succulent or cactus cluster on rough stone or wood surface',
    'woven jute rug runner along corridor or beside seating',
    'round terracotta or lacquered earth-tone coffee table tray',
    'aged brass small sculpture or candleholder',
  ],
  fire: [
    'large-format abstract art in dark ochre/rust/copper tones in blackened steel frame on dark wall',
    'Diptyque Baies candle in black glass on nero marquina marble tray',
    'Le Labo Santal 26 candle on polished brass dish',
    'hardcover Taschen photography book stack on polished brass coffee table',
    'oxidized copper bowl with warm patina holding stone spheres or dried botanicals',
    'matte black ceramic vase with single architectural dark branch',
    'hand-thrown stoneware vessels in terracotta/rust tones on floating dark shelf',
    'polished brass sculptural objects — spheres, geometric forms on marble surface',
    'whiskey decanter and tumblers on aged brass tray',
    'dark marble nero marquina pedestal with sculptural bronze figure',
    'copper kitchen accessories — canisters, kettle, utensil holder in aged patina',
    'potted dark-leaf plants (rubber tree, fiddle leaf) in matte black planters',
  ],
  water: [
    'Georg Jensen Cobra vase in mirror-polished stainless steel on chrome shelf',
    'Zaha Hadid Design Braid vase in chrome-plated metal with fluid form',
    'Alessi stainless steel tray with organic curved form on polished counter',
    'Jeff Koons Balloon Dog sculpture in mirror-polished chrome (small scale) on coffee table',
    'blown glass sculptural art pieces on metal rods as cascading room divider installation',
    'chrome sculptural figure or abstract liquid-form art piece as focal object',
    'Tom Dixon Bump vase set in hand-blown clear glass with metal stands',
    'polished stainless steel bowl or sphere sculpture on microcement surface',
    'Byredo scented candle in frosted glass vessel on chrome tray',
    'glass carafe and tumbler set on polished metal tray at bar',
    'fresh white orchid in simple white ceramic pot — organic softness',
    'caramel leather-wrapped sculptural objects for warm accent against chrome',
  ],
  air: [
    'large dichroic/iridescent glass art sculpture — shifts between amber, violet, green, blue depending on viewing angle — futuristic centerpiece',
    'tinted translucent glass partition panel in violet-to-amber gradient — large oval or organic shape dividing space',
    'slim white ceramic vase with single architectural bloom on white marble surface',
    'transparent glass vase with fresh eucalyptus catching diffused daylight',
    'white marble tray with Aesop products on curved Corian counter',
    'simple white linen curtains in lightweight voile — billowing with breeze, floor-length',
    'backlit blue agate or mineral slab panel — translucent geological art as room divider',
    'neon art signage in soft violet/lavender on metallic or glass surface — refined not garish',
    'crystal glass block screen or partition — geometric translucent room divider catching light',
    'white opal globe table lamp — soft diffused glow accent',
    'indoor plant (fiddle leaf, monstera, or tall palm) in white or silver planter — organic life balance within futurism',
    'curated art book stack on stainless steel or glass surface — minimal editorial styling',
  ],
};

// ── WALLPAPER BRANDS (when element style suggests pattern on walls) ──
const WALLPAPER_BY_ELEMENT: Record<Element, string[]> = {
  earth: [
    'Phillip Jeffries grasscloth wallcovering in natural sisal — warm textured',
    'Phillip Jeffries Japanese Paper Weave in warm ochre',
    'de Gournay hand-painted botanical panel in warm earth tones',
  ],
  fire: [
    'Cole & Son Fornasetti Tema e Variazioni in gold on black',
    'Wall&Decò dramatic geometric wallpaper in charcoal and bronze',
    'Elitis Nomades panoramic textured wall panel in dark tones',
  ],
  water: [
    'Wall&Decò watercolor abstract mural in silver and cool grey tones',
    'Elitis Anguille Big Croco wallcovering in metallic silver',
    'Arte Amalfi textured metallic wallcovering in pearl silver',
  ],
  air: [
    'Wall&Decò ethereal gradient wallpaper in white to soft lavender — cosmic atmospheric depth with iridescent shimmer',
    'Cole & Son Woods wallpaper in white on white — subtle tree silhouettes',
    'Elitis Galactée collection textured wallcovering in pearl white with holographic shimmer — futuristic surface',
  ],
};

// ── TILE BRANDS (for kitchen/bathroom when relevant) ──
const TILE_BRANDS_BY_ELEMENT: Record<Element, string> = {
  earth: 'Marazzi Cotto Toscana terracotta hexagonal floor tiles, or Mutina Mews collection in earthy tones',
  fire: 'Bisazza mosaic in dark graphite blend, or Mutina Phenomenon hexagonal tiles in black',
  water: 'Seves Glassblock Metallizzato glass block tiles, or Marazzi SistemN porcelain in silver-grey metallic finish',
  air: 'Mutina Phenomenon 3D tiles in white, or Cle Tile handmade zellige in pure white gloss',
};

// ── APPLIANCES & TECHNOLOGY by room type ──
const APPLIANCES_BY_ROOM: Record<string, string> = {
  'Kitchen': 'Gaggenau or Miele built-in oven and induction cooktop, integrated Liebherr refrigerator, Dornbracht kitchen faucet in brushed platinum, Bora cooktop exhaust system',
  'Bathroom': 'Hansgrohe Raindance overhead shower, Duravit wall-mounted toilet, Vola basin mixer in brushed nickel, heated towel rail',
  'Living Room': 'Bang & Olufsen Beosound speaker discreetly placed, concealed TV or art screen',
  'Bedroom': 'concealed bedside USB charging, integrated closet lighting system',
  'Study': 'Apple iMac or Studio Display on desk, wireless charger, architect desk lamp',
  'Office': 'Apple Studio Display, Herman Miller monitor arm, wireless charging pad',
};

// ── WALL TREATMENT INTELLIGENCE ──
// Real interior references show layered wall treatments, not just paint.
const WALL_TREATMENTS_BY_ELEMENT: Record<Element, string[]> = {
  earth: [
    'aged warm plaster wall with visible patina layers — cracks, repair patches, and time-worn texture (wabi-sabi)',
    'full-height green onyx or rainforest marble slab backsplash with dramatic veining — the hero surface',
    'reclaimed weathered timber plank wall — rough-hewn boards with grey patina, nail holes, and natural splits',
    'hand-troweled clay plaster in warm ochre/terracotta with visible trowel marks and tonal variation',
    'rammed earth / terracotta plaster exterior wall with warm layered earth tones',
    'full-height natural walnut paneling with simple profiles for kitchen cabinetry or storage wall',
    'ancient rough stone wall — preserved original with modern glass insertion (restoration aesthetic)',
    'exposed heavy timber beam ceiling with aged patina and visible grain — structural and honest',
    'blackened steel-frame open shelving against warm plaster wall displaying ceramic collection',
  ],
  fire: [
    'full-height corten steel panel cladding with natural oxidized rust patina — warm amber-brown texture with visible weathering gradients',
    'Nero Marquina dark marble slab feature wall with white calcite veining — bookmatched full-height behind TV or fireplace',
    'oxidized copper panels cladding kitchen island fronts and cabinet faces — warm living patina surface',
    'aged polished brass feature panel — full-height warm gold surface with natural patina variations',
    'blackened steel panel wall with visible weld seams and matte finish — framing open shelving',
    'floor-to-ceiling dark-stained wood paneling (ebonized oak or dark walnut) with concealed LED strip at ceiling junction',
    'charcoal-tinted venetian plaster with subtle warm metallic undertone as secondary wall surface',
    'exposed brick wall with dark mortar joints — industrial warmth behind seating area',
  ],
  water: [
    'mirror-polished stainless steel wall cladding wrapping from wall to ceiling in a continuous curve',
    'hammered/rippled metal feature wall with hand-textured surface catching ambient light',
    'curved plaster wall with seamless rounded corners and smooth mineral finish — no sharp edges',
    'glass block partition wall creating translucent light-filtering screen with soft glow',
    'satin chrome panel accent wall with subtle directional brush pattern reflecting diffused light',
    'upholstered fabric wall panels in vertical channels (bouclé or linen, floor-to-ceiling) providing soft warmth contrast',
    'fluid parametric metal canopy overhead — curved stainless steel wrapping from wall across ceiling',
  ],
  air: [
    '3D textured white wall panel with geometric relief pattern — rectangular or organic raised tiles creating dynamic shadow play (like hotel lobby reference)',
    'fluted white panel wall with vertical ridges creating rhythmic shadow lines — floor-to-ceiling on columns and feature walls',
    'curved white Corian or solid-surface wall flowing seamlessly into ceiling — no visible joints, organic wave transition',
    'undulating wave-form ceiling sculpture with layered white ridges — multiple flowing tiers with concealed LED tracing each ridge edge',
    'tinted translucent glass partition wall — large format colored glass (violet, amber, rose-gold gradient) with oval or arched form',
    'polished rose-gold or copper-mirror column cladding — single reflective accent column among white surfaces',
    'perforated white metal mesh screen or membrane facade creating dappled light patterns — sail-like ethereal filtration',
    'floor-to-ceiling clear low-iron glass wall dissolving boundary — frameless with minimal hardware',
    'hammered metallic silver counter/reception front with textured reflective surface',
    'bright limewash on curved white plaster with luminous mineral finish — rounded corners',
    'lavender or violet painted accent cabinet wall — flat matte futuristic color statement',
    'white vertical slat/louver ceiling accent with integrated lighting between slats',
  ],
};

// ── TEXTILE LAYERING ──
// References show multiple textile layers creating depth and comfort
const TEXTILE_LAYERS_BY_ELEMENT: Record<Element, string[]> = {
  earth: [
    'handwoven jute or sisal area rug in warm natural tone — heavy, textured, organic',
    'linen throw blanket in warm oatmeal or olive green draped casually on sofa',
    'cushions in sage green velvet, warm sand linen, and terracotta tones — mixed textures',
    'heavy natural cotton or linen curtains in warm sand — floor-length with gentle puddle',
    'chunky knit or woven wool throw in earth tones on armchair',
    'leather floor cushion or pouf in aged brown for casual seating',
  ],
  fire: [
    'textured wool rug in charcoal/warm grey with subtle pattern or Berber-style ivory/brown weave on dark herringbone floor',
    'cashmere throw in deep cognac or burnt sienna draped across the sofa arm',
    'velvet cushions in rust, copper, terracotta, and deep amber mixed with dark leather and black linen',
    'heavy linen or wool curtains in warm charcoal, floor-to-ceiling on blackened steel rod',
    'deep rust/terracotta velvet or nubuck leather as primary upholstery — the sofa MUST be in a warm oxidized tone (cognac, rust, terracotta)',
    'sheepskin or dark wool throw on accent chair for textural contrast',
  ],
  water: [
    'plush hand-tufted wool rug in soft cream or warm grey with organic fluid pattern — kidney or irregular shape',
    'soft cashmere throw in pale dove grey or silver draped on bouclé sofa',
    'cream and pearl bouclé cushions mixed with soft grey velvet — warm textural contrast against chrome',
    'sheer voile curtains in silver-white filtering light — creating diffused ethereal atmosphere',
    'caramel or warm tan leather on accent chair — critical warm counterpoint against reflective metal',
    'plush sheepskin or faux-fur throw on seating for tactile softness against hard polished surfaces',
  ],
  air: [
    'flat-weave cotton rug in pure white or pale grey — light and barely there',
    'lightweight linen throw in pure white or silver-grey draped minimally across sofa',
    'cushions in white, off-white, and soft lavender/silver accents — subtle futuristic tones',
    'sheer white or pale lilac curtains in lightweight voile — billowing with breeze, floor-length',
    'round white wool rug under seating — soft circle form echoing curved furniture on white floor',
    'metallic silver or holographic accent cushion — a single futuristic textural statement',
  ],
};

// ── COLOR PALETTE DEFINITIONS ──
const COLOR_PALETTE_MAP: Record<ColorPalette, string> = {
  'auto': '',
  'warm-earth': 'Color palette warm earth tones: sand (#E8DCC8), camel (#C4A882), walnut brown (#6B4E3D), terracotta (#C67A54), warm cream (#F5F0E8). Grounded, organic, natural warmth — every surface radiates warmth with earthy depth.',
  'cool-mineral': 'Color palette cool mineral tones: silver grey (#C8C8CC), slate (#8B8D94), pearl (#E8E6E0), sage (#A0A87E), cool white (#F0F0F0). Clean, modern, refined — mineral clarity with a calm sophisticated edge.',
  'dark-bronze': 'Color palette dark and dramatic: deep charcoal (#2A2A2E), espresso (#3C2A1E), burnished bronze (#8B6E4E), warm black (#1A1A1C), copper accent (#7A4E2A). Rich, moody, intimate luxury — dark surfaces with warm metallic highlights.',
  'light-air': 'Color palette luminous whites: pure white (#FAFAFA), warm white (#F8F4EF), pale birch (#E8DFD4), ice blue (#E4ECF0), cloud (#F4F4F8). Maximum brightness, Scandinavian clarity, ethereal openness — light floods every surface.',
  'ocean-calm': 'Color palette ocean calm: misty blue (#C8D4DC), soft grey (#D0D0D4), pearl (#E8E6E0), pale blue-grey (#D4DCE0), polished silver (#C0C0C4). Cool, atmospheric, fluid serenity — reflective surfaces and tranquil depth.',
};

// ── BUDGET LEVEL DIRECTIVES ──
// Backed by lib/brandCatalog.ts — keeps brand lists, $/m² ranges, and prompt
// directives in a single source of truth shared with the UI tier picker.
const BUDGET_LEVEL_MAP: Record<BudgetLevel, string> = {
  essential: buildBudgetBrandDirective('essential'),
  premium: buildBudgetBrandDirective('premium'),
  luxury: buildBudgetBrandDirective('luxury'),
};

// ── MATERIAL COLOR SIGNATURES ──
// When a user-selected material has a strong, identifying color (green onyx,
// rust velvet, dichroic glass, Nero Marquina marble, corten…) we must NOT let
// the chosen color palette ('warm-earth', 'light-air' etc.) flatten that color
// to a neutral or subtitute it for a "harmonious" hue. The reconciliation
// block below tells the model to keep these material colors honest on the
// surfaces where the material is used; the palette governs everything else.
//
// Keys are lowercase substrings matched against material.name. The value
// describes the dominant color signature in plain language for the prompt.
const MATERIAL_COLOR_SIGNATURES: Array<{ match: RegExp; signature: string }> = [
  // ── EARTH / warm stones & clays ─────────────────────────────────────────
  { match: /green.*(onyx|marble|onice|stone)|verde|connemara|rainforest/i, signature: 'deep emerald-to-pistachio green stone with white/gold veining — green is the dominant readable color of this surface' },
  { match: /cipollino/i, signature: 'cream marble base with warm wavy green-and-gold veining — the green veining flows in onion-skin layers' },
  { match: /marr.n.*emperador|emperador/i, signature: 'warm chocolate-brown marble with light beige veining — saturated rich brown' },
  { match: /jura.*limestone|jura/i, signature: 'warm golden-beige limestone with fine fossil inclusions and subtle horizontal grain' },
  { match: /pietra.*serena/i, signature: 'soft Tuscan grey-green sandstone with matte sand-blasted texture — neither cold grey nor warm beige' },
  { match: /sand.?blasted.*granite|warm.*granite/i, signature: 'warm beige-and-gold granite with sand-blasted matte surface and small visible mineral flecks' },
  { match: /onyx/i, signature: 'translucent onyx with backlit honey/amber/green glow — the surface itself emits warm color' },
  { match: /travertine.*honed|^travertine|honed.*travertine/i, signature: 'warm cream-to-beige travertine with horizontal vug texture and natural color variation' },
  { match: /rammed.?earth|terracotta/i, signature: 'warm terracotta-ochre to rust-clay color, layered horizontal sediment lines, sunlit warm tone' },
  { match: /walnut(?!.*natural finish)/i, signature: 'rich chocolate-to-cognac brown walnut grain with warm undertone — never bleached or pale' },
  { match: /reclaimed.*timber|weathered.*wood/i, signature: 'silvered grey-brown weathered timber with split grain, warm undertone, real patina, occasional nail holes' },
  { match: /natural.*oak|warm.*oak|herringbone.*oak/i, signature: 'honey-amber warm oak grain — golden mid-tone, never grey-stained' },
  { match: /clay.*plaster/i, signature: 'warm clay-pink to terracotta-cream plaster with visible trowel marks and tonal irregularity' },
  { match: /lime.*plaster.*warm|warm.*lime.*plaster/i, signature: 'warm mineral cream lime plaster with subtle pink/ochre cast' },
  { match: /tadelakt.*warm|warm.*tadelakt/i, signature: 'hand-burnished tadelakt in warm pigmented tones (clay-pink, ochre, cream) with soft satin sheen and waterproof Moroccan finish' },
  { match: /brick/i, signature: 'red-orange-to-rust industrial brick with mortar joints visible, slightly weathered face' },
  { match: /zellige.*warm|zellige.*ochre|zellige.*olive/i, signature: 'irregular handmade Zellige tile in warm ochre / olive / clay glaze — each tile slightly different, hand-glazed character' },
  { match: /board.?formed.*concrete/i, signature: 'cool grey board-formed concrete with horizontal timber-grain imprint and tie-rod holes, slight warm cast in sunlight' },
  { match: /volcanic|^basalt$/i, signature: 'deep charcoal-to-black volcanic basalt with rough porous texture' },
  { match: /jute|sisal/i, signature: 'natural honey-tone jute / sisal weave with coarse organic fibre — warm tactile floor texture' },
  { match: /boucl.*oat|boucl.*cream|oat.*boucl/i, signature: 'warm oatmeal / cream bouclé with looped tactile weave — soft natural color' },
  { match: /mohair.*velvet|warm.*velvet|rust.*velvet|olive.*velvet/i, signature: 'mohair velvet pile in warm rust / olive tones with soft sheen and rich light absorption' },

  // ── FIRE / dark, dramatic, metallic ─────────────────────────────────────
  { match: /corten|weathering.*steel/i, signature: 'rust-orange to deep oxblood corten patina with mottled red-brown texture — the rust IS the finish' },
  { match: /oxidized.*copper|copper.*patina/i, signature: 'verdigris green-blue oxidized copper transitioning to warm copper highlights' },
  { match: /burnished.*brass|antique.*brass/i, signature: 'hand-burnished antique brass with warm honey-gold tone and dark-rim hand-rubbed aging' },
  { match: /aged.*brass|polished.*brass|brass(?!.*accent)/i, signature: 'warm honey-gold brass with hand-rubbed patina, subtle dark-rim aging, living surface' },
  { match: /bronze/i, signature: 'deep warm bronze with chocolate-brown undertone, subtle gold highlights' },
  { match: /blackened.*steel/i, signature: 'gun-metal blackened steel with subtle warm bronze undertone in highlights' },
  { match: /calacatta.*viola/i, signature: 'white marble base with dramatic oxblood-purple-to-rose veining — the violet veining is bold and unmistakable, never neutral grey' },
  { match: /port.*laurent|saint.*laurent.*marble/i, signature: 'black marble with bold honey-gold veining — high contrast warm gold on dark base' },
  { match: /patagonia.*quartzite|patagonia/i, signature: 'smoky burgundy quartzite with grey-cream cloud movement — saturated wine-purple base' },
  { match: /sodalite.*blue|sodalite/i, signature: 'deep midnight royal-blue stone with white calcite flecks — saturated dark blue is dominant' },
  { match: /red.*travertine|persian.*travertine/i, signature: 'warm rust-orange travertine with horizontal vug texture — saturated terracotta tone' },
  { match: /bardiglio/i, signature: 'deep grey-black marble with subtle silver veining — moody charcoal' },
  { match: /dark.*marble|nero.*marquina|sahara.*noir|dark.*quartzite|black.*pearl/i, signature: 'deep black-to-charcoal stone with high-contrast bright white veining — the white veins must be crisp and dramatic' },
  { match: /venetian.*plaster.*polished/i, signature: 'polished Venetian plaster with deep saturated color (warm sienna, oxblood, or charcoal) and subtle marbled depth' },
  { match: /dark.*herringbone|smoked.*oak|fumed.*oak/i, signature: 'fume-stained dark chocolate oak with cool-grey undertone' },
  { match: /shou.?sugi.?ban|charred.*timber|yakisugi/i, signature: 'charred-black Japanese-style timber with brushed black-silver finish and visible grain — true black, not painted black' },
  { match: /oxblood.*velvet|rust.*velvet/i, signature: 'deep saturated oxblood / rust velvet pile with rich light absorption — bold red-brown' },
  { match: /cognac.*leather|saddle.*leather/i, signature: 'full-grain warm cognac saddle leather with visible pull-up patina and natural sheen' },
  { match: /charcoal.*velvet|smoke.*velvet/i, signature: 'deep charcoal velvet pile with subtle warm bronze undertone in highlights' },

  // ── WATER / cool, smooth, reflective ────────────────────────────────────
  { match: /bianco.*lasa|lasa/i, signature: 'cool grey-white marble with subtle warm-gold veining — base reads cool, not warm' },
  { match: /smoke.*quartzite|silver.*cloud/i, signature: 'cool silver-grey quartzite with cloudy soft movement and faint veining' },
  { match: /onice.*acqua|water.*onyx|onice.*azul/i, signature: 'translucent backlit pale water-blue onyx with crystalline veining — surface emits cool blue glow' },
  { match: /silver.*travertine|travertine.*silver/i, signature: 'polished silver-grey travertine with cool reflective sheen and horizontal vug pattern' },
  { match: /microcement/i, signature: 'cool greige-to-cream microcement with subtle cloudy texture, slight color variation, soft sheen' },
  { match: /smooth.*mineral.*plaster/i, signature: 'cool cream-grey mineral plaster with venetian micro-polished surface' },
  { match: /tadelakt.*cool|cool.*tadelakt/i, signature: 'hand-burnished tadelakt in cool pigmented tones (slate, dove-grey, smoke) with soft satin sheen and waterproof Moroccan finish' },
  { match: /mirror.?polished.*steel|stainless.*steel|chrome(?!.*satin)/i, signature: 'mirror-polished chrome/stainless — silver, picking up colored reflections of everything around it' },
  { match: /hammered.*metal|martellata/i, signature: 'hand-hammered silver metal with rippled dimples catching light at every angle' },
  { match: /satin.*chrome/i, signature: 'soft satin chrome with diffuse silver finish, less mirror-like than polished' },
  { match: /polished.*nickel/i, signature: 'cool silver-white polished nickel with crisp reflection — slightly cooler than chrome' },
  { match: /glass.*block/i, signature: 'translucent pale-aqua-to-frosted glass blocks diffusing soft cool light' },
  { match: /reeded.*glass|ribbed.*glass|fluted.*glass/i, signature: 'reeded fluted glass with vertical ribs and soft cool diffusion — light passes through striped' },
  { match: /curved.*bent.*glass|diffused.*glass/i, signature: 'translucent frosted glass with soft cool-neutral diffuse light passing through' },
  { match: /matte.*ceramic/i, signature: 'soft matte ceramic in pale cream / sand / grey, no shine' },
  { match: /glass.*mosaic/i, signature: '10–25 mm Italian glass mosaic in pale aqua / smoke / silver — small modular tile pattern with hand-laid grout joints' },
  { match: /silk.*satin|champagne.*silk|smoke.*silk/i, signature: 'high-sheen silk satin in champagne / smoke with soft reflective drape' },
  { match: /cream.*boucl/i, signature: 'soft creamy bouclé with looped weave — pale neutral organic tactile' },
  { match: /linen.*wool|wool.*textile|linen.*textile/i, signature: 'natural linen / wool weave in oat / flax / cream — warm-neutral organic color, visible weave' },
  { match: /pale.*grey.*wool|wool.*felt/i, signature: 'dense pale-grey wool felt with subtle mottling — soft acoustic surface' },

  // ── AIR / luminous, futurist ────────────────────────────────────────────
  { match: /thassos/i, signature: 'pure crystalline white Thassos marble — near-vein-free, almost-luminous white' },
  { match: /dolomite/i, signature: 'snow-white dolomite marble with very fine subtle grey veining' },
  { match: /bianco.*statuario|statuario|statuary/i, signature: 'luminous bright-white Statuario marble with delicate elegant grey veining' },
  { match: /dichroic|iridescent.*glass/i, signature: 'dichroic glass that shifts hue across the panel between violet, magenta, amber, teal — must show the color shift, never paint flat' },
  { match: /tinted.*translucent.*glass|tinted.*glass/i, signature: 'soft tinted laminated glass in gentle violet / amber / blue cast — light passes through tinted' },
  { match: /frosted.*satin.*glass|satin.*glass/i, signature: 'soft uniform satin frost diffusing daylight evenly — cool neutral white' },
  { match: /white.*marble|calacatta/i, signature: 'white Calacatta marble with crisp grey-to-gold veining — white must stay white, not warm-toned' },
  { match: /white.*terrazzo/i, signature: 'white terrazzo base with multi-color aggregate (warm browns, soft greys, occasional rust) — base reads as white' },
  { match: /metallic.*silver/i, signature: 'cool metallic silver with chrome-like luminance' },
  { match: /champagne.*aluminium|champagne.*anodized|anodized.*champagne/i, signature: 'soft warm champagne anodized aluminium with contemporary architectural metallic skin' },
  { match: /white.*corian/i, signature: 'pure seamless white Corian / solid surface with no visible joins — pure clean white' },
  { match: /fluted.*white|3d.*textured.*white/i, signature: 'pure white fluted / 3D-relief panel — the texture creates shadow play but the base color is pristine white' },
  { match: /limewash|white.*mineral.*plaster|white.*plaster/i, signature: 'soft chalky white limewash / mineral plaster with very subtle warm undertone, micro-texture' },
  { match: /light.*oak|ash|bleached.*birch/i, signature: 'pale honey-blonde light oak / ash / bleached birch with cool-warm balanced undertone — never orange, never grey' },
  { match: /clear.*glass/i, signature: 'clear low-iron glass — virtually colorless, transparent, picks up reflections of surroundings' },
  { match: /sheer.*linen|linen.*voile/i, signature: 'lightweight sheer linen voile drapery in ivory / soft cream — diffuses daylight, almost translucent' },
  { match: /iridescent.*satin|lurex/i, signature: 'shimmering iridescent satin / lurex with subtle violet / silver shift in light' },
];

const PALETTE_NEUTRAL_HUES: Record<ColorPalette, string> = {
  auto: '',
  'warm-earth': 'sand / camel / walnut / terracotta / warm cream',
  'cool-mineral': 'silver grey / slate / pearl / sage / cool white',
  'dark-bronze': 'deep charcoal / espresso / burnished bronze / warm black / copper',
  'light-air': 'pure white / warm white / pale birch / ice blue / cloud',
  'ocean-calm': 'misty blue / soft grey / pearl / pale blue-grey / polished silver',
};

// ── AUTHENTIC SURFACE COVERAGE BANDS ──
// For each material category we define where it CAN appear and a sane area
// share. This stops the AI from doing things like covering an entire room in
// brass, or a 100% velvet wall.
const CATEGORY_PLACEMENT_RULE: Record<MaterialCategory, string> = {
  stone:
    'Stone — apply on countertops, floors, vanity tops, feature walls, fireplace surrounds, kitchen islands. Wall coverage: up to ~40 % of one wall as a slab feature; never veneer every wall. Floors only when stone is the user-named flooring choice. Never on furniture upholstery, ceilings, or as a paint color.',
  wood:
    'Wood — apply on floors, joinery, cabinetry, dining/coffee table tops, doors, ceiling beams, wall slats. Never as a polished countertop substitute, never as upholstery, never as plumbing fixture.',
  plaster:
    'Plaster — apply on walls and ceilings only. Coverage typically 50–100 % of wall planes. Never on floors, furniture, or hardware.',
  concrete:
    'Concrete — apply on ceilings (slab), structural walls, floors, stair volumes, outdoor surfaces. Never on furniture upholstery, hardware, or small objects.',
  metal:
    'Metal — apply on hardware, lighting fixtures, frames, profiles, cabinet pulls, accent panels. Hard cap on coverage: brass / bronze / copper as accents only (~5–15 % of visible surface). Mirror chrome / stainless can wrap a feature wall or counter when the material is dominant in the brief, but never the entire envelope. Never on plaster walls or ceilings unless the brief explicitly says metal cladding.',
  glass:
    'Glass — apply on partitions, windows, balustrades, shower screens, vitrines, room dividers, feature art panels (dichroic, tinted). Never on floors, walls as paint, or upholstery.',
  ceramic:
    'Ceramic / tile — apply on bathroom walls, kitchen backsplashes, floors (when picked as flooring), spa pool surrounds, exterior cladding. Never on furniture upholstery, drapery, or ceilings.',
  textile:
    'Textile — apply on upholstery, drapery, cushions, rugs, banquette seating, headboards, acoustic wall panels (felt only). NEVER on floors as a primary surface, NEVER on cabinetry, NEVER on countertops, NEVER as wall paint. Coverage is shared across furniture pieces — one velvet sofa is enough; do not upholster every chair the same way.',
  composite:
    'Composite (Corian, GRC, fluted MDF, 3D relief) — apply on counters, reception desks, columns, feature walls, ceiling features. Never on flooring or furniture upholstery.',
};

/**
 * Build the "use materials only where relevant and authentic" directive.
 * Uses the material categories from the catalog to issue per-pick placement
 * limits (so velvet stays on furniture, brass stays an accent, marble stays
 * on countertops/feature walls, etc.). This is what prevents the AI from
 * wallpapering a room in oxblood velvet or making the floor out of brass.
 */
function buildAuthenticMaterialUsageBlock(
  materialsSelected: PromptInput['materialsSelected'],
): string | null {
  if (!materialsSelected || materialsSelected.length === 0) return null;

  const categoriesUsed = new Set<MaterialCategory>();
  const perPickRules: string[] = [];

  for (const m of materialsSelected) {
    const cat = getMaterialCategory(m.name);
    if (!cat) continue;
    categoriesUsed.add(cat);
    const placement = MATERIAL_SURFACE_AFFINITY[m.name];
    if (placement) {
      perPickRules.push(`${m.name} → ${placement}`);
    }
  }

  if (categoriesUsed.size === 0) return null;

  const categoryRules = Array.from(categoriesUsed)
    .map((cat) => CATEGORY_PLACEMENT_RULE[cat])
    .filter(Boolean);

  return [
    'AUTHENTIC MATERIAL PLACEMENT — every selected material MUST appear ONLY on surfaces where it is structurally and aesthetically appropriate.',
    'Per-pick placement (take this literally — do not reassign materials to other surfaces, do not drop a material because it is "less famous"):',
    perPickRules.join('. ') + '.',
    'Surface-family rules in force:',
    categoryRules.join(' '),
    'GLOBAL CHECKS: (a) no single material covers more than its sane share of the visible scene; (b) hard accents (brass, bronze, dichroic, mosaic) read as deliberate features, not decoration sprinkled everywhere; (c) textiles never become floors or cabinetry; (d) stones never become upholstery or paint; (e) when a material is small in the brief, it appears once with a clear identity, not nowhere and not everywhere.',
  ].join(' ');
}

/**
 * If the user picked materials with strong intrinsic colors (e.g. green onyx,
 * rust velvet, dichroic glass), the chosen color palette must NOT erase those
 * colors. This block reconciles the two so the AI keeps both honest.
 */
function buildMaterialPaletteReconciliationBlock(
  materialsSelected: PromptInput['materialsSelected'],
  palette: ColorPalette,
): string | null {
  if (!materialsSelected || materialsSelected.length === 0) return null;

  const colorLocks: string[] = [];
  const seenSignatures = new Set<string>();
  for (const m of materialsSelected) {
    for (const { match, signature } of MATERIAL_COLOR_SIGNATURES) {
      if (match.test(m.name) && !seenSignatures.has(signature)) {
        colorLocks.push(`${m.name} → ${signature}`);
        seenSignatures.add(signature);
        break;
      }
    }
  }

  if (colorLocks.length === 0) return null;

  const paletteHues = palette !== 'auto' ? PALETTE_NEUTRAL_HUES[palette] : '';
  const paletteRole = palette !== 'auto'
    ? `The chosen color palette (${paletteHues}) governs ONLY the neutral surfaces, ambient lighting, and accents that have no prescribed material color — it does NOT override the colors above.`
    : 'No global palette is locked, so the material colors above LEAD the overall scheme — derive complementary neutrals around them.';

  return [
    'MATERIAL → COLOR LOCK (reconcile with palette below; this overrides the palette for these specific surfaces):',
    colorLocks.map((l, i) => `${i + 1}. ${l}`).join('. ') + '.',
    paletteRole,
    'NEVER bleach a green stone to grey, NEVER tint a Calacatta marble warm to "match" a warm palette, NEVER make rust velvet pink, NEVER paint dichroic glass a single flat purple. The named material keeps its identifying color; the palette flows around it.',
  ].join(' ');
}

// Surface roles for material placement — architecture thinks in surfaces, not abstract lists
const SURFACE_ROLES = ['floor', 'main wall', 'accent wall / feature', 'ceiling / overhead', 'cabinetry / joinery', 'countertop / table surface', 'upholstery / textile', 'hardware / accents'] as const;

// Map material names to their natural architectural surface.
// Exported because services/shrePrompt.ts uses it to fill the
// {application} field of the SHRE prompt body for user-selected materials.
export const MATERIAL_SURFACE_AFFINITY: Record<string, string> = {
  // EARTH
  'Travertine (honed)': 'floor and wall cladding',
  'Jura limestone (golden)': 'floor slab, stair tread, vanity top — warm beige limestone with fossil interest',
  'Pietra Serena (Tuscan)': 'floor slab, exterior cladding, fireplace surround — Tuscan grey-green stone',
  'Cipollino marble (warm green-veined)': 'feature wall slab, countertop, vanity top — warm green-veined marble',
  'Green onyx / marble (veined)': 'kitchen island, countertop, backsplash, feature wall slab — emerald-green stone with white-gold veining',
  'Marrón Emperador (warm brown marble)': 'feature wall slab, countertop, fireplace surround — warm chocolate-brown marble',
  'Volcanic stone (basalt rough)': 'exterior base wall, landscape steps, interior feature wall, fireplace hearth',
  'Sand-blasted granite (warm)': 'floor slab, exterior cladding, kitchen countertop — warm beige-gold granite',
  'Natural oak (horizontal)': 'flooring planks and cabinetry fronts',
  'Herringbone parquet (warm oak)': 'main floor surface throughout living and dining areas',
  'Walnut veneer': 'cabinetry doors, headboard panel, desk surface, joinery panels',
  'Reclaimed weathered timber': 'column cladding, feature wall, dining table, shelving, ceiling beams',
  'Clay plaster': 'main wall finish — warm clay-cream hand-troweled',
  'Lime plaster (warm mineral)': 'wall and ceiling plaster — warm mineral trowel finish',
  'Rammed earth / terracotta plaster': 'exterior facade wall, interior accent wall, courtyard wall, fireplace surround',
  'Tadelakt (warm pigmented Moroccan)': 'bathroom walls and bath surround, hammam, sink basins — waterproof warm pigmented hand-burnished plaster',
  'Board-formed concrete': 'ceiling slab, structural wall, stair volume, cantilevered overhang',
  'Industrial brick': 'accent wall, fireplace surround, exposed structural wall',
  'Zellige tile (warm ochre / olive)': 'kitchen backsplash, bathroom wall, hammam wall — irregular handmade Moroccan tile',
  'Jute / sisal rug': 'living-area floor rug, bedroom rug — natural fibre',
  'Bouclé (oat / cream)': 'sofa upholstery, accent armchair, cushions — looped warm tactile weave',
  'Mohair velvet (warm rust / olive)': 'sofa upholstery, accent armchair, cushions, drapery — warm-toned plush velvet',

  // FIRE
  'Dark marble (high contrast)': 'countertop, fireplace surround, feature panel — Nero Marquina black with crisp white veining',
  'Port Laurent / Saint Laurent marble': 'kitchen island, bar counter, feature wall — black with bold honey-gold veining',
  'Calacatta Viola (white + oxblood veining)': 'feature wall slab, kitchen island, bar back-bar — white with dramatic oxblood-purple veining',
  'Patagonia quartzite (smoky burgundy)': 'feature wall slab, countertop, bar front — smoky burgundy with cloud movement',
  'Sodalite Blue (deep midnight stone)': 'feature wall slab, vanity top, art-style accent panel — deep midnight blue stone',
  'Red travertine (Persian)': 'feature wall, fireplace surround, vanity — warm rust-orange travertine',
  'Bardiglio Imperiale (deep grey-black)': 'flooring slabs, countertop, fireplace surround — deep grey-black marble',
  'Dark quartzite': 'countertop and feature wall — Black Pearl with white-silver veining',
  'Basalt': 'floor tiles or countertop — honed charcoal',
  'Shou-sugi-ban (charred timber)': 'exterior facade cladding, accent feature wall, ceiling beams — Japanese charred-black timber',
  'Smoked / fumed oak': 'flooring, dining table, joinery — fumed dark chocolate oak',
  'Dark herringbone parquet': 'main floor surface, bedroom floor, corridor floor — dark fumed oak in chevron pattern',
  'Venetian plaster (polished)': 'feature wall or ceiling finish — polished saturated lime-based',
  'Corten steel (weathering)': 'exterior facade cladding, entry portal frame, feature wall panel, garden wall',
  'Oxidized copper': 'facade accent panel, fireplace surround, door/cabinet fronts, sculptural feature',
  'Burnished antique brass': 'cabinet fronts, hardware, light fixture trim, kitchen hood — warm hand-burnished brass',
  'Aged brass (polished)': 'coffee table surface, hardware pulls, light fixture trim, sculptural accent, kitchen island front',
  'Blackened steel': 'shelf brackets, door frames, window profiles, structural columns',
  'Bronze accents': 'door handles, cabinet pulls, light fixture accents — small surface area, never main wall',
  'Oxblood / rust velvet upholstery': 'sofa upholstery, accent armchair, cushions, banquette seating — never wall finish',
  'Cognac saddle leather': 'sofa upholstery, dining chairs, lounge armchair, banquette — full-grain leather',
  'Charcoal / smoke velvet': 'sofa upholstery, accent armchair, banquette, drapery — never wall',

  // WATER
  'Bianco Lasa marble (cool grey-white)': 'countertop, vanity top, feature wall — cool grey-white marble with subtle veining',
  'Smoke quartzite (silver-grey)': 'feature wall, countertop, bar front — silver-grey quartzite with cloudy soft movement',
  'Onice Acqua (translucent water-blue onyx)': 'backlit feature wall, bar back-bar, vanity panel — translucent water-blue onyx with internal glow',
  'Silver travertine (polished)': 'floor slab, feature wall, vanity top — polished silver travertine',
  'Microcement (continuous)': 'continuous floor and wet-area walls — seamless cool greige',
  'Smooth mineral plaster': 'wall finish throughout — venetian micro-polished cool cream-grey',
  'Tadelakt (cool pigmented Moroccan)': 'bathroom walls and bath surround, hammam, sink basins — waterproof cool-pigmented hand-burnished plaster',
  'Mirror-polished stainless steel': 'feature wall cladding, counter/bar front, reception desk skin, column cladding — immersive chrome wraps',
  'Hammered metal (rippled)': 'counter front panel, feature wall accent, bar face cladding, ceiling accent panel',
  'Satin chrome': 'cabinet fronts, door frames, fixture housings, counter edge band',
  'Polished nickel': 'plumbing fixtures, hardware, sconce housings, mirror frames — cool silver-white finish',
  'Diffused glass': 'partition panels, cabinet fronts, bathroom screen',
  'Glass blocks (translucent)': 'partition wall, room divider, backsplash feature, light-filtering screen',
  'Curved bent glass': 'storefront facade, partition screen, display vitrine, curved balustrade',
  'Reeded / ribbed fluted glass': 'partition panel, shower enclosure, cabinet fronts, room divider — vertical fluted ribs',
  'Matte ceramic': 'backsplash, bathroom wall, floor tiles',
  'Glass mosaic tile (10–25 mm cool)': 'spa pool surround, bathroom wall feature, kitchen backsplash — small-format Italian glass mosaic',
  'Silk satin (champagne / smoke)': 'drapery, cushions, headboard upholstery — high-sheen silk',
  'Cream bouclé': 'sofa upholstery, accent armchair, cushions — soft creamy looped weave',
  'Linen / wool textile surfaces': 'sofa upholstery, drapery, cushions',
  'Pale grey wool felt': 'pinboard wall, banquette upholstery, cushions, acoustic wall panels — never main floor',

  // AIR
  'White marble (Calacatta)': 'countertop, vanity top, feature wall cladding',
  'Thassos marble (pure white)': 'flooring slab, countertop, vanity, bath surround — pure crystalline white',
  'Dolomite snow-white marble': 'countertop, vanity top, feature wall — snow-white with very fine veining',
  'Bianco Statuario (luminous white)': 'countertop, fireplace surround, sculptural feature — luminous white with delicate veining',
  'White terrazzo': 'floor surface, countertop, bathroom vanity',
  'Light oak / ash': 'flooring planks and shelf surfaces — pale honey-blonde grain',
  'Bleached birch': 'cabinetry fronts, shelving, light furniture surfaces',
  'Limewash (bright)': 'wall and ceiling wash finish',
  'White mineral plaster': 'ceiling and upper wall finish',
  'Pale concrete (smooth)': 'ceiling finish, wall panels, floor surface',
  'Metallic silver surface': 'furniture upholstery (silver vinyl armchairs), pedestal table column, counter front panel, decorative accessories',
  'Anodized champagne aluminium': 'window/door profiles, cabinet edges, ceiling trim, lighting housings — soft warm metallic skin',
  'Clear glass (low-iron)': 'full-height partitions, balustrades, shelving, structural glazing',
  'Dichroic / iridescent glass': 'large sculptural art installation, room divider, ceiling-hung art piece — shifts color with viewing angle',
  'Tinted translucent glass': 'space-dividing partition panel (large oval or arched form), desk surface, shelving, counter accent — colored translucent',
  'Frosted satin glass': 'partition panels, cabinet fronts, shower enclosure — uniform satin diffusion',
  'White Corian (curved seamless)': 'reception counter, kitchen island, bar counter — seamless thermoformed organic flowing form',
  'Fluted white panel': 'column cladding, feature wall panel — vertical fluted ridges floor-to-ceiling',
  '3D textured white panel': 'feature wall cladding, reception backdrop, column cladding — geometric relief tiles creating shadow pattern',
  'Sheer linen voile drapery': 'floor-to-ceiling sheer drapery diffusing window light — never upholstery',
  'Iridescent satin / lurex': 'cushions, single sculptural drape, statement accent textile — never wall or floor',

  // SHARED
  'Textured concrete (matte)': 'ceiling slab or feature wall panel',
  'Brushed metal': 'shelf system, railing, kitchen island frame',
  'Solid oak': 'dining table top, bench, flooring',
  'Walnut (natural finish)': 'dining table, desk, or joinery',
};

// Build explicit material placement instructions from user's selected materials.
//
// Each material gets a sentence in the form "SURFACE: material-or-product".
// Custom materials (user-defined) honor the user's `placementNote` when one
// is provided — the note becomes the authoritative surface so the model
// places the material exactly where the user asked for it. Catalog
// materials fall back to MATERIAL_SURFACE_AFFINITY → SURFACE_ROLES.
const buildMaterialPlacement = (
  materials: Array<{ name: string; placementNote?: string; isCustom?: boolean }>,
): string => {
  if (materials.length === 0) return '';
  const placements: string[] = [];
  materials.forEach((m, i) => {
    const products = MATERIAL_PRODUCT_MAP[m.name];
    // 1) User-typed placement note wins (treats whatever the user wrote
    //    as the assigned surface — e.g. "kitchen island front panel").
    // 2) Otherwise fall back to the canonical affinity / surface roles.
    const userSurface = m.placementNote?.trim();
    const surface = userSurface && userSurface.length > 0
      ? userSurface
      : (MATERIAL_SURFACE_AFFINITY[m.name] || SURFACE_ROLES[i % SURFACE_ROLES.length]);
    if (products && products.length > 0 && !m.isCustom) {
      const p = products[0];
      placements.push(`${surface}: ${p.brand} ${p.product}, ${p.finish}`);
    } else if (m.isCustom) {
      // Custom finish: tag visibly so the AI doesn't substitute a stock material.
      placements.push(`${surface}: ${m.name} (USER-DEFINED FINISH — do not substitute)`);
    } else {
      placements.push(`${surface}: ${m.name}`);
    }
  });
  return placements.join('. ') + '.';
};

/** Hard requirement: ≥80% of catalog picks clearly visible (rounded up); target 100%. */
const buildUserSelectedMaterialsMandatory = (
  materials: Array<{ name: string; isCustom?: boolean; placementNote?: string }>,
  materialPlacement: string,
): string => {
  const exact = materials.map((m) => m.name).join('; ');
  const n = materials.length;
  const minVisible = Math.max(1, Math.ceil(n * 0.8));
  const anchors = materials
    .map((m) => {
      if (m.isCustom) {
        const where = m.placementNote ? ` — apply to ${m.placementNote}` : '';
        return `${m.name} (USER-DEFINED — render as the actual material described${where}; never substitute a stock finish)`;
      }
      const prods = MATERIAL_PRODUCT_MAP[m.name];
      if (!prods?.length) return `${m.name} (match catalog name visually — real supplier-grade finish)`;
      const p = prods[0];
      return `${m.name} → ${p.brand} ${p.product}, ${p.finish}`;
    })
    .join(' | ');
  return [
    `USER-SELECTED FINISHES — NON-NEGOTIABLE (MINIMUM 80% VISIBLE, TARGET 100%)`,
    `The client picked ${n} catalog material(s). At least ${minVisible} of ${n} (≥80%, rounded up — absolute floor for a passing image) must appear in the render with unmistakable visual evidence: correct identity, not a generic lookalike. Strongly prefer showing all ${n} — only if composition forces a tradeoff, omit at most ${Math.max(0, n - minVisible)} and never drop below ${minVisible} visible. Zero silent substitutions on any pick that appears.`,
    `The client chose these exact materials from the elemental catalog. The image must prove they were used — not only a similar mood.`,
    `SELECTED (≥${minVisible}/${n} must be clearly in-frame, target all): ${exact}.`,
    `REAL-PRODUCT VISUAL ANCHORS: ${anchors}.`,
    `ASSIGNED SURFACES: ${materialPlacement}`,
    `VISIBILITY: Each visible pick must be identifiable — texture, color family, finish (matte/polished/veined/weave/brushed as applicable). Compose camera, focal depth, and lighting so the minimum ${minVisible} finishes each get at least one clear read (hero plane, foreground edge, or mid-ground). Do not hide catalog picks in deep shadow, blur-only bokeh, or off-camera implication.`,
    `PRECEDENCE: If DOMINANT ENERGY text, furniture examples, or COMBO ACCENTS imply different materials on the same surface roles, the USER-SELECTED FINISHES win. Generic stone/wood/metal language is background only where it does not replace a selected finish.`,
    `Wood shows grain; stone shows veining or pore structure; metal shows brush/patina direction; plaster shows trowel; textile shows weave — tuned to the specific pick above.`,
  ].join('\n\n');
};

// --- ELEMENT → ARCHITECTURAL STYLE RECOGNITION ---
// Maps each element to well-known architectural directions as a recognition framework.
// These styles help the AI understand the visual language, but the final result is driven by the element logic.
const ELEMENT_STYLE_MAP: Record<Element, { styles: string[]; description: string }> = {
  earth: {
    styles: ['wabi-sabi', 'organic modernism', 'warm brutalism', 'desert modernism', 'rustic luxury', 'biophilic design', 'materialist architecture'],
    description: 'Grounded in wabi-sabi and organic modernism — celebrating imperfection, material aging, and tactile authenticity. Three sub-languages: (1) WABI-SABI LUXURY: aged plaster walls with visible patina and repair layers, exposed heavy timber beams, reclaimed weathered wood, dramatic veined stone (green onyx, rainforest marble), warm clay plaster, handmade ceramics, jute rugs, branches in ceramic vases. Inspired by restored Mediterranean/Tuscan buildings with modern furniture. (2) WARM MODERNISM: timber slat facades, concrete + walnut + stone composition, boulder landscaping, herringbone parquet, blackened steel windows, walnut cabinetry with green marble countertops, aged brass fixtures. (3) DESERT EARTH: rammed earth/terracotta walls, desert planting (cacti, palms), warm ochre plaster, lap pools, teak furniture, warm sand-tone palette. Spaces feel handmade, warm, tactile, and connected to the earth — never sterile or clinical.',
  },
  fire: {
    styles: ['dramatic modernism', 'dark contemporary luxury', 'industrial refined', 'corten architecture', 'art deco noir', 'moody cinematic interiors'],
    description: 'Driven by dramatic oxidized warmth and dark material contrast. Signature palette: corten steel (warm amber-rust patina), Nero Marquina marble (black with white calcite veining), oxidized copper (warm verdigris), polished aged brass/gold surfaces, blackened steel frames, dark herringbone parquet floors. Inspired by RCR Arquitectes corten facades, Joseph Dirand dark Parisian interiors, Vincent Van Duysen moody Belgian spaces, Studio Mumbai raw luxury. Exterior: full-facade corten cladding with monumental portal entries, tall slot windows. Interior: dark marble feature walls, polished brass coffee tables, copper-clad kitchen islands, rust/cognac velvet sofas, matte black track lighting on dark ceilings, large abstract art in ochre-rust tones. Atmosphere is cinematic, moody, warm-dark — like architectural photography in Dezeen or Architectural Digest. Every element is real, buildable, branded.',
  },
  water: {
    styles: ['neo-futurism', 'fluid architecture', 'parametric design', 'chrome sculptural', 'liquid-metal interiors', 'reflective modernism'],
    description: 'Defined by polished reflective surfaces, gently curved architectural forms, and immersive material atmosphere — all achieved through REAL CONSTRUCTION METHODS. Signature palette: mirror-polished stainless steel cladding (sheet metal fabricated by specialist metalworkers, welded and polished on-site — as done by Gehry Partners and Zaha Hadid Architects), hammered metal panels (hand-textured sheet steel by artisan fabricators like De Castelli), satin chrome fixtures, glass blocks (Seves Glassblock modular systems), curved laminated glass (hot-bent by Cricursa or similar), microcement floors (Kerakoll seamless poured systems), cream bouclé textiles. Reference projects: Walt Disney Concert Hall (Gehry — real fabricated stainless steel sails), Antwerp Port House (Hadid — faceted glass diamond atop real masonry), Elbphilharmonie (Herzog & de Meuron — real curved glass panels). Interior: polished steel counter fronts fabricated from sheet stainless and mechanically polished, chrome-finished curved plasterboard bulkheads (standard drywall on metal stud framing bent to radius), hammered metal feature panels bolted to wall substrate, glass block partition walls with proper mortar joints, white bouclé curved sofas. Every curve has a buildable radius (minimum 500mm for drywall, minimum 300mm for sheet metal). Every metal surface is fabricated from real gauge sheet stock with visible or concealed joining methods.',
  },
  air: {
    styles: ['ethereal futurism', 'white modernism', 'neo-futurism', 'translucent architecture', 'parametric white', 'iridescent minimalism', 'SANAA clarity', 'forward-looking design'],
    description: 'AIR is forward-looking architecture grounded in REAL BUILDABLE TECHNOLOGY — defined by luminous white spaces, maximum transparency, and innovative yet industrially available materials. Base architecture: white plaster or Corian surfaces (thermoformed by Hi-Macs or Krion certified fabricators), fluted GRC (glass-reinforced concrete) columns, perforated aluminum or GRC facade panels, floor-to-ceiling structural glazing (Schüco or SG-compatible curtain wall systems). Forward-looking accents using REAL PRODUCTS: dichroic glass panels (3M Dichroic Film on laminated glass — used in Olafur Eliasson installations and real buildings like Nedre Foss Park pavilion), tinted laminated glass partitions (standard architectural glass with PVB interlayer in violet/amber tones — produced by AGC, Guardian, or Pilkington), LED cove lighting (standard Zumtobel, iGuzzini, or Deltalight linear LED systems concealed in aluminum channels), 3D textured wall panels (real products by 3DWalldecor, Inhabit, or CNC-milled MDF). Inspired by SANAA (Louvre-Lens, 21st Century Museum Kanazawa), Sou Fujimoto (House NA, Serpentine Pavilion), Junya Ishigami (KAIT Workshop). Interior: clean flat or gently curved ceilings with LED cove lighting, tinted glass partitions, light oak warmth accents, white terrazzo or marble floors. Spaces feel weightless, luminous, and innovative — but every element is sourced from real manufacturers and installed using standard construction methods. NOT sci-fi — genuine architectural futurism that exists today.',
  },
};

// --- ELEMENT → DEEP ARCHITECTURAL BEHAVIOR ---
// Each element is a complete architectural philosophy — geometry, materials, forms, light, and what to AVOID.
// These are master briefs, not style tags.

type ElementArchBrief = {
  geometry: string;
  materialWeight: string;
  lightingLogic: string;
  spatialHierarchy: string;
  formLanguage: string;
  avoidStrict: string;
  materialApplication: string;
};

const ELEMENT_ARCH_BEHAVIOR: Record<Element, ElementArchBrief> = {
  earth: {
    geometry: 'Heavy grounded volumes with thick walls (20cm+), deep overhangs, and terraced levels. Interior: double-height spaces with exposed heavy timber beams, arched stone openings, thick plaster walls showing age and repair layers. Exterior: horizontal timber slat cladding meets concrete/stone, boulder landscaping, deep entry portals with walnut or timber doors. Desert variant: cubic rammed earth/terracotta masses, flat roofs, courtyards with pools. Restored buildings: ancient rough stone walls preserved with modern glass insertions.',
    materialWeight: 'STONE IS PRIMARY — dramatic veined stone (green onyx, rainforest marble, travertine) for countertops, islands, and backsplashes. Warm clay/lime plaster with visible trowel marks and patina layers for walls. Heavy exposed timber beams (aged, with visible grain and weathering). Solid walnut cabinetry and paneling. Reclaimed weathered timber for tables and columns. Board-formed concrete for ceilings and structural elements. Herringbone parquet in warm oak or walnut for floors. Rammed earth or terracotta plaster for exterior walls. Aged/patinated brass for fixtures and hardware. Natural textiles in olive, sage, sand, terracotta, and warm earth tones.',
    lightingLogic: 'Warm golden natural light through tall steel-frame windows or deep recessed openings. Warm downlights (2700K) creating pools of amber glow on stone and wood surfaces. Sculptural woven pendant lights in natural fibers (rattan, bamboo, dried palm) — organic forms that cast pattern shadows. Backlit display cabinets with warm amber glow illuminating ceramic collections. Paper lanterns and candle-like fixtures for intimate ambient warmth. Light absorbed by rough plaster and reflected warmly off stone veining.',
    spatialHierarchy: 'Grounded material hierarchy — heavy timber beams overhead define the rhythm. Stone or dramatic veined marble anchors the focal point (kitchen island, fireplace, feature wall). Warm plaster walls provide the backdrop. Furniture sits low and heavy on the ground. Open shelving with curated ceramics, books, and handmade objects creates layered depth. Plants, branches, and natural arrangements bring organic life. The space feels like it has existed for centuries — layered, patinated, lived-in.',
    formLanguage: 'Massive, grounded, wabi-sabi. Thick stone slabs with dramatic veining used as countertops and islands. Heavy timber beams — rough, aged, imperfect. Low-slung deep sofas in natural linen or olive/sage velvet. Chunky reclaimed wood coffee tables. Round stone or terracotta side tables. Bar stools in sage/olive velvet with rounded padded forms. Everything feels handmade, heavy, and tactile. Imperfection is celebrated — cracks in plaster, weathering on timber, patina on brass.',
    avoidStrict: 'Thin or delicate elements, excessive gloss or mirror polish, futuristic/parametric forms, high-reflective stainless steel, plastic or synthetic surfaces, veneer pretending to be solid, clinical white spaces, anything lightweight or precious, perfectly smooth/sterile surfaces without texture or age.',
    materialApplication: 'Dramatic veined stone (green onyx, rainforest marble, or warm travertine from Antolini, Levantina, or Stone Italiana) wraps kitchen islands, countertops, and backsplashes — full-height 20mm slabs on plywood substrate with proper edge mitering and invisible silicone joints. Warm clay/lime plaster (Clayworks, Bauwerk) hand-applied to plastered masonry/drywall substrate showing trowel marks and patina. Exposed heavy timber beams — real structural glulam or reclaimed solid timber, properly sized for span (minimum 200x300mm for decorative, engineered for structural). Solid walnut cabinetry with real frame-and-panel construction. Herringbone parquet (Kährs engineered or solid 22mm oak) on screed with proper expansion gaps. Reclaimed weathered timber — real salvaged material with character, not distressed new wood. Aged brass fixtures (Rocky Mountain Hardware, Nanz) with genuine patina. Rammed earth walls — real pneumatically rammed aggregate/clay mix in formwork, or Clayworks rammed-earth-effect plaster for interior application. Every material is real, sourced from identifiable suppliers, and installed using proper trade methods.',
  },
  fire: {
    geometry: 'Monumental contrast planes — tall narrow vertical openings cut into thick dark walls, deep recessed entry portals, cantilevered dark volumes with corten cladding. Strong directional hierarchy with one dominant focal wall. Exterior: full-facade corten steel cladding with natural oxidized rust patina in warm amber-brown gradients, deep portal entries framed in darkened hardwood or blackened steel, tall narrow slot windows creating dramatic light blades, monumental scaled proportions. Interior: full-height bookmatched Nero Marquina marble feature walls, polished brass or aged gold coffee tables and fixtures, dark herringbone parquet floors in fumed oak, copper/bronze panel accents flanking focal points, blackened steel frame structures for shelving and kitchen islands.',
    materialWeight: 'CORTEN STEEL is the signature material — warm amber-rust-brown oxidized surface wrapping facades, entry portals, and interior accent walls with visible patina gradients and weathering patterns. NERO MARQUINA dark marble with dramatic white calcite veining in full-height bookmatched slabs. BLACKENED STEEL for precise frames, kitchen cabinets, shelving, and window profiles with matte oxidized finish. OXIDIZED COPPER for warm patina panels on kitchen fronts, fireplace surrounds, and accent walls. AGED POLISHED BRASS for coffee tables, pendant lights, fixtures, and hardware — warm gold living surface. DARK HERRINGBONE PARQUET in deep fumed oak for floors. Dark walnut or ebonized oak for paneling, portals, and ceiling soffits. Charcoal venetian plaster for secondary walls. Every surface must feel like a curated material composition — oxidized metals paired against dark stone, warm rust against deep charcoal, polished gold against matte black.',
    lightingLogic: 'Dramatic controlled chiaroscuro — strong directional warm light (2700K) creating defined shadow patterns on dark surfaces. Matte black minimal track spotlights on dark ceiling rails as primary overhead light source. Concealed LED strips in architectural shadow gaps between corten panels and wood, between marble and ceiling, under floating shelves — revealing material textures through grazing light. Warm amber uplighting on corten/copper surfaces to reveal rust texture depth. Pendant lights in polished brass/copper spheres (Tom Dixon Melt, &Tradition Flowerpot in dark copper). Dark zones are intentional — not every corner needs light. Interior should feel cinematic and moody.',
    spatialHierarchy: 'Centralized focal hierarchy — one dominant statement element commands the space: full-height corten steel or dark marble wall, or copper-clad kitchen island. Everything else supports this focal point. Tall vertical proportions create drama. Deep recessed openings and portals frame views like stage sets. Polished brass coffee tables and dark marble surfaces create layered foreground/midground/background depth. The eye is directed with intention.',
    formLanguage: 'Monumental and decisive. Thick corten steel portal frames with deep reveals. Solid dark marble slabs as continuous surfaces. Blackened steel frames with thin precise profiles for doors, windows, and furniture legs. Polished brass in circular/cylindrical forms (coffee tables, bowl trays, pendant globes). Furniture in warm rust/cognac/copper tones — velvet or nubuck leather in deep amber, terracotta, rust, or burnt sienna. Large-format abstract art in dark ochre/rust tones framed in blackened steel. Bold intentional material contrasts: oxidized warm against polished dark, heavy mass against precise metal edge, rough texture against smooth stone.',
    avoidStrict: 'Pastel colors, excessive softness, generic uniformity, all-white spaces, decorative clutter, rounded cutesy forms, lightweight or flimsy materials, reflective mirror-chrome surfaces (belongs to Water), cool blue-grey tones, Scandinavian lightness, any material that lacks warmth or boldness.',
    materialApplication: 'Corten steel (SSAB Weathering COR-TEN A, 3-5mm gauge) wraps exterior facades as rainscreen panels on steel subframe with proper drainage cavity — visible natural oxidation in warm amber-brown gradients. Interior: Nero Marquina marble (Levantina or Salvatori) in bookmatched 20mm full-height slabs on reinforced wall substrate with concealed mechanical fixings and proper stone weight support. Oxidized copper panels (Aurubis Nordic Green, or KME Tecu Patina) on kitchen island fronts — real pre-patinated sheet copper riveted or bonded to substrate. Aged brass panels and fixtures (Rocky Mountain Hardware, Nanz) with genuine living patina. Blackened steel frames (standard structural and decorative steel, hot-rolled and waxed or powder-coated matte black) for doors, windows, shelving, and kitchen frames — welded and bolted connections visible at joints. Dark herringbone parquet (Kährs Chevron Dark Smoke, engineered 15mm) on leveled screed. Dark walnut or ebonized oak panels with real veneer on MDF core or solid timber — proper joinery. Charcoal venetian plaster (Marmorino) on prepared substrate. Velvet or nubuck leather (Baxter, Poltrona Frau grade) in rust/cognac. Every material joint has a real detail — shadow gap, trim, or reveal strip where different materials meet.',
  },
  water: {
    geometry: 'Fluid yet STRUCTURALLY REAL spatial forms — curved plasterboard bulkheads on bent metal stud framing (standard drywall construction with minimum 500mm bend radius), stainless steel-clad arched features built on steel subframes, curved laminated glass partitions (hot-bent by specialist glaziers like Cricursa). Transitions are radiused and filleted using standard construction detailing — curved plaster corners, bull-nosed edges, radius skirting. Exterior: stainless steel rainscreen cladding on steel substructure (as in Gehry\'s Walt Disney Concert Hall — real fabricated panels bolted to support frames), curved curtain wall glazing (standard unitized systems by Schüco or Permasteelisa bent to radius). Interior: polished steel counter fronts fabricated from 1.5-2mm sheet stainless welded and site-polished, curved plasterboard ceiling bulkheads defining zones, glass block partition walls with structural mortar joints (Seves system), fluted satin stainless column cladding riveted or clipped to steel columns.',
    materialWeight: 'MIRROR-POLISHED STAINLESS STEEL is the signature material — fabricated from real sheet stock (304 grade, 1.5-2mm gauge) by specialist metal fabricators, mechanically polished to 8K mirror finish (Rimex Metals or equivalent). Applied as counter fronts, wall cladding panels, and column wraps with visible or concealed mechanical fixings. HAMMERED/RIPPLED METAL by artisan fabricators (De Castelli) — hand-textured sheet steel panels for bar faces and feature walls, each panel unique. SATIN CHROME for fixtures and hardware — standard commercially available finishes. GLASS BLOCKS (Seves Glassblock) in standard modular sizes with structural mortar or silicone joints. CURVED LAMINATED GLASS (hot-bent by Cricursa, or cold-bent within elastic limits) for partitions. MICROCEMENT (Kerakoll Cementoresina or Ideal Work) for seamless floors — poured and troweled on-site over screed substrate. Cream BOUCLÉ WOOL (Kvadrat) and white linen for upholstery. Every material is a real product from a real manufacturer installed using standard trade methods.',
    lightingLogic: 'Light as reflection and atmospheric depth — polished stainless surfaces bounce and multiply light naturally. Soft ambient glow from standard concealed LED strips (iGuzzini Underscore, Deltalight Femtoline) washing curved surfaces. Hammered metal creates rippling light patterns. Diffused daylight through frosted glass (Saint-Gobain Planilux acid-etched) or glass blocks. Chrome sphere pendants (Tom Dixon Mirror Ball) and blown glass fixtures. No harsh direct downlights — light is diffused, reflected, or scattered. Cool-neutral to warm white (3000-4000K). LED strip grazing on metal features reveals texture depth.',
    spatialHierarchy: 'Flowing spatial continuity — spaces connect through curved openings and reflective surfaces. Polished walls expand perceived space through reflections. Curved plasterboard bulkheads and stainless canopies define zones overhead — all built on standard metal stud framing. The eye flows continuously. Immersive, sensorial, atmospheric — but every spatial element has real structural support behind it.',
    formLanguage: 'Sculptural yet constructable. Furniture with organic curved silhouettes — serpentine bouclé sofas (Edra, Living Divani), kidney-shaped ottomans, polished steel counter fronts with gentle organic curves (fabricated from sheet metal over welded armatures). Stainless surfaces are curved within real fabrication limits — sheet metal brake-formed or roll-bent to achievable radii. Glass is curved within lamination tolerances. Counters and reception desks have flowing forms achieved through real metalwork — welded sheet steel polished on-site, supported by hidden steel subframes. Fluted satin columns with pressed vertical ridges. Forms reference built neo-futurism (Gehry, Hadid, Calatrava) — projects that were ACTUALLY CONSTRUCTED, not just rendered.',
    avoidStrict: 'Sharp 90-degree angles, rigid rectilinear grid layouts, raw rustic wood, heavy dark stone masses (Fire territory), oxidized/rusted metals (Fire territory), warm amber/rust tones, angular fragmented compositions, matte-only surfaces without reflective counterpoint, cluttered decorative objects, traditional furniture with straight legs, warm earthy color palette. ALSO AVOID: impossible double-curved surfaces that cannot be fabricated from sheet metal, gravity-defying cantilevers without visible structure, seamless material transitions that have no real-world joining method.',
    materialApplication: 'Mirror-polished stainless steel wraps counter fronts — fabricated from sheet stock, seam-welded and mechanically polished on-site, mounted on concealed steel subframes. Stainless steel wall cladding panels fixed to wall substrate with concealed clip systems (standard rainscreen method). Curved plasterboard ceiling features on bent metal stud framing — standard drywall construction finished with smooth plaster. Hammered metal panels (De Castelli or bespoke) bolted to wall substrate on counter faces and backsplash. Glass blocks (Seves) form partition walls with proper mortar joints and steel reinforcement as per manufacturer specs. Satin chrome fixtures and hardware — standard commercial products. Microcement (Kerakoll) poured over leveled screed for seamless floor finish. Bouclé curved sofas (Edra Boa, or B&B Italia) provide textile warmth against polished surfaces. All material junctions show real construction details — shadow gaps, trim profiles, expansion joints where different materials meet.',
  },
  air: {
    geometry: 'Forward-looking yet FULLY BUILDABLE spatial forms with CLEAN SIMPLE CEILINGS by default — flat white plaster or gently curved plasterboard ceiling with concealed LED cove lighting in standard aluminum channels (iGuzzini, Deltalight). FLUTED GRC (glass-reinforced concrete) or MDF COLUMNS with CNC-milled vertical ridges — standard fabrication by specialist suppliers. TINTED LAMINATED GLASS PARTITIONS (colored PVB interlayer by AGC or Guardian in violet, amber, or gradient tones — standard architectural glass product). Thermoformed white Corian counters and islands (Hi-Macs or Krion certified fabricators — achievable curves within thermoforming limits). 3D TEXTURED WALL PANELS (real products: 3DWalldecor, Inhabit tiles, or CNC-milled MDF panels). Exterior: white GRC or aluminum rainscreen panels with perforations (standard CNC-punched patterns), structural curtain wall glazing (Schüco systems). Interior: curved Corian counters on concealed steel subframes, clean plaster ceilings with LED coves, tinted glass partitions in aluminum frames, white marble or terrazzo floors. Every form is achievable with standard specialist construction methods.',
    materialWeight: 'WHITE CORIAN (Hi-Macs, Krion) is the signature surface — thermoformed into curved counters and islands within material bend limits (12mm sheets heated to 160°C, bent to achievable radii, seam-bonded invisibly). TINTED LAMINATED GLASS — standard float glass with colored PVB interlayer (AGC Lacobel, Guardian SatinDeco) in violet/amber tones; DICHROIC FILM GLASS (3M Dichroic Film applied to laminated glass — a real commercially available product used in built projects). 3D TEXTURED WALL PANELS — commercially manufactured relief tiles (3DWalldecor, WallArt) or CNC-milled MDF/GRC panels fixed to wall substrate with adhesive or mechanical clips. WHITE MARBLE (Calacatta, Statuario) slabs for floors — standard stone installation on screed. FLUTED WHITE GRC or MDF PANELS on columns — CNC-milled and site-fixed. LIMEWASH (Bauwerk) and WHITE MINERAL PLASTER (Marmorino) for walls — standard artisan application. Clear LOW-IRON GLASS (Pilkington Optiwhite, Guardian UltraClear) for maximum transparency. WHITE TERRAZZO (poured in-situ or precast tiles). LED lighting systems (iGuzzini, Zumtobel, Deltalight) in standard aluminum extrusion channels. Light oak or bleached birch for warmth — real engineered timber. Every material is orderable from real suppliers and installable by standard trades.',
    lightingLogic: 'Abundant natural daylight through floor-to-ceiling structural glazing (low-iron glass in aluminum frames) — LIGHT IS THE PRIMARY MATERIAL. Concealed LED strips (iGuzzini Underscore, Deltalight Femtoline) in standard aluminum channels tracing ceiling coves and shelf edges — cool white (4000-5000K). Soft accent LED in architectural reveals — not garish neon but refined linear LED in warm or cool tones integrated into plaster recesses or counter reveals. WHITE OPAL GLOBE LIGHTS (Flos Glo-Ball, Louis Poulsen Panthella) on slim stems. RING/HALO LED pendants (Flos Arrangements, Artemide Discovery). Dichroic glass art panels refract rainbow spectrums across white surfaces when sunlight hits them — this is real physics, not fantasy. Cool-neutral to daylight color temperature (4000-5500K) for ambient. The space is luminous and naturally lit — light quality comes from real window proportions, glass clarity, and surface reflectivity.',
    spatialHierarchy: 'Weightless yet structurally supported composition — clean flat or gently curved plasterboard ceilings (on standard metal stud framing) define zones, fluted columns create rhythm, TINTED LAMINATED GLASS PARTITIONS divide space while maintaining visual connection (rectangular or gently curved panels in aluminum frames — standard glazing systems). Generous negative space and clear circulation. Dichroic glass art panels serve as focal points — these are real manufactured products (3M Dichroic Film on laminated glass). When other elements mix in, those accents appear proportionally as furniture and decor — never disrupting the light architectural envelope.',
    formLanguage: 'Clean white and gently futuristic — all forms achievable through real fabrication. Gently curved plasterboard ceiling features (standard construction). Fluted CNC-milled panels on columns. Thermoformed Corian counters with smooth organic curves. Stainless steel pedestal tables (Fritz Hansen, Vitra). Tinted glass partition panels in aluminum frames. 3D textured wall tiles (commercially manufactured). Furniture: silver/white upholstered chairs (Fritz Hansen Egg in silver fabric, Vitra Eames in white), white lacquer tables, glass-topped tables with metal bases, opal globe and ring pendant lights. When combined with WATER: polished chrome accents. When combined with FIRE: warm brass fixtures, amber glass. When combined with EARTH: light oak surfaces, indoor plants, cream textiles. The AIR envelope stays light/white — other elements provide warmth.',
    avoidStrict: 'Heavy dark materials, cluttered spaces, ornamental traditional decoration, thick/bulky/heavy furniture, visible heavy hardware, warm earthy tones dominating, raw brutalist concrete, oxidized/rusted metals (Fire territory), full chrome/steel wall-wrapping (Water territory — AIR uses silver accents not immersive chrome), dark dramatic contrast. ALSO AVOID: impossible floating forms without visible support, fantasy materials that don\'t exist commercially, sci-fi aesthetic that has no real-world construction method, holographic surfaces (dichroic film is real — holographic is not).',
    materialApplication: 'White Corian wraps counters and islands — thermoformed by certified fabricators into curved shapes within material limits, seam-bonded and sanded smooth, mounted on concealed MDF/steel subframes. 3D textured wall panels (commercially manufactured tiles or CNC-milled MDF) fixed to wall substrate with adhesive. Tinted laminated glass partitions in aluminum or steel frames — standard glazing installation. Dichroic glass art panels (3M Dichroic Film on laminated glass) as focal features — mounted in steel frames or suspended from ceiling structure with visible cable/rod support. Fluted GRC or MDF panels clad columns with concealed fixing clips. Clean plaster ceilings with LED cove strips in standard aluminum channels. White marble (Calacatta) or terrazzo floors on leveled screed. Limewash or mineral plaster on walls — artisan application over standard plaster substrate. Furniture in silver/white tones from real manufacturers. LED linear systems in architectural reveals — standard products in standard extrusions. Light oak or birch for warmth accents — real engineered timber. The space is 80%+ white/light with forward-looking but REAL and BUILDABLE accents.',
  },
};

// Derived ENERGY_RULES for buildEnergySpatialRules
const ENERGY_RULES: Record<Element, { form: string; lighting: string; spatial: string; material: string }> = Object.fromEntries(
  (['earth', 'fire', 'water', 'air'] as Element[]).map(el => [el, {
    form: ELEMENT_ARCH_BEHAVIOR[el].geometry,
    lighting: ELEMENT_ARCH_BEHAVIOR[el].lightingLogic,
    spatial: ELEMENT_ARCH_BEHAVIOR[el].spatialHierarchy,
    material: ELEMENT_ARCH_BEHAVIOR[el].materialWeight,
  }])
) as Record<Element, { form: string; lighting: string; spatial: string; material: string }>;

const VARIATION_DIRECTIVES = {
  geometry: "VARIATION AXIS — geometry: pick a different spatial hierarchy than the last pass (linear / central / radial / asymmetrical / nested zones). Move the camera to a meaningfully different vantage and crop. The viewer should read this as a different room from the same project, not the same shot re-coloured.",
  lighting: "VARIATION AXIS — lighting: change the dominant light direction (window to the left, then to the right, then behind the camera), the contrast ratio (soft wash vs grazing rake), and which fixtures actually fire. The mood shifts; the materials and palette do not.",
  material: "VARIATION AXIS — material emphasis: bring a different surface into the foreground (stone counter, then wood floor, then plaster wall, then textile mass). The hero finish in this pass was background last pass. Same canonical material list — different reading.",
  focal: "VARIATION AXIS — focal object: rotate the anchor piece (sofa group → dining table → kitchen island → reading nook → fireplace wall). The framing serves a different functional zone of the same project.",
} as const;

// Per-generation camera vantage — rotates with generationIndex so back-to-back
// renders of the same brief don't all share the same one-point centred shot.
// Each entry stays inside the 24-35mm tilt-shift envelope mandated by the
// system instruction; only the standpoint and crop change.
const CAMERA_VANTAGES = [
  'Camera at eye-level (≈ 1.55 m), one-point perspective looking down the long axis of the room. Symmetrical-leaning composition with the primary furniture group at the golden-section line. Camera is fully INSIDE the room — no doorway, no arch, no column edge framing the shot.',
  'Camera at eye-level, two-point perspective from a room corner — both side walls visible, furniture arranged in an L along them. 30 mm equivalent, vertical lines corrected. Camera stands clean inside the corner, no foreground architectural element framing the view.',
  'Camera at eye-level (≈ 1.55 m), three-quarter view from one of the long walls — primary furniture group sits in the middle plane, focal-point wall reads clearly across the back. 30-35 mm equivalent.',
  'Camera high (≈ 1.85 m, standing) and pulled toward one wall, looking diagonally across the room toward the brightest window or aperture. Strong light-to-shadow gradient across the floor. No foreground arch / door / column framing the shot.',
  'Camera at eye-level near the focal-point wall, looking back toward the seating / activity zone. Reverse-shot of the primary view — the focal element (TV / fireplace / art / bar back) is behind the camera; foreground reads the working surface or coffee-table cluster.',
  'Camera close to the dominant window or skylight, looking back into the room. Daylight comes from behind the camera, walls and ceiling read with even soft illumination, deep furniture-side shadows.',
] as const;

/**
 * Bans the "viewed through an arch / doorway / vestibule" framing that the
 * model defaults to when given any commercial or hospitality program. The
 * user explicitly flagged this as the failure mode that ruins otherwise good
 * renders: a beautiful coffee shop reduced to "a coffee shop seen through a
 * concrete arch in a darker foreground room". Camera stays INSIDE the room
 * being designed, not inside the neighbour.
 */
export const CAMERA_FRAMING_DISCIPLINE = `CAMERA FRAMING DISCIPLINE (mandatory — overrides any decorative impulse to "frame" the shot):
- The camera is INSIDE the room being designed — feet on its floor, lens at human eye-level. NEVER place the camera in an adjacent room, vestibule, hallway, or outside the door looking in.
- NO foreground arch, archway, doorway frame, vestibule, dark portal, dark column, dark beam, dark "tunnel" effect, or any other architectural element framing the scene from a darker foreground plane. The room IS the scene — it does not need a proscenium.
- NO "viewed-through-an-opening" composition. NO black-bordered keyhole shots. NO arch-shaped vignettes. The frame edges are the photograph's edges, not an in-scene wall cutout.
- Walls of the room being designed read FULL from floor to ceiling on at least two sides of the frame. Side walls are the room's own walls — not a darker shell behind which we glimpse another room.
- If the brief mentions an archway or vault as a feature of THIS room, it may appear AS a wall opening within the room (e.g. a doorway to the kitchen visible on one side wall) — never as the foreground frame the camera shoots through.`;

// --- CORE PROMPT ENGINE ---

const getActiveDistribution = (input: PromptInput): Vector4 => {
  if ((input.hasUserRefined || input.deepSurveyCompleted) && input.refinedDistribution) {
    return input.refinedDistribution;
  }
  return input.baseDistribution;
};

/** Active elements ≥5% with max−min ≤ this → harmonious / near-equal blend (atmosphere stays multi-way). */
const BALANCED_BLEND_MAX_SPREAD = 12;

const isBalancedElementBlend = (activeDist: Vector4): boolean => {
  const active = ELEMENTS.filter((el) => activeDist[el] >= 5);
  if (active.length <= 1) return false;
  const vals = active.map((el) => activeDist[el]);
  return Math.max(...vals) - Math.min(...vals) <= BALANCED_BLEND_MAX_SPREAD;
};

const buildVisualWeightContractBlock = (activeDist: Vector4): string => {
  const e = Math.round(activeDist.earth);
  const f = Math.round(activeDist.fire);
  const w = Math.round(activeDist.water);
  const a = Math.round(activeDist.air);
  const sorted = sortElementsByDistribution(activeDist);
  const top = sorted[0];
  const second = sorted[1];
  const p0 = Math.round(activeDist[top]);
  const p1 = Math.round(activeDist[second]);
  const nearTie =
    Math.abs(p0 - p1) <= 5 &&
    p1 >= 12 &&
    ((top === 'air' && second === 'earth') || (top === 'earth' && second === 'air'));
  const tieNote = nearTie
    ? ` TOP-TWO NEAR TIE (${top} ${p0}% vs ${second} ${p1}%): treat both as co-primary in the frame — the numeric first place must NOT justify an ultra-ethereal, all-glass, or weightless-futurist read that erases grounded mass. Air = daylight discipline, proportion, selective transparency; Earth = clearly visible stone/timber/plaster/tactile furniture mass occupying comparable readable area.`
    : '';
  return `VISUAL WEIGHT CONTRACT (mandatory): Earth ${e}%, Fire ${f}%, Water ${w}%, Air ${a}%. The image must reflect these shares in atmosphere and material/lighting presence — larger percentages earn larger readable zones and stronger character; smaller ones remain honest calibrated layers (accents, hardware, secondary surfaces, contrast pockets), never erased and never inflated into a false boss mood.${tieNote}`;
};

/** Build energy-weighted spatial rules from percentages (includes material expression) */
const buildEnergySpatialRules = (activeDist: Vector4): string => {
  const parts: string[] = [];
  const sorted = sortElementsByDistribution(activeDist);
  const activeSorted = sorted.filter((el) => activeDist[el] >= 5);
  const maxPct = activeSorted.length ? Math.max(...activeSorted.map((el) => activeDist[el])) : 0;
  for (const el of sorted) {
    const pct = activeDist[el];
    if (pct < 5) continue;
    const rules = ENERGY_RULES[el];
    const rel = maxPct > 0 ? pct / maxPct : 1;
    const tier =
      rel >= 0.92 ? "primary-tier (top share)" :
      rel >= 0.7 ? "strong co-lead" :
      rel >= 0.45 ? "clear supporting" :
      "accent-tier";
    parts.push(
      `${el} (~${Math.round(pct)}% profile, ${tier}): Aim for comparable sensory weight to ~${Math.round(pct)}% of the scene’s material + light + spatial read — ${rules.form} ${rules.lighting} ${rules.spatial} Material: ${rules.material}.`,
    );
  }
  return parts.join(" ");
};

/** Build structured architectural behavior block — geometry, material weight, lighting, spatial hierarchy */
const buildArchitecturalBehaviorBlock = (activeDist: Vector4): string => {
  const sorted = sortElementsByDistribution(activeDist);
  const activeSorted = sorted.filter((el) => activeDist[el] >= 5);
  const maxPct = activeSorted.length ? Math.max(...activeSorted.map((el) => activeDist[el])) : 0;
  const parts: string[] = [];
  for (const el of sorted) {
    const pct = activeDist[el];
    if (pct < 5) continue;
    const b = ELEMENT_ARCH_BEHAVIOR[el];
    const rel = maxPct > 0 ? pct / maxPct : 1;
    const role =
      rel >= 0.92 ? "co-primary / top share" :
      rel >= 0.7 ? "strong secondary" :
      rel >= 0.45 ? "supporting" :
      "trace-to-accent";
    parts.push(`${el.toUpperCase()} (${Math.round(pct)}%, ${role}): Geometry — ${b.geometry}. Material weight — ${b.materialWeight}. Lighting — ${b.lightingLogic}. Spatial hierarchy — ${b.spatialHierarchy}.`);
  }
  return parts.join(" ");
};

// ── SPACE CATEGORY IDENTITY ──
// Strong visual identity per category — prevents a restaurant from looking like a living room
const SPACE_IDENTITY: Record<string, string> = {
  'Living / Residential': 'This is a PRIVATE RESIDENTIAL interior — a home where people live. It must feel domestic, personal, warm, and intimate. Residential furniture scale, personal belongings visible, homely comfort.',
  'Office / Workspace': 'This is a PROFESSIONAL WORKSPACE — an office environment for working. It must feel organized, functional, and corporate-appropriate. Desks, task chairs, monitors, meeting spaces. NOT a home.',
  'Hospitality': 'This is a HOSPITALITY venue — a hotel, boutique hotel, or hospitality space designed for guests. It must feel welcoming, luxurious, and service-oriented. Reception, concierge, guest amenities visible.',
  'Restaurant / Cafe': 'This is a RESTAURANT or CAFE — a commercial dining/drinking establishment for paying customers. It MUST have MULTIPLE dining tables or cafe seating set for service, a visible bar or barista counter, menu/wine displays, commercial-grade furniture, service circulation. This is NOT a home dining room. It must feel like a real restaurant or coffee shop you would walk into. Barista equipment, espresso machines, pastry displays for cafe; full table settings for restaurant. Façade and street-facing enclosure must read as COMMERCIAL: large-format glazing, curtain wall, clerestory, or integrated stained glass / art glass — never suburban house windows.',
  'Retail / Public Interior': 'This is a RETAIL or PUBLIC COMMERCIAL space — a shop, showroom, or public interior. Display fixtures, product shelving, checkout counter, wayfinding signage, commercial-grade lighting. NOT a residential space. Storefront and public envelope must use commercial architectural glazing or feature stained glass / leaded glass as a primary design move where appropriate — not domestic PVC sash or cottage-style house windows.',
  'Private House': 'This is a PRIVATE HOUSE interior — a residential home. It must feel domestic, personal, and lived-in. Home furnishings, personal objects, family-scale spaces.',
  'Residential Building': 'This is a RESIDENTIAL BUILDING — an apartment or residential unit. Standard residential features: entryway, living spaces, domestic scale.',
  'Commercial Building': 'This is a COMMERCIAL BUILDING interior — professional, business-grade space. Corporate materials, commercial lighting, professional furniture, organized zones.',
  'Cultural / Public Architecture': 'This is a CULTURAL or PUBLIC BUILDING — a museum, gallery, civic building, or cultural institution. Grand volumes, public-scale spaces, exhibition-quality lighting, institutional character. NOT a home.',
};

// ── CONTEXT-AWARE ROOM MODIFIER ──
// When a room type is used WITHIN a specific category, modify its character
const ROOM_CONTEXT_MODIFIERS: Record<string, Record<string, string>> = {
  'Restaurant / Cafe': {
    'Dining': 'This is a RESTAURANT DINING HALL — NOT a home dining room. It must have MULTIPLE separate dining tables (at least 4-8 visible), each with full table settings (plates, glasses, napkins, cutlery). Upholstered banquette seating along walls, loose chairs at center tables. Pendant lighting over each table. Service circulation between tables (min 120cm). Visible bar or service station in background. Commercial atmosphere — guests dining, wine bottles, candle holders.',
    'Bar': 'This is a RESTAURANT/CAFE BAR — a fully equipped cocktail/wine/coffee bar. Back-bar with shelved spirits or coffee equipment, bar counter with stools, ambient bar lighting. Commercial atmosphere.',
    'Cafe': 'This is a CAFE SPACE — barista counter with espresso machine (La Marzocca or similar), grinder, drip station, pastry display case, POS system, cup stacks. Multiple small tables with café chairs and/or stools (not residential sofas), menu boards, warm inviting lighting. Specialty coffee shop atmosphere.',
    'Coffee Shop': 'This is a COFFEE SHOP — a cozy, specialty third-wave coffee environment. Prominent barista bar with professional espresso machine (La Marzocca, Victoria Arduino, or Synesso), hand-brew station (V60, Chemex), grinder setup. Pastry/bakery display, artisan cups and ceramics. Seating = café chairs, stools, window counter, communal table with chairs/stools — NOT sofas or sectional lounge as primary furniture. Exposed bulb or pendant warm lighting, chalkboard or minimal menu boards, potted plants, books, curated playlist vibe. Warm, inviting, indie-creative atmosphere — NOT a fast-food chain. Specialty coffee culture. Façade: full-height commercial storefront or curtain-wall bays, OR stained glass / art-glass on façade, entrance, or clerestory (logical light architecture) — if vitrage is used, the bar sits on a different service-capable wall or island, not stacked on the stained-glass plane. Never a house-like living-room window.',
    'Terrace': 'This is a RESTAURANT/CAFE TERRACE — an outdoor dining area for guests. Multiple tables with weather-appropriate settings, outdoor lighting, planters or greenery, protective canopy or parasols. Commercial outdoor dining.',
    'VIP Lounge': 'This is a VIP LOUNGE in a restaurant — private or semi-private seating area with premium furniture, ambient mood lighting, curated art, wine display or private bar. Intimate, exclusive, refined atmosphere.',
    'Restroom': 'This is a RESTAURANT/CAFE RESTROOM — designer-grade guest restroom with premium fixtures, statement mirror, quality tiles, ambient lighting, designer soap dispenser. Must feel curated and on-brand with the venue.',
  },
  'Office / Workspace': {
    'Office': 'This is a PROFESSIONAL OFFICE — multiple work desks, ergonomic chairs, monitors, organized cable management, meeting pod or area visible. Professional, not domestic.',
    'Reception': 'This is a CORPORATE RECEPTION — branded reception desk, company logo or signage, waiting area with commercial seating, professional lighting.',
    'Meeting Room': 'This is a MEETING ROOM — conference table with 6-12 chairs, presentation screen or whiteboard, video conferencing equipment, acoustic treatment, professional lighting.',
    'Lounge': 'This is an OFFICE LOUNGE — break area with comfortable seating, coffee corner, casual meeting spots, soft lighting. A creative respite zone within the workspace.',
    'Restroom': 'This is an OFFICE RESTROOM — clean, modern, well-lit with quality fixtures, full-height mirror, modern tiles. Professional-grade.',
    'Coworking': 'This is a COWORKING SPACE — open plan with hot desks, phone booths, collaborative zones, lounge seating, shared amenities. Creative, flexible, community atmosphere.',
  },
  'Hospitality': {
    'Lobby': 'This is a HOTEL LOBBY — grand entrance with reception desk, bell-service area, luggage zone, concierge, lounge seating, feature chandelier or art installation. Double-height if possible.',
    'Guest Room': 'This is a HOTEL ROOM — king or queen bed with hotel-grade bedding, built-in luggage rack, minibar, desk area, hotel-style bathroom visible. Room service tray, branded amenities.',
    'Lounge': 'This is a HOTEL LOUNGE — comfortable seating groups, cocktail tables, ambient lighting, bar service nearby. Elegant, social, evening atmosphere.',
    'Bar': 'This is a HOTEL BAR — premium bar counter, back-bar with spirits display, lounge seating, cocktail tables, sophisticated evening lighting. Commercial bar, not home.',
    'Reception': 'This is a HOTEL RECEPTION — check-in desk with multiple stations, key-card system, concierge, luggage area, branded wall behind. Welcoming, professional.',
    'Restroom': 'This is a HOTEL RESTROOM — premium guest restroom with designer fixtures, marble or stone surfaces, statement lighting, luxury amenities. Must feel five-star.',
  },
  'Retail / Public Interior': {
    'Shop': 'This is a RETAIL SHOP — product display fixtures, shelving units, mannequins or product pedestals, checkout counter, branded signage, commercial lighting highlighting products.',
    'Reception': 'This is a SHOWROOM RECEPTION — greeting area with product information, brand wall, consultation desk, curated product displays nearby.',
    'Entrance': 'This is a COMMERCIAL ENTRANCE — designed entry threshold, wayfinding, branded elements, transition from exterior to interior.',
    'Lounge': 'This is a RETAIL LOUNGE — comfortable customer seating, coffee station, consultation area with curated displays. Premium shopping experience.',
    'Exhibition': 'This is a RETAIL EXHIBITION — curated product displays, feature lighting, rotating collection area, visual merchandising.',
    'Restroom': 'This is a PUBLIC RESTROOM in a retail space — clean, modern, accessible, quality fixtures, good lighting.',
  },
};

// ── COMMERCIAL / PUBLIC VENUE — vitrage, façade glazing, MEP realism ──
const COMMERCIAL_PUBLIC_INTERIOR_CATEGORIES = new Set<string>([
  'Restaurant / Cafe',
  'Retail / Public Interior',
  'Hospitality',
  'Commercial Building',
  'Cultural / Public Architecture',
]);

const isCommercialPublicInteriorCategory = (category: string): boolean =>
  COMMERCIAL_PUBLIC_INTERIOR_CATEGORIES.has(category);

/** Stained glass + commercial glazing vs residential window clichés */
const COMMERCIAL_GLAZING_VITRAGE_BLOCK = `COMMERCIAL FAÇADE, VITRAGE & GLAZING (MANDATORY for this project class): Coffee shops, restaurants, bars, cafés, bakeries, and similar PUBLIC commercial venues must read as built for paying guests — not a private house. Where exterior light or street context appears, the envelope must be ARCHITECTURAL COMMERCIAL: structural glass walls, slim steel or aluminum curtain-wall mullions, ribbon or clerestory glazing, brise-soleil, or deep façade bays — never suburban cottage sash, tilt-turn PVC “home” windows, or living-room curtains on domestic frames.

STAINED GLASS / VITRAGE: Treat art glass as a CORE design element when appropriate — full-height or large-format leaded/stained glass panels, laminated art-glass feature walls, heritage revival tracery, or contemporary abstract vitrage integrated into partitions and entrances. It must be a complete architectural surface (readable cames, joints, support structure, realistic transmission of light), not a tiny hung picture. If the brief does not specify vitrage, still avoid residential window typology: default to commercial storefront or curtain-wall composition.

VITRAGE PLACEMENT — LOGICAL ONLY (mandatory when stained glass / vitrage appears): Put vitrage where real buildings put architectural glazing or art glass — street façade, entrance portal, clerestory band, partition between public zones, or a dedicated feature wall meant for light and identity. Do NOT run the primary bar, barista counter, or drink rail along the same plane as a full stained-glass feature in a way that stacks shelves, equipment, or back-bar storage on the art-glass surface. Where vitrage exists, that surface stays readable as glass/light architecture — the bar belongs on a different wall or on a freestanding island with a service-capable substrate (solid wall, stone, tile, metal, joinery) for MEP, drainage, and ergonomics. Vitrage zone ≠ bar zone unless separated orthogonally (e.g. vitrage on façade wall, bar along side wall).

FORBIDDEN for this category: façades that look like a detached house, domestic French doors with net curtains, or small punched openings that belong in residential living rooms.`;

/** All interiors: circulation, bar logic, simplicity — complements program-specific rules */
const PRACTICAL_LAYOUT_SIMPLICITY_BLOCK = `PRACTICAL LAYOUT & OPERATIONAL REALISM (mandatory): Design for real entry, movement, and daily operation. Clear paths: ingress from entrance toward service and seating; egress and staff routes readable; customer aisles typically ≥90 cm, service/tray paths ≥120 cm where F&B applies. Bars and counters sit on walls or islands that logically carry power, water, drainage, and storage — not arbitrary floating sculptures. If stained glass or vitrage is in the scene, keep it on façade, entrance, clerestory, or dedicated feature surface — never use the stained-glass plane as the main bar back with equipment mounted through it. Avoid dead-end furniture, blocked doors, purely decorative volumes that waste floor plate, and formal gimmicks that contradict running the space. Prefer straightforward zoning (serve / sit / wait / circulate) with modest complexity — legible and easy to operate, not a maze.`;

const FURNITURE_SERVICE_LINE_SANITY_BLOCK = `FURNITURE vs BAR / SERVICE COUNTER / KITCHEN ISLAND (mandatory wherever a bar, barista counter, kitchen island, peninsula, or long service run appears — residential AND commercial): NEVER place sofas, sectionals, lounge chairs, or deep upholstery leaning on, fused to, or jammed against the island or counter face. The minimum gap from the closest edge of any upholstered piece to the island / bar / counter is 90 cm — a real walkable corridor where a person can pass with a tray. Sofa-to-island flush placement is an automatic layout failure; relocate the sofa, shrink it, or omit it. Bar / island seating = stools at the counter with 25-30 cm knee overhang and 90 cm aisle behind; loose lounge seating = chairs and small tables on walkable floor with full perimeter circulation for staff and guests. Every seat must be reachable and usable from at least one side — no decorative clusters wedged into corners that ignore ergonomics.`;

const ISLAND_HARDWARE_LOGIC_BLOCK = `ISLAND / BAR / PENINSULA HARDWARE & FACADE (mandatory whenever a kitchen island, bar block, peninsula, or freestanding service counter appears): Cabinet handles, knobs, drawer pulls, finger-grip channels, push-to-open seams, hinge lines, and any operable hardware live ONLY on the WORKING side — the side where staff or the cook stands. The DINING / SEATING / GUEST-FACING side of an island or bar is a CLEAN finished panel: a continuous waterfall stone wrap, a fluted wood or plaster facade, a flat veneered panel, a board-and-batten run, a polished metal sheet, or an upholstered banquette skirt — never visible drawer fronts, hinge gaps, or pulls. Same logic on reception desks, ticket counters, and millwork credenzas: hardware faces staff, the public face is flush and finished. If the camera shows both sides, the working side may show neat cabinet rhythm with subtle hardware, but the seated guest's side stays clean. Backs of islands NEVER carry working drawer fronts visible to the dining area.`;

const CAFE_COFFEE_SEATING_BLOCK = `CAFÉ / COFFEE SHOP TYPOLOGY (mandatory when the room is Café or Coffee Shop): Residential-scale sofas and sectionals are NOT appropriate — omit them by default. Seating vocabulary = café chairs, bar stools, counter stools, small 2-top and 4-top tables, communal high table with stools, optional compact bench along a wall or short window perch — never a bulky sofa as the hero. Armchairs at most in low count if m² allows and always away from the service line. The image must read as a working specialty-coffee floor, not a living room with an espresso machine.`;

const buildCommercialCeilingMepBlock = (
  areaM2: number,
  ceilingH: number,
  firePct: number,
  primary: Element,
): string => {
  const fireHeavy = primary === 'fire' || firePct >= 32;
  const volumeHint = `Approximate treated volume scales with ~${areaM2}m² floor plate and ~${ceilingH}m ceiling — diffuser count, grille size, and equipment scale must feel credible (not one toy vent in a large hall).`;

  const base = `CEILING & MEP / HVAC REALISM (COMMERCIAL — construction-grade): Show believable building services integrated with architecture. Include visible SUPPLY air: linear slot diffusers, square perforated supply grilles, or plenum slot details coordinated with lighting. Include RETURN / EXHAUST: return grilles, perforated metal ceiling zones, or paired bar grilles in logical locations relative to supply. ${volumeHint} Sprinklers: pendant heads or concealed cover plates on a believable grid where suspended ceiling or open slab rules apply. Coordination: diffusers, lights, and sprinklers share orthogonal grids or clear axes — no random floating services.`;

  const fireIndustrial = fireHeavy
    ? ` FIRE-DOMINANT OR HIGH-FIRE SHARE: Prefer stronger industrial / hospitality-kitchen language where it fits: OPEN SLAB or EXPOSED MEP — blackened or galvanized duct mains, cable tray, acoustic baffles, expanded-metal or mesh ceiling zones, or spray-fireproofed structure. Where cooking, open flame, or bar-kitchen back-of-house is implied, show EXHAUST CANOPY / grease-rated hood geometry, larger extract grilles, and heavier duct scale. Heating & cooling: plausible terminal layout — cassettes, linear active chilled beams, high-wall FCUs, or bulkhead-concealed duct with linear grilles — multiple terminals or large-format units sized for the room volume, not a single undersized residential split indoor unit unless the space is tiny.`

    : ` Heating/cooling terminals should still be visible or implied with correct scale for the room — commercial cassette, slot, or bulkhead linear grilles — distributed in a logical engineer’s layout.`;

  return `${base}${fireIndustrial}`;
};

const COMMERCIAL_RENDER_EXCELLENCE_BLOCK = `OUTPUT QUALITY (COMMERCIAL / PUBLIC): Aim for ultra-high-end contemporary arch-viz and editorial photography — tack-sharp materials, refined global illumination, no plastic CGI gloss, no floating objects. Furnish with current-market, professional-grade FF&E and recognizable fixture families. Glass, metal, stone, and wood must show real depth, micro-reflection, and installation detail (gaskets, mullions, shadow gaps). The frame must feel like a photograph of a finished venue ready to open — believable occupancy, code-plausible services, and objects that exist at premium contract standards.`;

// ── ROOM-TYPE INTELLIGENCE ──
// Each room type defines its architectural program: required furniture, forbidden items,
// material priorities, camera guidance, and spatial rules.
const ROOM_PROGRAMS: Record<string, {
  requiredElements: string[];
  forbiddenItems: string[];
  materialPriority: string;
  cameraHint: string;
  spatialRules: string;
  layoutLogic: string;
}> = {
  'Living Room': {
    requiredElements: [
      'sofa or sectional seating ANCHORED on a rug',
      'coffee table within arm reach of the sofa',
      'area rug defining the seating zone',
      'floor lamp or table lamp at human-eye height beside seating',
      'one clear FOCAL POINT directly opposite the sofa: a wall-mounted TV / media wall, a fireplace, a substantial curated artwork composition, or a large window framing a real view — the sofa MUST face this focal point',
      'media console / low credenza beneath the TV or artwork (when TV / media wall is the focal point)',
    ],
    forbiddenItems: ['kitchen island', 'bed', 'office desk', 'toilet', 'shower', 'commercial counter', 'bar stools', 'sofa facing a blank wall with nothing on it', 'pendant light floating in mid-air over nothing', 'pendant centered on the room with no functional surface below', 'wall sconce on a random blank wall with no function (no door, no art, no mirror, no bed, no fireplace)'],
    materialPriority: 'warm textiles on seating, hardwood or stone flooring, plaster or paint walls',
    cameraHint: 'eye-level from corner showing the seating arrangement AND the focal-point wall (TV / fireplace / art / view) the sofa faces, 28-32mm',
    spatialRules: 'Sofa MUST face one of: (a) wall-mounted TV with media console, (b) fireplace, (c) curated art wall, (d) feature window with view. Never a blank wall. Coffee table within arm reach of sofa. Min 90cm circulation around furniture grouping. Rug anchors the seating zone. Pendants ONLY over the coffee-table cluster or dining adjacency — never floating between zones with nothing below. Wall sconces only beside doors, art walls, or media walls — never on empty blank walls.',
    layoutLogic: 'Conversation-oriented arrangement with a clear focal point opposite the sofa (TV / fireplace / art / view). Primary seating faces this focal point; secondary seating (armchair) is 90-110° angled to it. Side tables flank sofa. Lighting layered at three heights: floor lamp beside sofa, table lamp on side table or console, optional pendant strictly anchored over the coffee-table cluster (not floating randomly mid-room).',
  },
  'Bedroom': {
    requiredElements: ['bed with headboard against a wall', 'nightstand(s)', 'bedside lighting', 'textile layering (sheets, throw, pillows)'],
    forbiddenItems: ['kitchen island', 'dining table for 6+', 'office cubicle', 'toilet', 'commercial counter', 'bar'],
    materialPriority: 'soft textiles, warm wood flooring (oak or walnut), plaster walls, linen bedding',
    cameraHint: 'eye-level from foot of bed or corner diagonal, showing headboard wall and window, 30-35mm',
    spatialRules: 'Bed centered on the longest wall or positioned with headboard against a solid wall. Min 60cm on each side for nightstands. Wardrobe/closet along perpendicular wall. Clear path from door to bed.',
    layoutLogic: 'Bed is the anchor. Symmetrical nightstands for primary bedroom. Soft lighting only — no overhead harsh fixtures. Reading lights at headboard height.',
  },
  'Kitchen': {
    requiredElements: ['countertop workspace', 'cabinetry (upper and/or lower)', 'sink', 'cooktop or range area', 'task lighting above counter'],
    forbiddenItems: ['bed', 'bathtub', 'office desk', 'wardrobe'],
    materialPriority: 'durable stone or engineered countertops, ceramic or stone backsplash, hardwood or tile flooring, painted or veneer cabinetry',
    cameraHint: 'eye-level from dining area looking toward counter and cabinetry, 28-32mm',
    spatialRules: 'Work triangle between sink, cooktop, and refrigerator. Min 120cm between parallel counters. Island requires 100cm clearance on ALL working sides — never less, never blocked by a sofa or armchair. Upper cabinets 45-50cm above counter. ISLAND HARDWARE LAW: cabinet doors, drawer fronts, knobs, pulls, and visible hardware appear ONLY on the working (cook) side of the island; the seating / dining side shows a clean unbroken finished panel (waterfall stone, fluted wood, flat veneer, or upholstered banquette skirt) — NEVER backside drawer fronts or knobs visible from the living / dining area. SOFA-TO-ISLAND CLEARANCE: when a sofa or sectional is in the same room as a kitchen island, the minimum gap between sofa edge and island edge is 90cm — a walkable corridor. Never fuse sofa to island, never wedge a sectional against the island face.',
    layoutLogic: 'Efficient work zones: prep, cook, clean. Task lighting under upper cabinets. Pendant lights over island/peninsula. Ventilation above cooktop. Living area (if open plan) is set BACK from the island with a clear walkway between zones — sofas face the lounge focal point, not the kitchen work surface.',
  },
  'Bathroom': {
    requiredElements: ['vanity with basin', 'mirror with integrated architectural lighting', 'glass shower screen or walk-in shower', 'towel storage (rail or niche)'],
    forbiddenItems: ['bed', 'sofa', 'dining table', 'kitchen island', 'wardrobe', 'curtains', 'drapery', 'voile', 'sheers', 'window soft treatments', 'curtains in mirror reflection', 'indoor trees', 'spa resort staging', 'wine glass', 'bath caddy', 'excessive candles', 'living-room textiles'],
    materialPriority: 'waterproof surfaces — porcelain tile, natural stone, microcement, glass partitions, matte ceramic, brushed metal hardware',
    cameraHint: 'eye-level from doorway showing vanity and shower zone, 28-35mm',
    spatialRules: 'Dry zone (vanity, mirror, optional hearth) separated from wet zone (shower/tub behind glass). Min 70cm clearance in front of vanity. NO curtains or drapery anywhere — including mirror reflections. Glass partition only for wet zone. Floor drain slope in shower.',
    layoutLogic: 'Functional wet/dry split. Mirror with integrated LED or flanking sconces — architectural, not theatrical. When Fire element ≥ 30%: built-in hearth in dry zone on marble/brass feature wall, ventilated and away from shower.',
  },
  'Dining': {
    requiredElements: ['dining table with appropriate number of chairs', 'pendant light above table', 'clear floor around table for chair pull-out'],
    forbiddenItems: ['bed', 'bathtub', 'office cubicle', 'kitchen sink'],
    materialPriority: 'solid wood or stone table top, upholstered or wood chairs, pendant lighting',
    cameraHint: 'eye-level from corner showing table setting and lighting, 30-35mm',
    spatialRules: 'Min 80cm from table edge to wall for chair movement. Pendant 70-80cm above table surface. Table proportional to room — 4-seat for small, 6-8 for large.',
    layoutLogic: 'Table centered under pendant. Chairs spaced 60cm apart. Sideboard or console against nearest wall. Connected visually to kitchen or living area.',
  },
  'Study': {
    requiredElements: ['desk at proper working height (72-75cm)', 'task chair', 'task lighting', 'bookshelves or storage'],
    forbiddenItems: ['bed', 'kitchen island', 'bathtub', 'dining table for 6+'],
    materialPriority: 'wood desk surface, leather or fabric task chair, wood or metal shelving, warm lighting',
    cameraHint: 'eye-level from corner showing desk area and shelving, 30-35mm',
    spatialRules: 'Desk near window for natural light but not facing window directly (glare). Chair has 100cm rollback space. Bookshelves within arm reach or along wall.',
    layoutLogic: 'Focused work environment. Desk lamp plus ambient overhead. Cable management invisible. Personal objects minimal and curated.',
  },
  'Office': {
    requiredElements: ['work desk(s)', 'ergonomic seating', 'task lighting', 'organized storage'],
    forbiddenItems: ['bed', 'bathtub', 'kitchen stove', 'residential sofa'],
    materialPriority: 'clean surfaces — laminate, wood veneer, metal, glass, acoustic panels',
    cameraHint: 'eye-level showing workspace arrangement and natural light, 28-32mm',
    spatialRules: 'Desks oriented to avoid screen glare from windows. Min 150cm between desk rows. Meeting area separated from focus zone.',
    layoutLogic: 'Functional zones: individual focus, collaboration, storage. Acoustic consideration. Clean cable routing. Professional, not domestic.',
  },
  'Hallway': {
    requiredElements: ['clear circulation path min 100cm wide', 'wall lighting or recessed ceiling lights', 'minimal console or shelf if space allows'],
    forbiddenItems: ['bed', 'dining table', 'kitchen island', 'sofa', 'large furniture blocking path'],
    materialPriority: 'durable flooring (stone, tile, hardwood), feature wall treatment',
    cameraHint: 'one-point perspective down the corridor, 24-28mm',
    spatialRules: 'Nothing blocks the circulation path. Lighting guides movement. Doors visible. Width perception enhanced by mirrors or light walls.',
    layoutLogic: 'Transit space — minimal furniture, maximum flow. Wall art or feature materials for visual interest. Lighting recessed or wall-mounted.',
  },
  'Lobby': {
    requiredElements: ['reception or focal point', 'seating area', 'clear wayfinding', 'feature lighting', 'large-format commercial glazing, curtain-wall entry, or grand stained glass / art-glass feature appropriate to a public lobby'],
    forbiddenItems: ['bed', 'kitchen appliances', 'bathroom fixtures'],
    materialPriority: 'premium stone flooring, feature wall in stone or wood, metal accents, statement lighting',
    cameraHint: 'eye-level from entrance showing reception and volume, 24-30mm',
    spatialRules: 'Clear sight line from entrance to reception. Waiting area off main circulation. Double-height or feature ceiling if possible. Branded material choices.',
    layoutLogic: 'Arrival experience. Reception desk visible immediately. Seating grouped but not blocking flow. Dramatic vertical lighting.',
  },
  'Restaurant': {
    requiredElements: ['MULTIPLE dining tables (at least 4-6 visible, set with plates/glasses/napkins)', 'upholstered banquette seating along at least one wall', 'bar counter or service station with stools', 'pendant or candle lighting over each table', 'waiter circulation paths between tables', 'commercial envelope glazing: full-height storefront/curtain-wall OR large stained glass / art-glass feature (integral, not house windows)'],
    forbiddenItems: ['bed', 'bathtub', 'office desk', 'residential wardrobe', 'residential sofa', 'home bookshelf'],
    materialPriority: 'mix of textures — wood or marble tables, upholstered banquettes in leather or velvet, stone or tile floor, metal/glass bar, acoustic ceiling panels',
    cameraHint: 'eye-level from entry showing depth of dining room with multiple tables receding into space, 28-35mm',
    spatialRules: 'Min 120cm between table edges for service circulation. Bar or open-kitchen counter scaled to m² — large dining hall = long service front + real back-of-house read; small venue = shorter but still functional line. Bar area distinct from dining. Acoustic treatment on ceiling or walls. Mix of 2-top and 4-top arrangements. Tables set with full place settings.',
    layoutLogic: 'Zones: bar, intimate dining, group dining. Banquette along walls. Loose tables in center. Lighting creates intimacy per table. Wine storage or display visible.',
  },
  'Bar': {
    requiredElements: ['long bar counter with bar stools (at least 6-8 seats)', 'back-bar with shelved spirits and glassware', 'cocktail preparation area', 'ambient/mood lighting', 'small cocktail tables or high-tops', 'street-facing or perimeter glazing reads as commercial bar (curtain wall, steel windows, or stained glass feature — not residential sash)'],
    forbiddenItems: ['bed', 'bathtub', 'office desk', 'kitchen stove', 'residential furniture', 'residential sofa inside the bar working zone', 'sectional sofa fused to the bar', 'living-room coffee table in front of the bar', 'persian rug under the bar', 'oriental rug under bar stools', 'tribal pattern rug in working hospitality zone', 'fringed domestic rug in front of bar', 'lounge sofa pushed against the bar face', 'reading nook inside the bar', 'library shelving in the bar working zone'],
    materialPriority: 'dark wood or stone bar top, metal bar rail, leather or upholstered bar stools, tile or stone floor, moody wall treatment',
    cameraHint: 'eye-level showing length of bar counter with back-bar visible, camera fully inside the bar room, 28-32mm, no foreground arch or doorway framing the shot, no dark void wall eating half the frame',
    spatialRules: 'Bar counter height 105-110cm. Bar stools 75cm height. Min 150cm behind bar for bartender. Back-bar within arm reach. Cocktail tables off main bar area. BAR FRONTAGE MUST SCALE WITH ROOM m² — long room = long continuous rail (or segmented) with believable stool count; never a short toy bar in a large volume. NO sofa / sectional / residential lounge furniture inside the bar working zone — separation between bar and any lounge furniture is at least 150 cm and must read as a deliberate secondary zone, not fused.',
    layoutLogic: 'Bar is the SINGLE focal point. Stools face bartender. Back-bar lit for display. If a lounge zone appears at all, it sits as a clearly separated secondary cluster (own rug or floor patch, own light fixture, ≥150 cm away from the bar working face) — NOT a sofa wedged into the bar service zone. Low intimate lighting unified across the whole space — no half-bright-half-pitch-black composition.',
  },
  'Lounge': {
    requiredElements: ['multiple seating groups (sofas, armchairs, ottomans)', 'cocktail or coffee tables', 'ambient lighting at multiple heights', 'decorative objects and art'],
    forbiddenItems: ['bed', 'kitchen island', 'office desk', 'bathtub'],
    materialPriority: 'plush upholstery, area rugs, brass or metal accents, warm wood, soft lighting fixtures',
    cameraHint: 'eye-level from corner showing depth and multiple seating zones, 28-32mm',
    spatialRules: 'Multiple conversation groups (not one giant arrangement). Clear circulation between groups. Each group has its own table and lighting. Mix of sofa + chairs.',
    layoutLogic: 'Social, relaxed zones. Each group accommodates 3-6 people. Lighting creates pools of intimacy. Background music speaker discreet.',
  },
  'Guest Room': {
    requiredElements: ['bed with high-quality hotel bedding', 'nightstands with reading lights', 'luggage rack or bench', 'desk or console area', 'minibar or refreshment tray'],
    forbiddenItems: ['kitchen island', 'commercial counter', 'multiple dining tables', 'office cubicle'],
    materialPriority: 'premium textiles, upholstered headboard, carpet or warm flooring, wood furniture, quality bathroom fixtures',
    cameraHint: 'eye-level from entrance showing bed and window, 30-35mm',
    spatialRules: 'Bed as focal point. Luggage bench at foot. Desk near window. Minibar in wardrobe unit. Bathroom door visible.',
    layoutLogic: 'Hotel room layout: bed, work area, storage, amenities. Everything within reach from bed. Blackout curtains. Room service tray.',
  },
  'Terrace': {
    requiredElements: ['outdoor seating (chairs, lounge, or dining)', 'weather-appropriate table', 'outdoor lighting', 'planters or greenery'],
    forbiddenItems: ['indoor-only furniture', 'bathtub', 'office desk', 'kitchen stove'],
    materialPriority: 'weather-resistant — teak, aluminum, rope weave, stone, outdoor fabric, concrete planters',
    cameraHint: 'eye-level showing outdoor space with view/greenery in background, 28-35mm',
    spatialRules: 'Furniture arranged for views. Weather protection (canopy/parasol) available. Planters define edges. Drainage considered.',
    layoutLogic: 'Outdoor living. Seating oriented toward best view. Greenery creates privacy/enclosure. Lighting for evening use.',
  },
  'Cafe': {
    requiredElements: ['barista counter with espresso machine', 'pastry display case', 'multiple small tables with café chairs and/or stools (sofas omitted)', 'menu board or display', 'ambient lighting', 'large-format commercial glazing or integrated stained glass / art-glass (venue character — not domestic windows)'],
    forbiddenItems: ['bed', 'bathtub', 'office cubicle', 'residential wardrobe', 'residential sofa or sectional as main seating', 'sofa leaning on bar counter'],
    materialPriority: 'warm wood surfaces, tile or concrete counter, copper/brass accents, café chairs and stools',
    cameraHint: 'eye-level from entrance showing counter and seating depth, 28-32mm',
    spatialRules: 'Barista counter prominent from entrance — LENGTH and DEPTH proportional to stated m² (large café = long service run + real back bar; small = compact but still operator-usable). Mix of bar stools at window, small 2-tops with café chairs — no sofa clusters. Queue strip 1.2m+ clear in front. Min 90cm circulation aisles.',
    layoutLogic: 'Coffee shop flow: enter, queue, order, sit. Counter as hero element. Varied seating for solo and groups. Warm inviting atmosphere.',
  },
  'Coffee Shop': {
    requiredElements: ['professional espresso machine (La Marzocca/Victoria Arduino)', 'hand-brew station (V60, Chemex)', 'coffee grinder setup', 'pastry/bakery display', 'artisan ceramic cups', 'communal table with café chairs or stools (not a sofa)', 'window counter with stools', 'café chairs and/or bar stools at small tables', 'pendant or exposed-bulb warm lighting', 'chalkboard or minimal menu', 'façade reads as specialty café: storefront/curtain-wall OR prominent stained glass / leaded glass feature wall or partition (full composition)'],
    forbiddenItems: ['bed', 'bathtub', 'office cubicle', 'formal dining table settings', 'fast-food branding', 'residential sofa or sectional', 'sofa or sectional against or merged with the bar'],
    materialPriority: 'natural oak or walnut surfaces, exposed brick or raw plaster walls, terrazzo or concrete floors, copper/brass barista fixtures, woven textiles, ceramic and stoneware',
    cameraHint: 'eye-level from entrance capturing barista bar and seating depth, warm natural light from window, 28-32mm',
    spatialRules: 'Barista bar is the spatial anchor — its customer-facing run must LOOK sized for the room m² (wide/deep plate → long or L-shaped bar, multiple machine groups + grinder bank + brew bar + display; tiny kiosk → short but thick counter, not a dollhouse strip in a warehouse). Queue + order zone in front. Window counter + stools; tables with café chairs — no sofa blocking or leaning on the bar; no dead trapped space behind furniture. Min 90cm circulation; staff paths ~120cm where possible. Plants and greenery accents.',
    layoutLogic: 'Third-wave coffee experience: enter, admire the bar, order, sit at stool, window, or table with chairs. Warm indie-creative atmosphere. Books, plants, curated objects. NOT a chain — artisan specialty culture. NOT a living room.',
  },
  'VIP Lounge': {
    requiredElements: ['premium upholstered seating', 'cocktail or wine service area', 'mood lighting', 'curated art or decor'],
    forbiddenItems: ['bed', 'bathtub', 'office desk', 'commercial shelving'],
    materialPriority: 'velvet or leather upholstery, dark wood or marble tables, brass accents, rich textiles',
    cameraHint: 'eye-level showing intimate seating arrangement and mood lighting, 30-35mm',
    spatialRules: 'Semi-private feeling with screens or curtains. Premium furniture. Ambient low lighting. Service access without exposing back-of-house.',
    layoutLogic: 'Exclusive intimate space. Conversation-oriented seating. Premium drinks display. Moody, elevated atmosphere.',
  },
  'Wine Room': {
    requiredElements: ['wine storage display (racks or shelving)', 'tasting table or counter', 'ambient lighting', 'temperature-controlled feel'],
    forbiddenItems: ['bed', 'bathtub', 'office cubicle', 'kitchen stove'],
    materialPriority: 'dark wood, stone or brick, wrought iron, warm subdued lighting, leather accents',
    cameraHint: 'eye-level showing wine display wall and tasting area, 30-35mm',
    spatialRules: 'Wine racks as feature wall. Tasting area with counter or table. Controlled lighting highlighting bottles. Cool, cellar-like atmosphere.',
    layoutLogic: 'Display-driven. Wine racks as art. Tasting table centered. Moody intimate lighting.',
  },
  'Restroom': {
    requiredElements: ['designer wash basin or vanity', 'statement mirror', 'quality fixtures and fittings', 'ambient or accent lighting', 'premium tiles or stone'],
    forbiddenItems: ['bed', 'kitchen island', 'dining table', 'office desk'],
    materialPriority: 'marble, terrazzo, or quality tile, designer taps, stone or solid surface vanity, mood lighting',
    cameraHint: 'eye-level from entrance showing vanity wall and mirror, 30-35mm',
    spatialRules: 'Vanity as focal point. Mirror with lighting. Quality hardware. Clean lines. Accessible layout.',
    layoutLogic: 'Designer restroom. Premium materials. Statement mirror and lighting. On-brand with the venue aesthetics.',
  },
  'Reception': {
    requiredElements: ['reception desk or counter', 'seating for visitors', 'branded or feature wall', 'directional/wayfinding elements'],
    forbiddenItems: ['bed', 'bathtub', 'kitchen stove', 'residential wardrobe'],
    materialPriority: 'premium materials on desk and feature wall, durable flooring, professional lighting',
    cameraHint: 'eye-level from entrance showing reception desk and feature wall, 28-32mm',
    spatialRules: 'Reception desk first thing visible on entry. Waiting area to the side. Clear circulation. Feature wall behind or beside desk.',
    layoutLogic: 'First impression space. Desk centered or prominent. Brand identity visible. Professional and welcoming.',
  },
  'Meeting Room': {
    requiredElements: ['conference table with 6-12 chairs', 'presentation screen or whiteboard', 'adequate lighting', 'cable management/outlets'],
    forbiddenItems: ['bed', 'kitchen stove', 'bathtub', 'residential sofa', 'bar'],
    materialPriority: 'wood or laminate conference table, ergonomic chairs, acoustic panels, cable-managed surfaces',
    cameraHint: 'eye-level from corner showing table and screen, 28-32mm',
    spatialRules: 'Table centered. Screen/whiteboard at head end. Min 100cm behind chairs for movement. Acoustic treatment.',
    layoutLogic: 'Collaborative space. Everyone sees screen. Good lighting for video calls. Sound insulation.',
  },
  'Coworking': {
    requiredElements: ['shared work tables or hot-desks', 'variety of seating options', 'phone booths or focus pods', 'communal lounge area'],
    forbiddenItems: ['bed', 'bathtub', 'residential kitchen'],
    materialPriority: 'industrial-modern — plywood, steel, concrete, acoustic felt, plants',
    cameraHint: 'eye-level showing variety of work zones and social interaction, 24-28mm',
    spatialRules: 'Mix of individual and collaborative zones. Phone booths for privacy. Kitchen/coffee visible. Plants and greenery throughout.',
    layoutLogic: 'Variety of work modes: focus, collaborate, socialize. Hot-desk area, lounge, meeting pods, kitchen.',
  },
  'Shop': {
    requiredElements: ['product display fixtures or shelving', 'checkout counter', 'fitting room or consultation area', 'commercial lighting highlighting products', 'public-facing glazing: display windows, curtain-wall shopfront, or feature art-glass — not residential house windows'],
    forbiddenItems: ['bed', 'bathtub', 'office desk', 'residential furniture'],
    materialPriority: 'display-focused — clean shelving, branded fixtures, spot lighting, premium floor',
    cameraHint: 'eye-level from entrance showing product displays and depth, 24-28mm',
    spatialRules: 'Products at eye level. Clear customer flow path. Checkout at exit. Feature displays at entry. Fitting rooms private.',
    layoutLogic: 'Retail flow: browse, try, buy. Hero products at entrance. Category zones. Checkout naturally at end of journey.',
  },
  'Counter': {
    requiredElements: ['service counter with equipment', 'display case or menu board', 'POS system area', 'preparation workspace behind counter'],
    forbiddenItems: ['bed', 'bathtub', 'office desk', 'residential sofa'],
    materialPriority: 'durable counter surface, commercial equipment, tile or stone backsplash, commercial flooring',
    cameraHint: 'eye-level from customer side showing counter and display, 30-35mm',
    spatialRules: 'Counter height 90-100cm for standing service. Display at eye level. POS accessible. Prep area organized behind.',
    layoutLogic: 'Service point. Customer faces staff. Menu/display visible. Quick service flow.',
  },
  'Seating': {
    requiredElements: ['multiple tables with chairs for customers', 'ambient lighting', 'comfortable arrangement', 'clear circulation between tables'],
    forbiddenItems: ['bed', 'bathtub', 'office cubicle', 'residential wardrobe'],
    materialPriority: 'commercial-grade chairs and tables, durable flooring, acoustic treatment, warm lighting',
    cameraHint: 'eye-level showing multiple table arrangement with depth, 28-32mm',
    spatialRules: 'Tables spaced for comfort and service access. Mix of 2-top and 4-top. Window seats if available.',
    layoutLogic: 'Customer comfort. Varied table sizes. Window seating premium. Lighting per zone.',
  },
  'Exhibition': {
    requiredElements: ['display pedestals or hanging systems', 'controlled lighting', 'open floor space', 'informational graphics or labels'],
    forbiddenItems: ['bed', 'kitchen island', 'office desk', 'residential furniture'],
    materialPriority: 'neutral walls (white or grey), polished concrete or timber floor, track lighting, minimal fixtures',
    cameraHint: 'eye-level showing gallery space and exhibits, 24-28mm',
    spatialRules: 'Open plan. Exhibits spaced for contemplation. Lighting focused on art/objects. Neutral background.',
    layoutLogic: 'Gallery flow. Each exhibit has breathing room. Lighting dramatic on objects, neutral elsewhere.',
  },
  'Entrance': {
    requiredElements: ['entry door or threshold', 'coat storage or hooks', 'shoe bench or mat', 'mirror', 'key tray or console'],
    forbiddenItems: ['bed', 'kitchen island', 'bathtub', 'dining table'],
    materialPriority: 'durable flooring, built-in storage, mirror, warm lighting',
    cameraHint: 'one-point perspective from inside looking toward door, 28-35mm',
    spatialRules: 'Clear entry path. Storage for coats/shoes. Mirror for last check. Light switch accessible.',
    layoutLogic: 'Transition space. Everything has a place. Welcoming but organized.',
  },
  'Balcony': {
    requiredElements: ['compact outdoor seating', 'railing visible', 'planters or small garden', 'outdoor view visible'],
    forbiddenItems: ['bed', 'kitchen island', 'bathtub', 'large indoor furniture'],
    materialPriority: 'weather-resistant, compact furniture, planters, outdoor textiles',
    cameraHint: 'eye-level from inside looking out or from corner of balcony, 30-35mm',
    spatialRules: 'Railing at edge. Furniture scaled to small outdoor space. Plants at railing. View is focal.',
    layoutLogic: 'Compact outdoor oasis. Seating oriented for view. Greenery creates privacy.',
  },
  'Kids Room': {
    requiredElements: ['child-sized bed or bunk bed', 'play area', 'storage for toys and books', 'desk or activity table', 'soft area rug'],
    forbiddenItems: ['bar', 'kitchen island', 'commercial equipment', 'office cubicle'],
    materialPriority: 'safe, soft materials — rounded furniture, washable textiles, warm wood, rubber or cork flooring',
    cameraHint: 'eye-level at child height showing play area and bed, 30-35mm',
    spatialRules: 'Bed against wall. Play area open in center. Storage accessible at child height. No sharp corners.',
    layoutLogic: 'Child-friendly zones: sleep, play, learn, store. Colorful but not chaotic. Safe and soft.',
  },
  'Laundry': {
    requiredElements: ['washing machine', 'dryer or drying area', 'folding surface', 'storage for supplies'],
    forbiddenItems: ['bed', 'dining table', 'bar', 'office desk'],
    materialPriority: 'waterproof flooring, durable countertop, tile or microcement, practical lighting',
    cameraHint: 'eye-level showing appliances and workspace, 30-35mm',
    spatialRules: 'Appliances side by side or stacked. Counter above for folding. Supplies stored above. Ventilation.',
    layoutLogic: 'Efficient workflow: sort, wash, dry, fold, store.',
  },
};

// Fallback for room types not in the map
const getDefaultRoomProgram = (roomName: string) => ({
  requiredElements: ['appropriate furniture for the space function'],
  forbiddenItems: ['unrelated fixtures from other room types'],
  materialPriority: 'materials appropriate to the space function',
  cameraHint: 'eye-level, 30mm architectural lens',
  spatialRules: 'Furniture does not block circulation. All items properly scaled to room size.',
  layoutLogic: 'Logical arrangement serving the room purpose.',
});

/**
 * WORKING / IN-USE CONTENT per room type.
 *
 * The user flagged renders that were "empty showrooms" — a bar with no
 * bottles, an office with no monitors, a kitchen with no pots. The SHRE
 * body alone never names this working content; the ROOM PROGRAM preamble
 * block injects it explicitly so the model knows the room is captured
 * mid-service / in active use, with all the equipment a real operator
 * would have on the surfaces. Each entry lists VISIBLE WORKING OBJECTS,
 * not finishes — the SHRE body already handles materials.
 */
const WORKING_CONTENT_BY_ROOM: Record<string, string> = {
  'Bar': 'back-bar fully stocked with rows of spirit bottles on backlit shelves (200+ bottles across multiple tiers), tiered glassware racks (coupe, rocks, highball, wine glasses), an espresso machine on a counter end with portafilters and a tamper, ice well with metal jiggers and bar spoons, garnish trays with citrus wheels and fresh herbs, cocktail shakers, strainers, muddlers laid out on the counter, draft taps or soda gun, a wine fridge or glazed wine cellar visible behind, a half-made cocktail or two glasses with ice mid-service, a folded bar towel draped over the rail',
  'Restaurant': 'tables set with linen napkins, water glasses, wine glasses, polished cutlery in place, charger plates, menu cards in folders, small candles lit on each table, bread baskets with butter, salt & pepper mills, a service tray with empty glassware on a side station, an exposed pass with two plated dishes mid-service, a wine carafe and a corkscrew on a side cart',
  'Kitchen': 'pots simmering on the cooktop with steam visible, a wooden cutting board with a sliced sourdough and a knife, fresh herbs (rosemary, thyme, basil) in glass jars, a fruit bowl with citrus, a stand mixer or espresso machine on the counter, hanging copper utensils, a draped tea towel, a sourdough starter in a jar, an open cookbook with a recipe marked',
  'Living Room': 'hardback books stacked on the coffee table and lower shelves, a thrown wool blanket on the sofa with natural folds, a half-finished cup of tea on a side table, a stack of magazines and art books, a fresh-cut floral arrangement in a ceramic vase, framed art on the wall (two or three pieces grouped), vinyl records or art books on a low console, a folded pair of reading glasses',
  'Bedroom': 'a freshly made bed with a thrown duvet (one corner folded back) and reading pillows, a folded throw at the foot, a bedside lamp lit pooling warm light, a hardback book face-down on the nightstand with a glass of water, slippers parallel by the bed, an open wardrobe revealing hung garments and folded textiles, a watch and a small dish of cufflinks on the dresser',
  'Bathroom': 'rolled white towels on open shelving or a ladder rail (2-3 visible), a glass shower screen with fine water droplets, a wall-mounted mirror with integrated or flanking vanity lighting, a folded hand towel on a hook, a quality soap dispenser at the basin, a built-in niche with functional toiletries — bathroom objects only, no spa-resort staging',
  'Office': 'ergonomic task chairs at each desk, two monitors per workstation showing soft glowing screens (low-light office content visible), keyboards with worn keys, paper trays with sorted documents, indoor plants beside each desk (monstera, snake plant, pothos), a coffee station with mugs and a milk pitcher, a whiteboard with handwritten notes and sticky notes, a printer alcove with a stack of printed paper, headphones resting on a desk, a steaming mug on one desk',
  'Study': 'an open hardback book on the desk with a fountain pen and a pair of reading glasses, a brass desk lamp lit creating a warm pool of light, an ink pot, a stack of letters and papers held by a brass paperweight, books floor-to-ceiling on the shelves with leather spines, a leather wing chair turned slightly toward the desk, an old globe or framed antique map, a tumbler of whisky on a side table',
  'Lobby': 'a manned reception counter with two terminals and an open guest book, brass key tags hung on a board, a luggage trolley with two stacked cases off to one side, a substantial fresh-flower arrangement on a side console, magazines fanned on a low coffee table, brochures in a holder, a doorman bell, a coat rack with a folded jacket and an umbrella near the entrance, a uniformed concierge silhouette',
  'Reception': 'a manned reception counter with terminals, an open appointment book, brass call bell, business cards in a holder, a fresh-flower arrangement on a side console, magazines on a low coffee table, a coat rack with a folded jacket, a wayfinding signboard',
  'Lounge': 'two cocktail glasses with a half-finished drink and one with melting ice on a side table, hardback books and design magazines fanned on a coffee table, a thrown wool blanket on the sofa, a beeswax candle lit on the console, a vinyl record sleeve on the side cabinet, a fresh-cut floral arrangement in a heavy vase, framed black-and-white photographs grouped on the wall, a folded newspaper',
  'VIP Lounge': 'two crystal whisky glasses with a half-finished pour and a single ice sphere on a side table, hardback books fanned on a coffee table, a thrown velvet throw on the sofa, lit beeswax candles in brass holders, a brass tray with a decanter and two glasses, framed art on the wall, a fresh-cut floral arrangement, an open cigar box on a console',
  'Dining': 'a table fully set with linen napkins, wine glasses, water glasses, polished cutlery, charger plates, a low center floral arrangement or candelabra with lit candles, bread on a wooden board with a knife, a half-poured carafe of red wine, a side console with extra plates and a decanter, a wine bottle being opened, a folded tablecloth',
  'Hallway': 'a console with mail stacked and a brass key bowl, a coat rack with a draped jacket and a scarf, a tall mirror reflecting a pool of light, a runner rug, a single framed photograph or landscape painting, a small plant on a stool, an umbrella in a brass stand, a stack of magazines on the console',
  'Guest Room': 'a hotel-made bed with crisp white linens and a thrown duvet, a luggage bench at the foot with an open suitcase revealing folded garments, a desk with stationery and a small lit lamp, a tray with two glass water bottles and tumblers, a folded newspaper, slippers parallel, a folded white robe hung on the open wardrobe, a small fruit bowl on the desk',
  'Terrace': 'two half-finished glasses of wine on the table, a folded linen napkin, a lit citronella candle in a brass holder, potted herbs in terracotta planters (rosemary, thyme, lavender), a thrown wool blanket draped over the lounge chair, an open hardback book face-down on the side table, a tall vase of fresh-cut greenery or seasonal flowers, a wooden tray with a coffee pot',
  'Cafe': 'a working espresso machine on the counter (steam wand in use), a hand-grinder beside it, ceramic cups stacked in pairs, a pastry case with fresh croissants and tarts visible, a chalkboard menu hand-written, fresh roses or seasonal flowers in a small ceramic vase, a stack of design magazines on the communal table, two cups of coffee with latte art on a window-counter, a folded cloth, fresh herbs in a glass jar',
  'Coffee Shop': 'a working La Marzocco or Victoria Arduino espresso machine on the counter with portafilters out, a hand-brew V60 station with a kettle, a Mahlkönig grinder bank with multiple hoppers, ceramic cups stacked in pairs, a pastry case with fresh croissants and tarts, a chalkboard menu hand-written, a small ceramic vase with seasonal flowers, two cups of coffee with latte art on a window-counter, a stack of design magazines on the communal table, a folded barista cloth, fresh-roasted bean bags branded',
  'Wine Room': 'wine bottles laid out on the tasting counter with two stemmed glasses, an open notebook with tasting notes, a corkscrew, a small plate of cheese and crackers, a candle lit, a decanter of red wine being aired, a stack of wine reference books, a wine rack visible behind with hundreds of bottles labeled by region',
  'Meeting Room': 'a long table set with notepads and pens at each seat, glass water carafes and tumblers, an open laptop on the table showing a soft glow, a remote control beside a screen, a tray with coffee cups and saucers, fresh-cut flowers in a low vase, a fruit bowl, a folded agenda on each pad',
  'Coworking': 'shared tables with two laptops open, ceramic coffee cups, notebooks with pens, indoor plants on shelf dividers, a coffee station with a milk pitcher and a row of mugs, a whiteboard with sticky notes, headphones resting on one desk, a stack of books with bookmarks, a steaming cup, a folded jacket on a chair-back',
  'Shop': 'curated product displays on shelves and tables with merchandise arranged in palettes, a checkout counter with a tablet POS terminal, a paper bag with handles on the counter, a folded garment or item being wrapped in tissue, fresh flowers in a vase, a printed price card, a small plant beside the till, a coat rack',
  'Counter': 'a working service counter with a tablet POS, ceramic cups stacked, a milk pitcher, a small bell, a folded cloth, a tray with two cups of coffee mid-service, a small chalkboard with daily specials, fresh flowers in a glass jar',
  'Seating': 'small tables set with menus, a candle lit, two glasses of water with lemon slices, folded linen napkins, an open menu, a folded magazine on an adjacent table, fresh flowers in a small vase, an empty wine glass mid-pour',
  'Restroom': 'rolled hand towels stacked in a tray, a brass soap dispenser, a small floral arrangement or a single stem in a slim vase, a folded cotton mat by the basin, a candle lit, a small basket with fresh towels, a hanging white linen towel, a wood stool',
  'Exhibition': 'framed art evenly spaced on the walls with neat gallery labels beside each piece, a sculpture on a centred plinth, a bench in the middle of the room for visitors, a printed gallery brochure on a small console, soft pools of accent light on each work, a discreet attendant chair, a glass of water on a side table',
  'Entrance': 'a console with a guest book and a brass pen, a small floral arrangement, an umbrella stand with two folded umbrellas, a coat rack with a folded scarf and jacket, a folded newspaper on the console, a mirror reflecting the entry pool of light, a small lamp lit',
  'Balcony': 'two outdoor chairs with thrown cotton blankets, a small table with a tray of two coffee cups and a folded napkin, potted herbs in terracotta planters, a small candle in a glass lantern, an open hardback book face-down, a folded magazine, a wooden footstool',
  'Kids Room': 'a low bed with thrown patterned bedding, a soft toy or two on the pillow, a small desk with crayons and an open sketchbook with childlike drawings, a wooden toy on the floor, a hanging mobile, a small plant, a folded blanket draped over the chair, books with picture spines on the low shelf',
  'Laundry': 'a folded stack of clean white towels on the counter, a wicker basket with crisp folded linens, a small plant on the shelf, a brass-handled iron resting upright, a folded ironing board against the wall, a small bottle of detergent and a soap dish, a hanging rack with two folded shirts',
};

// ── COMPOSITION STRATEGIES (anti-repetition) ──
/** Must stay aligned with App.tsx IMAGE_HOTSPOTS (x,y = % from left, top) for pin-to-pixel coherence */
const HOTSPOT_FRAME_ANCHORS_16_9: Array<{ role: string; x: number; y: number }> = [
  { role: 'FLOOR FINISH (foreground slab, joints, rug edge)', x: 25, y: 88 },
  { role: 'PRIMARY WALL / VERTICAL FINISH', x: 8, y: 40 },
  { role: 'FURNITURE VOLUMES (casegoods, tables, cabinet masses)', x: 38, y: 62 },
  { role: 'MAIN SEATING / PRIMARY UPHOLSTERY', x: 55, y: 68 },
  { role: 'ARCHITECTURAL OR CEILING LIGHTING', x: 35, y: 10 },
  { role: 'FEATURE STONE OR MONOLITHIC SURFACE (island, hearth, splash)', x: 72, y: 55 },
  { role: 'TEXTILE LAYER (cushions, drapery, soft zones)', x: 48, y: 52 },
  { role: 'METAL ACCENTS / HARDWARE / REFLECTIVE FIXTURES', x: 88, y: 35 },
  { role: 'DECOR / ART GLASS / CURATED OBJECTS ON SURFACES', x: 65, y: 38 },
];

const buildHotspotAnchoredCompositionBlock = (): string => {
  const lines = HOTSPOT_FRAME_ANCHORS_16_9.map(
    (h) => `• ${h.role}: center the most legible instance near (${h.x}%, ${h.y}%) — ±8% tolerance.`,
  );
  return [
    'INTERACTIVE PIN / HOTSPOT ALIGNMENT (16:9): The UI shows fixed-position pins at approximate frame coordinates. Compose so the strongest visual read of each role falls in its zone — viewers must be able to connect each pin to a real material, real product, or real fixture.',
    ...lines,
    'Pins MUST sit on truthful features — not empty paint, not anonymous ceiling, not unused floor corners. If a briefed material would miss its zone, adjust furniture layout or camera so construction logic stays natural.',
  ].join(' ');
};

const buildClientEnergyHarmonyBlock = (
  activeDist: Record<Element, number>,
  primary: Element,
  secondary: Element,
  sorted: Element[],
): string => {
  const e = Math.round(activeDist.earth);
  const f = Math.round(activeDist.fire);
  const w = Math.round(activeDist.water);
  const a = Math.round(activeDist.air);
  const primPct = Math.round(activeDist[primary]);
  const secPct = Math.round(activeDist[secondary]);
  const balanced = isBalancedElementBlend(activeDist as Vector4);

  if (balanced) {
    const orderHint =
      primPct === secPct
        ? `${primary.toUpperCase()} / ${secondary.toUpperCase()} order is a UI tie-break only — perceived visual shares must stay close to the stated percentages.`
        : `${primary.toUpperCase()} (${primPct}%) and ${secondary.toUpperCase()} (${secPct}%) lead numerically but stay within a tight band — do not collapse the room into a single-element story.`;
    const airEarthPair =
      ((primary === 'air' && secondary === 'earth') || (primary === 'earth' && secondary === 'air')) && Math.abs(primPct - secPct) <= 6
        ? ' When Air and Earth are the two strongest and within a few points, forbid “Air wins” as a sci-fi glass void: keep warm mineral/wood/stone mass and tactile earth layers as legible as openness and light.'
        : '';
    return `CLIENT ENERGY PROFILE (balanced / near-equal blend — adapt; never illustrate literal elements): Earth ${e}%, Fire ${f}%, Water ${w}%, Air ${a}%. This is a HARMONIOUS MULTI-WAY MIX: each energy owns roughly its share of readable atmosphere — distribute across zones and layers (floor plane, wall treatments, furniture mass, joinery, lighting temperature, metal accents, reflective vs matte passages). ${orderHint}${airEarthPair} Earth ≈ tactile warmth & mass; Fire ≈ contrast & drama; Water ≈ fluid reflectivity & calm; Air ≈ light, openness & futurist clarity — all co-present in proportion. One photographable interior, intentionally fusion — not four unrelated styles fighting.`;
  }

  const tertiary = sorted.filter((el) => el !== primary && el !== secondary && Math.round(activeDist[el]) >= 8);
  const trace =
    tertiary.length > 0
      ? ` Weaker shares (${tertiary.map((x) => `${x} ${Math.round(activeDist[x])}%`).join(', ')}) stay honest to their percentage — present as calibrated layers (texture, object choice, lighting nuance, selective zones), never erased and never pretending to be a second dominant.`
      : '';
  const primSecGap = Math.abs(primPct - secPct);
  const marginalLead =
    primSecGap <= 5 && secPct >= 15
      ? ` Numeric order is marginal (${primPct}% vs ${secPct}%): compose as dual-lead — ${primary.toUpperCase()} must not visually outrank ${secondary.toUpperCase()} as if the gap were 15+ points. `
      : '';
  const airEarthMarginal =
    primSecGap <= 5 &&
    secPct >= 15 &&
    ((primary === 'air' && secondary === 'earth') || (primary === 'earth' && secondary === 'air'))
      ? primary === 'air'
        ? `AIR↔EARTH: Air leads by only a few points — treat Air as proportion, daylight quality, and restrained glass/transparency, not an all-white accelerated-future envelope; Earth stays co-equal visible mass (stone, plaster, timber, woven textiles). `
        : `AIR↔EARTH: Earth leads by only a few points — keep grounded stone/plaster/timber mass photographable at full strength; Air reads as disciplined daylight and proportion, not a sci-fi all-glass wipeout. `
      : '';
  const leadClause =
    marginalLead || airEarthMarginal
      ? `${marginalLead}${airEarthMarginal}${primary.toUpperCase()} at ${primPct}% and ${secondary.toUpperCase()} at ${secPct}% share leadership of the spatial read — interleave surfaces so both remain photographable at comparable strength.`
      : `${primary.toUpperCase()} at ${primPct}% leads — largest surfaces, spatial proportions, and overall light mood follow this logic first. ${secondary.toUpperCase()} at ${secPct}% harmonizes as the designed counter-accent (furniture, metal temperature, focal contrast) at a strength matching its share.`;
  return `CLIENT ENERGY PROFILE (adapt — never illustrate literal elements): Earth ${e}%, Fire ${f}%, Water ${w}%, Air ${a}%. ${leadClause}${trace} One coherent narrative a photographer could caption in one sentence.`;
};

const buildSessionPassBlock = (ordinal: number): string => {
  const pass = ordinal + 1;
  const dimLock =
    ' Stated floor area (m²) and ceiling height are fixed brief datums — do not enlarge or shrink the room versus prior passes; only refine detail, materials, and realism.';
  if (ordinal <= 0) {
    return `SESSION GENERATION PASS ${pass}: Establish elemental hierarchy and a fully buildable, photographable space. Favor contractor-grade realism over stylization.`;
  }
  return `SESSION GENERATION PASS ${pass} (progressive refinement): Increase micro-realism versus a generic visualization — sharper material transitions, clearer manufacturer-level product reads, more disciplined lighting, calmer coordination so secondary energies support (not dilute) the dominant. Every specified finish must be visible and correctly zoned.${dimLock}`;
};

const COMPOSITION_STRATEGIES = [
  { name: 'asymmetric-depth', desc: 'Off-center composition with strong diagonal depth. Primary furniture group offset to one-third of frame. Layered depth through foreground element, midground focus, background wall.' },
  { name: 'axial-linear', desc: 'Strong central axis with symmetrical flanking elements. Eye drawn along a clear perspective line. Balanced but not mirror-perfect.' },
  { name: 'framed-view', desc: 'Composition uses architectural elements (doorway, archway, column) to frame the main scene. Viewer looks through an opening into the room.' },
  { name: 'corner-reveal', desc: 'Camera positioned at room corner showing two walls meeting. Furniture arranged along both visible walls creating an L-shaped composition.' },
  { name: 'window-focal', desc: 'Window or glass wall as primary light source and focal point. Interior arranged toward and lit by this natural light source. Strong light-to-dark gradient.' },
  { name: 'sectional-divide', desc: 'Room visually divided into foreground zone and background zone by a material change, level change, or furniture arrangement. Two distinct but connected spatial experiences.' },
] as const;

// ── HUMAN-READABLE SCALE (authoritative floor + ceiling — model must obey) ──
const buildHumanScaleAndProportionBlock = (
  areaM2: number,
  ceilingH: number,
  spaceCategory: string,
  primaryRoom: string | null,
): string => {
  const vol = Math.round(areaM2 * ceilingH);
  const program = primaryRoom ? `${primaryRoom} (${spaceCategory})` : spaceCategory;
  const side = Math.sqrt(Math.max(areaM2, 1));
  const sideStr = side.toFixed(2);

  const footprint =
    areaM2 < 28
      ? 'This is a SMALL, TIGHT footprint: show essentially one main usable zone in frame — not a vast hall, not multiple unrelated wings. Furniture count and circulation stay minimal and believable.'
      : areaM2 < 65
        ? 'This is a COMPACT-TO-MEDIUM room: one clear primary zone plus perhaps a secondary nook — avoid duplicate “second rooms” stretching unrealistically far.'
        : areaM2 < 130
          ? 'This is a MEDIUM-LARGE open plate: you may show two related zones (e.g. seating + bar) with honest spacing — still proportional to the m² count, not endless depth.'
          : areaM2 < 280
            ? 'This is a LARGE venue floor: multiple seating clusters, clear circulation spine, repeated structural or lighting rhythm — density of furniture and services must scale up; never a near-empty aircraft hangar with one sofa.'
            : 'This is a VERY LARGE public or commercial plate: grand volume, bays, possible double-height or mezzanine hints — MEP and lighting counts must look like a real engineered space, not an oversized void with tiny props.';

  const vertical =
    ceilingH < 2.55
      ? 'Ceiling is RELATIVELY LOW: human figures nearly touch the perceived headroom; shallow coffers or flush services; door/window heads align with this datum — no double-height drama.'
      : ceilingH < 3.05
        ? 'Ceiling is TYPICAL residential / small commercial: ~2.5–3.0 m mentality — standard doors ~2.1 m, pendants and services in normal proportion.'
        : ceilingH < 4.2
          ? 'Ceiling is TALL / loft-like: show the extra vertical air — taller glazing heads, longer pendants, mezzanine edge or clerestory only if it fits the program; do not compose as if the room were 2.8 m high.'
          : 'Ceiling is VERY HIGH or double-height: monumentality is appropriate — feature stair, gallery rail, industrial roof structure, or layered lighting; verticals must read tall in the frame.';

  return [
    'ROOM SIZE — READ THIS LIKE A REAL CLIENT BRIEF (mandatory for proportions; plain language):',
    `• The space you are photographing is ${areaM2} m² on the floor plan, with a clear ceiling height of ${ceilingH} m — treat these as exact design datums, not loose hints.`,
    `• FLOOR PLATE ANCHOR: If this plan were a square, each side would be ~${sideStr} m (√${areaM2}); elongated plans must keep the same total floor area — the visible room must not read like 2× or 3× this footprint (no aircraft-hangar void for a small m² count).`,
    `• Rough enclosed volume ~${vol} m³ — diffuser counts, fixture density, and how filled the room feels must match this volume.`,
    `• Program label for sanity check: ${program}. If the program would not physically fit this m², simplify: realism and these dimensions win over cramming impossible furniture.`,
    footprint,
    vertical,
    'Do not output dollhouse scale, endless empty floors, or ceilings that visibly contradict the stated height. Every person, door, window, and chair must look consistent with these dimensions.',
    'EQUIPMENT & BUILT-IN SCALE: Bars, barista counters, reception desks, kitchen/service lines, pastry/display cases, and back-bar volumes are ARCHITECTURAL JOINERY — their frontage length and depth must track the stated m² (large plate = long or multi-station run + real back-of-house depth; small plate = compact but still code-plausible). Never a toy-sized bar floating in a large empty room; never a banquet block that eats an implausible share of a tiny footprint. Circulation stays practical (typically ≥90 cm customer aisles, ≥120–150 cm where staff pass with trays).',
  ].join(' ');
};

/**
 * Program-specific front-of-house dimensions vs floor plate — fixes café/bar renders that read as dollhouse props.
 */
const buildProgramEquipmentScaleBlock = (
  areaM2: number,
  ceilingH: number,
  primaryRoom: string | null,
  spaceCategory: string,
): string => {
  const room = primaryRoom || '';
  const coffeeLike = room === 'Coffee Shop' || room === 'Cafe';
  const barLike = room === 'Bar';
  const restaurantLike = room === 'Restaurant' || room === 'Seating';
  const counterLike = room === 'Counter';
  const lobbyLike = room === 'Lobby' || room === 'Reception';
  const shopLike = room === 'Shop';
  const categoryRestaurantCafe = spaceCategory === 'Restaurant / Cafe';

  const explicitProgram =
    coffeeLike || barLike || restaurantLike || counterLike || lobbyLike || shopLike;

  if (!explicitProgram && !categoryRestaurantCafe) {
    return '';
  }

  const head =
    `PROGRAM EQUIPMENT SCALE (mandatory — match ~${areaM2} m² × ~${ceilingH} m): ` +
    `Lay out like a real operator brief: front-of-house run length, equipment count, and seat count must feel credible for this footprint. ` +
    `The bar/counter must occupy a convincing fraction of the room width or depth in frame — proportional, practical circulation, no miniature hero counter in a hall.`;

  const chunks: string[] = [];

  if (coffeeLike) {
    if (areaM2 < 32) {
      chunks.push(
        `COFFEE / CAFÉ (compact ~${areaM2} m²): customer-facing barista front typically ~2.4–4.5 m total (straight or short L); one professional espresso group line + grinders + compact brew/rinse; pastry case ~0.9–1.6 m; clear queue/order zone ~1.2–2.2 m in front; ~4–16 seats (2-tops, window rail, small bench) — believable density, not a corridor of empty floor.`,
      );
    } else if (areaM2 < 75) {
      chunks.push(
        `COFFEE / CAFÉ (medium ~${areaM2} m²): main service front ~4–8.5 m (L or straight + optional second POS); grinder bank + pour-over bar + display readable; queue depth ~2–3.5 m; ~16–40 seats in mixed typologies (2-top, 4-top, communal).`,
      );
    } else if (areaM2 < 140) {
      chunks.push(
        `COFFEE / CAFÉ (large ~${areaM2} m²): extended bar run ~7–14 m or segmented stations; back counter depth ~90–140 cm workable; secondary cold case or retail wall possible; seating scales up with multiple clusters — still a full venue, not one tiny island.`,
      );
    } else {
      chunks.push(
        `COFFEE / CAFÉ (venue / flagship ~${areaM2} m²): very long or multi-module bar, possible duplicate service line or central island; displays and seating at real commercial density — dozens of covers in distinct zones; MEP and lighting count match volume.`,
      );
    }
  }

  if (barLike) {
    if (areaM2 < 45) {
      chunks.push(
        `BAR (compact): main drink rail ~3–5.5 m with 5–12 stools; back-bar and speed rail scaled to length — not a postage-stamp counter.`,
      );
    } else if (areaM2 < 120) {
      chunks.push(
        `BAR (medium–large ~${areaM2} m²): continuous or broken front ~6–14 m; 12–35+ stools where layout allows; underbar, ice, and glasswasher implied by length; lounge high-tops secondary.`,
      );
    } else {
      chunks.push(
        `BAR (venue ~${areaM2} m²): long run, island, or multiple bars; several bartender work zones; back-bar wall or gantry at architectural scale.`,
      );
    }
  }

  if (restaurantLike && !coffeeLike) {
    chunks.push(
      `RESTAURANT / DINING: cover count and aisle width scale with ${areaM2} m² — larger floor = more tables with ~120–150 cm service aisles; small floor = fewer tables, still real place settings and working server paths.`,
    );
  }

  if (counterLike) {
    const runLo = Math.max(2.4, Math.min(14, 2 + areaM2 * 0.055));
    const runHi = Math.max(runLo + 0.5, Math.min(16, 2.8 + areaM2 * 0.07));
    chunks.push(
      `SERVICE COUNTER: target customer-facing counter front ~${runLo.toFixed(1)}–${runHi.toFixed(1)} m for ~${areaM2} m² (narrow vs square plan may use L-shape); prep zone behind ~90–150 cm deep.`,
    );
  }

  if (lobbyLike) {
    const deskLo = Math.max(2.2, Math.min(11, 1.6 + areaM2 * 0.045));
    const deskHi = Math.max(deskLo + 0.4, Math.min(14, 2.2 + areaM2 * 0.055));
    chunks.push(
      `RECEPTION / LOBBY: desk or concierge run ~${deskLo.toFixed(1)}–${deskHi.toFixed(1)} m band for ~${areaM2} m² — must read as built for the volume, not a tiny podium lost in space.`,
    );
  }

  if (shopLike) {
    chunks.push(
      `RETAIL: checkout counter and service run proportional to shop width and ${areaM2} m² — fixture density and aisle length believable for the format.`,
    );
  }

  if (chunks.length === 0 && categoryRestaurantCafe) {
    chunks.push(
      `RESTAURANT / CAFÉ (room type unspecified): scale any visible bar, barista counter, back-bar, and seating to ~${areaM2} m² — long frontage and believable equipment density on large floors; compact but complete station on small floors — never a miniature counter in an oversized empty volume.`,
    );
  }

  return [head, ...chunks].join(' ');
};

// ── CAMERA SPECIFICATIONS BY ROOM SIZE ──
const getCameraSpec = (areaM2: number, ceilingH: number, roomHint: string) => {
  const focalLength = areaM2 >= 150 ? '24mm' : areaM2 >= 80 ? '28mm' : areaM2 >= 40 ? '30mm' : '35mm';
  const cameraHeight = ceilingH >= 3.5 ? '120cm from floor' : '110cm from floor (seated eye-level)';
  const tiltCorrection = 'vertical lines perfectly straight — full architectural perspective correction applied';
  return `Camera: ${focalLength} prime lens on medium-format sensor, ${cameraHeight}, ${tiltCorrection}. ${roomHint} f/8 aperture for deep focus, natural color temperature. No lens distortion, no vignetting.`;
};

export const buildGenerationPackage = (input: PromptInput): GenerationPackage => {
  const activeDist = getActiveDistribution(input);
  const profile = elementLanguageProfile(activeDist);

  let mappingBasis = "conceptual";
  let geometryLock = "none";
  if (input.reference.photoUploaded) { mappingBasis = "photo-based"; geometryLock = "strict"; }
  else if (input.reference.planUploaded) { mappingBasis = "plan-based"; geometryLock = "partial"; }

  const primaryRoom = input.rooms && input.rooms.length > 0 ? input.rooms[0] : null;
  const roomKey = primaryRoom || input.spaceCategory;
  const roomProgram = ROOM_PROGRAMS[roomKey] || getDefaultRoomProgram(roomKey);

  // Space identity — strong category-level visual character
  const spaceIdentity = SPACE_IDENTITY[input.spaceCategory] || '';

  // Context modifier — adjusts room behavior based on parent category
  const categoryModifiers = ROOM_CONTEXT_MODIFIERS[input.spaceCategory];
  const contextOverride = categoryModifiers && primaryRoom ? (categoryModifiers[primaryRoom] || '') : '';

  const areaM2 = Math.max(8, Math.min(50000, Math.round(Number(input.areaM2) > 0 ? Number(input.areaM2) : 100)));
  const rawCeil = input.constraints?.ceilingHeightM;
  const ceilingH =
    typeof rawCeil === 'number' && Number.isFinite(rawCeil) && rawCeil > 0
      ? Math.max(2, Math.min(12, Math.round(rawCeil * 10) / 10))
      : 2.8;
  const naturalLight = input.constraints?.naturalLight || 'medium';
  const colorPalette = input.constraints?.colorPalette || 'auto';
  const budgetLevel = input.constraints?.budgetLevel || 'premium';

  const sorted = sortElementsByDistribution(activeDist);
  const primary = sorted[0];
  const secondary = sorted[1];
  const balancedBlend = isBalancedElementBlend(activeDist);
  const earthPct = Math.round(activeDist.earth);
  const firePct = Math.round(activeDist.fire);
  const waterPct = Math.round(activeDist.water);
  const airPct = Math.round(activeDist.air);

  // Material placement — explicit surface-to-material mapping
  const materialPlacement = buildMaterialPlacement(input.materialsSelected);

  // Furniture diversity — cycle different items per generation using generationIndex
  const genIdx = input.generationIndex ?? 0;
  const primaryPool = FURNITURE_BY_ELEMENT[primary];
  const secondaryPool = secondary !== primary ? FURNITURE_BY_ELEMENT[secondary] : [];
  const tertiaryEl = sorted[2];
  const tertiaryPool =
    balancedBlend && tertiaryEl && FURNITURE_BY_ELEMENT[tertiaryEl]?.length
      ? FURNITURE_BY_ELEMENT[tertiaryEl]
      : [];
  const furnitureItems = [
    primaryPool[genIdx % primaryPool.length],
    primaryPool[(genIdx + 1) % primaryPool.length],
    ...(secondaryPool.length > 0 ? [secondaryPool[(genIdx + 2) % secondaryPool.length]] : []),
    ...(tertiaryPool.length > 0 ? [tertiaryPool[(genIdx + 3) % tertiaryPool.length]] : []),
  ];
  const primaryLights = LIGHTING_BY_ELEMENT[primary];
  const secondaryLights = secondary !== primary ? LIGHTING_BY_ELEMENT[secondary] : [];
  const sharedLight = SHARED_LIGHTING[(genIdx + 2) % SHARED_LIGHTING.length];
  const lightItems = [
    primaryLights[genIdx % primaryLights.length],
    ...(secondaryLights.length > 0 ? [secondaryLights[(genIdx + 1) % secondaryLights.length]] : []),
    sharedLight,
  ];

  // Decor items — cycle through for variety
  const decorPool = DECOR_BY_ELEMENT[primary];
  const secDecorPool = secondary !== primary ? DECOR_BY_ELEMENT[secondary] : [];
  const quatEl = sorted[3];
  const quatDecorPool =
    balancedBlend && quatEl && DECOR_BY_ELEMENT[quatEl]?.length ? DECOR_BY_ELEMENT[quatEl] : [];
  const decorItems = [
    decorPool[genIdx % decorPool.length],
    decorPool[(genIdx + 3) % decorPool.length],
    ...(secDecorPool.length > 0 ? [secDecorPool[(genIdx + 1) % secDecorPool.length]] : []),
    ...(quatDecorPool.length > 0 ? [quatDecorPool[(genIdx + 4) % quatDecorPool.length]] : []),
  ];

  // Wall treatment — cycle through for variety
  const wallTreatPool = WALL_TREATMENTS_BY_ELEMENT[primary];
  const secWallPool = secondary !== primary ? WALL_TREATMENTS_BY_ELEMENT[secondary] : [];
  const wallTreatment = wallTreatPool[genIdx % wallTreatPool.length];
  const secWallTreatment = secWallPool.length > 0 ? secWallPool[(genIdx + 1) % secWallPool.length] : '';

  // Textile layers
  const textilePool = TEXTILE_LAYERS_BY_ELEMENT[primary];
  const secTextilePool = secondary !== primary ? TEXTILE_LAYERS_BY_ELEMENT[secondary] : [];
  const textileLayers = [
    textilePool[genIdx % textilePool.length],
    textilePool[(genIdx + 1) % textilePool.length],
    ...(secTextilePool.length > 0 ? [secTextilePool[genIdx % secTextilePool.length]] : []),
  ];

  // Color palette directive
  const colorDirective = colorPalette !== 'auto' ? COLOR_PALETTE_MAP[colorPalette] : '';
  const budgetDirective = BUDGET_LEVEL_MAP[budgetLevel];

  // Appliances for room type
  const roomAppliances = APPLIANCES_BY_ROOM[roomKey] || '';

  // Wallpaper/tiles when relevant
  const useWallpaper = (primary === 'earth' || primary === 'fire' || primary === 'water') && genIdx % 3 === 1;
  const wallpaperChoice = useWallpaper ? WALLPAPER_BY_ELEMENT[primary][genIdx % WALLPAPER_BY_ELEMENT[primary].length] : '';
  const useTiles = (roomKey === 'Kitchen' || roomKey === 'Bathroom') && !input.materialsSelected.some(m => m.name.toLowerCase().includes('ceramic') || m.name.toLowerCase().includes('tile'));
  const tileChoice = useTiles ? TILE_BRANDS_BY_ELEMENT[primary] : '';

  // Atmosphere
  const userAdjectives = input.adjectivesSelected.map(a => a.label);
  const atmosphereBlock = userAdjectives.length > 0
    ? `Atmosphere requirements: ${userAdjectives.join(', ')}. These define the experiential character — every material, light source, and spatial proportion must reinforce these qualities.`
    : `Atmosphere: ${profile.atmospherePhrases.slice(0, balancedBlend ? 6 : 4).join(', ')}. Blend strength must track the Earth/Fire/Water/Air percentages — no single phrase may erase a sizeable share.`;

  // Composition cycling
  const compIdx = (input.generationIndex ?? 0) % COMPOSITION_STRATEGIES.length;
  const composition = COMPOSITION_STRATEGIES[compIdx];
  const focusKeys: ('geometry' | 'lighting' | 'material' | 'focal')[] = ['geometry', 'lighting', 'material', 'focal'];
  const variationFocus = input.variationFocus ?? focusKeys[(input.generationIndex ?? 0) % 4];
  const variationDirective = VARIATION_DIRECTIVES[variationFocus];

  // Camera vantage rotates independently of composition strategy. Combined,
  // 6 vantages × 6 compositions × 4 variation axes × 4 time variants ≈ 576
  // unique configurations before the model adds its own micro-variation,
  // so back-to-back generations of the same brief read as the same project
  // shot at different moments rather than as identical re-renders.
  const cameraVantage = CAMERA_VANTAGES[(input.generationIndex ?? 0) % CAMERA_VANTAGES.length];

  // Lighting — rotates between four DAYTIME scenarios for anti-repetition.
  // We no longer rotate into an "evening / blue hour" variant by default —
  // it was producing a night render every 4th generation and forcing every
  // low-natural-light room into a dim moody evening scene, which the user
  // explicitly flagged ("ღამის რენდერი არ არის აუცილებელი"). Night/evening
  // is now opt-in via the explicit `params.timeOfDay === 'evening'` brief
  // (handled elsewhere); the auto-rotation stays in daylight territory.
  const timeVariants = [
    { time: 'midday', desc: 'Bright natural daylight flooding through windows. Strong sun-cast shadow patterns on floor and walls. Color temperature 5000-5500K. Window light creates defined geometric shadow shapes of window frames on interior surfaces.' },
    { time: 'golden hour', desc: 'Late afternoon golden hour light angling deeply through windows. Warm amber light (3500K) creating long dramatic shadows and warm pools on surfaces. The sun is low, casting golden ribbons across the room.' },
    { time: 'overcast', desc: 'Soft diffused overcast daylight from windows. Even, shadowless illumination (5000K) with no harsh shadows. All material textures clearly visible. Supplementary warm accent lighting (2700K) from architectural fixtures.' },
    { time: 'soft afternoon', desc: 'Soft mid-afternoon daylight, sun high but slightly off-axis to the window. Gentle warm-neutral light (4200-4700K) wraps the room without harsh contrast. Long soft shadows on the floor reveal material texture. Architectural accent lighting (3000K) stays low and supportive — no blue-hour exterior, no dimmed evening mood.' },
  ];
  const timeIdx = genIdx % timeVariants.length;
  const baseLight = naturalLight === 'high'
    ? timeVariants[timeIdx % 3] // bright rooms stay in midday / golden / overcast
    : naturalLight === 'low'
      ? timeVariants[2] // dim rooms read as overcast daylight, never blue-hour night
      : timeVariants[timeIdx]; // medium light rotates through all four daytime moods
  const lightScenario = baseLight.desc;

  const ar = '16:9';
  const archContextLabel = input.archContext ? ` in a ${input.archContext} setting` : '';
  const spaceLabel = input.domain === 'architecture'
    ? `${input.spaceCategory} building${archContextLabel}`
    : primaryRoom
      ? `${primaryRoom} within a ${input.spaceCategory} project`
      : `${input.spaceCategory} interior`;

  // ═══════════════════════════════════════════════════
  // PROMPT ASSEMBLY — structured for maximum clarity
  // ═══════════════════════════════════════════════════

  const P: string[] = [];

  // [0] DOMAIN LOCK — strict interior/architecture separation
  if (input.domain === 'architecture') {
    P.push(`DOMAIN: ARCHITECTURE / EXTERIOR. Generate ONLY an exterior architectural view — the camera is OUTSIDE showing a building, facade, landscape, urban context. Do NOT generate any interior spaces, room interiors, or indoor furniture. This is a BUILDING seen from outside.`);
  } else {
    P.push(`DOMAIN: INTERIOR. Generate ONLY an interior space — the camera is INSIDE a room. Do NOT generate any exterior building views, facades, or outdoor landscapes. This is a ROOM seen from inside.`);
  }

  const spaceConfigLine = input.spaceSummaryLine?.trim();
  if (spaceConfigLine) {
    P.push(`SPACE CONFIG SUMMARY (active one-line brief from workspace or user edit — treat as authoritative for project type, rooms/context, scale, and atmosphere cues; keep the image consistent with it): ${spaceConfigLine}`);
  }

  // ─────────────────────────────────────────────────────────────
  // INPUT FIDELITY LOCK — the user's wheel/survey/space-config picks
  // must reach the image, not get lost behind generic SHRE poetry.
  // Front-loaded so the model treats these as hard constraints,
  // not soft hints.
  // ─────────────────────────────────────────────────────────────
  {
    const dist = activeDist;
    const distLine = `Earth ${Math.round(dist.earth)}% · Fire ${Math.round(dist.fire)}% · Water ${Math.round(dist.water)}% · Air ${Math.round(dist.air)}%`;
    const adjLine = input.adjectivesSelected.length
      ? input.adjectivesSelected.map((a) => a.label).join(', ')
      : '(none selected)';
    const matLine = input.materialsSelected.length
      ? input.materialsSelected.slice(0, 10).map((m) => `${m.name}${m.placementNote ? ` [${m.placementNote}]` : ''}`).join('; ')
      : '(SHRE defaults)';
    const styleDir = input.diagnosis?.styleDirection || null;
    const diagPalette = input.diagnosis?.palette || null;
    const archCtx = input.archContext ? ` · context: ${input.archContext}` : '';
    const roomsLine = input.rooms && input.rooms.length > 0 ? input.rooms.join(', ') : (primaryRoom || input.spaceCategory);
    const lightLine = `daylight: ${naturalLight}`;
    const paletteLine = colorPalette && colorPalette !== 'auto' ? `palette: ${colorPalette}` : 'palette: auto';
    const budgetLine = `budget tier: ${budgetLevel}`;
    const aspectLine = input.aspectRatio ? `aspect: ${input.aspectRatio}` : '';

    P.push(
      [
        `USER INPUT FIDELITY LOCK (treat every line as a non-negotiable design datum — every render below must visibly honour these picks):`,
        `- Project: ${input.spaceCategory}${archCtx}`,
        `- Rooms / program in frame: ${roomsLine}`,
        `- Floor area: ${areaM2} m² — fixture density, fixture count, and furniture quantity must read this footprint, not double it.`,
        `- Clear ceiling height: ${ceilingH} m — pendants drop, wall heights, and door / window head heights all scale to this datum.`,
        `- SHRE energy distribution (must be visually readable in materials + light + atmosphere): ${distLine}`,
        `- Selected adjectives (mood register the room must carry): ${adjLine}`,
        `- Selected materials (must appear by name on real surfaces — see placement notes when given): ${matLine}`,
        styleDir ? `- Diagnosis style direction: ${styleDir}` : '',
        diagPalette ? `- Diagnosis palette direction: ${diagPalette}` : '',
        `- ${lightLine} · ${paletteLine} · ${budgetLine}${aspectLine ? ` · ${aspectLine}` : ''}`,
        input.spaceNote ? `- User note about the space: "${input.spaceNote.trim()}"` : '',
        input.userNote ? `- User note for this generation: "${input.userNote.trim()}"` : '',
        `If any element of this block contradicts a stylistic default lower in the prompt, this block wins. The user did not pick this brief by accident.`,
      ].filter(Boolean).join('\n'),
    );
  }

  P.push(buildHumanScaleAndProportionBlock(areaM2, ceilingH, input.spaceCategory, primaryRoom));
  const programEquipScale = buildProgramEquipmentScaleBlock(areaM2, ceilingH, primaryRoom, input.spaceCategory);
  if (programEquipScale) P.push(programEquipScale);

  // Resolve dominant + secondary early so the LIFE & DAYLIGHT and
  // ELEMENTAL ACCENT LAYER preamble blocks can be element-aware before
  // the SHRE body is assembled.
  const { primary: shrePrimary, secondary: shreSecondary } = readElements(activeDist);

  // ─────────────────────────────────────────────────────────────
  // ROOM PROGRAM — functional working content.
  // ─────────────────────────────────────────────────────────────
  // The legacy block that pushed roomProgram.requiredElements is disabled
  // inside the SHRE refactor, so the SHRE body had no idea what objects
  // must be physically present in the room. The user flagged this
  // explicitly ("a bar must have drinks, equipment and corresponding
  // gear placed, just like other spaces"). This block re-injects the
  // program data PLUS an explicit "in-use working content" list per room
  // type so the render reads as a working space mid-service, not an
  // empty showroom.
  const workingContent = WORKING_CONTENT_BY_ROOM[roomKey] || 'task tools, in-use objects, and signs of recent activity proportional to the room type';
  P.push(
    `ROOM PROGRAM — FUNCTIONAL WORKING CONTENT (must be physically present and visible in the render):
- REQUIRED ELEMENTS in this ${roomKey}: ${roomProgram.requiredElements.join('; ')}.
- LAYOUT LOGIC: ${roomProgram.layoutLogic}
- SPATIAL RULES: ${roomProgram.spatialRules}
- FORBIDDEN in this room (do not render): ${roomProgram.forbiddenItems.join(', ')}.
- IN-USE WORKING OBJECTS (must be visible on the surfaces): ${workingContent}.
- The room is captured MID-SERVICE / IN ACTIVE USE — there is always something happening: a half-finished drink, a steaming cup, an open book, a thrown jacket, a folded napkin, a lit candle, an in-progress task. NEVER render an empty showroom-clean version of a working space — that is the failure mode.`,
  );

  // ─────────────────────────────────────────────────────────────
  // LIFE & DAYLIGHT — mandatory atmosphere of inhabitation.
  // ─────────────────────────────────────────────────────────────
  // The user described the previous render as "no sun comes in, no joy,
  // no gravitas, nothing happening". This block injects natural daylight
  // (element-tinted to match the dominant element's emotional register),
  // mandatory plant life, layered textiles, and signs of recent human
  // use so every render reads as inhabited and considered — not sterile,
  // not a marketing render.
  P.push(
    `LIFE & DAYLIGHT — MANDATORY ATMOSPHERE (the room must feel inhabited, refined, and emotionally calibrated — never sterile):
- NATURAL DAYLIGHT enters the space: ${ELEMENT_DAYLIGHT_QUALITY[shrePrimary]}. Daylight is the BASE light source; the SHRE fixture + concealed cove LED + one warm task lamp at human-eye height layer ON TOP — daylight first, fixtures second. No flat global fill, no fake HDR, no night scene unless explicitly requested.
- PLANT LIFE is mandatory where the room type allows: at least one substantial green presence proportional to the space — olive tree in clay, dracaena, ficus, fern, monstera, eucalyptus in a vase, or herbs in jars. Skip in Bathroom, Restroom, wine cellars, or ultra-minimal galleries.
- SIGNS OF RECENT HUMAN USE: evidence proportional to ${roomKey} — folded napkin, steaming cup, half-open book, draped jacket, fresh flowers, in-progress task. Working spaces show tools of the trade (bar tools, espresso cups, desk papers) — not random decor props. Bathrooms show functional use only (folded towel, soap at basin) — never spa-resort fantasy props.
- LAYERED TEXTILES (where the space type allows): at minimum one rug or runner, one cushion family, one throw or linen — never bare-everywhere hard surfaces in residential or lounge types. Skip entirely in Bathroom and Restroom — no curtains, throws, or living-room textiles.
- REFINED EMOTIONAL DENSITY: warmth and gravitas together — restrained luxury, quiet intelligence, photographed calm. Not Pinterest cliché, not developer showroom, not algorithmic perfection.`,
  );

  // ─────────────────────────────────────────────────────────────
  // ELEMENTAL ACCENT LAYER — proportional decor from non-dominant elements.
  // ─────────────────────────────────────────────────────────────
  // The dominant + secondary elements set context and atmosphere via the
  // SHRE body. Every OTHER element with ≥5% weight enters the room as
  // DECOR + LIGHTING accents proportional to its % — this is the user's
  // explicit method ("dominant and secondary create context, the rest
  // enter as supporting decor and accent details proportional to their
  // %"). Accents NEVER clad walls or floors; they appear as lighting
  // fixtures, decor pieces, textiles, or in-use details only.
  {
    const allElements: Element[] = ['earth', 'fire', 'water', 'air'];
    const elementPct = (el: Element) => Math.round(activeDist[el]);
    const tertiaryLines: string[] = [];
    for (const el of allElements) {
      if (el === shrePrimary || el === shreSecondary) continue;
      const pct = elementPct(el);
      if (pct < 5) continue;
      const intensity = pct >= 20 ? 'substantial presence' : pct >= 12 ? 'visible presence' : 'subtle hint';
      const accentLine =
        roomKey === 'Bathroom' || roomKey === 'Restroom'
          ? BATHROOM_ACCENT_DECOR[el]
          : ELEMENT_ACCENT_DECOR[el];
      tertiaryLines.push(`- ${el.toUpperCase()} accent (${pct}%, ${intensity}): ${accentLine}.`);
    }
    if (tertiaryLines.length > 0) {
      P.push(
        `ELEMENTAL ACCENT LAYER — non-dominant elements enter as DECOR + LIGHTING proportional to their %:
${tertiaryLines.join('\n')}
These are SMALL decor and lighting accents distributed in the room — they do NOT replace the primary materials, they do NOT clad walls or floors. They give the room emotional range so it reads as multi-note and alive, not single-element flat. The room's atmosphere = (dominant element context) + (secondary element register) + (tertiary/quaternary accents above as decor and lighting).`,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────
  // REALITY ANCHOR — surface & ceiling discipline.
  // ─────────────────────────────────────────────────────────────
  // The SHRE body alone is too sparse: when the dominant element is
  // stone-heavy (Water with marble picks, Earth with travertine picks,
  // Air with white marble), the image model defaults to a "marble box"
  // — cladding floor, walls AND ceiling in the same stone. The user
  // flagged this explicitly ("marble on the ceiling is nonsense, this
  // is not conceptual design"). These rules restore the surface
  // discipline that used to live in the legacy [7b] / [12b] blocks.
  P.push(
    `REALITY ANCHOR — SURFACE & CEILING DISCIPLINE (non-negotiable, applies to every render):
- CEILING IS NEVER CLAD IN STONE, MARBLE, ONYX, QUARTZITE OR ANY SLAB MATERIAL. The ceiling is clean smooth plaster (white or pale neutral) with concealed LED cove lighting at the perimeter. Beam profiles, plaster cornices and recessed downlights are acceptable; stone, marble or onyx cladding on the ceiling is FORBIDDEN regardless of the dominant element.
- NO SINGLE-MATERIAL ROOM. Every render must show AT LEAST THREE distinct material families on the visible surfaces (e.g. stone + wood + plaster, or stone + metal + textile). Even when the user picks four stones, only ONE of them clads a feature wall — the others appear as counter, bar front, vanity top or accent panel. No "marble box", no "concrete box", no "all-one-finish" wrap.
- EACH NAMED MATERIAL HOLDS ONE SURFACE FAMILY. Floors are floors; walls are walls; counters are counters. A material listed as "feature wall" does NOT also become the floor and the ceiling. A material listed as "floor" does NOT climb the walls.
- STONE GETS A FEATURE WALL ONLY ONCE PER ROOM. The dominant stone clads ONE feature wall (or one column, or one bar back) — not three walls, not a wrap-around, not the soffit, not the ceiling. The other walls are plaster.
- CONSTRUCTION EVIDENCE IS MANDATORY: visible 3 mm shadow gap where floor meets wall, real baseboards or flush reveals, edge profiles on stone counters, mitred corners on slabs, grout lines where appropriate. Surfaces are installed onto substrates, not floating.
- REAL, REALISTIC, NOT CONCEPTUAL. This is a constructed interior delivered to a paying client — not a showroom render, not a competition board, not a stone-supplier promo. If a decision can't be built by a contractor with standard methods, simplify until it can.`,
  );

  P.push(buildAntiUtopianControlBlock(roomKey));
  P.push(FUNCTIONAL_PLACEMENT_LOGIC);
  P.push(CAMERA_FRAMING_DISCIPLINE);

  if (roomKey === 'Bathroom' || roomKey === 'Restroom') {
    P.push(buildBathroomArchitecturalBlock(shrePrimary, firePct));
  }

  // ─────────────────────────────────────────────────────────────
  // SHRE v1.0 — authoritative prompt BODY.
  // ─────────────────────────────────────────────────────────────
  // The user mandated that the image prompt follow the SHRE 5-step
  // structure (material+brand+application × 3, accent detail, furniture,
  // lighting, atmosphere, K+light, surface finish, closing line).
  //
  // Policy: USER-WINS material selection — user-picked catalog materials
  // fill the primary/secondary/accent slots first; the SHRE element
  // pools only fill any remaining slots.
  //
  // The preamble above (DOMAIN LOCK + SPACE CONFIG SUMMARY + scale /
  // ceiling + program-equipment scale) is retained so the model still
  // gets the spatial brief. The legacy verbose realism / composition /
  // atmosphere / camera / anti-repetition blocks were dropped per spec.
  const shreSpaceLabel = primaryRoom
    ? `${primaryRoom} within a ${input.spaceCategory} project, ${areaM2} m², ${ceilingH} m ceiling`
    : input.domain === 'architecture'
      ? `${input.spaceCategory} building${input.archContext ? ` in a ${input.archContext} setting` : ''}, ${areaM2} m² floor plate, ${ceilingH} m typical floor-to-floor`
      : `${input.spaceCategory} interior, ${areaM2} m², ${ceilingH} m ceiling`;
  const shreUserMaterials = input.materialsSelected.map((m) => {
    const w = m.vec;
    const order: Element[] = ['earth', 'fire', 'water', 'air'];
    let bestEl: Element = 'earth';
    let bestVal = -Infinity;
    for (const el of order) {
      if ((w as any)[el] > bestVal) { bestVal = (w as any)[el]; bestEl = el; }
    }
    return {
      id: m.id,
      name: m.name,
      element: bestEl,
      image: m.imagePath || '',
      isShared: false,
      elementWeights: {
        earth: (w.earth || 0) / 100,
        fire:  (w.fire  || 0) / 100,
        water: (w.water || 0) / 100,
        air:   (w.air   || 0) / 100,
      },
    } as MaterialDef;
  });
  // SHRE prompt body — authoritative format per user spec.
  // When a diagnosis is attached, its style/palette/materials are fed
  // through so the rendered image agrees with the report screen.
  P.push(buildSHREPromptBody({
    spaceLabel: shreSpaceLabel,
    primary: shrePrimary,
    secondary: shreSecondary,
    activeDist: activeDist as Vector4,
    userMaterials: shreUserMaterials,
    generationIndex: input.generationIndex ?? 0,
    diagnosis: input.diagnosis,
    primaryRoom,
  }));

  // ── SPACE RELEVANCE LOCK — room typology must match (was only in legacy body) ──
  if (input.domain !== 'architecture') {
    const roomTypeLabel = primaryRoom || roomKey;
    P.push(
      `SPACE RELEVANCE LOCK (mandatory — wrong typology = failed render):
- THIS IMAGE IS EXACTLY: ${roomTypeLabel} within ${input.spaceCategory}. Camera and program: ${roomProgram.cameraHint}
- LAYOUT: ${roomProgram.layoutLogic}
- SPATIAL RULES: ${roomProgram.spatialRules}
${spaceIdentity ? `- CATEGORY IDENTITY: ${spaceIdentity}` : ''}
${contextOverride ? `- ROOM CHARACTER (overrides generic styling): ${contextOverride}` : ''}
- FORBIDDEN: do not render a generic living room, empty showroom, or wrong commercial/residential typology when the brief says ${roomTypeLabel}. Every object must belong in this room type.`,
    );
    P.push(PRACTICAL_LAYOUT_SIMPLICITY_BLOCK);
    P.push(FURNITURE_SERVICE_LINE_SANITY_BLOCK);
    P.push(ISLAND_HARDWARE_LOGIC_BLOCK);
    if (primaryRoom === 'Coffee Shop' || primaryRoom === 'Cafe') {
      P.push(CAFE_COFFEE_SEATING_BLOCK);
    }
    if (isCommercialPublicInteriorCategory(input.spaceCategory)) {
      P.push(COMMERCIAL_GLAZING_VITRAGE_BLOCK);
      P.push(buildCommercialCeilingMepBlock(areaM2, ceilingH, firePct, primary));
    }
  } else if (spaceIdentity) {
    P.push(`SPACE IDENTITY (exterior): ${spaceIdentity}`);
  }

  // ── ATMOSPHERE CALIBRATION + active daylight scenario (computed but was not emitted) ──
  P.push(
    buildAtmosphereCalibrationBlock({
      primary: shrePrimary,
      secondary: shreSecondary,
      activeDist: activeDist as Vector4,
      roomLabel: primaryRoom || roomKey,
      roomAtmosphereHint: ROOM_ATMOSPHERE_REFINEMENT[roomKey],
      userAdjectives,
      lightTime: baseLight.time,
      lightDesc: lightScenario,
    }),
  );
  if (atmosphereBlock) {
    P.push(atmosphereBlock);
  }

  P.push(
    `LIGHTING SCENARIO (${baseLight.time}): ${lightScenario}. Architectural fixtures from the SHRE lighting roster support this scenario at low intensity — never overpower natural daylight.`,
  );

  P.push(
    `PHOTOGRAPHIC REALISM GATE (mandatory):
- Editorial architectural photograph — Dezeen / ArchDaily / Wallpaper* / Frame caliber. Medium-format clarity (think Hasselblad H6D-100c or Phase One IQ4 — tilt-shift verticals corrected). Subtle depth-of-field on distant planes, believable contact shadows, no CGI plastic gloss.
- ${cameraVantage}. ${composition.name}: ${composition.desc}
- Camera is INSIDE the room being designed — no foreground arch / doorway / vestibule / dark portal framing the shot. The photograph's edges are the frame; the room is the subject.
- Materials read as installed construction: veining variation, wood grain direction, plaster trowel marks, metal brushing, fabric weave — never stamped repeating texture.
- LOGICAL DESIGN: every placement functional for ${roomKey}; circulation clear; furniture scaled to ${areaM2} m²; proportions credible for ${ceilingH} m ceiling. The user picked these numbers — honour them.
- BRAND CULTURE: viewers must recognise the design culture — at least 3 distinct manufacturers across seating + tables + lighting, real specifiable products. No generic "blob furniture", no AI fantasy pieces, no impossible silhouettes.
- ANTI-AI: no hyper-detail overload, no fake reflections, no surreal geometry, no random luxury clutter, no identical marble on every surface, no pristine empty showroom, no "viewed through an opening" composition, no chandelier centred on empty floor, no sofa facing a blank wall.
- USE-WORTHY OUTCOME: a paying client should be able to take this render to a contractor and brief from it — every product nameable, every dimension buildable, every detail constructible by standard trades.`,
  );

  P.push(
    `IMAGE CLEANLINESS (mandatory — the frame must look like a professional architectural photo, not a noisy render):
- NO visible speckles, dots, fireflies, film grain, sensor noise, or salt-and-pepper artifacts on walls, ceiling, floor, marble, metal, or plaster — surfaces are CLEAN and smooth unless real material texture (veining, wood pore, plaster trowel) requires it.
- NO dust motes, airborne particles, floating light dots, sparkle overlays, or bokeh clutter in the air — daylight is clean and legible.
- NO post-process grain, no HDR halos, no oversharpening halos, no repeated noise pattern across dark and light zones.
- Smooth tonal transitions in shadow and highlight; micro-texture only where the material is genuinely textured (stone vein, fabric weave) — never random pixel speckle.`,
  );

  // ── LEGACY VERBOSE BODY — DISABLED ───────────────────────────
  // The blocks below ([0b] through [12b]) were the pre-SHRE prompt body.
  // They're skipped via the `false &&` guard so they no longer contribute
  // to the image prompt — but the code is kept verbatim so we can revert
  // by flipping the guard to `true` if needed.
  if (false as boolean) {
  // [0b] ELEMENT ENERGY AS ABSTRACT SPATIAL LOGIC — not literal
  P.push(`ELEMENT ENERGY IS ABSTRACT DESIGN LOGIC — translated EXCLUSIVELY into REAL, BUILDABLE architectural decisions. Earth, Fire, Water, Air = materiality, atmosphere, form, contrast, softness, openness, lighting behavior. They are NEVER literal — no flames, no water waves, no wind effects, no soil or dirt, no element symbols, no conceptual art installations. Translate elemental energy into CONSTRUCTABLE architectural and design choices: real materials from real manufacturers, real construction methods, real furniture from real brands, real lighting systems, real spatial proportions that follow building codes. Every design decision inspired by element energy must pass the test: "Could an architecture firm specify this in construction documents and a contractor build it?"`);

  // [0c] CLIENT PROFILE + SESSION REFINEMENT — hierarchy and progressive tightening
  P.push(buildVisualWeightContractBlock(activeDist));
  P.push(buildClientEnergyHarmonyBlock(activeDist, primary, secondary, sorted));
  P.push(`PERCENT-LOCKED SPATIAL TRANSLATION: ${buildEnergySpatialRules(activeDist)}`);
  P.push(buildSessionPassBlock(input.sessionGenerationOrdinal ?? 0));

  // [1] PHOTOGRAPHIC IDENTITY
  P.push(`Ultra-realistic editorial architectural photograph of a completed, physically built ${spaceLabel}. EXACT floor area ${areaM2} m² (not approximate — match furniture count, circulation, and depth of field to this number; ~${Math.sqrt(Math.max(areaM2, 1)).toFixed(1)} m per side if roughly square), ceiling height ${ceilingH} m. Published in Dezeen / ArchDaily / AD Magazine. Shot on location by an elite architectural photographer (Hélène Binet / Iwan Baan / Fernando Guerra caliber). The space is REAL, BUILT, INHABITED — not a render or concept. This is a DELIVERED PROJECT by a real architecture firm for a real client — it went through design development, construction documents, building permits, contractor bidding, and physical construction. Years of design: patina on materials, wear on floors, curated objects. Light enters naturally through real windows creating authentic shadow patterns. Every material is identifiable — stone veining, wood grain, plaster trowel marks, metal reflections, fabric weave. CONSTRUCTION EVIDENCE: visible material joints, shadow gaps where different finishes meet, real grout lines, edge trims, expansion joints, proper baseboards or shadow details. The image shows how materials were ACTUALLY INSTALLED — not floating surfaces but real construction with depth, layers, and substrate.`);

  // [1b] SPACE IDENTITY (critical — prevents a restaurant from looking like a living room)
  if (spaceIdentity) {
    P.push(`SPACE IDENTITY (MANDATORY): ${spaceIdentity}`);
  }

  // [1c] CONTEXT OVERRIDE (room within category — e.g. "Dining" in a "Restaurant" context)
  if (contextOverride) {
    P.push(`CONTEXT OVERRIDE (highest priority for room character): ${contextOverride}`);
  }

  // [1c-bis] Commercial / public venues — stained glass, storefront glazing, ceiling MEP, premium output bar
  if (input.domain !== 'architecture' && isCommercialPublicInteriorCategory(input.spaceCategory)) {
    P.push(COMMERCIAL_GLAZING_VITRAGE_BLOCK);
    P.push(buildCommercialCeilingMepBlock(areaM2, ceilingH, firePct, primary));
    P.push(COMMERCIAL_RENDER_EXCELLENCE_BLOCK);
  }

  // [1c-arch] ARCHITECTURE LANDSCAPE CONTEXT
  if (input.domain === 'architecture' && input.archContext) {
    const ARCH_CONTEXT_PROMPTS: Record<string, string> = {
      'Urban': 'SETTING: Dense urban environment — city skyline visible, neighboring buildings, paved streets, pedestrian activity. The building integrates into a metropolitan fabric with sidewalks, street trees, and urban infrastructure. Contemporary urbanism.',
      'Suburban': 'SETTING: Suburban residential area — spacious lots, manicured lawns, driveways, neighborhood context. Mature trees, hedges, quiet streets. The building sits in a suburban residential fabric with appropriate setbacks and scale.',
      'Forest': 'SETTING: Dense forest environment — tall mature trees (pine, oak, birch depending on climate), dappled light filtering through canopy, forest floor with ferns and moss, natural woodland. The building is immersed in nature, with trees close to facades, natural ground cover.',
      'Mountainous': 'SETTING: Mountain landscape — dramatic elevation, rocky terrain, panoramic valley or peak views, alpine vegetation, crisp clear atmosphere. The building perches on or integrates into steep terrain with stone retaining walls, dramatic cantilevers over slopes.',
      'Coastal': 'SETTING: Coastal / seaside environment — ocean or sea visible, sandy or rocky shoreline, salt air atmosphere, coastal vegetation (grasses, wind-shaped trees), boardwalks or beach access. The building opens toward water views with weather-resistant materials.',
      'Desert': 'SETTING: Desert landscape — arid terrain, sand or red earth, sparse desert vegetation (cacti, succulents, desert grasses), dramatic sky, intense sunlight and sharp shadows. The building uses thermal mass, shaded courtyards, earth-toned materials blending with the landscape.',
      'Rural / Village': 'SETTING: Rural village environment — agricultural landscape, traditional vernacular buildings nearby, cobblestone or dirt paths, farmland or pastures, rustic fences, church steeple or village center visible. The building respects local scale and vernacular character.',
      'Lakeside': 'SETTING: Lakeside environment — calm lake water reflections, gentle shoreline, reeds and water plants, boat dock or jetty, surrounding hills or forests reflected in water. The building maximizes lake views with large glazing and terraces oriented toward water.',
      'Tropical': 'SETTING: Tropical environment — lush tropical vegetation (palms, banana plants, frangipani, bougainvillea), warm humid atmosphere, bright equatorial light, possibly rice terraces or jungle backdrop. The building uses open ventilation, covered verandas, natural materials, indoor-outdoor flow.',
      'Arctic / Nordic': 'SETTING: Arctic / Nordic landscape — snow-covered terrain, birch forests, aurora-capable sky, crisp cold atmosphere, minimal vegetation, dramatic winter light (blue hour). The building is heavily insulated with warm interiors contrasting cold exterior, large windows framing stark landscape.',
    };
    const ctxPrompt = ARCH_CONTEXT_PROMPTS[input.archContext];
    if (ctxPrompt) {
      P.push(`LANDSCAPE CONTEXT (MANDATORY for exterior shots and visible surroundings): ${ctxPrompt}`);
    }
  }

  // [1d] COLOR PALETTE (if specified)
  if (colorDirective) {
    P.push(colorDirective);
  }

  // [1e] BUDGET CONTEXT
  P.push(budgetDirective);

  // [1f] ARCHITECTURAL STYLE RECOGNITION — gives the AI well-known visual references
  const styleInfo = ELEMENT_STYLE_MAP[primary];
  P.push(`ARCHITECTURAL STYLE DIRECTION: ${styleInfo.description} Reference styles: ${styleInfo.styles.join(', ')}. Use these as a recognition framework for the visual language, NOT as a strict template. The final visual result must be driven primarily by the ${primary.toUpperCase()} energy logic defined below.`);

  // [2] ROOM PROGRAM & LAYOUT
  P.push(`Room contains: ${roomProgram.requiredElements.join('; ')}. ${roomProgram.layoutLogic} ${roomProgram.spatialRules}`);
  if (input.domain !== 'architecture') {
    P.push(PRACTICAL_LAYOUT_SIMPLICITY_BLOCK);
    P.push(FURNITURE_SERVICE_LINE_SANITY_BLOCK);
    P.push(ISLAND_HARDWARE_LOGIC_BLOCK);
    if (primaryRoom === 'Coffee Shop' || primaryRoom === 'Cafe') {
      P.push(CAFE_COFFEE_SEATING_BLOCK);
    }
  }

  // [3] MATERIAL SPECIFICATION (the user's actual choices — highest priority)
  if (input.materialsSelected.length > 0 && materialPlacement) {
    P.push(buildUserSelectedMaterialsMandatory(input.materialsSelected, materialPlacement));
  } else {
    P.push(`Material palette: ${roomProgram.materialPriority}. Elevated selections: ${profile.materialBehaviorPhrases.slice(0, balancedBlend ? 5 : 4).join(', ')}. Every surface shows realistic texture depth — no flat, uniform, or digitally perfect surfaces.`);
  }

  // [3b] MATERIAL ↔ PALETTE RECONCILIATION — keeps green stone green, etc.
  const reconBlock = buildMaterialPaletteReconciliationBlock(input.materialsSelected, colorPalette);
  if (reconBlock) {
    P.push(reconBlock);
  }

  // [3c] AUTHENTIC PLACEMENT — velvet only on furniture, brass only on accents,
  //      stone only on countertops/feature walls, etc. Stops the AI from
  //      smearing one material across every surface.
  const authBlock = buildAuthenticMaterialUsageBlock(input.materialsSelected);
  if (authBlock) {
    P.push(authBlock);
  }

  // [4] DOMINANT ELEMENT BRIEF — the architectural DNA of this space (softened when mix is balanced)
  const domBrief = ELEMENT_ARCH_BEHAVIOR[primary];
  const domHead = balancedBlend
    ? `STRONGEST-SHARE ELEMENT (UI order when ties — percentages are near-balanced; spatial character must stay multi-way, not single-style): ${primary.toUpperCase()} (${Math.round(activeDist[primary])}%)`
    : `DOMINANT ENERGY: ${primary.toUpperCase()} (${Math.round(activeDist[primary])}%) — this defines the entire spatial character`;
  P.push(`${domHead}.\nGeometry: ${domBrief.geometry}\nMaterials: ${domBrief.materialWeight}\nForms: ${domBrief.formLanguage}\nMaterial application: ${domBrief.materialApplication}\nLighting: ${domBrief.lightingLogic}\nSpatial feel: ${domBrief.spatialHierarchy}\nSTRICTLY AVOID: ${domBrief.avoidStrict}`);

  // [4b] Secondary + supporting energy influences (intensity scales with share vs top element)
  const supportParts: string[] = [];
  const maxShare = Math.max(...sorted.map((el) => activeDist[el]), 1);
  for (const el of sorted.slice(1)) {
    const pct = Math.round(activeDist[el]);
    if (pct < 5) continue;
    const brief = ELEMENT_ARCH_BEHAVIOR[el];
    const rel = activeDist[el] / maxShare;
    const intensity =
      rel >= 0.92 ? 'near-co-primary' :
      rel >= 0.7 ? 'strong supporting' :
      rel >= 0.45 ? 'clear layer' :
      'calibrated trace';
    supportParts.push(`${el.toUpperCase()} (${pct}%, ${intensity}): ${brief.formLanguage} ${brief.materialWeight.split('.')[0]}.`);
  }
  if (supportParts.length > 0) {
    P.push(`Supporting energies: ${supportParts.join(' ')}`);
  }

  // [4c] ELEMENT COMBINATION HARMONY — how supporting elements manifest as accents
  const COMBO_ACCENTS: Record<string, string> = {
    'air+water': 'Water energy brings: deep royal blue velvet modular sofas and accent seating (Paola Lenti-style blue textile), blue woven rug zones, perforated blue metal screen partitions, blue agate/mineral backlit art slab, polished chrome sculptural accents, blue glass block walls. The futuristic white AIR architecture gains WATER\'s deep blue textile soul and liquid metallic reflections. Blue appears as FURNITURE and ART accents — not as architectural envelope.',
    'air+fire': 'Fire energy brings: rose-gold/copper-mirror column cladding (polished warm reflective accent), amber-to-copper gradient glass partitions, warm brass wall sconces and gold cylinder side tables, copper hardware and fixtures, warm walnut or oak shelving inserts, cognac leather accent chair, warm underlighting (amber LED glow beneath glass furniture). The futuristic white AIR architecture gains FIRE\'s warm metallic radiance.',
    'air+earth': 'Earth energy brings: natural stone counter/table accent (marble, travertine), exposed timber ceiling beams among white architecture, indoor plants in white/silver planters, cream/oatmeal textile cushions, light wood shelving and table surfaces, handmade ceramic objects, woven natural fiber rug. The futuristic white AIR architecture gains EARTH\'s grounding organic warmth and life.',
    'water+air': 'Air energy brings: translucent colored glass partitions, white fluted panels, increased transparency and glass, lighter futuristic ceiling with LED lines, iridescent/dichroic art accents, white 3D textured wall panels. The chrome/steel WATER architecture gets AIR\'s futuristic ethereal lightness.',
    'water+fire': 'Fire energy brings: warm brass/gold fixtures alongside chrome, amber-tinted glass, corten or copper accent surfaces, cognac leather warmth against reflective metal, warm LED underlighting.',
    'water+earth': 'Earth energy brings: natural stone surface accents (marble, travertine), warm wood shelving inserts, raw texture contrast against smooth chrome, cream textile warmth, organic plant life, exposed timber.',
    'fire+water': 'Water energy brings: polished chrome/steel accent pieces, hammered reflective metal surfaces, neon or LED cool-tone accent lines, cool metallic contrast to warm patina, glass block or reflective partitions.',
    'fire+air': 'Air energy brings: increased natural light and glass transparency, translucent glass partitions, lighter futuristic ceiling treatments, white plaster secondary walls, iridescent accents balancing the dark drama.',
    'fire+earth': 'Earth energy brings: natural stone textures (raw marble, travertine), warm wood grain on secondary surfaces, tactile ceramic objects, indoor plants, organic material depth alongside dark metal drama.',
    'earth+water': 'Water energy brings: smooth polished stone finishes, chrome fixtures, reflective glass accents, hammered metal surfaces, fluid curved forms alongside grounded heavy masses.',
    'earth+fire': 'Fire energy brings: dark dramatic accent wall (corten or dark marble), oxidized copper/brass fixtures, blackened steel frames, warm amber lighting pools alongside natural earthy warmth.',
    'earth+air': 'Air energy brings: increased natural light and glass, futuristic translucent partitions, lighter ceiling treatment with LED, white 3D textured panels, iridescent art accents balancing the heavy grounded mass.',
  };
  const comboKey = `${primary}+${secondary}`;
  const secondaryPct = Math.round(activeDist[secondary]);
  const primaryPctCombo = Math.round(activeDist[primary]);
  const skipPairAccent =
    balancedBlend || (Math.abs(primaryPctCombo - secondaryPct) <= 3 && primaryPctCombo >= 15 && secondaryPct >= 15);
  if (!skipPairAccent && secondaryPct >= 15 && COMBO_ACCENTS[comboKey]) {
    const intensity = secondaryPct >= 30 ? 'prominently' : secondaryPct >= 20 ? 'noticeably' : 'subtly';
    P.push(`ELEMENT COMBINATION (${primary}+${secondary}, ${secondaryPct}% ${secondary}): ${intensity} integrate these accent elements: ${COMBO_ACCENTS[comboKey]}`);
  }

  // [5] FURNITURE & OBJECTS
  const isCafeCoffeeRoom = primaryRoom === 'Coffee Shop' || primaryRoom === 'Cafe';
  const furnitureFormNote = isCafeCoffeeRoom
    ? 'CAFÉ / COFFEE SHOP: Seating is chair- and stool-scale only — Hay, Vitra, Muuto, Fritz Hansen contract chairs; bar stools at counter; small café tables. Do NOT default to sofas, sectionals, or lounge upholstery; never lean bulky seating on the bar. Keep knee zones and staff access honest.'
    : primary === 'water' ? 'Furniture should have gently organic, sculptural forms achievable through REAL MANUFACTURING — serpentine bouclé sofas (Edra Boa, B&B Italia Bend), polished stainless steel counter fronts fabricated from sheet metal over welded subframes, chrome-legged coffee tables with kidney/organic shapes (Minotti, Living Divani), caramel leather accent chairs (Poltrona Frau). Counters and reception desks are the star — polished steel fronts with gentle curves achievable through sheet metal brake-forming and roll-bending, seam-welded and mechanically polished. Hammered metal panels (De Castelli) on island faces. Glass blocks (Seves) for accent walls. Forms reference BUILT neo-futurism — projects that were actually constructed, not just rendered. Every curve has a feasible fabrication method.'
    : primary === 'earth' ? 'Furniture should feel chunky, low-slung, and grounded — deep modular sofas in natural linen, olive/sage velvet, or warm cream (Baxter, Flexform, Meridiani). Thick solid wood tables — real walnut or reclaimed oak with proper joinery (mortise-and-tenon, doweled). Bar stools with rounded padded forms in sage velvet. Handmade ceramic collections on open shelving. Heavy woven or jute rugs. Wabi-sabi aesthetic: surfaces show real age, warmth, and patina — not artificially distressed but genuinely aged or handcrafted.'
    : primary === 'fire' ? 'Furniture should have dramatic material contrast — deep rust/cognac/copper-toned velvet (Dedar, Rubelli) or full-grain leather (Poltrona Frau, Baxter) upholstery against dark marble and blackened steel frames. Warm oxidized metal finishes on real branded fixtures. Bold, curated, intense — every piece from an identifiable manufacturer.'
    : 'Furniture should feel refined, forward-looking, and buildable — metallic silver upholstered armchairs (Fritz Hansen Egg in silver, Cassina LC7), stainless steel pedestal tables (Fritz Hansen Series, Vitra), thermoformed white Corian counters (within real bending limits), tinted laminated glass partitions (standard architectural glass with colored PVB interlayer). Dichroic glass panels (real 3M Dichroic Film product) as art accents. LED cove lighting in standard aluminum extrusion channels (iGuzzini, Deltalight). 3D textured wall panels (commercially manufactured relief tiles). White opal globe lights (Flos Glo-Ball) and LED ring pendants (Flos Arrangements, Artemide Discovery). Fluted GRC or MDF columns with CNC-milled profiles. AIR is forward-looking minimalism grounded in REAL PRODUCTS — natural wood and airy organic textures welcome for warmth. Every element is sourceable from real manufacturers and installable by real trades.';
  P.push(`Furniture: ${furnitureItems.join('; ')}. Lighting fixtures: ${lightItems.join('; ')}. ${furnitureFormNote} BRAND & SILHOUETTE — REAL SOURCEABLE PRODUCTS (mandatory): The image must read as a project styled with REAL, currently-manufactured, world-market design pieces — the kind an architect actually specs from a showroom or trade catalogue. Use distinctive silhouettes associated with named manufacturers — pull from a DIVERSE roster, never repeat the same 2-3 brands across every render. Reference vocabulary by category: SOFAS & SEATING: B&B Italia (Tufty-Time, Camaleonda, Bend, Le Bambole), Minotti (Lawrence, Jacques, Quadrado), Poliform (Saint-Germain, Mondrian), Cassina (LC2/LC3/LC5 Le Corbusier, 290 Maralunga, Soriana), Vitra (Eames LCW, Mariposa, Polder, Suita), Molteni&C (Paul, Sloane), Living Divani (Extrasoft, Neowall), Edra (Standard, Boa, On the Rocks), Baxter (Tactile, Chester Moon, Viktor), Flexform (Groundpiece, Magnum), Knoll (Florence Knoll, Platner), Moroso (Misfits, Redondo), De Padova (Louisiana), Poltrona Frau (Vanity Fair, Chester One), Gubi (Beetle, Bat). DINING & SIDE TABLES: Cassina (LC6, Eros), Poliform (Howard, Trip), B&B Italia (Maxalto, Athos), Molteni (Mateo, Asterias), Walter Knoll (Tama, Liz), Fritz Hansen (Super-Elliptical, PK51), e15 (Bigfoot, Habibi), Carl Hansen (CH327, CH011), Maxalto (Solo, Apta). LIGHTING — chandeliers + pendants + sconces + floor lamps drawn from named houses: Flos (IC, Skygarden, Arco, 2097, Aim, Glo-Ball, Bilboquet, String Lights), Artemide (Tolomeo, Nesso, Tizio, Discovery, Dioscuri), Louis Poulsen (PH 5, AJ, Yuh, Patera, Panthella), &Tradition (Flowerpot, Bellevue, Formakami, Mass), Foscarini (Twiggy, Anisha, Aplomb, Le Soleil), Luceplan (Costanza, Trama, Hope, Mesh), Tom Dixon (Melt, Mirror Ball, Plane, Spring), Lee Broom (Orion, Crystal Bulb, Eclipse), Bocci (14, 28, 73, 84), Apparatus (Trapeze, Cloud, Talisman, Tube), DCW éditions (Lampe Gras, In The Tube), Vibia (Wireflow, Match, North), Catellani & Smith (Sissi, Macchina della Luce), Roll & Hill (Modo, Halo, Rudi), Santa & Cole (M64, Cesta), Anglepoise (Type 75). CHAIRS & STOOLS: Fritz Hansen (Egg, Swan, Series 7, PK22), Hay (AAC, Rey, Mags), Vitra (Eames DSW/DSR, HAL, Tip Ton), Carl Hansen (CH24 Wishbone, CH88, CH33), Gubi (Bestlite, Beetle, F3), Magis (Spun, Steelwood), Cappellini (S Chair), Knoll (Tulip, Brno, Womb). PROPORTIONS stay honest: seating 42-45 cm seat height; dining tables 72-75 cm; bars/counters ~90-105 cm. EACH RENDER MUST PULL FROM AT LEAST 3 DISTINCT BRAND FAMILIES across seating + tables + lighting — never all-one-brand showroom, never anonymous blob furniture in focal roles. Anything that is not a real, sourceable, currently-manufactured piece reads as failure. Everything sits on real surfaces with contact shadows; nothing floats or blocks code-clear circulation.`);

  // [5a-bis] Occasional iconic “trust” object — most generations, skip ~1 in 4 for calmer scenes
  if (genIdx % 4 !== 3) {
    const trustCue = ICONIC_TRUST_ANCHOR_ROTATIONS[genIdx % ICONIC_TRUST_ANCHOR_ROTATIONS.length];
    P.push(
      `TRUST & RECOGNITION (this pass — frequent but not mandatory clutter): ${trustCue} If the brief or layout leaves no honest place for it, skip rather than crowding. Goal: warmth and credibility — viewers sense familiar, loved, real-world design culture, not a generic render.`,
    );
  }

  // [5b] DECOR & STYLING — makes the space feel lived-in, curated, inviting
  P.push(`Decor and styling details (must be visible in the image): ${decorItems.join('; ')}. These objects should be placed naturally — on tables, shelves, counters — making the space feel inhabited and warm, not staged or empty. Where a famous design-world accessory (ceramics, fragrance, book imprint, tray) fits the element language, prefer names viewers know — still sparse; every visible object earns its place.`);

  // [5c] WALL TREATMENTS — key to achieving reference-quality depth
  P.push(`Wall treatment (creates depth and character): Primary wall — ${wallTreatment}.${secWallTreatment ? ` Secondary wall — ${secWallTreatment}.` : ''} Walls must NOT be flat painted surfaces — they must show real texture, material joints, and construction depth. Wall panels should have visible shadow gaps where they meet the floor and ceiling.`);

  // [5d] TEXTILE LAYERING — multiple layers of warmth and texture
  P.push(`Textile layers (essential for warmth and comfort): ${textileLayers.join('; ')}. These textile layers create visual and tactile depth. Fabrics show realistic drape, texture, and subtle wrinkles — not perfectly flat or digitally smooth.`);

  // [5e] APPLIANCES & TECHNOLOGY (room-specific)
  if (roomAppliances) {
    P.push(`Technology and appliances (integrated naturally): ${roomAppliances}. All appliances should be built-in or discreetly placed — no exposed cables, no cheap-looking electronics.`);
  }

  // [5f] WALLPAPER (when element style dictates)
  if (wallpaperChoice) {
    P.push(`Feature wall treatment: ${wallpaperChoice} — applied to ONE accent wall only, complementing the other material surfaces.`);
  }

  // [5g] TILES (for kitchen/bathroom)
  if (tileChoice) {
    P.push(`Tile selection: ${tileChoice}. Tiles should be laid with proper grout lines and professional installation — realistic, not digitally perfect.`);
  }

  // [6] ATMOSPHERE
  P.push(atmosphereBlock);

  // [7] LIGHTING — natural + artificial
  P.push(`Lighting: ${lightScenario} ${profile.lightPhrases.slice(0, balancedBlend ? 3 : 2).join(', ')}. Light behaves with physical accuracy: warm golden glow absorbed by wood grain, soft milky diffusion across plaster walls, crisp specular highlights on polished metal reflecting the room, translucent glow through glass casting colored shadows. One dominant natural light direction with soft gradual shadow falloff. Secondary fill light from opposite direction at 1/3 intensity. Warm ambient pools (2700K) from concealed architectural lighting in shadow gaps and shelf edges. The lighting alone tells you the time of day and the atmosphere of the space.`);

  // [7b] CEILING — clean by default
  const ceilingIntensity = activeDist[primary] >= 60 ? 'high' : activeDist[primary] >= 40 ? 'medium' : 'low';
  const ceilingDirective = primary === 'air'
    ? (ceilingIntensity === 'high' ? 'Ceiling may feature subtle wave-form or flowing ridge accents with concealed LED — but keep it restrained and elegant, not overloaded.' : 'CEILING MUST BE CLEAN AND SIMPLE — flat white or gently curved with concealed LED cove lighting. NO complex wave sculptures, no overloaded ceiling ornamentation. Clean minimal ceiling is the AIR priority.')
    : primary === 'water'
    ? (ceilingIntensity === 'high' ? 'Ceiling may feature a curved chrome canopy or parametric form over the main zone.' : 'Ceiling is clean — smooth white or light plaster with concealed ambient lighting. Chrome and parametric forms stay on walls/counters, not ceiling.')
    : primary === 'fire'
    ? 'Ceiling is dark and restrained — dark-toned or recessed with minimal track lighting. No decorative ceiling elements.'
    : 'Ceiling is honest — exposed beams if contextual, otherwise clean plaster with warm ambient light.';
  P.push(`CEILING TREATMENT (important): ${ceilingDirective} The ceiling should NOT be overloaded or visually heavy unless the design brief specifically calls for a dramatic overhead statement. Default is always clean and architecturally resolved.`);

  // [8] CAMERA & PHOTOGRAPHY
  const focalLength = areaM2 >= 120 ? '24mm' : areaM2 >= 80 ? '28mm' : areaM2 >= 40 ? '30mm' : '35mm';
  P.push(`Photography: ${focalLength} tilt-shift lens on Phase One IQ4 150MP digital back. Camera height 110cm (standing eye level). Use a slightly longer focal for small m² so the frame does not exaggerate width — match lens to stated footprint. PERFECTLY CORRECTED VERTICALS — all vertical lines are absolutely straight. f/8–f/11 aperture, deep focus with slight natural bokeh on distant planes. Color science: neutral with warm bias, no post-processing filters, no HDR, no saturation boost, no Instagram look. Light behaves physically — soft shadow gradients from windows, warm amber pools from recessed downlights, material-accurate reflections (mirror-polish shows room reflections, matte absorbs light). Depth composition: clear foreground detail (edge of table, plant leaf), sharp mid-ground (main furniture group), soft atmospheric background (distant wall or window view). The image quality matches Dezeen's "House of the Year" photography standard.`);

  // [9] FRAMING + CAMERA VANTAGE (rotates per generation so back-to-back
  // renders read as different shots of the same project)
  P.push(`Camera vantage (this pass): ${cameraVantage}`);
  P.push(`Composition strategy (this pass — ${composition.name}): ${composition.desc} Full-frame with 15% breathing margin. All furniture fully visible — NOTHING cropped at frame edge. Clear foreground-midground-background depth layering. A curated vignette element in the near foreground (plant leaf edge, book corner, ceramic edge) creates editorial depth. The composition follows the rule of thirds with the primary furniture group at the golden ratio intersection.`);

  // [9b] Pin-aligned zones (interior only — matches UI hotspot percentages)
  if (input.domain !== 'architecture') {
    P.push(buildHotspotAnchoredCompositionBlock());
  }

  // [10] PHYSICAL RULES + ELEMENT CONSTRAINTS
  P.push(`Physical accuracy (non-negotiable): Every object obeys gravity — furniture legs create contact shadows on floor. Ceiling height ${ceilingH}m throughout. Doors 80cm+ wide, 210cm tall with visible frames. Windows have 15cm+ deep reveals, real frames, and show subtle reflections of interior on glass. Wall thickness 15-20cm visible at every opening. MATERIAL JOINTS ARE CRITICAL: visible 3mm shadow gaps between floor and wall, edge profiles on stone counters, reveal strips between different materials, baseboards or flush shadow details. Fabrics have realistic drape — cushions show compression, throws have natural folds, curtains puddle slightly on floor. Every surface has micro-texture variation — no surface is perfectly uniform. FORBIDDEN in this room: ${roomProgram.forbiddenItems.join(', ')}. FORBIDDEN by ${primary.toUpperCase()} element logic: ${domBrief.avoidStrict}`);

  // [10b] LOGICAL SPATIAL DESIGN (realism enforcement)
  P.push(`LOGICAL DESIGN (critical for realism): Every element placement must make FUNCTIONAL SENSE. Sofas face conversation areas or views, not walls. Dining tables are near kitchens with appropriate clearance. Lighting fixtures illuminate areas where light is needed — over dining, reading, workspaces. Materials are applied where they make constructional sense — stone on floors and counters (where it can bear weight and resist wear), wood on floors and cabinetry (where grain direction follows structural logic), plaster on walls (where it has proper substrate), metal on frames and accents (where it has structural support). Heavy materials like marble and stone are used on SUPPORTED surfaces — not cantilevered impossibly or applied to ceilings without visible structure. Furniture is scaled correctly for the room — not oversized in small rooms or undersized in large rooms. Circulation paths are clear (minimum 90cm walkways). CONSTRUCTION LOGIC: every design choice must answer "how would a contractor build this?" — walls have proper framing, cladding has fixing substrate, countertops have cabinets beneath them, shelves have brackets or concealed support, pendant lights hang from ceiling structure. The room must look like it was designed by a professional architect who understands BOTH aesthetics AND construction — someone who produces construction documents, not just concept renders.`);

  // [11] ANTI-REPETITION — generation index ${genIdx} drives the four
  // independent rotations (vantage / composition strategy / variation axis /
  // time-of-day). The image must read as *this exact project* but a
  // genuinely different shot than the previous pass.
  P.push(`ANTI-REPETITION (this is generation #${genIdx + 1} of the same brief — must NOT repeat the previous frame): ${variationDirective} Treat the rotation tokens above (camera vantage = "${cameraVantage.split('.')[0]}", composition strategy = "${composition.name}", lighting = "${baseLight.time}") as binding for THIS pass. Same project, same material palette, same elemental logic — but a clearly different shot. Acceptable to walk to a different corner, frame through a different opening, or anchor on a different functional zone. Forbidden: identical camera position, identical focal point, identical light angle, identical foreground vignette as the prior render.`);

  // [12] MAPPING
  if (mappingBasis === "photo-based") {
    P.push("Preserve layout and viewpoint of the reference photo. Apply material/lighting/atmosphere changes only.");
  } else if (mappingBasis === "plan-based") {
    P.push(`FLOOR PLAN UPLOADED (MANDATORY — highest spatial priority): The user has uploaded an architectural floor plan drawing. You MUST interpret and follow the plan precisely:

SPATIAL ANALYSIS REQUIREMENTS:
- WALLS: Identify all thick black lines as load-bearing and partition walls. Respect exact wall positions, thicknesses, and openings. Do NOT add or remove walls.
- WINDOWS: Identify window symbols (thin parallel lines in walls, or glass markings). Place windows at the exact positions shown. Windows determine natural light direction and view orientation.
- DOORS: Identify door swing arcs and opening directions. Door positions define circulation flow and room access.
- ROOM DIMENSIONS: Read any dimension annotations (numbers in meters or centimeters, e.g. 270, 480, 600 = cm). Use these for accurate spatial proportions. Read m² annotations for room areas.
- FURNITURE LAYOUT: If furniture outlines are visible (sofas, tables, kitchen islands, beds), follow their approximate position, scale, and orientation. The user placed them intentionally.
- CIRCULATION: Respect clear paths between furniture groups and doorways. Maintain walkable corridors shown in the plan.
- KITCHEN/BATHROOM FIXTURES: If counters, sinks, toilets, or bathtubs are shown, place them at the indicated positions.
- PROPORTIONS: The plan defines the room's aspect ratio (rectangular, L-shaped, open-plan, etc.). The 3D visualization must match this geometry exactly.
- CAMERA ANGLE: Choose a perspective that best reveals the spatial layout shown in the plan — typically from a corner looking diagonally across the longest dimension.

The generated interior must feel like a direct 3D realization of this exact floor plan — as if you walked into the space drawn on paper.`);
  }

  // [12b] REALISM ENFORCEMENT (final quality gate)
  P.push(`REALISM QUALITY GATE (apply to every generation — NON-NEGOTIABLE):
- Prioritize architectural realism, high-quality proportions, believable materials, logical lighting, and clean professional composition above all else.
- Every object must have a PURPOSE in the space — no random decorative items, no meaningless light fixtures, no objects placed just to fill emptiness.
- Materials must be BUILDABLE and REAL — no fantasy textures, no impossible material combinations, no surfaces that don't exist in real construction.
- CONSTRUCTABILITY TEST: every design decision must pass this question — "Could a real contractor build this with standard construction methods and available materials?" If the answer is no, simplify to a buildable alternative. Curved walls require real formwork. Custom metalwork requires real fabrication. Glass installations require real structural support.
- REAL-WORLD RELEVANCE: every architectural solution must be something a professional architecture firm would actually specify for a client. No conceptual art installations disguised as architecture. No impossible cantilevers, no gravity-defying forms, no materials used in ways that contradict their physical properties.
- STRUCTURAL INTEGRITY: all forms must be structurally plausible — visible columns where needed, proper load paths, realistic spans, credible connection details between different materials. Walls have thickness. Cantilevers have limits. Glass has frames or visible structural silicone joints.
- MATERIAL HONESTY: materials behave as they do in reality. Stone has weight and needs support. Metal has gauge thickness and visible joining methods (welding, bolting, folding). Wood has grain direction and joinery. Plaster has substrate. Nothing floats without structure.
- USER-SELECTED CATALOG FINISHES: When materials were chosen in the catalog, at least 80% of picks (count rounded up, minimum 1) must be clearly visible, recognizable, and used as specified — target every pick; no generic substitutes for those finishes. Frame and light so the client can verify each one that appears. VITRAGE / STAINED GLASS: only on architecturally logical surfaces (façade, entrance, clerestory, dedicated feature); do not mount the main bar or barista line on the stained-glass plane. BAR / COUNTER: on service-capable walls or islands with believable circulation for entry, exit, and queues.
- ${balancedBlend ? 'All elemental energies with ≥5% share must remain READABLE at strengths aligned with the stated percentages — harmonious multi-way identity, not chaos or a single-mood takeover.' : 'The dominant element energy must be clearly READABLE through design choices (material selection, color temperature, spatial proportion, light quality) — not through literal symbols or decorative gimmicks.'}
- If this is INTERIOR: the camera is inside a room. No exterior building facades visible. Windows show realistic exterior views (landscape, city, garden) but the composition is interior.
- If this is ARCHITECTURE: the camera is outside. Show the building in its context. No room interiors visible beyond what's naturally seen through windows from outside.
- The result must look like it was designed by a top-tier architecture firm (Olson Kundig, John Pawson, Tadao Ando, Studio Mumbai, Norm Architects caliber) and photographed for publication. It must look like a COMPLETED, DELIVERED PROJECT — not a concept render or competition entry.`);
  } // end LEGACY VERBOSE BODY — DISABLED block (kept verbatim for revert)

  // [13] REFINEMENT
  if (input.refinementFeedback) {
    P.push(`USER DIRECTION (highest priority): "${input.refinementFeedback}".`);
  }

  // [14] USER NOTE
  if (input.userNote?.trim()) {
    P.push(`ADDITIONAL BRIEF NOTE from the user: "${input.userNote.trim()}". Incorporate this guidance into the design naturally.`);
  }

  // [14b] CUSTOM SPACE CONTEXT (user's own space description + photo)
  if (input.spaceNote?.trim()) {
    P.push(`USER'S SPECIFIC SPACE DESCRIPTION (HIGH PRIORITY): The user has described their actual space: "${input.spaceNote.trim()}". This is their REAL existing space — incorporate these specific details, constraints, and wishes into the design. Adapt the elemental design language to work within the realities of this specific space (existing architecture, dimensions, features, limitations). The result should feel like a professional renovation/redesign of THIS particular space, not a generic concept.`);
  }
  if (input.reference.spacePhotoUploaded) {
    P.push(`USER'S SPACE PHOTO UPLOADED: The user has provided a photograph of their actual space. Use this as the PRIMARY spatial reference — preserve the room geometry, window positions, ceiling height, floor area, and architectural features visible in the photo. Apply the elemental design language (materials, furniture, lighting, atmosphere) as a RENOVATION of this real space. The result should look like the same room after a professional interior designer transformed it with the ${input.primaryElement.toUpperCase()} element palette. Maintain the camera angle and perspective of the uploaded photo.`);
  }

  const rawPrompt = P.join('\n\n');
  const finalPrompt = scrubBannedTokens(rawPrompt);

  const negativePrompt = "3D render, CGI, concept art, Unreal Engine, V-Ray render, artificial perfection, plastic-looking surfaces, fisheye distortion, barrel distortion, tilted verticals, leaning walls, cropped furniture, cut-off edges, floating objects, furniture embedded in walls, impossible geometry, wrong proportions, oversized furniture, undersized furniture, blocked doorways, literal element symbols, actual flames, actual water waves, actual wind effects, soil or dirt piles, elemental symbols, cartoon, illustration, text overlay, watermarks, people, human figures, HDR tonemapping, Instagram filter, oversaturation, IKEA catalog look, Pinterest cliché, developer showroom, beige sofa repetition, symmetrical staged catalog, empty room, bare walls without texture, flat uniform surfaces without grain or variation, video game aesthetic, low resolution, blurry, noisy, compression artifacts, AI face artifacts, extra fingers, deformed objects, impossible shadows, multiple light source directions, clinical fluorescent lighting, random decorative objects with no purpose, meaningless accent lights, fake luxury gold trim, non-buildable fantasy forms, clutter, objects that serve no function, wrong room typology, residential sofa in coffee shop, living room posing as restaurant, generic showroom instead of named room type, bar without back-bar, kitchen without work surfaces, bedroom without bed, night scene without request, marble ceiling, marble box interior, sofa fused to kitchen island, film grain, speckle noise, fireflies, render noise, dust motes, airborne particles, floating white dots, salt and pepper noise, sparkle overlay, bokeh dots, grainy texture, noisy plaster, noisy marble, cinematic fantasy interior, spa cliché, utopian luxury scene, theatrical haze, volumetric god rays, dramatic orange glow, bathroom curtains, curtains in mirror, voile drapery, sheer curtains, indoor tree in bathroom, spa resort staging, wine glass on bath caddy, overdesigned spa bathroom, AI luxury fantasy, dreamy atmosphere, fake light leaks, decorative curtains without window, split composition, pendant light floating in mid air, chandelier centered on empty floor, pendant over nothing, wall sconce on blank wall, sconce with no function beside it, sofa facing blank wall, living room with no focal point, bedroom with no headboard wall, random window on blank wall, window behind sofa, window behind TV wall, window behind bathtub, mismatched window heads, scattered ceiling fixtures, too many pendants, lights without anchor surface, floating candles, candles suspended in air, glowing dots in mid air without holder, candles without wax body, candles without visible holder, wall candle holder without bracket, decor objects floating, vases floating, books floating, persian rug, oriental rug, kilim rug, turkish rug, anatolian rug, tribal pattern rug, ornate medallion rug, fringed domestic rug, persian rug in modern bar, oriental rug in contemporary lounge, kilim rug in minimalist room, tribal pattern rug in editorial hospitality, mismatched rug style, ornate domestic rug in commercial bar, clashing rug pattern, red persian rug, burgundy oriental rug, residential sofa inside bar, sectional fused to bar, lounge sofa wedged into bar working zone, sofa pushed against bar face, living room collaged into bar, two programs in one shot, bar with bedroom in the back, bar with reading nook in working zone, fragmented composition, half bright half pitch black room, dark void wall eating half the frame, incoherent lighting between zones, sunny bar plus dark cave lounge collision";

  const designSummary = buildDesignSummary(input, activeDist);
  
  const generationBullets = [
    `Mapping: ${mappingBasis}`,
    `Geometry Lock: ${geometryLock}`,
    `Primary: ${input.primaryElement} (${Math.round(activeDist[input.primaryElement])}%)`,
    `Secondary: ${input.secondaryElement} (${Math.round(activeDist[input.secondaryElement])}%)`,
    `Materials: ${input.materialsSelected.length > 0 ? input.materialsSelected.map(m => m.name).join(', ') : 'auto'}`,
    `Composition: ${composition.name}`,
    `Ceiling: ${ceilingH}m | Light: ${naturalLight}`,
  ];

  return {
    imagePrompt: finalPrompt,
    negativePrompt,
    designSummaryBullets: designSummary,
    generationBullets,
    aspectRatio: ar,
    metadata: {
      mappingBasis,
      cameraRule: roomProgram.cameraHint,
      geometryLock,
      activeDistribution: activeDist
    }
  };
};

// --- ARTIFACT PROMPT BUILDER (STRICT SPRITE SHEET + MANUFACTURABLE REALISM) ---
export const buildArtifactPrompt = (distribution: Vector4, materials: MaterialDef[]): string => {
  const sorted = sortElementsByDistribution(distribution);
  const primary = sorted[0];
  const secondary = sorted[1];
  
  const primaryLogic = {
    earth: "mass, heavy base, thick matte geometry",
    fire: "precision machined edges, angular cuts, high contrast",
    water: "molded smooth surfaces, continuous transitions, soft fillets",
    air: "lightweight tension, perforations, thin structural fins"
  }[primary];

  const secondaryLogic = {
    earth: "grounded stone detail",
    fire: "metallic accent",
    water: "gloss finish",
    air: "glass or transparent section"
  }[secondary];

  const matNames = materials.map(m => m.name).join(", ");
  const materialPhrase = materials.length > 0
    ? `Constructed from: ${matNames}. Structural material combined with secondary surface finish.`
    : "Constructed from industrial materials (brushed metal, matte stone, glass, ceramic).";

  // STRICT 360 SPRITE SHEET PROMPT
  const parts = [
    "Generate a sprite sheet containing exactly 16 frames arranged in a 4x4 grid.",
    "The frames must represent a full 360-degree turntable rotation of a single architectural concept object (SHRE Artifact).",
    "Each frame shows the same object rotated slightly around its vertical axis. The object must remain fixed in the center of each grid cell.",
    "The sequence proceeds row by row.",
    "Background must be solid pure white #FFFFFF.",
    
    // NEW REALISM LOGIC
    "Object Style: High-end industrial design prototype / architectural maquette.",
    "Form: Manufacturable assembly of 2-3 distinct interlocking parts. Visible seams, joins, and material transitions.",
    "Geometry: Realistic thickness, gravity-aware, stable base. No abstract floating parts, no impossible physics.",
    
    // ENERGY TRANSLATION
    `Primary Character: ${primaryLogic}.`,
    `Secondary Detail: ${secondaryLogic}.`,
    `${materialPhrase}`,
    
    "Lighting: Soft studio lighting, realistic shadows, no dramatic effects.",
    "Aesthetic: Premium, minimal, clean, BUILDABLE. Every form must look like it could be manufactured using real industrial processes (CNC milling, sheet metal forming, casting, injection molding). Visible material thickness, real joining methods, achievable geometry."
  ];

  return parts.join(" ");
};

export const buildTargetedEditPrompt = (
  userInstruction: string,
  dominant: Element,
  dist: Record<Element, number>,
  materials: { name: string; element: Element }[],
  adjectives: { label: string; element: Element }[],
  domain: string,
  spaceCategory: string,
  /** Earlier edit instructions on this render (chronological). Disambiguates "it", "there", "more", etc. */
  priorInstructions?: string[],
): string => {
  const domPct = Math.round(dist[dominant]);
  const sorted = (['earth', 'fire', 'water', 'air'] as Element[]).sort((a, b) => dist[b] - dist[a]);
  const secondary = sorted[1] || dominant;
  const secPct = Math.round(dist[secondary]);

  const ELEMENT_AESTHETIC: Record<Element, string> = {
    earth: 'warm organic tones, natural materials (wood, stone, linen, clay), wabi-sabi imperfection, golden warm lighting, layered textures, handcrafted character',
    fire: 'dramatic warmth, oxidized metals (copper, brass, corten), dark marble, focused light beams, deep shadows, bold contrasts, rich jewel tones',
    water: 'cool fluid serenity, polished reflective surfaces, curved forms, glass, microcement, atmospheric calm, blue-grey-silver tones',
    air: 'ethereal lightness, translucent materials, maximum daylight, metallic silver, clean minimal forms, futuristic elegance, cool white-grey palette',
  };

  const matList = materials.slice(0, 5).map(m => m.name).join(', ');
  const adjList = adjectives.slice(0, 3).map(a => a.label).join(', ');

  const isArch = domain.toLowerCase().includes('arch') || domain.toLowerCase().includes('exterior');

  const preserveInterior = [
    `— Camera, framing, perspective`,
    `— Room geometry, walls, floor, ceiling`,
    `— Surfaces and objects the USER REQUEST does not name`,
    `— Window placement, treatments, exterior view`,
    `— Global lighting direction and shadow character`,
    `— Decor and styling you were not told to touch`,
  ];

  const preserveArchitecture = [
    `— Camera, framing, perspective`,
    `— Building massing, structure, roofline`,
    `— Site, landscape, context, sky`,
    `— Facade elements the USER REQUEST does not name`,
    `— Openings you were not told to change`,
    `— Shadow direction and ambient light character`,
  ];

  const distBalanced = isBalancedElementBlend(dist as Vector4);
  const styleFallback = distBalanced
    ? `Fallback only (if the user request does not already specify material, form, or product): ` +
      `keep the edit consistent with a BALANCED elemental mix — Earth ${Math.round(dist.earth)}%, Fire ${Math.round(dist.fire)}%, Water ${Math.round(dist.water)}%, Air ${Math.round(dist.air)}% — preserve proportional presence of each language; do not let one strand take over unless the user asked. ` +
      `Keep real-world buildable photorealism. If the user named a specific target, obey it exactly.`
    : `Fallback only (if the user request does not already specify material, form, or product): ` +
      `bias replacements toward ${dominant}-dominant (${domPct}%), secondary ${secondary} (${secPct}%) — ${ELEMENT_AESTHETIC[dominant].slice(0, 120)}… ` +
      `Keep real-world buildable photorealism. ` +
      `If the user named a specific color, material, object, or action, obey the USER REQUEST exactly and ignore conflicting hints.`;

  const prior = (priorInstructions || []).map((s) => s.trim()).filter(Boolean);
  const priorBlock =
    prior.length > 0
      ? [
          `EDIT THREAD — SAME IMAGE / SAME TOPIC (chronological; the current picture already reflects these changes):`,
          ...prior.map((t, i) => `${i + 1}. "${t}"`),
          ``,
          `How to use this thread: resolve vague follow-ups (e.g. "make it warmer", "there", "even more", "revert that") against what was changed before. The CURRENT USER REQUEST below is the new task — it may refine or extend prior edits. Do NOT undo earlier edits unless the new text explicitly asks to revert or replace them.`,
          ``,
        ]
      : [];

  const lines: string[] = [
    `SURGICAL EDIT — LITERAL SCOPE`,
    `Implement ONLY what the user request says. Do not reinterpret, redesign, or "upgrade" the scene. No fantasy or utopian features unless explicitly asked.`,
    ``,
    ...priorBlock,
    `USER REQUEST (absolute priority; narrow reading — THIS turn):`,
    `"${userInstruction.trim()}"`,
    ``,
    `CONTEXT (for identification only — do not expand the task): ${isArch ? 'exterior / architecture' : 'interior'} · ${spaceCategory}`,
    ``,
    `DO NOT ALTER:`,
    ...(isArch ? preserveArchitecture : preserveInterior),
    ``,
    `HOW TO APPLY THE CHANGE:`,
    `- Minimum change that satisfies the user request; same location/footprint as the affected element unless the text asks to move/add/remove.`,
    `- Match existing light direction, perspective, and scale; photoreal, contractor-buildable materials only.`,
    `- No new objects, surfaces, or effects beyond what the user request implies.`,
    ``,
    styleFallback,
    matList
      ? `Project materials: keep at least 80% of these finishes clearly identifiable after the edit (same material identity) unless the user explicitly asked to remove or replace them: ${matList}.`
      : '',
    adjList ? `Mood notes (secondary — only if request is vague): ${adjList}.` : '',
  ].filter(Boolean);

  return lines.join('\n');
};

export interface PromptOptions {
  generationIndex?: number;
  refinementFeedback?: string;
  userNote?: string;
  /** Override session ordinal; default = state.generationHistory.length */
  sessionGenerationOrdinal?: number;
}

// --- LEGACY WRAPPER FOR APP.TSX ---
export const buildUniversalPrompt = (state: UserState, options?: PromptOptions): PromptResult => {
  const deepCompleted = Object.keys(state.deepSurveyAnswers).length > 0;
  
  const p = state.refinement.isActive && state.refinement.refinedPercentages 
    ? state.refinement.refinedPercentages 
    : (state.analysis?.percentages || { earth: 25, fire: 25, water: 25, air: 25 });
    
  const sorted = sortElementsByDistribution(p as Vector4);

  const adjectiveInputs = state.refinement.selectedAdjectives.map(adj => {
    const vec: Vector4 = { earth: 0, fire: 0, water: 0, air: 0 };
    vec[adj.element] = 100;
    return { id: adj.id, label: adj.label, vec };
  });

  const materialInputs = getEnabledMaterials(
    state.refinement.selectedMaterials,
    state.refinement.disabledMaterialIds,
  ).map(mat => {
    const w = mat.elementWeights;
    const vec: Vector4 = {
      earth: (w?.earth || 0) * 100,
      fire: (w?.fire || 0) * 100,
      water: (w?.water || 0) * 100,
      air: (w?.air || 0) * 100,
    };
    // Forward `isCustom` + `placementNote` when present so the prompt engine
    // can honour user-defined materials with explicit placement intent.
    //
    // Precedence for the routed placement note:
    //   1. The custom material's own placementNote (set on the modal)
    //   2. Catalog-side per-material placement (state.refinement.materialPlacements[id])
    // If both exist, custom wins; otherwise whichever is present.
    const customMeta = mat as Partial<{ isCustom: boolean; placementNote: string }>;
    const perMatNote = state.refinement.materialPlacements?.[mat.id];
    const routedNote = (customMeta.placementNote && customMeta.placementNote.trim().length > 0)
      ? customMeta.placementNote
      : perMatNote;
    return {
      id: mat.id,
      name: mat.name,
      category: 'finish',
      vec,
      imagePath: mat.image,
      isCustom: customMeta.isCustom === true,
      placementNote: routedNote,
    };
  });

  const area = Math.max(8, Math.min(50000, Math.round(Number(state.params.squareMeters) > 0 ? Number(state.params.squareMeters) : 100)));
  const ceilParam = state.params.ceilingHeight;
  const ceilHuman =
    typeof ceilParam === 'number' && Number.isFinite(ceilParam) && ceilParam > 0
      ? Math.max(2, Math.min(12, Math.round(ceilParam * 10) / 10))
      : 2.8;

  const input: PromptInput = {
    domain: state.params.domain || 'interior',
    spaceCategory: state.params.category || 'Space',
    rooms: state.params.rooms,
    archContext: state.params.archContext,
    areaM2: area,
    baseDistribution: state.analysis?.percentages || { earth: 25, fire: 25, water: 25, air: 25 },
    refinedDistribution: state.refinement.refinedPercentages,
    primaryElement: sorted[0],
    secondaryElement: sorted[1],
    adjectivesSelected: adjectiveInputs,
    materialsSelected: materialInputs,
    hasUserRefined: state.refinement.hasUserRefined,
    deepSurveyCompleted: deepCompleted,
    reference: {
      photoUploaded: !!state.params.referenceImage,
      planUploaded: !!state.params.architecturalPlan,
      spacePhotoUploaded: !!state.params.spacePhoto,
    },
    spaceNote: state.params.spaceNote,
    spaceSummaryLine: state.params.spaceSummaryLine?.trim() || formatSpaceConfigOneLiner(state.params),
    constraints: {
      ceilingHeightM: ceilHuman,
      naturalLight: state.params.naturalLight,
      colorPalette: state.params.colorPalette,
      budgetLevel: state.params.budgetLevel,
    },
    generationIndex: options?.generationIndex,
    sessionGenerationOrdinal: options?.sessionGenerationOrdinal ?? (state.generationHistory?.length ?? 0),
    refinementFeedback: options?.refinementFeedback,
    userNote: options?.userNote,
    aspectRatio: state.params.resolution,
    // SHRE v2 — forward the 7-section diagnosis so the image prompt
    // agrees with the client report (style direction, palette, picks).
    diagnosis: state.analysis?.diagnosis,
  };

  const pkg = buildGenerationPackage(input);

  // Build a detailed concept brief for this generation
  const prim = sorted[0];
  const sec = sorted[1];
  const primPct = Math.round(p[prim]);
  const secPct = Math.round(p[sec]);
  const matNames = state.refinement.selectedMaterials.length > 0
    ? state.refinement.selectedMaterials.map(m => m.name).join(' · ')
    : null;
  const adjNames = state.refinement.selectedAdjectives.slice(0, 3).map(a => a.label).join(', ');
  const roomLabel = state.params.rooms?.[0] || state.params.category || 'Space';
  const palette = state.params.colorPalette && state.params.colorPalette !== 'auto'
    ? state.params.colorPalette.replace('-', ' ')
    : null;
  const budget = state.params.budgetLevel || 'premium';
  const conceptParts = [
    `${roomLabel} · ${area} m² · ceiling ${ceilHuman} m`,
    `${prim} ${primPct}% / ${sec} ${secPct}%`,
    matNames || null,
    adjNames || null,
    palette ? `Palette: ${palette}` : null,
  ].filter(Boolean);
  const conceptStory = conceptParts.join(' · ');

  return {
    promptStory: conceptStory,
    bulletPoints: pkg.designSummaryBullets, 
    imagePrompt: pkg.imagePrompt,
    negativePrompt: pkg.negativePrompt,
    aspectRatio: pkg.aspectRatio,
    metadata: pkg.metadata
  };
};