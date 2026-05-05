import type { BudgetLevel } from '../types';

/**
 * Tiered real-world brand catalog for budget-aware prompt generation.
 *
 * Every brand listed here is independently verifiable on the global market
 * (Dezeen, ArchDaily, AD Magazine, Architonic regulars). Lists are intentionally
 * curated rather than exhaustive: they should give the image model a tight,
 * consistent visual signal at each tier instead of a brand soup.
 *
 * Tier definitions (used by both the UI and promptEngine):
 *  - essential: well-designed, accessible brands (Scandi/IKEA-tier, contract).
 *  - premium:   established design brands (Italian/Scandi/Japanese designer tier).
 *  - luxury:    bespoke, atelier-level, couture-tier brands.
 */

export interface BrandList {
  /** Sofas, sectionals, lounge chairs, beds, tables. */
  furniture: string[];
  /** Pendants, sconces, floor lamps, table lamps, architectural cove. */
  lighting: string[];
  /** Cabinetry / kitchen system manufacturers. */
  kitchenSystems: string[];
  /** Cooking and refrigeration appliances. */
  kitchenAppliances: string[];
  /** Faucets, showers, fittings. */
  plumbing: string[];
  /** Sanitary ware (basins, toilets, baths). */
  sanitary: string[];
  /** Surface providers: marble, quartzite, sintered, terrazzo, composite. */
  stoneSurfaces: string[];
  /** Wood floor / plank specialists, parquet houses. */
  woodFloors: string[];
  /** Door hardware, knobs, handles, hinges. */
  hardware: string[];
  /** Upholstery fabric / linen / wool / velvet houses. */
  textiles: string[];
  /** Rug houses. */
  rugs: string[];
}

export interface BudgetTierProfile {
  id: BudgetLevel;
  /** Short label for UI. */
  label: string;
  /** Short tagline shown under label. */
  blurb: string;
  /** Approximate FF&E (furniture/fixtures/equipment) range per m². */
  perSqmFFE: { lowUSD: number; highUSD: number };
  /** UI dollar-sign indicator. */
  symbol: '$' | '$$' | '$$$' | '$$$$';
  /** Brand sets, by category. */
  brands: BrandList;
}

const ESSENTIAL: BrandList = {
  furniture: [
    'IKEA (higher Stockholm / Markus Holmbäck collab tier)',
    'Hay (entry collection)',
    'Muuto',
    'Normann Copenhagen',
    'Menu / Audo',
    'String Furniture',
    'Bolia',
    'Tikamoon',
    'Northern',
    'Ferm Living',
  ],
  lighting: [
    'Muuto',
    'Hay',
    'Northern',
    'Louis Poulsen (mass-produced classics — PH 5, AJ)',
    'Frandsen',
    'Gubi (entry — Multi-Lite, Pedrera)',
    'Anglepoise',
    'New Works',
  ],
  kitchenSystems: [
    'IKEA Metod',
    'Reform (DIY fronts on IKEA carcasses)',
    'Häcker (entry)',
    'Nobilia',
  ],
  kitchenAppliances: [
    'Bosch Series 6/8',
    'Siemens iQ500/iQ700',
    'Miele (entry)',
    'AEG',
    'Whirlpool',
  ],
  plumbing: [
    'Hansgrohe',
    'Grohe Essence / Atrio',
    'GROHE Eurosmart',
    'Ikea / Häfele',
  ],
  sanitary: [
    'Duravit (entry — D-Neo)',
    'Villeroy & Boch',
    'Geberit',
    'Roca',
  ],
  stoneSurfaces: [
    'Caesarstone',
    'Silestone',
    'Cosentino Dekton (entry)',
    'IKEA Karlby (laminate engineered wood top)',
  ],
  woodFloors: [
    'Junckers',
    'Tarkett',
    'Quick-Step Massimo',
    'Pergo Sensation',
  ],
  hardware: [
    'Häfele',
    'Hettich',
    'Blum standard hinges',
    'IKEA Bagganäs',
  ],
  textiles: [
    'Kvadrat (Steelcut Trio, Hallingdal — accessible tier)',
    'Bemz (slipcover specialist)',
    'IKEA Sammanhang',
    'Camira',
  ],
  rugs: [
    'IKEA Stockholm',
    'Hay rugs',
    'Ferm Living rugs',
    'Layered',
  ],
};

