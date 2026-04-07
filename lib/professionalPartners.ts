import type { Domain, SpaceCategory } from '../types';

export type ProfessionalRole = 'contractor' | 'architect' | 'designer';

export type ProfessionalPartner = {
  id: string;
  name: string;
  role: ProfessionalRole;
  specialty: string;
  url: string;
  /** Minimum m² (inclusive); omit = no lower bound */
  areaMin?: number;
  /** Maximum m² (inclusive); omit = no upper bound */
  areaMax?: number;
  /** Match if client's SpaceCategory equals one of these */
  categories?: SpaceCategory[];
  /** Match if client's category string includes any keyword (lowercase) */
  categoryKeywords?: string[];
  /** Match if domain is listed; omit = any */
  domains?: Domain[];
  /** Lower sorts earlier within the same role (0 = first). */
  pickOrder?: number;
};

const KW = {
  living: ['living', 'residential', 'private'],
  office: ['office', 'workspace', 'commercial building'],
  hospitality: ['hospitality', 'hotel'],
  restaurant: ['restaurant', 'cafe'],
  retail: ['retail', 'public interior', 'shop'],
  cultural: ['cultural', 'architecture'],
  house: ['private house', 'residential building'],
} as const;

/** Curated references (education / discovery — not endorsements). */
export const PROFESSIONAL_PARTNERS: ProfessionalPartner[] = [
  // Contractors — scale & typology aware
  { id: 'con-skanska', name: 'Skanska', role: 'contractor', specialty: 'Large build & major renovation', url: 'https://www.skanska.com', areaMin: 800, domains: ['architecture'], categoryKeywords: [...KW.office, ...KW.house, 'commercial'] },
  { id: 'con-strabag', name: 'STRABAG', role: 'contractor', specialty: 'Turnkey construction', url: 'https://www.strabag.com', areaMin: 500, domains: ['architecture'] },
  { id: 'con-isg', name: 'ISG', role: 'contractor', specialty: 'Commercial interior fit-out', url: 'https://www.isgltd.com', areaMin: 120, categoryKeywords: [...KW.office, ...KW.retail, ...KW.hospitality, ...KW.restaurant] },
  { id: 'con-bam', name: 'BAM', role: 'contractor', specialty: 'Fit-out & refurbishment', url: 'https://www.bam.com', areaMin: 200, categoryKeywords: [...KW.office, ...KW.cultural] },
  { id: 'con-vf', name: 'VolkerFitzpatrick', role: 'contractor', specialty: 'Refurbishment & infrastructure', url: 'https://www.volkerfitzpatrick.co.uk', areaMin: 250 },
  { id: 'con-briggs', name: 'Briggs & Forrester', role: 'contractor', specialty: 'Services + interior packages', url: 'https://www.briggsforrester.co.uk', areaMin: 60, areaMax: 12000 },
  { id: 'con-sweeten', name: 'Sweeten', role: 'contractor', specialty: 'Residential renovation matching', url: 'https://sweeten.com', areaMax: 450, domains: ['interior'], categoryKeywords: [...KW.living] },
  { id: 'con-houzz', name: 'Houzz Pro', role: 'contractor', specialty: 'Find vetted pros & budget tools', url: 'https://www.houzz.com/pro', areaMax: 600, domains: ['interior'], categoryKeywords: [...KW.living, 'kitchen', 'bathroom'] },

  // Architects — programme scale
  { id: 'shre-studio', name: 'SHRESTUDIO', role: 'architect', specialty: 'Architecture & interior design · Tbilisi', url: 'https://shre.ge', domains: ['architecture', 'interior'], pickOrder: 0 },
  { id: 'arc-foster', name: 'Foster + Partners', role: 'architect', specialty: 'Global large-scale architecture', url: 'https://www.fosterandpartners.com', areaMin: 1500, domains: ['architecture'] },
  { id: 'arc-sno', name: 'Snøhetta', role: 'architect', specialty: 'Cultural & landscape-integrated', url: 'https://snohetta.com', areaMin: 400, domains: ['architecture'], categoryKeywords: [...KW.cultural, 'coastal', 'mountain'] },
  { id: 'arc-big', name: 'BIG', role: 'architect', specialty: 'Experimental form & sustainability', url: 'https://big.dk', areaMin: 600, domains: ['architecture'] },
  { id: 'arc-heatherwick', name: 'Heatherwick Studio', role: 'architect', specialty: 'Sculptural architecture', url: 'https://www.heatherwick.com', areaMin: 400, domains: ['architecture'], categoryKeywords: [...KW.cultural, ...KW.retail] },
  { id: 'arc-mvrdv', name: 'MVRDV', role: 'architect', specialty: 'Dense urban & mixed-use', url: 'https://www.mvrdv.nl', areaMin: 800, domains: ['architecture'], categoryKeywords: [...KW.office, 'commercial building', 'residential building'] },
  { id: 'arc-studgang', name: 'Studio Gang', role: 'architect', specialty: 'Residential towers & cultural', url: 'https://studiogang.com', areaMin: 300, domains: ['architecture'] },
  { id: 'arc-caruso', name: 'Caruso St John', role: 'architect', specialty: 'Refined adaptive reuse', url: 'https://www.carusostjohn.com', areaMin: 200, domains: ['architecture'], categoryKeywords: [...KW.cultural, ...KW.retail] },
  { id: 'arc-sjb', name: 'SJB', role: 'architect', specialty: 'Architecture & interiors (AU)', url: 'https://sjb.com.au', areaMin: 180, domains: ['architecture', 'interior'] },

  // Interior designers
  { id: 'des-yabu', name: 'Yabu Pushelberg', role: 'designer', specialty: 'Luxury hospitality & retail', url: 'https://yabupushelberg.com', areaMin: 200, domains: ['interior'], categoryKeywords: [...KW.hospitality, ...KW.retail, ...KW.restaurant] },
  { id: 'des-kelly', name: 'Kelly Wearstler', role: 'designer', specialty: 'Signature residential', url: 'https://kellywearstler.com', areaMin: 80, domains: ['interior'], categoryKeywords: [...KW.living, ...KW.hospitality] },
  { id: 'des-tds', name: 'Tom Dixon', role: 'designer', specialty: 'Product-driven interiors', url: 'https://www.tomdixon.net', areaMin: 40, domains: ['interior'] },
  { id: 'des-ils', name: 'ILSE CRAWFORD', role: 'designer', specialty: 'Human-centred residential', url: 'https://www.ilsecrawford.com', areaMin: 50, domains: ['interior'], categoryKeywords: [...KW.living, ...KW.hospitality] },
  { id: 'des-pierre', name: 'Pierre Yovanovitch', role: 'designer', specialty: 'Parisian modern residences', url: 'https://www.pierreyovanovitch.com', areaMin: 120, domains: ['interior'], categoryKeywords: [...KW.living] },
  { id: 'des-house', name: 'House of Grey', role: 'designer', specialty: 'Calm tonal interiors', url: 'https://houseofgrey.net', areaMin: 45, areaMax: 400, domains: ['interior'], categoryKeywords: [...KW.living] },
  { id: 'des-avroko', name: 'AvroKO', role: 'designer', specialty: 'Restaurant & bar concepts', url: 'https://avroko.com', areaMin: 80, domains: ['interior'], categoryKeywords: [...KW.restaurant] },
  { id: 'arc-marmol', name: 'Marmol Radziner', role: 'architect', specialty: 'Custom residential architecture', url: 'https://www.marmolradziner.com', areaMin: 80, areaMax: 2500, domains: ['interior', 'architecture'], categoryKeywords: [...KW.living, ...KW.house] },
  { id: 'arc-mk27', name: 'studio mk27', role: 'architect', specialty: 'Residential & pavilion architecture', url: 'https://www.mk27.net', areaMin: 70, domains: ['architecture', 'interior'], categoryKeywords: [...KW.living] },
];

