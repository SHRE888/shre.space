import { UserState, AnalysisResult, Element, PromptResult, PromptInput, GenerationPackage, Vector4, MaterialDef, ColorPalette, BudgetLevel } from '../types';
import { SHORT_QUESTIONS, ELEMENTS, COMBINATION_ARTICLES, PROMPT_BANS, ELEMENT_ARCH_TERMS } from '../constants';
import { scrubBannedTokens } from './bannedTokens';
import { elementLanguageProfile } from './elementLanguage';
import { buildDesignSummary } from './designSummary';

// --- ADAPTER / LEGACY SUPPORT ---
export const calculateAnalysis = (state: UserState): AnalysisResult => {
  const scores: Record<Element, number> = { air: 0, fire: 0, water: 0, earth: 0 };

  if (state.shortSurveySkipped) {
      const flat = { air: 25, fire: 25, water: 25, earth: 25 };
      return {
          percentages: flat,
          primary: 'earth',
          secondary: 'air',
          estimate: { cost: {low:0, high:0}, timeline: {low:0, high:0} }
      };
  }

  Object.entries(state.shortSurveyAnswers).forEach(([qId, answerIdx]) => {
    const question = SHORT_QUESTIONS.find(q => q.id === qId);
    if (question && question.options[answerIdx]) {
      const weights = question.options[answerIdx].weights;
      Object.entries(weights).forEach(([el, weight]) => {
        if(weight) scores[el as Element] += weight;
      });
    }
  });

  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0) || 1;
  const percentages: any = {};
  ELEMENTS.forEach(el => {
    percentages[el] = (scores[el] / totalScore) * 100;
  });

  const sorted = [...ELEMENTS].sort((a, b) => {
      const diff = percentages[b] - percentages[a];
      if (Math.abs(diff) < 0.1) return ELEMENTS.indexOf(a) - ELEMENTS.indexOf(b);
      return diff;
  });
  
  const area = state.params.squareMeters || 100;
  const isInterior = state.params.domain === 'interior';
  const baseCost = isInterior ? 1500 : 2500; 
  const complexityMultiplier = (percentages.fire + percentages.water) / 40 + 1;
  const estimatedTotal = area * baseCost * complexityMultiplier;
  
  return {
    percentages,
    primary: sorted[0],
    secondary: sorted[1],
    estimate: {
      cost: {
        low: Math.round(estimatedTotal * 0.9),
        high: Math.round(estimatedTotal * 1.2)
      },
      timeline: {
        low: Math.round(Math.sqrt(area)),
        high: Math.round(Math.sqrt(area) * 1.5)
      }
    }
  };
};