const PREMIUM: BrandList = {
  furniture: [
    'B&B Italia',
    'Poliform',
    'Cassina',
    'Molteni&C',
    'Maxalto (B&B Italia)',
    'Living Divani',
    'Vitra',
    'Fritz Hansen',
    'Carl Hansen & Søn',
    'Knoll',
    'De La Espada',
    'Time & Style',
    'e15',
    'Gubi (full collection)',
    'Hay (full collection)',
    'Arper',
    'Walter Knoll',
    'Wittmann',
  ],
  lighting: [
    'Flos',
    'Artemide',
    'Tom Dixon',
    'Vibia',
    'Foscarini',
    'Davide Groppi',
    'Louis Poulsen (architectural)',
    'Bocci (standard runs)',
    'Apparatus Studio (standard)',
    'Catellani & Smith',
    'Lasvit (catalog)',
    'Penta Light',
    'Anglepoise (collab editions)',
  ],
  kitchenSystems: [
    'Bulthaup',
    'Boffi',
    'Poliform Varenna',
    'Modulnova',
    'SieMatic',
    'Reform (full collection)',
    'Leicht',
    'Valcucine',
  ],
  kitchenAppliances: [
    'Miele Generation 7000',
    'Gaggenau 200 series',
    'Wolf',
    'Sub-Zero',
    'Liebherr Monolith',
    'Bora hobs',
    'Fisher & Paykel',
  ],
  plumbing: [
    'Vola',
    'Dornbracht (Tara, Meta)',
    'Fantini Rubinetti',
    'Cea Design',
    'Boffi taps',
    'Hansgrohe Axor (designer collab)',
  ],
  sanitary: [
    'Duravit (Starck, Cape Cod)',
    'Catalano Premium',
    'Falper',
    'Antonio Lupi',
    'Agape',
    'Boffi sanitary',
  ],
  stoneSurfaces: [
    'Antolini Luigi (catalog stones)',
    'Citco',
    'Marble Trend',
    'Salvatori (Lithoverde, Romboo)',
    'Neolith',
    'Cosentino Dekton (designer collection)',
  ],
  woodFloors: [
    'Listone Giordano',
    'Dinesen (catalog widths)',
    'Bolefloor',
    'Mafi',
    'Havwoods (Henley, Domus)',
    'Junckers Premier',
  ],
  hardware: [
    'Olivari',
    'FSB',
    'Frank Allart',
    'Joseph Giles',
    'Salice push-to-open',
    'Blum Aventos',
  ],
  textiles: [
    'Kvadrat (full Raf Simons / Sahco range)',
    'Pierre Frey',
    'Romo',
    'Designers Guild',
    'C&C Milano',
    'Dedar (catalog)',
    'Élitis',
    'Holland & Sherry (catalog)',
  ],
  rugs: [
    'Nanimarquina',
    'cc-tapis',
    'Tai Ping',
    'Christopher Farr',
    'Loro Piana Interiors rugs',
    'Sahrai Milano',
  ],
};

const LUXURY: BrandList = {
  furniture: [
    'Edra',
    'Minotti (Atrium / Quadrado top tiers)',
    'Promemoria',
    'Henge',
    'Baxter',
    'Ceccotti Collezioni',
    'Linteloo',
    'Holly Hunt',
    'De Sede (custom)',
    'Christian Liaigre',
    'India Mahdavi (collab pieces)',
    'Fendi Casa',
    'Bottega Veneta Casa',
    'Hermès Maison',
    'Loro Piana Interiors',
    'Pierre Augustin Rose',
    'Studio Henry Wilson',
    'Gallotti & Radice',
    'Giorgetti',
    'Promemoria',
  ],
  lighting: [
    'Apparatus Studio (bespoke)',
    'Bocci (custom large clusters)',
    'Lasvit (bespoke chandeliers)',
    'Davide Groppi (bespoke)',
    'Lindsey Adelman (bespoke)',
    'Roll & Hill',
    'Gabriel Scott',
    'J.T. Kalmar',
    'Ingo Maurer (bespoke)',
    'Atelier Areti',
    'Allied Maker',
    'Studio Snowpuppe (custom)',
  ],
  kitchenSystems: [
    'Boffi (custom)',
    'Bulthaup b3 / b Solitaire (custom)',
    'Eggersmann',
    'Snaidero (custom)',
    'Minotti Cucine',
    'Gatto Cucine',
  ],
  kitchenAppliances: [
    'Gaggenau Vario 400 / 200 fully integrated',
    'La Cornue (custom range)',
    'Officine Gullo',
    'Sub-Zero / Wolf full suite',
    'Liebherr Monolith',
    'V-Zug Excellence',
    'Miele MasterCool',
  ],
  plumbing: [
    'Dornbracht (Vaia, Tara Logic, Meta Pure)',
    'Vola (custom finishes)',
    'Cea Design (PVD finishes)',
    'Salvatori (stone fittings)',
    'Boffi (Pipe collection)',
    'THG Paris',
  ],
  sanitary: [
    'Agape (custom)',
    'Antonio Lupi',
    'Boffi (Iceland, Sabbia)',
    'Falper',
    'Salvatori stone basins',
    'Apaiser',
    'Devon&Devon',
  ],
  stoneSurfaces: [
    'Antolini Luigi (Exclusive Collection — Calacatta Borghini, Patagonia, Cipollino)',
    'Salvatori (Lithoverde, Stiletto, Romboo bespoke)',
    'Citco (Lithea bespoke)',
    'Marmi Rivamonti',
    'Pibamarmi',
    'Studio Marmo bespoke',
  ],
  woodFloors: [
    'Dinesen (Douglas / Heartoak custom widths)',
    'Listone Giordano (Atelier)',
    'Bolefloor (live-edge custom)',
    'Mafi (smoked oak, charred custom)',
    'Havwoods (atelier)',
  ],
  hardware: [
    'Olivari (designer collab)',
    'Frank Allart (custom finishes)',
    'Joseph Giles (custom solid bronze)',
    'Izé',
    'Sun Valley Bronze',
    'WOUD bespoke',
  ],
  textiles: [
    'Loro Piana Interiors',
    'Hermès Métiers',
    'Dedar (Hermès collab)',
    'Holland & Sherry (custom)',
    'Pierre Frey (Maison)',
    'Rubelli',
    'Rose Uniacke fabrics',
    'Lelièvre',
    'Castel Maison',
  ],
  rugs: [
    'Tai Ping (custom)',
    'cc-tapis (custom)',
    'Nanimarquina (custom)',
    'Christopher Farr (bespoke)',
    'Loro Piana Interiors rugs',
    'Sahrai Milano (handknotted)',
    'The Rug Company (designer collab)',
  ],
};