export type PartnerPickerInput = {
  squareMeters: number;
  category?: string;
  domain?: Domain;
};

function keywordMatch(category: string, keywords?: string[]): boolean {
  if (!keywords?.length) return true;
  const low = category.toLowerCase();
  return keywords.some(k => low.includes(k.toLowerCase()));
}

function categoryExactMatch(category: string, list?: SpaceCategory[]): boolean {
  if (!list?.length) return true;
  return list.includes(category as SpaceCategory);
}

/** Score higher = better match (for sorting). */
function scorePartner(p: ProfessionalPartner, area: number, category: string, domain: Domain): number {
  let s = 0;
  if (p.domains?.length) {
    if (p.domains.includes(domain)) s += 40;
    else s -= 25;
  }
  if (!categoryExactMatch(category, p.categories)) return -1000;
  if (!keywordMatch(category, p.categoryKeywords)) s -= 15;

  const min = p.areaMin ?? 0;
  const max = p.areaMax ?? 1e9;
  if (area >= min && area <= max) s += 35;
  else if (area < min) s += Math.max(0, 20 - (min - area) / 50);
  else s += Math.max(0, 20 - (area - max) / 80);

  if (p.categoryKeywords?.some(k => category.toLowerCase().includes(k))) s += 25;
  return s;
}

export function getRecommendedProfessionalPartners(
  input: PartnerPickerInput,
  opts?: { perRole?: number },
): Record<ProfessionalRole, ProfessionalPartner[]> {
  const perRole = opts?.perRole ?? 5;
  const area = Math.max(1, input.squareMeters || 85);
  const category = input.category || 'Living / Residential';
  const domain = input.domain || 'interior';

  const roles: ProfessionalRole[] = ['contractor', 'architect', 'designer'];
  const out: Record<ProfessionalRole, ProfessionalPartner[]> = {
    contractor: [],
    architect: [],
    designer: [],
  };

  for (const role of roles) {
    const pool = PROFESSIONAL_PARTNERS.filter(p => p.role === role)
      .map(p => ({ p, sc: scorePartner(p, area, category, domain) }))
      .sort((a, b) => {
        const oa = a.p.pickOrder ?? 1000;
        const ob = b.p.pickOrder ?? 1000;
        if (oa !== ob) return oa - ob;
        return b.sc - a.sc;
      })
      .map(({ p }) => p);
    out[role] = pool.slice(0, perRole);
  }

  const shreStudio = PROFESSIONAL_PARTNERS.find(p => p.id === 'shre-studio');
  if (shreStudio) {
    const rest = out.architect.filter(p => p.id !== 'shre-studio');
    out.architect = [shreStudio, ...rest].slice(0, perRole);
  }

  return out;
}