// --- REAL-WORLD PRODUCT REFERENCES ---
// Maps each material in our catalog to specific real-world brands and product lines
const MATERIAL_PRODUCT_MAP: Record<string, { brand: string; product: string; finish: string }[]> = {
  'Travertine (honed)':           [{ brand: 'Stone Italiana', product: 'Navona travertine', finish: 'honed unfilled cross-cut' }],
  'Dark quartzite':                [{ brand: 'Levantina', product: 'Grey quartzite slab', finish: 'honed with dramatic veining' }],
  'Clay plaster':                  [{ brand: 'Clayworks', product: 'Clay plaster wall finish', finish: 'hand-troweled with tonal irregularity' }],
  'Lime plaster (warm mineral)':   [{ brand: 'Bauwerk', product: 'Lime plaster', finish: 'warm mineral trowel finish' }],
  'Dark marble (high contrast)':   [{ brand: 'Salvatori', product: 'Nero Marquina marble', finish: 'polished with white calcite veining' }],
  'Basalt':                        [{ brand: 'Stone Federation', product: 'basalt slab', finish: 'honed matte volcanic' }],
  'Blackened steel':                [{ brand: 'Corten Direct', product: 'blackened steel panel', finish: 'oxidized matte' }],
  'Venetian plaster (polished)':   [{ brand: 'Marmorino', product: 'Venetian plaster', finish: 'polished lime-based' }],
  'Bronze accents':                [{ brand: 'Nanz', product: 'cast bronze lever handle', finish: 'dark patinated wax seal' }],
  'Microcement (continuous)':      [{ brand: 'Kerakoll', product: 'Cementoresina microcement', finish: 'seamless mineral coat' }],
  'Smooth mineral plaster':         [{ brand: 'Kerakoll', product: 'Cementoresina smooth wall plaster', finish: 'venetian trowel micro-polished' }],
  'Matte ceramic':                 [{ brand: 'Mutina', product: 'Mews collection porcelain tile', finish: 'chalky matte surface' }],
  'Linen / wool textile surfaces': [{ brand: 'Kvadrat', product: 'Hallingdal 65 wool upholstery', finish: 'mélange weave' }, { brand: 'Dedar', product: 'Nuvola linen', finish: 'natural ivory slub' }],
  'Diffused glass':                [{ brand: 'Saint-Gobain', product: 'Planilux acid-etched glass', finish: 'satin frost translucent' }],
  'Mirror-polished stainless steel': [{ brand: 'Rimex Metals', product: 'Super Mirror 304 stainless steel panel', finish: '8K mirror polish reflective' }],
  'Hammered metal (rippled)':      [{ brand: 'De Castelli', product: 'Martellata hammered steel sheet', finish: 'rippled hand-hammered texture' }],
  'Satin chrome':                  [{ brand: 'Rimex Metals', product: '304 stainless steel panel', finish: 'satin directional brush No.4' }],
  'Glass blocks (translucent)':    [{ brand: 'Seves Glassblock', product: 'Pegasus Metallizzato glass block', finish: 'translucent with soft internal diffusion' }],
  'Curved bent glass':             [{ brand: 'Cricursa', product: 'hot-bent curved glass panel', finish: 'extra-clear laminated curved' }],
  'Corten steel (weathering)':     [{ brand: 'SSAB', product: 'Weathering COR-TEN A steel panel', finish: 'natural oxidized rust patina' }],
  'Oxidized copper':               [{ brand: 'Aurubis', product: 'Nordic Green copper sheet', finish: 'pre-oxidized verdigris patina' }],
  'Aged brass (polished)':         [{ brand: 'Rocky Mountain Hardware', product: 'polished aged brass panel', finish: 'warm gold patina with living surface' }],
  'Dark herringbone parquet':      [{ brand: 'Kährs', product: 'Chevron Dark Smoke oak parquet', finish: 'deep fumed herringbone with matte lacquer' }],
  'Board-formed concrete':         [{ brand: 'Site cast', product: 'board-formed exposed concrete', finish: 'raw formwork texture with bug holes' }],
  'Volcanic stone (basalt rough)': [{ brand: 'Stone Italiana', product: 'basalt volcanic stone slab', finish: 'rough split-face or bush-hammered' }],
  'Green onyx / marble (veined)': [{ brand: 'Antolini', product: 'Rainforest Green marble slab', finish: 'polished full-height with dramatic green-gold veining' }],
  'Rammed earth / terracotta plaster': [{ brand: 'Clayworks', product: 'rammed earth effect clay plaster', finish: 'layered terracotta warm-ochre hand-applied' }],
  'Reclaimed weathered timber': [{ brand: 'Reclaimed', product: 'aged oak beam and plank', finish: 'natural weathered grey-brown patina with nail holes' }],
  'Herringbone parquet (warm oak)': [{ brand: 'Kährs', product: 'Herringbone engineered oak', finish: 'warm natural oiled with aged patina' }],
  'Limewash (bright)':             [{ brand: 'Bauwerk', product: 'Limewash', finish: 'bright mineral wash' }],
  'White mineral plaster':         [{ brand: 'Marmorino', product: 'white mineral plaster', finish: 'matte lime-based' }],
  'Light oak / ash':               [{ brand: 'Kährs', product: 'Grande Collection engineered oak', finish: 'matte natural grain' }],
  'White marble (Calacatta)':      [{ brand: 'Salvatori', product: 'Calacatta Oro marble slab', finish: 'polished with warm gold veining' }],
  'Clear glass (low-iron)':        [{ brand: 'Saint-Gobain', product: 'Diamant low-iron glass', finish: 'ultra-clear transparent' }],
  'Bleached birch':                [{ brand: 'Kährs', product: 'Nordic Naturals birch plank', finish: 'bleached whitewash matte' }],
  'White terrazzo':                [{ brand: 'Huguet', product: 'Terrazzo Blanco precast slab', finish: 'polished white aggregate with subtle chips' }],
  'Pale concrete (smooth)':       [{ brand: 'LCDA', product: 'BFUP smooth concrete panel', finish: 'pale grey silk-smooth' }],
  'Natural oak (horizontal)':      [{ brand: 'Kährs', product: 'Grande Collection engineered oak', finish: 'horizontal grain natural' }],
  'Walnut veneer':                 [{ brand: 'Alpi', product: 'Walnut fine veneer panel', finish: 'satin vertical grain' }],
  'Industrial brick':              [{ brand: 'Brickworks', product: 'Red industrial face brick', finish: 'pastoral rustic' }],
  'Textured concrete (matte)':     [{ brand: 'LCDA', product: 'BFUP concrete panel', finish: 'raw shuttered matte' }],
  'Brushed metal':                 [{ brand: 'Rimadesio', product: 'brushed metal profile', finish: 'satin anodization' }],
  'Solid oak':                     [{ brand: 'Boen', product: 'Chaletino wide plank', finish: 'solid oak natural' }],
  'Walnut (natural finish)':       [{ brand: 'Kährs', product: 'Lumen Collection American walnut', finish: 'satin oiled natural' }],
  'White Corian (curved seamless)': [{ brand: 'DuPont', product: 'Corian Glacier White solid surface', finish: 'thermoformed curved seamless, no visible joints' }],
  'Fluted white panel':            [{ brand: 'Cosentino', product: 'Dekton ultra-compact surface fluted profile', finish: 'white vertical ridges, floor-to-ceiling' }],
  'Dichroic / iridescent glass':   [{ brand: '3M', product: 'Dichroic Glass Film on laminated glass panel', finish: 'color-shifting iridescent (amber-violet-green-blue spectrum), translucent' }],
  'Tinted translucent glass':      [{ brand: 'Cricursa', product: 'Laminated colored glass panel', finish: 'tinted translucent in violet, amber, or rose-gold gradient' }],
  'Metallic silver surface':       [{ brand: 'Rimex Metals', product: 'Brushed aluminium panel', finish: 'satin silver metallic with soft directional brush' }],
  '3D textured white panel':       [{ brand: 'WallArt', product: '3D wall panel in mineral composite', finish: 'geometric relief pattern, matte white, paintable' }],
  // Legacy aliases for backward compatibility with saved states
  'Natural Oak':                   [{ brand: 'Kährs', product: 'Grande Collection engineered oak', finish: 'matte natural grain' }],
  'Walnut':                       [{ brand: 'Kährs', product: 'Lumen Collection American walnut', finish: 'satin oiled natural' }],
  'Travertine':                   [{ brand: 'Stone Italiana', product: 'Navona travertine', finish: 'honed' }],
  'Clay Plaster':                 [{ brand: 'Clayworks', product: 'Clay plaster', finish: 'hand-troweled' }],
  'Microcement':                  [{ brand: 'Kerakoll', product: 'Cementoresina microcement', finish: 'seamless mineral coat' }],
  'Clear Glass':                  [{ brand: 'Vitrocsa', product: 'minimal frame glass', finish: 'low-iron ultra-clear' }],
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
const BUDGET_LEVEL_MAP: Record<BudgetLevel, string> = {
  'essential': 'Budget context: practical and focused. Use quality mainstream materials and well-designed functional furniture. Clean execution without excessive ornamentation. Smart material choices that look good and last.',
  'premium': 'Budget context: premium designer level. Use recognized design brands (B&B Italia, Poliform, Minotti-tier). Engineered stone and hardwood throughout. Custom joinery details visible. Professional lighting design.',
  'luxury': 'Budget context: ultra-luxury bespoke. Use the finest materials — bookmatched marble, hand-finished plaster, custom bronze hardware, couture textile finishing. Every detail is bespoke: shadow gaps, flush details, concealed hardware. The space feels like it was designed by a world-class interior architect.',
};

// Surface roles for material placement — architecture thinks in surfaces, not abstract lists
const SURFACE_ROLES = ['floor', 'main wall', 'accent wall / feature', 'ceiling / overhead', 'cabinetry / joinery', 'countertop / table surface', 'upholstery / textile', 'hardware / accents'] as const;

// Map material names to their natural architectural surface
const MATERIAL_SURFACE_AFFINITY: Record<string, string> = {
  'Travertine (honed)': 'floor and wall cladding',
  'Dark quartzite': 'countertop and feature wall',
  'Clay plaster': 'main wall finish',
  'Lime plaster (warm mineral)': 'wall and ceiling plaster',
  'Dark marble (high contrast)': 'countertop, fireplace surround, or feature panel',
  'Basalt': 'floor tiles or countertop',
  'Blackened steel': 'shelf brackets, door frames, window profiles',
  'Venetian plaster (polished)': 'feature wall or ceiling finish',
  'Bronze accents': 'door handles, cabinet pulls, light fixture accents',
  'Microcement (continuous)': 'continuous floor and wet-area walls',
  'Smooth mineral plaster': 'wall finish throughout',
  'Matte ceramic': 'backsplash, bathroom wall, or floor tiles',
  'Linen / wool textile surfaces': 'sofa upholstery, curtains, cushions',
  'Diffused glass': 'partition panels, cabinet fronts, bathroom screen',
  'Mirror-polished stainless steel': 'feature wall cladding, counter/bar front, reception desk skin, column cladding',
  'Hammered metal (rippled)': 'counter front panel, feature wall accent, bar face cladding, ceiling accent panel',
  'Satin chrome': 'cabinet fronts, door frames, fixture housings, counter edge band',
  'Glass blocks (translucent)': 'partition wall, room divider, backsplash feature, light-filtering screen',
  'Curved bent glass': 'storefront facade, partition screen, display vitrine, curved balustrade',
  'Corten steel (weathering)': 'exterior facade cladding, entry portal frame, feature wall panel, garden wall',
  'Oxidized copper': 'facade accent panel, fireplace surround, door/cabinet fronts, sculptural feature',
  'Aged brass (polished)': 'coffee table surface, hardware pulls, light fixture trim, sculptural accent, kitchen island front',
  'Dark herringbone parquet': 'main floor surface, bedroom floor, corridor floor — dark fumed oak in chevron pattern',
  'Board-formed concrete': 'ceiling slab, structural wall, stair volume, cantilevered overhang',
  'Volcanic stone (basalt rough)': 'exterior base wall, landscape steps, interior feature wall, fireplace hearth',
  'Green onyx / marble (veined)': 'kitchen island, countertop, backsplash, feature wall slab',
  'Rammed earth / terracotta plaster': 'exterior facade wall, interior accent wall, courtyard wall, fireplace surround',
  'Reclaimed weathered timber': 'column cladding, feature wall, dining table, shelving, ceiling beams',
  'Herringbone parquet (warm oak)': 'main floor surface throughout living and dining areas',
  'Limewash (bright)': 'wall and ceiling wash finish',
  'White mineral plaster': 'ceiling and upper wall finish',
  'Light oak / ash': 'flooring planks and shelf surfaces',
  'White marble (Calacatta)': 'countertop, vanity top, feature wall cladding',
  'Clear glass (low-iron)': 'full-height partitions, balustrades, shelving',
  'Bleached birch': 'cabinetry fronts, shelving, light furniture surfaces',
  'White terrazzo': 'floor surface, countertop, bathroom vanity',
  'Pale concrete (smooth)': 'ceiling finish, wall panels, floor surface',
  'Natural oak (horizontal)': 'flooring and cabinetry fronts',
  'Walnut veneer': 'cabinetry doors, headboard panel, desk surface',
  'Industrial brick': 'accent wall',
  'Textured concrete (matte)': 'ceiling slab or feature wall panel',
  'Brushed metal': 'shelf system, railing, kitchen island frame',
  'Solid oak': 'dining table top, bench, flooring',
  'Walnut (natural finish)': 'dining table, desk, or joinery',
  'White Corian (curved seamless)': 'reception counter, kitchen island, bar counter — seamless thermoformed organic flowing form',
  'Fluted white panel': 'column cladding, feature wall panel — vertical fluted ridges floor-to-ceiling',
  'Dichroic / iridescent glass': 'large sculptural art installation, room divider, ceiling-hung art piece — shifts color with viewing angle',
  'Tinted translucent glass': 'space-dividing partition panel (large oval or arched form), desk surface, shelving, counter accent — colored translucent',
  'Metallic silver surface': 'furniture upholstery (silver vinyl armchairs), pedestal table column, counter front panel, decorative accessories',
  '3D textured white panel': 'feature wall cladding, reception backdrop, column cladding — geometric relief tiles creating shadow pattern',
};

// Build explicit material placement instructions from user's selected materials
const buildMaterialPlacement = (materials: { name: string }[]): string => {
  if (materials.length === 0) return '';
  const placements: string[] = [];
  materials.forEach((m, i) => {
    const products = MATERIAL_PRODUCT_MAP[m.name];
    const surface = MATERIAL_SURFACE_AFFINITY[m.name] || SURFACE_ROLES[i % SURFACE_ROLES.length];
    if (products && products.length > 0) {
      const p = products[0];
      placements.push(`${surface}: ${p.brand} ${p.product}, ${p.finish}`);
    } else {
      placements.push(`${surface}: ${m.name}`);
    }
  });
  return placements.join('. ') + '.';
};

// Resolve real product descriptions from selected materials
const resolveRealProducts = (materials: { name: string }[], dist: Vector4): string => {
  const sorted = (['earth', 'fire', 'water', 'air'] as Element[]).sort((a, b) => dist[b] - dist[a]);
  const primary = sorted[0];
  const secondary = sorted[1];
  const parts: string[] = [];

  materials.forEach(m => {
    const products = MATERIAL_PRODUCT_MAP[m.name];
    if (products && products.length > 0) {
      const p = products[0];
      parts.push(`${p.brand} ${p.product} (${p.finish})`);
    }
  });

  const furniture = FURNITURE_BY_ELEMENT[primary];
  if (furniture.length > 0) parts.push(furniture[0]);
  if (secondary !== primary) {
    const secFurniture = FURNITURE_BY_ELEMENT[secondary];
    if (secFurniture.length > 1) parts.push(secFurniture[1]);
    else if (secFurniture.length > 0) parts.push(secFurniture[0]);
  }

  const lights = LIGHTING_BY_ELEMENT[primary];
  if (lights.length > 0) parts.push(lights[0]);

  return parts.join('; ');
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
    description: 'Defined by liquid-metal reflections, flowing sculptural chrome surfaces, and parametric spatial forms. Signature palette: mirror-polished stainless steel (counters, walls, ceilings, furniture), hammered/rippled metal (textured reflectivity), satin chrome, glass blocks, curved bent glass, microcement, cream bouclé textiles. Inspired by Frank Gehry (Walt Disney Concert Hall stainless steel sails), Zaha Hadid (Antwerp Port House faceted glass), MAD Architects fluid parametric buildings, Elbphilharmonie wave-form glass. Interior: polished steel bar counters with organic curved forms, chrome arched canopies wrapping from wall to ceiling, hammered metal wall cladding, full-height stainless steel panel walls, white bouclé curved sofas against chrome walls, fluid sculptural reception desks in liquid-metal form. Commercial: stainless steel café counters, glass block accent walls, minimal steel shelving. The space is atmospheric, immersive, reflective — surfaces capture and multiply light like liquid mercury frozen in architectural form.',
  },
  air: {
    styles: ['ethereal futurism', 'white modernism', 'neo-futurism', 'translucent architecture', 'parametric white', 'iridescent minimalism', 'SANAA clarity', 'forward-looking design'],
    description: 'AIR is the FUTURE — defined by ethereal flowing white architecture WITH futuristic material innovation: dichroic/iridescent glass installations, tinted translucent glass partitions (violet, amber, gradient), metallic silver furniture, neon LED accent lighting, 3D textured white wall panels, and holographic/color-shifting surfaces. Base architecture is white (wave-form ceiling sculptures, fluted white columns, flowing white Corian counters, perforated shell facades) but accented with forward-looking materials that feel like a glimpse into tomorrow. Inspired by SANAA crystalline clarity, Sou Fujimoto transparency, MAD Architects flowing parametric white, Olafur Eliasson chromatic light installations, contemporary gallery spaces with colored translucent glass art, futuristic hospitality (hammered metallic counter fronts, neon signage, silver furniture). Interior: wave-form ceilings with LED, tinted glass partitions, dichroic art installations, metallic silver lounge chairs, stainless steel pedestal tables, neon accent tubes. Spaces feel weightless, luminous, futuristic yet practical and livable — not sci-fi but genuine architectural futurism. This does NOT exclude light natural wood and airy organic textures — they provide warmth balance within the futuristic framework.',
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
    materialApplication: 'Dramatic veined stone (green onyx, rainforest marble, or warm travertine) wraps kitchen islands, countertops, and backsplashes as the hero material — full-height slabs showing the stone\'s natural movement. Warm clay/lime plaster coats walls with visible hand-troweling, age patches, and repair layers (wabi-sabi aesthetic). Exposed heavy timber beams span ceilings with aged patina. Walnut cabinetry with simple profiles lines kitchens and storage. Herringbone parquet in warm wood covers floors. Reclaimed weathered timber becomes tables, shelving, and column cladding. Aged brass fixtures (faucets, handles, range hoods) show patina. Rammed earth or terracotta plaster for exterior walls. Jute/sisal rugs on floors. Branches in ceramic vases, handmade pottery collections on shelves, and potted plants bring organic life.',
  },
  fire: {
    geometry: 'Monumental contrast planes — tall narrow vertical openings cut into thick dark walls, deep recessed entry portals, cantilevered dark volumes with corten cladding. Strong directional hierarchy with one dominant focal wall. Exterior: full-facade corten steel cladding with natural oxidized rust patina in warm amber-brown gradients, deep portal entries framed in darkened hardwood or blackened steel, tall narrow slot windows creating dramatic light blades, monumental scaled proportions. Interior: full-height bookmatched Nero Marquina marble feature walls, polished brass or aged gold coffee tables and fixtures, dark herringbone parquet floors in fumed oak, copper/bronze panel accents flanking focal points, blackened steel frame structures for shelving and kitchen islands.',
    materialWeight: 'CORTEN STEEL is the signature material — warm amber-rust-brown oxidized surface wrapping facades, entry portals, and interior accent walls with visible patina gradients and weathering patterns. NERO MARQUINA dark marble with dramatic white calcite veining in full-height bookmatched slabs. BLACKENED STEEL for precise frames, kitchen cabinets, shelving, and window profiles with matte oxidized finish. OXIDIZED COPPER for warm patina panels on kitchen fronts, fireplace surrounds, and accent walls. AGED POLISHED BRASS for coffee tables, pendant lights, fixtures, and hardware — warm gold living surface. DARK HERRINGBONE PARQUET in deep fumed oak for floors. Dark walnut or ebonized oak for paneling, portals, and ceiling soffits. Charcoal venetian plaster for secondary walls. Every surface must feel like a curated material composition — oxidized metals paired against dark stone, warm rust against deep charcoal, polished gold against matte black.',
    lightingLogic: 'Dramatic controlled chiaroscuro — strong directional warm light (2700K) creating defined shadow patterns on dark surfaces. Matte black minimal track spotlights on dark ceiling rails as primary overhead light source. Concealed LED strips in architectural shadow gaps between corten panels and wood, between marble and ceiling, under floating shelves — revealing material textures through grazing light. Warm amber uplighting on corten/copper surfaces to reveal rust texture depth. Pendant lights in polished brass/copper spheres (Tom Dixon Melt, &Tradition Flowerpot in dark copper). Dark zones are intentional — not every corner needs light. Interior should feel cinematic and moody.',
    spatialHierarchy: 'Centralized focal hierarchy — one dominant statement element commands the space: full-height corten steel or dark marble wall, or copper-clad kitchen island. Everything else supports this focal point. Tall vertical proportions create drama. Deep recessed openings and portals frame views like stage sets. Polished brass coffee tables and dark marble surfaces create layered foreground/midground/background depth. The eye is directed with intention.',
    formLanguage: 'Monumental and decisive. Thick corten steel portal frames with deep reveals. Solid dark marble slabs as continuous surfaces. Blackened steel frames with thin precise profiles for doors, windows, and furniture legs. Polished brass in circular/cylindrical forms (coffee tables, bowl trays, pendant globes). Furniture in warm rust/cognac/copper tones — velvet or nubuck leather in deep amber, terracotta, rust, or burnt sienna. Large-format abstract art in dark ochre/rust tones framed in blackened steel. Bold intentional material contrasts: oxidized warm against polished dark, heavy mass against precise metal edge, rough texture against smooth stone.',
    avoidStrict: 'Pastel colors, excessive softness, generic uniformity, all-white spaces, decorative clutter, rounded cutesy forms, lightweight or flimsy materials, reflective mirror-chrome surfaces (belongs to Water), cool blue-grey tones, Scandinavian lightness, any material that lacks warmth or boldness.',
    materialApplication: 'Corten steel wraps exterior facades in continuous weathered panels with visible amber-brown oxidation gradients — full coverage, not applied as trim. Interior walls: Nero Marquina marble in bookmatched full-height slabs on the primary focal wall. Oxidized copper or aged brass panels clad kitchen island fronts, fireplace surrounds, and feature accent walls with warm living patina. Blackened steel frames all doors, windows, shelving systems, and kitchen cabinetry with matte oxidized finish. Dark herringbone parquet (fumed oak) covers floors throughout. Dark walnut or ebonized oak panels line portals, ceiling soffits, and built-in storage. Polished brass appears as coffee table surfaces, pendant globes, faucets, and door handles. Velvet or nubuck leather upholstery in rust/cognac/terracotta on main seating — the sofa is always a warm oxidized tone against the dark backdrop. Heavy linen or wool curtains in warm charcoal. Every material pairing is a deliberate contrast — dark against warm, matte oxidized against polished stone, heavy mass against precise metal edge.',
  },
  water: {
    geometry: 'Fluid, continuous spatial forms — curved walls flowing seamlessly into ceilings, arched stainless steel canopies, tubular chrome structures, parametric surfaces, organic shell-like enclosures. No sharp 90-degree corners. Every transition is radiused, filleted, or continuously curved. Surfaces bend and wrap like liquid metal frozen in motion. Exterior: sculptural flowing stainless steel-clad volumes (Gehry titanium sails, Hadid faceted glass diamonds, MAD Architects parametric waves), undulating facades with concave/convex glass panels. Interior: mirror-polished steel arched canopies wrapping from wall to ceiling over bar/counter, curved polished chrome reception desks with organic twisted forms, fluted satin metal column cladding, full-height polished stainless steel wall panels.',
    materialWeight: 'MIRROR-POLISHED STAINLESS STEEL is the signature material — wrapping counters, walls, ceilings, column cladding, and furniture in continuous liquid-metal surfaces that capture and multiply reflections. HAMMERED/RIPPLED METAL for textured reflective surfaces on bar faces, kitchen islands, and feature walls — hand-textured creating water-like surface patterns. SATIN CHROME for fixtures, edges, hardware, and reception desk surfaces. GLASS BLOCKS for translucent partitions filtering soft diffused light. CURVED BENT GLASS for sculptural partitions and facade panels. MICROCEMENT for seamless continuous floors flowing into walls. SMOOTH MINERAL PLASTER for soft secondary wall surfaces. Cream BOUCLÉ WOOL and white linen for sofa upholstery — providing warmth contrast against cold reflective chrome. The palette oscillates between high-reflectivity metal and soft organic textile.',
    lightingLogic: 'Light as reflection and atmospheric depth — mirror-polished stainless steel surfaces bounce and multiply light throughout the space, creating dynamic shifting reflections. Soft ambient glow from concealed LED strips washing curved chrome surfaces. Hammered metal creates rippling light patterns. Diffused daylight through frosted or bent glass. Chrome sphere pendants and blown glass fixtures with internal silver coating. No harsh direct downlights — light is always diffused, reflected, or scattered. Cool-neutral to warm white (3000-4000K). Vertical LED light bars flanking raw stone or metal features for dramatic grazing effect.',
    spatialHierarchy: 'Flowing spatial continuity — spaces dissolve into each other through curved chrome openings and reflective surfaces. Mirror-polished walls expand perceived space through infinite reflections. Stainless steel arched canopies define zones overhead. Parametric ceiling forms create spatial drama. The eye flows continuously without interruption. Immersive, sensorial, atmospheric — closer to spatial experience than object composition.',
    formLanguage: 'Sculptural and liquid. Furniture with organic curved silhouettes — serpentine bouclé sofas, kidney-shaped ottoman forms, sculpted chrome bar counters with twisted fluid profiles, tubular metal archways. Stainless steel surfaces are curved, bent, and sculpted (never flat panels). Glass is curved and bent. Counters and reception desks have flowing organic shapes like liquid mercury — pinched waists, flowing edges, sculpted bases. Fluted satin columns with vertical ridges. Forms reference neo-futurism (Gehry, Hadid, Calatrava) and parametric design — continuous, smooth, reflective, never angular.',
    avoidStrict: 'Sharp 90-degree angles, rigid rectilinear grid layouts, raw rustic wood, heavy dark stone masses (Fire territory), oxidized/rusted metals (Fire territory), warm amber/rust tones, angular fragmented compositions, matte-only surfaces without reflective counterpoint, cluttered decorative objects, traditional furniture with straight legs, warm earthy color palette.',
    materialApplication: 'Mirror-polished stainless steel wraps bar/counter fronts in continuous curved organic forms — no visible seams, flowing like liquid metal. Full-height stainless steel panels clad walls floor-to-ceiling creating immersive reflective environments. Chrome arched canopy wraps from wall across ceiling over bar area. Hammered/rippled metal on counter faces and backsplash with hand-textured water-like surface patterns. Glass blocks form translucent accent walls with internal diffused glow. Satin chrome on columns, fixtures, shelving, and hardware. Microcement flows seamlessly across floors — cool grey continuous surface. White/cream bouclé curved sofas and armchairs provide warmth against chrome walls. Sculpted chrome reception/bar desks with organic twisted forms are focal furniture pieces. Blown glass art installations with internal silver or clear glass hung as sculptural dividers.',
  },
  air: {
    geometry: 'Futuristic, floating, ethereal spatial forms with CLEAN SIMPLE CEILINGS by default — flat white or gently curved ceiling with concealed LED cove lighting, NOT wave-form ceiling sculptures unless specifically needed for dramatic statement spaces. FLUTED WHITE COLUMNS with vertical ridges creating rhythmic shadow lines. TINTED TRANSLUCENT GLASS PARTITIONS (violet-amber gradient, frosted colored glass, dichroic rainbow panels) as dramatic space dividers. Flowing curved white Corian counters and islands with seamless organic silhouettes. 3D TEXTURED WHITE WALL PANELS with geometric relief patterns casting shadow and depth. Exterior: SAIL-LIKE WHITE FACADES with billowing curved panels, PERFORATED WHITE SHELLS. Interior: curved white counters, clean minimal ceilings, translucent colored glass art installations, white marble floors, floor-to-ceiling glass dissolving boundaries. AIR is the FUTURE — precise minimalism, clean spatial forms, and forward-looking material innovation. CEILING PRIORITY: clean and simple is the default — complex ceiling forms only when high element intensity demands it.',
    materialWeight: 'WHITE CORIAN (Hi-Macs, Krion) is the signature surface material — curved seamless counters, reception desks, bar islands in organic forms. TINTED TRANSLUCENT GLASS — colored glass partitions in violet, amber, rose-gold gradient tones; frosted colored glass desks; DICHROIC/IRIDESCENT GLASS art installations that shift color with viewing angle (rainbow, holographic). METALLIC SILVER/ALUMINUM furniture upholstery and stainless steel pedestal tables. 3D TEXTURED WHITE WALL PANELS — geometric relief tiles creating shadow patterns. WHITE MARBLE (Calacatta, Statuario) for floors. FLUTED WHITE PANELS on columns. LIMEWASH and WHITE MINERAL PLASTER for curved walls. Clear LOW-IRON GLASS for transparency. WHITE TERRAZZO for seamless floors. NEON LED accent lines (soft violet, cool white) integrated into architecture. Light oak or bleached birch for minimal warmth accent. AIR architecture is predominantly white/light but with futuristic translucent, iridescent, and metallic accents that feel forward-looking. Other element energies add their signature accents proportionally.',
    lightingLogic: 'Abundant natural daylight flooding through floor-to-ceiling glass — LIGHT IS THE PRIMARY MATERIAL. Concealed LED strips in cool white and soft violet trace ceiling ridges and wave-forms. NEON LED accent lines and tubes (lavender, violet, soft pink) as architectural art elements — not garish club lighting but refined futuristic glow integrated into architectural reveals and counters. WHITE OPAL GLOBE LIGHTS on slim white/chrome stems. RING/HALO LED pendants for futuristic geometry. Dichroic glass art catches and refracts rainbow light spectrums across white surfaces. Cool-neutral to daylight color temperature (4000-5500K) for ambient, with accent neon in 3000-4000K lavender/violet. The space glows from within — light, glass, and iridescence define the future atmosphere.',
    spatialHierarchy: 'Weightless floating composition — wave-form ceilings hover overhead defining zones without walls, fluted columns create rhythm, TRANSLUCENT COLORED GLASS PARTITIONS divide space while maintaining visual connection (large oval/organic shaped tinted glass panels in violet-amber gradients). Generous negative space. The space breathes — everything floats. Dichroic glass installations serve as art focal points, refracting rainbow light across white architecture. When other elements mix in (Water adds reflective blue/chrome, Fire adds warm gold/copper, Earth adds natural wood/stone), those accents appear proportionally as furniture and decor — never disrupting the light futuristic architectural envelope.',
    formLanguage: 'Flowing white AND futuristic-minimal. Undulating wave-form ceiling sculptures. Fluted vertical panels. Curved white Corian counters. METALLIC SILVER tubular furniture — silver/aluminum upholstered lounge chairs with plump rounded forms. Stainless steel pedestal tables with circular tops. Transparent/tinted glass furniture. 3D textured white panels. Dichroic glass sculptures as room centerpieces. Neon signage/art tubes as accent. Hammered metallic (silver, lavender-tinted) counter fronts. Furniture in pure AIR: silver metallic armchairs, white lacquer tables, transparent glass chairs, metallic pedestal tables, opal globe lights, iridescent accessories. When combined with WATER: blue accents, deep chrome, translucent blue glass. When combined with FIRE: warm gold sconces, amber glass, copper accents, rose-gold gradient panels. When combined with EARTH: light wood warmth, stone counter, cream textiles, indoor plants. The AIR envelope stays light/white/futuristic — other elements provide warmth and grounding.',
    avoidStrict: 'Heavy dark materials, cluttered spaces, ornamental traditional decoration, thick/bulky/heavy furniture, visible heavy hardware, warm earthy tones dominating, raw brutalist concrete, oxidized/rusted metals (Fire territory), full chrome/steel wall-wrapping (Water territory — AIR uses silver accents not immersive chrome), dark dramatic contrast. The space must feel weightless, luminous, futuristic, and ethereal — never dense, grounded, or backward-looking.',
    materialApplication: 'White Corian wraps counters and islands in seamless flowing curves — organic shapes like frozen white waves. 3D textured white wall panels with geometric relief cover feature walls. Tinted translucent glass partitions in violet/amber/rose-gold gradient tones divide spaces — large oval or organic shaped panels inspired by contemporary gallery installations. Dichroic/iridescent glass art pieces (large sculptural forms that shift between amber, violet, green, blue with viewing angle) serve as spatial centerpieces. Fluted white panels clad columns floor-to-ceiling. Wave-form ceiling sculpture with LED-traced ridges. White marble (Calacatta) floors. Limewash and plaster on curved walls. Metallic silver/aluminum upholstered furniture (tubular rounded armchairs, stainless steel pedestal tables). Neon LED tubes in lavender/violet integrated into bar counters, wall reveals, or as art signage. Hammered silver metallic counter fronts for bars/reception. Frosted colored glass desks and shelving. Light oak or birch for minimal warmth — never dominant. The space is 80%+ white/light with futuristic iridescent, metallic silver, and translucent colored glass accents. Additional accent colors/materials enter through other element energies.',
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
  geometry: "Emphasize geometry shift: change spatial hierarchy (linear / central / radial / asymmetrical). Introduce a different compositional strategy.",
  lighting: "Emphasize lighting shift: alter light direction, intensity, or shadow character. New illumination mood.",
  material: "Emphasize material emphasis shift: foreground different surfaces or textures. Shift tactile focus.",
  focal: "Emphasize focal object change: different main furniture or anchor element. New center of attention.",
} as const;

// --- CORE PROMPT ENGINE ---

const getActiveDistribution = (input: PromptInput): Vector4 => {
  if ((input.hasUserRefined || input.deepSurveyCompleted) && input.refinedDistribution) {
    return input.refinedDistribution;
  }
  return input.baseDistribution;
};

/** Build energy-weighted spatial rules from percentages (includes material expression) */
const buildEnergySpatialRules = (activeDist: Vector4): string => {
  const parts: string[] = [];
  const sorted = (['earth', 'fire', 'water', 'air'] as Element[]).sort((a, b) => activeDist[b] - activeDist[a]);
  for (const el of sorted) {
    const pct = activeDist[el];
    if (pct < 5) continue;
    const rules = ENERGY_RULES[el];
    const intensity = pct >= 40 ? "strongly" : pct >= 25 ? "clearly" : "subtly";
    parts.push(`${el} (${Math.round(pct)}%): ${intensity} — ${rules.form}. ${rules.lighting}. ${rules.spatial}. Material: ${rules.material}.`);
  }
  return parts.join(" ");
};

/** Build structured architectural behavior block — geometry, material weight, lighting, spatial hierarchy */
const buildArchitecturalBehaviorBlock = (activeDist: Vector4): string => {
  const sorted = (['earth', 'fire', 'water', 'air'] as Element[]).sort((a, b) => activeDist[b] - activeDist[a]);
  const parts: string[] = [];
  for (const el of sorted) {
    const pct = activeDist[el];
    if (pct < 5) continue;
    const b = ELEMENT_ARCH_BEHAVIOR[el];
    const intensity = pct >= 40 ? "primary" : pct >= 25 ? "supporting" : "trace";
    parts.push(`${el.toUpperCase()} (${intensity}): Geometry — ${b.geometry}. Material weight — ${b.materialWeight}. Lighting — ${b.lightingLogic}. Spatial hierarchy — ${b.spatialHierarchy}.`);
  }
  return parts.join(" ");
};

// ── SPACE CATEGORY IDENTITY ──
// Strong visual identity per category — prevents a restaurant from looking like a living room
const SPACE_IDENTITY: Record<string, string> = {
  'Living / Residential': 'This is a PRIVATE RESIDENTIAL interior — a home where people live. It must feel domestic, personal, warm, and intimate. Residential furniture scale, personal belongings visible, homely comfort.',
  'Office / Workspace': 'This is a PROFESSIONAL WORKSPACE — an office environment for working. It must feel organized, functional, and corporate-appropriate. Desks, task chairs, monitors, meeting spaces. NOT a home.',
  'Hospitality': 'This is a HOSPITALITY venue — a hotel, boutique hotel, or hospitality space designed for guests. It must feel welcoming, luxurious, and service-oriented. Reception, concierge, guest amenities visible.',
  'Restaurant / Cafe': 'This is a RESTAURANT or CAFE — a commercial dining/drinking establishment for paying customers. It MUST have MULTIPLE dining tables or cafe seating set for service, a visible bar or barista counter, menu/wine displays, commercial-grade furniture, service circulation. This is NOT a home dining room. It must feel like a real restaurant or coffee shop you would walk into. Barista equipment, espresso machines, pastry displays for cafe; full table settings for restaurant.',
  'Retail / Public Interior': 'This is a RETAIL or PUBLIC COMMERCIAL space — a shop, showroom, or public interior. Display fixtures, product shelving, checkout counter, wayfinding signage, commercial-grade lighting. NOT a residential space.',
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
    'Cafe': 'This is a CAFE SPACE — barista counter with espresso machine (La Marzocca or similar), grinder, drip station, pastry display case, POS system, cup stacks. Multiple small tables and lounge seating, menu boards, warm inviting lighting. Specialty coffee shop atmosphere.',
    'Coffee Shop': 'This is a COFFEE SHOP — a cozy, specialty third-wave coffee environment. Prominent barista bar with professional espresso machine (La Marzocca, Victoria Arduino, or Synesso), hand-brew station (V60, Chemex), grinder setup. Pastry/bakery display, artisan cups and ceramics. Mix of communal wooden tables, window counter seating, and soft lounge corners. Exposed bulb or pendant warm lighting, chalkboard or minimal menu boards, potted plants, books, curated playlist vibe. Warm, inviting, indie-creative atmosphere — NOT a fast-food chain. Specialty coffee culture.',
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
    requiredElements: ['sofa or sectional seating', 'coffee table or side table', 'area rug defining the seating zone', 'floor lamp or table lamp'],
    forbiddenItems: ['kitchen island', 'bed', 'office desk', 'toilet', 'shower', 'commercial counter', 'bar stools'],
    materialPriority: 'warm textiles on seating, hardwood or stone flooring, plaster or paint walls',
    cameraHint: 'eye-level from corner showing seating arrangement and window wall, 28-32mm',
    spatialRules: 'Seating faces a focal point (window, fireplace wall, or art wall). Coffee table within arm reach of sofa. Min 90cm circulation around furniture grouping. Rug anchors the seating zone.',
    layoutLogic: 'Conversation-oriented arrangement. Primary seating faces secondary. Side tables flank sofa. Lighting at multiple heights (floor, table, pendant).',
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
    spatialRules: 'Work triangle between sink, cooktop, and refrigerator. Min 120cm between parallel counters. Island requires 100cm clearance on all working sides. Upper cabinets 45-50cm above counter.',
    layoutLogic: 'Efficient work zones: prep, cook, clean. Task lighting under upper cabinets. Pendant lights over island/peninsula. Ventilation above cooktop.',
  },
  'Bathroom': {
    requiredElements: ['vanity with basin', 'mirror above vanity', 'shower or bathtub', 'towel storage'],
    forbiddenItems: ['bed', 'sofa', 'dining table', 'kitchen island', 'wardrobe'],
    materialPriority: 'waterproof surfaces — porcelain tile, natural stone, microcement, glass partitions, matte ceramic',
    cameraHint: 'eye-level from doorway showing vanity and shower/tub, 28-35mm',
    spatialRules: 'Vanity opposite or adjacent to shower. Min 70cm clearance in front of vanity. Shower glass partition or curtain. Floor drain slope. Wet zone separated from dry zone.',
    layoutLogic: 'Wet zone (shower/tub) separated from dry zone (vanity, toilet). Mirror with integrated or flanking lighting. Recessed shelving in shower wall.',
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
    requiredElements: ['reception or focal point', 'seating area', 'clear wayfinding', 'feature lighting'],
    forbiddenItems: ['bed', 'kitchen appliances', 'bathroom fixtures'],
    materialPriority: 'premium stone flooring, feature wall in stone or wood, metal accents, statement lighting',
    cameraHint: 'eye-level from entrance showing reception and volume, 24-30mm',
    spatialRules: 'Clear sight line from entrance to reception. Waiting area off main circulation. Double-height or feature ceiling if possible. Branded material choices.',
    layoutLogic: 'Arrival experience. Reception desk visible immediately. Seating grouped but not blocking flow. Dramatic vertical lighting.',
  },
  'Restaurant': {
    requiredElements: ['MULTIPLE dining tables (at least 4-6 visible, set with plates/glasses/napkins)', 'upholstered banquette seating along at least one wall', 'bar counter or service station with stools', 'pendant or candle lighting over each table', 'waiter circulation paths between tables'],
    forbiddenItems: ['bed', 'bathtub', 'office desk', 'residential wardrobe', 'residential sofa', 'home bookshelf'],
    materialPriority: 'mix of textures — wood or marble tables, upholstered banquettes in leather or velvet, stone or tile floor, metal/glass bar, acoustic ceiling panels',
    cameraHint: 'eye-level from entry showing depth of dining room with multiple tables receding into space, 28-35mm',
    spatialRules: 'Min 120cm between table edges for service circulation. Bar area distinct from dining. Acoustic treatment on ceiling or walls. Mix of 2-top and 4-top arrangements. Tables set with full place settings.',
    layoutLogic: 'Zones: bar, intimate dining, group dining. Banquette along walls. Loose tables in center. Lighting creates intimacy per table. Wine storage or display visible.',
  },
  'Bar': {
    requiredElements: ['long bar counter with bar stools (at least 6-8 seats)', 'back-bar with shelved spirits and glassware', 'cocktail preparation area', 'ambient/mood lighting', 'small cocktail tables or high-tops'],
    forbiddenItems: ['bed', 'bathtub', 'office desk', 'kitchen stove', 'residential furniture'],
    materialPriority: 'dark wood or stone bar top, metal bar rail, leather or upholstered bar stools, tile or stone floor, moody wall treatment',
    cameraHint: 'eye-level showing length of bar counter with back-bar visible, 28-32mm',
    spatialRules: 'Bar counter height 105-110cm. Bar stools 75cm height. Min 150cm behind bar for bartender. Back-bar within arm reach. Cocktail tables off main bar area.',
    layoutLogic: 'Bar is the focal point. Stools face bartender. Back-bar lit for display. Lounge seating creates secondary zone. Low intimate lighting.',
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
    requiredElements: ['barista counter with espresso machine', 'pastry display case', 'multiple small tables and chairs', 'menu board or display', 'ambient lighting'],
    forbiddenItems: ['bed', 'bathtub', 'office cubicle', 'residential wardrobe'],
    materialPriority: 'warm wood surfaces, tile or concrete counter, copper/brass accents, comfortable seating mix',
    cameraHint: 'eye-level from entrance showing counter and seating depth, 28-32mm',
    spatialRules: 'Counter prominent from entrance. Mix of bar stools at window, small 2-tops, and lounge seating. Queue space in front of counter. Min 90cm circulation.',
    layoutLogic: 'Coffee shop flow: enter, queue, order, sit. Counter as hero element. Varied seating for solo and groups. Warm inviting atmosphere.',
  },
  'Coffee Shop': {
    requiredElements: ['professional espresso machine (La Marzocca/Victoria Arduino)', 'hand-brew station (V60, Chemex)', 'coffee grinder setup', 'pastry/bakery display', 'artisan ceramic cups', 'communal wooden table', 'window counter with stools', 'soft lounge corner', 'pendant or exposed-bulb warm lighting', 'chalkboard or minimal menu'],
    forbiddenItems: ['bed', 'bathtub', 'office cubicle', 'formal dining table settings', 'fast-food branding'],
    materialPriority: 'natural oak or walnut surfaces, exposed brick or raw plaster walls, terrazzo or concrete floors, copper/brass barista fixtures, woven textiles, ceramic and stoneware',
    cameraHint: 'eye-level from entrance capturing barista bar and seating depth, warm natural light from window, 28-32mm',
    spatialRules: 'Barista counter as focal hero element near entrance. Window counter seating for solo guests. Communal table in center. Soft lounge area in back. Min 90cm circulation. Plants and greenery accents.',
    layoutLogic: 'Third-wave coffee experience: enter, admire the bar, order, choose your seat type (solo window, communal, lounge). Warm indie-creative atmosphere. Books, plants, curated objects. NOT a chain — artisan specialty culture.',
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
    requiredElements: ['product display fixtures or shelving', 'checkout counter', 'fitting room or consultation area', 'commercial lighting highlighting products'],
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

// ── COMPOSITION STRATEGIES (anti-repetition) ──
const COMPOSITION_STRATEGIES = [
  { name: 'asymmetric-depth', desc: 'Off-center composition with strong diagonal depth. Primary furniture group offset to one-third of frame. Layered depth through foreground element, midground focus, background wall.' },
  { name: 'axial-linear', desc: 'Strong central axis with symmetrical flanking elements. Eye drawn along a clear perspective line. Balanced but not mirror-perfect.' },
  { name: 'framed-view', desc: 'Composition uses architectural elements (doorway, archway, column) to frame the main scene. Viewer looks through an opening into the room.' },
  { name: 'corner-reveal', desc: 'Camera positioned at room corner showing two walls meeting. Furniture arranged along both visible walls creating an L-shaped composition.' },
  { name: 'window-focal', desc: 'Window or glass wall as primary light source and focal point. Interior arranged toward and lit by this natural light source. Strong light-to-dark gradient.' },
  { name: 'sectional-divide', desc: 'Room visually divided into foreground zone and background zone by a material change, level change, or furniture arrangement. Two distinct but connected spatial experiences.' },
] as const;

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

  const areaM2 = input.areaM2 || 100;
  const ceilingH = input.constraints?.ceilingHeightM || 2.8;
  const naturalLight = input.constraints?.naturalLight || 'medium';
  const colorPalette = input.constraints?.colorPalette || 'auto';
  const budgetLevel = input.constraints?.budgetLevel || 'premium';

  const sorted = (['earth', 'fire', 'water', 'air'] as Element[]).sort((a, b) => activeDist[b] - activeDist[a]);
  const primary = sorted[0];
  const secondary = sorted[1];
  const earthPct = Math.round(activeDist.earth);
  const firePct = Math.round(activeDist.fire);
  const waterPct = Math.round(activeDist.water);
  const airPct = Math.round(activeDist.air);

  // Material placement — explicit surface-to-material mapping
  const materialPlacement = buildMaterialPlacement(input.materialsSelected);
  const realProducts = resolveRealProducts(input.materialsSelected, activeDist);

  // Furniture diversity — cycle different items per generation using generationIndex
  const genIdx = input.generationIndex ?? 0;
  const primaryPool = FURNITURE_BY_ELEMENT[primary];
  const secondaryPool = secondary !== primary ? FURNITURE_BY_ELEMENT[secondary] : [];
  const furnitureItems = [
    primaryPool[genIdx % primaryPool.length],
    primaryPool[(genIdx + 1) % primaryPool.length],
    ...(secondaryPool.length > 0 ? [secondaryPool[(genIdx + 2) % secondaryPool.length]] : []),
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
  const decorItems = [
    decorPool[genIdx % decorPool.length],
    decorPool[(genIdx + 3) % decorPool.length],
    ...(secDecorPool.length > 0 ? [secDecorPool[(genIdx + 1) % secDecorPool.length]] : []),
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
    : `Atmosphere: ${profile.atmospherePhrases.slice(0, 4).join(', ')}.`;

  // Composition cycling
  const compIdx = (input.generationIndex ?? 0) % COMPOSITION_STRATEGIES.length;
  const composition = COMPOSITION_STRATEGIES[compIdx];
  const focusKeys: ('geometry' | 'lighting' | 'material' | 'focal')[] = ['geometry', 'lighting', 'material', 'focal'];
  const variationFocus = input.variationFocus ?? focusKeys[(input.generationIndex ?? 0) % 4];
  const variationDirective = VARIATION_DIRECTIVES[variationFocus];

  // Lighting — varies between day/golden-hour/evening for anti-repetition
  const timeVariants = [
    { time: 'midday', desc: 'Bright natural daylight flooding through windows. Strong sun-cast shadow patterns on floor and walls. Color temperature 5000-5500K. Window light creates defined geometric shadow shapes of window frames on interior surfaces.' },
    { time: 'golden hour', desc: 'Late afternoon golden hour light angling deeply through windows. Warm amber light (3500K) creating long dramatic shadows and warm pools on surfaces. The sun is low, casting golden ribbons across the room.' },
    { time: 'overcast', desc: 'Soft diffused overcast daylight from windows. Even, shadowless illumination (5000K) with no harsh shadows. All material textures clearly visible. Supplementary warm accent lighting (2700K) from architectural fixtures.' },
    { time: 'evening', desc: 'Blue hour exterior visible through windows. Interior lit by warm architectural lighting (2700K) — concealed LED strips, pendant fixtures, and wall sconces creating intimate amber pools. Contrast between cool blue exterior and warm golden interior.' },
  ];
  const timeIdx = genIdx % timeVariants.length;
  const baseLight = naturalLight === 'high'
    ? timeVariants[timeIdx % 3]
    : naturalLight === 'low'
      ? timeVariants[3]
      : timeVariants[timeIdx];
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

  // [1] PHOTOGRAPHIC IDENTITY
  P.push(`Ultra-realistic editorial architectural photograph of a completed, physically built ${spaceLabel}. ${areaM2}m², ceiling height ${ceilingH}m. This image will be published in Dezeen, ArchDaily, or AD Magazine. Shot on location by an elite architectural photographer (Hélène Binet / Iwan Baan / Fernando Guerra caliber). The space is REAL, BUILT, INHABITED — not a render or concept. It shows years of careful design: patina on materials, wear on floors, books on shelves, ceramics curated over time. Light enters naturally through actual windows creating authentic shadow patterns on textured surfaces. Every material is identifiable from the photograph — you can see the stone veining, wood grain direction, plaster trowel marks, metal reflections of the room, fabric weave texture.`);

  // [1b] SPACE IDENTITY (critical — prevents a restaurant from looking like a living room)
  if (spaceIdentity) {
    P.push(`SPACE IDENTITY (MANDATORY): ${spaceIdentity}`);
  }

  // [1c] CONTEXT OVERRIDE (room within category — e.g. "Dining" in a "Restaurant" context)
  if (contextOverride) {
    P.push(`CONTEXT OVERRIDE (highest priority for room character): ${contextOverride}`);
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

  // [3] MATERIAL SPECIFICATION (the user's actual choices — highest priority)
  if (input.materialsSelected.length > 0 && materialPlacement) {
    P.push(`MATERIAL SPECIFICATION (use EXACTLY these materials on these surfaces): ${materialPlacement} Each material must be clearly identifiable in the photograph — show its characteristic texture, color, and finish at close range. The viewer should be able to name each material from looking at the image. Wood shows grain direction and natural color variation. Stone shows veining pattern and surface porosity. Plaster shows subtle trowel texture. Metal shows brushing direction or patina. Textile shows weave structure.`);
  } else {
    P.push(`Material palette: ${roomProgram.materialPriority}. Elevated selections: ${profile.materialBehaviorPhrases.slice(0, 4).join(', ')}. Every surface shows realistic texture depth — no flat, uniform, or digitally perfect surfaces.`);
  }

  // [4] DOMINANT ELEMENT BRIEF — the architectural DNA of this space
  const domBrief = ELEMENT_ARCH_BEHAVIOR[primary];
  P.push(`DOMINANT ENERGY: ${primary.toUpperCase()} (${Math.round(activeDist[primary])}%) — this defines the entire spatial character.\nGeometry: ${domBrief.geometry}\nMaterials: ${domBrief.materialWeight}\nForms: ${domBrief.formLanguage}\nMaterial application: ${domBrief.materialApplication}\nLighting: ${domBrief.lightingLogic}\nSpatial feel: ${domBrief.spatialHierarchy}\nSTRICTLY AVOID: ${domBrief.avoidStrict}`);

  // [4b] Secondary + supporting energy influences
  const supportParts: string[] = [];
  for (const el of sorted.slice(1)) {
    const pct = Math.round(activeDist[el]);
    if (pct < 8) continue;
    const brief = ELEMENT_ARCH_BEHAVIOR[el];
    const intensity = pct >= 25 ? 'significant supporting' : pct >= 15 ? 'noticeable' : 'subtle trace';
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
  if (secondaryPct >= 15 && COMBO_ACCENTS[comboKey]) {
    const intensity = secondaryPct >= 30 ? 'prominently' : secondaryPct >= 20 ? 'noticeably' : 'subtly';
    P.push(`ELEMENT COMBINATION (${primary}+${secondary}, ${secondaryPct}% ${secondary}): ${intensity} integrate these accent elements: ${COMBO_ACCENTS[comboKey]}`);
  }

  // [5] FURNITURE & OBJECTS
  const furnitureFormNote = primary === 'water' ? 'Furniture should have organic, sculptural, fluid forms — serpentine bouclé sofas in cream/white, sculpted mirror-polished stainless steel bar counters with organic twisted profiles, chrome coffee tables with kidney/organic shapes, caramel leather accent chairs for warm contrast. Counters and reception desks must be the star — flowing liquid-metal stainless steel forms. Hammered/rippled metal on island and bar faces. Glass blocks for accent walls. Forms reference neo-futurism (Gehry, Hadid) — continuous, smooth, reflective, never angular.'
    : primary === 'earth' ? 'Furniture should feel chunky, low-slung, and grounded — deep modular sofas in natural linen, olive/sage velvet, or warm cream. Thick solid wood tables (walnut, reclaimed oak). Bar stools with rounded padded forms in sage velvet. Handmade ceramic collections on open shelving. Heavy woven or jute rugs. Branches in ceramic vases as natural decoration. Wabi-sabi aesthetic: nothing is perfectly new — surfaces show age, warmth, and character.'
    : primary === 'fire' ? 'Furniture should have dramatic material contrast — deep rust/cognac/copper-toned velvet or leather upholstery against dark marble and blackened steel frames. Warm oxidized metal finishes. Bold, curated, intense.'
    : 'Furniture should feel weightless, futuristic, and forward-looking — metallic silver upholstered armchairs with rounded tubular forms, stainless steel pedestal tables, curved white Corian counters with organic silhouettes, transparent glass and frosted colored glass furniture, wire-frame minimal chairs. Dichroic/iridescent glass art installations as centerpieces. Tinted translucent glass partitions (violet, amber, gradient). Neon LED accent tubes in lavender/violet as architectural art. 3D textured white wall panels. Hammered metallic silver counter fronts. White opal globe lights and LED ring pendants. Fluted white columns and wave-form ceiling sculptures define the architecture. AIR is futuristic minimalism — natural wood and airy organic textures still welcome for warmth balance. Accent colors from other element energies: if WATER present add deep blue textile furniture and chrome art; if FIRE present add rose-gold/copper accent columns and warm brass; if EARTH present add timber beams, stone counters, and indoor plants.';
  P.push(`Furniture: ${furnitureItems.join('; ')}. Lighting fixtures: ${lightItems.join('; ')}. ${furnitureFormNote} BRAND REQUIREMENT (critical): Every object MUST look like a recognizable famous designer product — furniture by B&B Italia, Minotti, Poliform, Cassina, Vitra, Fritz Hansen, Moroso, Flos, Molteni&C, Kartell, Hay, Living Divani, Edra, Baxter, or equivalent premium tier. Lighting by Flos, Artemide, Tom Dixon, Louis Poulsen, &Tradition, Foscarini, Luceplan, Lee Broom, or equivalent. NO generic unbranded furniture — every piece must have a distinctive designer silhouette. Correct proportions: seating 42-45cm height, dining tables 72-75cm, counters 90cm. All furniture rests firmly on the floor with visible contact shadows. Nothing floats, intersects walls, or blocks circulation.`);

  // [5b] DECOR & STYLING — makes the space feel lived-in, curated, inviting
  P.push(`Decor and styling details (must be visible in the image): ${decorItems.join('; ')}. These objects should be placed naturally — on tables, shelves, counters — making the space feel inhabited and warm, not staged or empty. Minimalist but considered: every item has purpose.`);

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
  P.push(`Lighting: ${lightScenario} ${profile.lightPhrases.slice(0, 2).join(', ')}. Light behaves with physical accuracy: warm golden glow absorbed by wood grain, soft milky diffusion across plaster walls, crisp specular highlights on polished metal reflecting the room, translucent glow through glass casting colored shadows. One dominant natural light direction with soft gradual shadow falloff. Secondary fill light from opposite direction at 1/3 intensity. Warm ambient pools (2700K) from concealed architectural lighting in shadow gaps and shelf edges. The lighting alone tells you the time of day and the atmosphere of the space.`);

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
  const focalLength = areaM2 >= 120 ? '24mm' : areaM2 >= 60 ? '28mm' : '32mm';
  P.push(`Photography: ${focalLength} tilt-shift lens on Phase One IQ4 150MP digital back. Camera height 110cm (standing eye level). PERFECTLY CORRECTED VERTICALS — all vertical lines are absolutely straight. f/8–f/11 aperture, deep focus with slight natural bokeh on distant planes. Color science: neutral with warm bias, no post-processing filters, no HDR, no saturation boost, no Instagram look. Light behaves physically — soft shadow gradients from windows, warm amber pools from recessed downlights, material-accurate reflections (mirror-polish shows room reflections, matte absorbs light). Depth composition: clear foreground detail (edge of table, plant leaf), sharp mid-ground (main furniture group), soft atmospheric background (distant wall or window view). The image quality matches Dezeen's "House of the Year" photography standard.`);

  // [9] FRAMING
  P.push(`Composition: ${composition.desc} Full-frame with 15% breathing margin. All furniture fully visible — NOTHING cropped at frame edge. Clear foreground-midground-background depth layering. A curated vignette element in the near foreground (plant leaf edge, book corner, ceramic edge) creates editorial depth. The composition follows the rule of thirds with the primary furniture group at the golden ratio intersection.`);

  // [10] PHYSICAL RULES + ELEMENT CONSTRAINTS
  P.push(`Physical accuracy (non-negotiable): Every object obeys gravity — furniture legs create contact shadows on floor. Ceiling height ${ceilingH}m throughout. Doors 80cm+ wide, 210cm tall with visible frames. Windows have 15cm+ deep reveals, real frames, and show subtle reflections of interior on glass. Wall thickness 15-20cm visible at every opening. MATERIAL JOINTS ARE CRITICAL: visible 3mm shadow gaps between floor and wall, edge profiles on stone counters, reveal strips between different materials, baseboards or flush shadow details. Fabrics have realistic drape — cushions show compression, throws have natural folds, curtains puddle slightly on floor. Every surface has micro-texture variation — no surface is perfectly uniform. FORBIDDEN in this room: ${roomProgram.forbiddenItems.join(', ')}. FORBIDDEN by ${primary.toUpperCase()} element logic: ${domBrief.avoidStrict}`);

  // [10b] LOGICAL SPATIAL DESIGN (realism enforcement)
  P.push(`LOGICAL DESIGN (critical for realism): Every element placement must make FUNCTIONAL SENSE. Sofas face conversation areas or views, not walls. Dining tables are near kitchens with appropriate clearance. Lighting fixtures illuminate areas where light is needed — over dining, reading, workspaces. Materials are applied where they make constructional sense — stone on floors and counters, not randomly on ceilings. Furniture is scaled correctly for the room — not oversized in small rooms or undersized in large rooms. Circulation paths are clear (minimum 90cm walkways). The room must look like it was designed by a professional architect who understands human behavior and spatial function, not an AI that places objects decoratively without functional logic.`);

  // [11] ANTI-REPETITION
  P.push(`${variationDirective} Do NOT repeat identical compositions across generations. Each result must feel like a DIFFERENT PROJECT but within the same ${primary.toUpperCase()} elemental logic — different furniture arrangement, different focal point, different material balance, different light direction. ${composition.name} strategy.`);

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

  // [13] REFINEMENT
  if (input.refinementFeedback) {
    P.push(`USER DIRECTION (highest priority): "${input.refinementFeedback}".`);
  }

  // [14] USER NOTE
  if (input.userNote?.trim()) {
    P.push(`ADDITIONAL BRIEF NOTE from the user: "${input.userNote.trim()}". Incorporate this guidance into the design naturally.`);
  }

  const rawPrompt = P.join('\n\n');
  const finalPrompt = scrubBannedTokens(rawPrompt);

  const negativePrompt = "3D render, CGI, concept art, Unreal Engine, V-Ray render, artificial perfection, plastic-looking surfaces, fisheye distortion, barrel distortion, tilted verticals, leaning walls, cropped furniture, cut-off edges, floating objects, furniture embedded in walls, impossible geometry, wrong proportions, oversized furniture, undersized furniture, blocked doorways, flames, water waves, literal element symbols, cartoon, illustration, text overlay, watermarks, people, human figures, neon lighting, colored LED strips, HDR tonemapping, Instagram filter, oversaturation, IKEA catalog look, Pinterest cliché, developer showroom, beige sofa repetition, symmetrical staged catalog, empty room, bare walls without texture, flat uniform surfaces without grain or variation, video game aesthetic, low resolution, blurry, noisy, compression artifacts, AI face artifacts, extra fingers, deformed objects, impossible shadows, multiple light source directions, clinical fluorescent lighting";

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
  const sorted = (['earth', 'fire', 'water', 'air'] as Element[]).sort((a,b) => distribution[b] - distribution[a]);
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
    "Aesthetic: Premium, minimal, clean, buildable."
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

  const ELEMENT_FURNITURE_STYLE: Record<Element, string> = {
    earth: 'solid wood frames, organic curved forms, raw linen/bouclé upholstery, hand-thrown ceramic legs, warm walnut/oak tones — brands like Poliform, Carl Hansen, Arper',
    fire: 'bold sculptural silhouettes, dark leather/velvet, oxidized metal accents, dramatic contrast pieces, jewel-tone fabrics — brands like Minotti, Baxter, Meridiani',
    water: 'fluid curved lines, chrome/polished steel frames, cool grey/blue fabrics, glass-topped pieces, seamless microcement finishes — brands like B&B Italia, Flexform, MDF Italia',
    air: 'ultra-minimal geometric forms, thin metal frames, translucent/acrylic elements, white/silver palette, weightless appearance — brands like Kartell, Flos, Hay, Magis',
  };

  const ELEMENT_MATERIAL_STYLE: Record<Element, string> = {
    earth: 'natural stone with visible veining, aged plaster, raw timber planking, terracotta, hand-glazed tiles, cork, sisal',
    fire: 'corten steel, blackened bronze, dark marble (Nero Marquina), hammered copper, charred wood (shou sugi ban), volcanic stone',
    water: 'polished concrete, microcement, frosted glass, mirror-polished stainless steel, blue-grey terrazzo, liquid-effect resin',
    air: 'white corian, matte anodized aluminum, translucent onyx, dichroic glass panels, ultra-thin porcelain slabs, titanium finish',
  };

  const lines: string[] = [
    `EDIT THIS IMAGE. Change ONLY what I describe below. Keep EVERYTHING ELSE identical.`,
    ``,
    `WHAT TO CHANGE: "${userInstruction}"`,
    ``,
    `DO NOT CHANGE (keep pixel-identical):`,
    `✗ Camera angle, perspective, framing`,
    `✗ Room shape, walls, floor, ceiling`,
    `✗ Wall color/texture/material`,
    `✗ Floor material and pattern`,
    `✗ Window positions, curtains, blinds`,
    `✗ Any furniture NOT mentioned above`,
    `✗ Lighting direction, color temperature, shadows`,
    `✗ Decorative objects (plants, books, vases, art)`,
    `✗ Background, exterior view through windows`,
    ``,
    `STYLE FOR THE NEW ELEMENT:`,
    `The replacement must match ${dominant.toUpperCase()}-dominant aesthetic (${domPct}%):`,
    `${ELEMENT_AESTHETIC[dominant]}`,
    ``,
    `Furniture reference: ${ELEMENT_FURNITURE_STYLE[dominant]}`,
    `Material reference: ${ELEMENT_MATERIAL_STYLE[dominant]}`,
    adjList ? `Mood: ${adjList}` : '',
    ``,
    `TECHNICAL REQUIREMENTS:`,
    `- Same position and approximate size as the original element`,
    `- Correct perspective matching the existing vanishing points`,
    `- Shadows consistent with the existing light source direction`,
    `- Photorealistic material quality (real textures, not CG)`,
    `- The edit must be seamless and invisible`,
  ].filter(Boolean);

  return lines.join('\n');
};

export interface PromptOptions {
  generationIndex?: number;
  refinementFeedback?: string;
  userNote?: string;
}

// --- LEGACY WRAPPER FOR APP.TSX ---
export const buildUniversalPrompt = (state: UserState, options?: PromptOptions): PromptResult => {
  const deepCompleted = Object.keys(state.deepSurveyAnswers).length > 0;
  
  const p = state.refinement.isActive && state.refinement.refinedPercentages 
    ? state.refinement.refinedPercentages 
    : (state.analysis?.percentages || { earth: 25, fire: 25, water: 25, air: 25 });
    
  const sorted = (['earth', 'fire', 'water', 'air'] as Element[]).sort((a,b) => p[b] - p[a]);

  const adjectiveInputs = state.refinement.selectedAdjectives.map(adj => {
    const vec: Vector4 = { earth: 0, fire: 0, water: 0, air: 0 };
    vec[adj.element] = 100;
    return { id: adj.id, label: adj.label, vec };
  });

  const materialInputs = state.refinement.selectedMaterials.map(mat => {
    const w = mat.elementWeights;
    const vec: Vector4 = {
      earth: (w?.earth || 0) * 100,
      fire: (w?.fire || 0) * 100,
      water: (w?.water || 0) * 100,
      air: (w?.air || 0) * 100,
    };
    return { id: mat.id, name: mat.name, category: 'finish', vec, imagePath: mat.image };
  });

  const input: PromptInput = {
    domain: state.params.domain || 'interior',
    spaceCategory: state.params.category || 'Space',
    rooms: state.params.rooms,
    archContext: state.params.archContext,
    areaM2: state.params.squareMeters || 100,
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
    },
    constraints: {
      ceilingHeightM: state.params.ceilingHeight,
      naturalLight: state.params.naturalLight,
      colorPalette: state.params.colorPalette,
      budgetLevel: state.params.budgetLevel,
    },
    generationIndex: options?.generationIndex,
    refinementFeedback: options?.refinementFeedback,
    userNote: options?.userNote,
    aspectRatio: state.params.resolution,
  };

  const pkg = buildGenerationPackage(input);

  // Build a detailed concept brief for this generation
  const prim = sorted[0];
  const sec = sorted[1];
  const primPct = Math.round(p[prim]);
  const secPct = Math.round(p[sec]);
  const matNames = state.refinement.selectedMaterials.slice(0, 4).map(m => m.name.split('(')[0].trim()).join(', ');
  const adjNames = state.refinement.selectedAdjectives.slice(0, 3).map(a => a.label).join(', ');
  const roomLabel = state.params.rooms?.[0] || state.params.category || 'Space';
  const area = state.params.squareMeters || 100;
  const palette = state.params.colorPalette && state.params.colorPalette !== 'auto'
    ? state.params.colorPalette.replace('-', ' ')
    : null;
  const budget = state.params.budgetLevel || 'premium';
  const conceptParts = [
    `${roomLabel} · ${area}m²`,
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