export const BUDGET_TIERS: Record<BudgetLevel, BudgetTierProfile> = {
  essential: {
    id: 'essential',
    label: 'Essential',
    blurb: 'Quality mainstream design — well-resolved, accessible.',
    perSqmFFE: { lowUSD: 300, highUSD: 800 },
    symbol: '$$',
    brands: ESSENTIAL,
  },
  premium: {
    id: 'premium',
    label: 'Premium',
    blurb: 'Italian / Scandi / Japanese designer tier — Dezeen-default.',
    perSqmFFE: { lowUSD: 1000, highUSD: 3000 },
    symbol: '$$$',
    brands: PREMIUM,
  },
  luxury: {
    id: 'luxury',
    label: 'Luxury',
    blurb: 'Bespoke ateliers, couture finishes — AD-100 / WOA caliber.',
    perSqmFFE: { lowUSD: 4000, highUSD: 15000 },
    symbol: '$$$$',
    brands: LUXURY,
  },
};

/** Compact human-readable price label for UI badges. */
export function formatBudgetRange(tier: BudgetLevel): string {
  const t = BUDGET_TIERS[tier];
  return `${t.symbol} • $${t.perSqmFFE.lowUSD.toLocaleString()}–${t.perSqmFFE.highUSD.toLocaleString()}/m²`;
}

/**
 * Build a compact, dense, prompt-friendly brand directive for a given tier.
 * Keeps the line list short to avoid bloating the prompt while still locking
 * the visual character of the FF&E (furniture, fixtures, equipment).
 */
export function buildBudgetBrandDirective(tier: BudgetLevel): string {
  const t = BUDGET_TIERS[tier];
  const b = t.brands;

  const top = (xs: string[], n: number) => xs.slice(0, n).join(' / ');

  const intro =
    tier === 'essential'
      ? 'Budget context: ESSENTIAL (well-designed accessible tier — Scandi / contract / IKEA-top). Furniture and fixtures must read as quality mainstream design — clean, functional, well-detailed but never bespoke or couture. Avoid couture-luxury cues (no bookmatched marble feature walls, no full-bronze ironmongery, no atelier chandeliers).'
      : tier === 'premium'
        ? 'Budget context: PREMIUM (Dezeen / ArchDaily standard — Italian and Scandinavian designer tier). Every furniture piece, light fixture, kitchen system, and fitting must read like a recognizable designer product. Engineered stone and hardwood throughout. Custom joinery details visible. Professional architectural lighting design.'
        : 'Budget context: LUXURY (bespoke atelier — AD-100 / World of Architecture caliber). Every detail is custom: bookmatched natural marble, hand-finished plaster, solid bronze ironmongery, couture textile finishing, hand-knotted rugs, atelier-made lighting. Shadow gaps, flush details, concealed hardware. The space must feel commissioned to a world-class interior architect with no expense spared on craft.';

  const bandList =
    `Furniture references: ${top(b.furniture, 8)}. ` +
    `Lighting references: ${top(b.lighting, 7)}. ` +
    `Kitchen system: ${top(b.kitchenSystems, 4)}. ` +
    `Kitchen appliances: ${top(b.kitchenAppliances, 5)}. ` +
    `Plumbing fittings: ${top(b.plumbing, 4)}. ` +
    `Sanitary ware: ${top(b.sanitary, 4)}. ` +
    `Stone / surface providers: ${top(b.stoneSurfaces, 4)}. ` +
    `Wood flooring: ${top(b.woodFloors, 4)}. ` +
    `Door / cabinet hardware: ${top(b.hardware, 4)}. ` +
    `Upholstery / drapery textiles: ${top(b.textiles, 5)}. ` +
    `Rugs: ${top(b.rugs, 4)}.`;

  const ffe =
    `Approximate FF&E budget: $${t.perSqmFFE.lowUSD.toLocaleString()}–$${t.perSqmFFE.highUSD.toLocaleString()} per m² (USD, furniture+fixtures+lighting+textiles, excluding shell construction). Match the visible quality of every item to this band — neither cheaper nor more expensive than the brands listed above.`;

  return [intro, bandList, ffe].join(' ');
}
