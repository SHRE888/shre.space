import { PromptInput, Vector4, Element } from '../types';
import { elementLanguageProfile } from './elementLanguage';

const FURNITURE_REFS: Record<Element, string[]> = {
  earth: ['Baxter Damasco modular sofa in natural linen', 'reclaimed solid wood coffee table in weathered oak', 'Molteni&C Tondo table in green onyx marble'],
  fire: ['Baxter Budapest sofa in deep rust nubuck leather', 'polished aged brass cylindrical coffee table with nero marquina top', 'Minotti Andersen sofa in terracotta velvet'],
  water: ['Edra Boa sofa in cream bouclé with serpentine form', 'sculptural polished chrome bar counter with organic fluid form', 'De Sede DS-600 modular sofa in ivory leather curves'],
  air: ['metallic silver tubular armchairs with futuristic rounded form', 'dichroic iridescent glass art sculpture as centerpiece', 'DuPont Corian curved counter in glacier white with flowing organic form'],
};

const LIGHTING_REFS: Record<Element, string[]> = {
  earth: ['sculptural woven pendant in dark rattan/palm fiber', 'Ay Illuminate Nama pendant in natural bamboo', 'Isamu Noguchi Akari floor lamp in washi paper'],
  fire: ['matte black track spotlights on dark ceiling rails', 'Tom Dixon Melt pendant in polished copper', '&Tradition Flowerpot pendant in dark copper'],
  water: ['Tom Dixon Mirror Ball pendant in chrome cluster', 'vertical LED light bars flanking polished steel', 'Ross Lovegrove Mercury suspension in chrome liquid form'],
  air: ['neon LED accent tube in soft violet integrated into architectural reveals', 'LED ring/halo pendant with futuristic circular geometry', 'white opal globe lights on chrome stems clustered at varying heights'],
};

const MATERIAL_PRODUCT_MAP: Record<string, string> = {
  'Travertine (honed)': 'Stone Italiana Navona travertine, honed unfilled cross-cut',
  'Dark quartzite': 'Levantina grey quartzite, honed dramatic veining',
  'Clay plaster': 'Clayworks hand-troweled clay plaster',
  'Lime plaster (warm mineral)': 'Bauwerk lime plaster, warm mineral trowel',
  'Dark marble (high contrast)': 'Nero Marquina marble, polished white calcite veining',
  'Basalt': 'Honed basalt slab, matte volcanic surface',
  'Blackened steel': 'Blackened steel panel, oxidized matte finish',
  'Venetian plaster (polished)': 'Marmorino polished Venetian plaster',
  'Bronze accents': 'Nanz cast bronze hardware, dark patinated wax',
  'Microcement (continuous)': 'Kerakoll Cementoresina microcement, seamless',
  'Smooth mineral plaster': 'Kerakoll smooth wall plaster, micro-polished',
  'Matte ceramic': 'Mutina Mews collection porcelain, chalky matte',
  'Linen / wool textile surfaces': 'Kvadrat Hallingdal 65 wool + Dedar Nuvola linen',
  'Diffused glass': 'Saint-Gobain Planilux acid-etched glass, satin frost',
  'Mirror-polished stainless steel': 'Rimex Metals Super Mirror 304, 8K mirror polish reflective',
  'Hammered metal (rippled)': 'De Castelli Martellata hammered steel, rippled hand-textured',
  'Satin chrome': 'Rimex Metals 304 stainless steel, satin directional brush No.4',
  'Glass blocks (translucent)': 'Seves Glassblock Pegasus Metallizzato, translucent diffused',
  'Curved bent glass': 'Cricursa hot-bent curved glass, extra-clear laminated',
  'Limewash (bright)': 'Bauwerk bright limewash mineral finish',
  'White mineral plaster': 'Marmorino white mineral plaster, matte',
  'Light oak / ash': 'Kährs Grande Collection engineered oak, matte natural',
  'White marble (Calacatta)': 'Salvatori Calacatta Oro marble, polished warm gold veining',
  'Clear glass (low-iron)': 'Saint-Gobain Diamant low-iron glass, ultra-clear transparent',
  'Bleached birch': 'Kährs Nordic Naturals birch, bleached whitewash matte',
  'White terrazzo': 'Huguet Terrazzo Blanco precast, polished white aggregate',
  'Pale concrete (smooth)': 'LCDA BFUP smooth panel, pale grey silk finish',
  'Natural oak (horizontal)': 'Kährs Grande Collection engineered oak, horizontal grain',
  'Walnut veneer': 'Alpi walnut fine veneer, satin vertical grain',
  'Industrial brick': 'Brickworks red industrial face brick, pastoral rustic',
  'Textured concrete (matte)': 'LCDA BFUP concrete panel, raw shuttered matte',
  'Brushed metal': 'Rimadesio brushed metal profile, satin anodized',
  'Solid oak': 'Boen Chaletino wide plank solid oak',
  'Walnut (natural finish)': 'Kährs Lumen American walnut, satin oiled',
  'Corten steel (weathering)': 'SSAB Weathering COR-TEN A steel, natural oxidized rust patina',
  'Oxidized copper': 'Aurubis Nordic Green copper, pre-oxidized verdigris patina',
  'Aged brass (polished)': 'Rocky Mountain Hardware polished aged brass, warm gold living patina',
  'Dark herringbone parquet': 'Kährs Chevron Dark Smoke oak parquet, deep fumed herringbone',
  'Board-formed concrete': 'Site-cast board-formed exposed concrete, raw formwork with bug holes',
  'Volcanic stone (basalt rough)': 'Stone Italiana basalt volcanic, rough split-face',
  'Green onyx / marble (veined)': 'Antolini Rainforest Green marble, polished dramatic green-gold veining',
  'Rammed earth / terracotta plaster': 'Clayworks rammed earth effect clay plaster, layered terracotta warm-ochre',
  'Reclaimed weathered timber': 'Aged reclaimed oak beam and plank, natural weathered grey-brown patina',
  'Herringbone parquet (warm oak)': 'Kährs Herringbone engineered oak, warm natural oiled',
  'White Corian (curved seamless)': 'DuPont Corian Glacier White solid surface, thermoformed curved seamless',
  'Fluted white panel': 'Cosentino Dekton ultra-compact fluted profile in white, vertical ridges',
  'Dichroic / iridescent glass': '3M Dichroic Glass Film on laminated glass, color-shifting iridescent art panel',
  'Tinted translucent glass': 'Cricursa laminated colored glass in violet/amber gradient, translucent partition',
  'Metallic silver surface': 'Rimex Metals brushed aluminium panel, satin silver metallic finish',
  '3D textured white panel': 'WallArt 3D mineral composite wall panel, geometric relief in matte white',
};

export const buildDesignSummary = (input: PromptInput, activeDistribution: Vector4): string[] => {
  const profile = elementLanguageProfile(activeDistribution);
  const sorted = (['earth', 'fire', 'water', 'air'] as Element[]).sort((a, b) => activeDistribution[b] - activeDistribution[a]);
  const primary = sorted[0];
  const secondary = sorted[1];
  const bullets: string[] = [];

  const rooms = input.rooms && input.rooms.length > 0 ? input.rooms.join(', ') : input.spaceCategory;
  bullets.push(`Space: ${rooms} — ${input.areaM2}m², ${input.domain === 'interior' ? 'interior' : 'architecture'}, ceiling ${input.constraints?.ceilingHeightM || 2.8}m`);

  const atmosWords = profile.atmospherePhrases.slice(0, 3).join(', ');
  bullets.push(`Mood: ${atmosWords.charAt(0).toUpperCase() + atmosWords.slice(1)}`);

  if (input.materialsSelected.length > 0) {
    const matDetails = input.materialsSelected.slice(0, 4).map(m => {
      const detail = MATERIAL_PRODUCT_MAP[m.name];
      return detail || m.name;
    });
    bullets.push(`Surfaces: ${matDetails.join(' · ')}`);
  } else {
    bullets.push(`Surfaces: ${profile.materialBehaviorPhrases[0]}`);
  }

  const furn = FURNITURE_REFS[primary];
  const secFurn = FURNITURE_REFS[secondary];
  const furnitureList = [furn[0], secFurn.length > 1 ? secFurn[1] : secFurn[0]].filter(Boolean);
  bullets.push(`Furniture: ${furnitureList.join(' · ')}`);

  const lights = LIGHTING_REFS[primary];
  const lightStr = lights.slice(0, 2).join(' · ');
  const lightLevel = input.constraints?.naturalLight === 'high' ? 'bright natural daylight' : input.constraints?.naturalLight === 'low' ? 'soft dawn light, low ambient' : 'balanced natural daylight';
  bullets.push(`Lighting: ${lightStr} — ${lightLevel}`);

  bullets.push(`Form: ${profile.formPhrases[0]}`);

  const lightWords = profile.lightPhrases.slice(0, 2).join(', ');
  bullets.push(`Light Character: ${lightWords.charAt(0).toUpperCase() + lightWords.slice(1)}`);

  const pPct = Math.round(activeDistribution[primary]);
  const sPct = Math.round(activeDistribution[secondary]);
  bullets.push(`Balance: ${primary} ${pPct}% + ${secondary} ${sPct}% — integrated, no literal symbolism`);

  return bullets.slice(0, 8);
};
