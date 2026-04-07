import { Vector4, Element } from '../types';
import { ELEMENTS } from '../constants';

interface ElementProfile {
  atmospherePhrases: string[];
  formPhrases: string[];
  lightPhrases: string[];
  materialBehaviorPhrases: string[];
  contrastPhrases: string[];
}

// Structural references — not decorative tags. Translate to: geometry, material weight, lighting, spatial hierarchy
const DICTIONARY: Record<Element, ElementProfile> = {
  earth: {
    atmospherePhrases: ["brutalist massing logic", "thick mineral surfaces", "grounded composition", "anchored quiet strength"],
    formPhrases: ["honed travertine flooring, lime plaster walls", "thick boundary conditions", "horizontal anchoring", "solid composed mass"],
    lightPhrases: ["deep shadows", "absorbed light", "controlled apertures", "subdued ambient"],
    materialBehaviorPhrases: ["honed travertine, lime plaster, clay plaster", "thick mineral surfaces", "grounded composition", "warm mineral tactile finishes"],
    contrastPhrases: ["low contrast depth", "shadow dominance"]
  },
  fire: {
    atmospherePhrases: ["moody cinematic warmth", "oxidized material drama", "dark luxurious intensity", "warm-dark architectural tension"],
    formPhrases: ["monumental contrast planes", "directional hierarchy", "deep portal entries", "sharp metal-against-stone edges"],
    lightPhrases: ["dramatic chiaroscuro", "warm amber on corten/copper", "dark track spot lighting", "controlled light blades through slots"],
    materialBehaviorPhrases: ["corten steel rust patina, nero marquina marble, oxidized copper, polished aged brass, dark herringbone parquet", "warm oxidized metals against dark stone", "blackened steel frames", "high-contrast material layering"],
    contrastPhrases: ["warm rust against dark charcoal", "polished gold against matte black", "oxidized mass against precise metal edge"]
  },
  water: {
    atmospherePhrases: ["liquid metallic reflections", "fluid spatial immersion", "sculptural chrome surfaces", "atmospheric reflective depth"],
    formPhrases: ["organic curved forms", "fluid sculptural counters", "parametric shell structures", "tubular chrome arches"],
    lightPhrases: ["reflected multiplied light on polished steel", "diffused glow on curved surfaces", "ambient chrome reflections", "soft luminous depth through metal and glass"],
    materialBehaviorPhrases: ["mirror-polished stainless steel panels and counters", "hammered rippled metal surfaces", "satin chrome fixtures", "glass blocks with soft glow", "microcement seamless floors", "bouclé and cream textiles against chrome", "curved bent glass partitions"],
    contrastPhrases: ["cold reflective metal against soft textile warmth", "polished chrome against matte mineral surface"]
  },
  air: {
    atmospherePhrases: ["futuristic ethereal luminosity", "forward-looking iridescent minimalism", "flowing wave-form architecture with translucent colored glass", "cosmic spatial clarity with dichroic shimmer"],
    formPhrases: ["undulating white ceiling sculptures with layered ridges", "tinted translucent glass partitions in violet-amber gradient", "metallic silver furniture with rounded tubular futuristic forms", "3D textured white wall panels with geometric relief and shadow play"],
    lightPhrases: ["abundant daylight flooding through floor-to-ceiling glass", "neon LED accent lines in soft violet tracing architectural reveals", "dichroic glass refracting rainbow light spectrums across white surfaces", "concealed LED tracing every curved ceiling form with cool-white glow"],
    materialBehaviorPhrases: ["white Corian curved seamless counters, dichroic/iridescent glass art installations, metallic silver furniture", "tinted translucent glass partitions, 3D textured white panels, hammered metallic silver surfaces", "neon LED accent tubes, frosted colored glass, white marble floors with grey veining", "futuristic white base with iridescent/translucent/metallic accents — natural wood welcome for warmth balance"],
    contrastPhrases: ["futuristic iridescent shimmer against pure white architecture", "metallic silver softness against translucent colored glass drama"]
  }
};

/** Largest-remainder allocation so phrase counts track percentages (incl. near-equal quads). */
const allocateProportionalSlots = (dist: Vector4, totalSlots: number, minPct = 5): Record<Element, number> => {
  const slots: Record<Element, number> = { earth: 0, fire: 0, water: 0, air: 0 };
  const active = ELEMENTS.filter((el) => dist[el] >= minPct);
  if (active.length === 0 || totalSlots <= 0) return slots;

  const sumW = active.reduce((s, el) => s + dist[el], 0) || 1;
  const raw = active.map((el) => (dist[el] / sumW) * totalSlots);
  const floors = active.map((el, i) => {
    const f = Math.floor(raw[i]);
    slots[el] = f;
    return { el, frac: raw[i] - f };
  });
  let remainder = totalSlots - active.reduce((s, el) => s + slots[el], 0);
  floors.sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < remainder; k++) slots[floors[k % floors.length].el]++;

  return slots;
};

const takePhrases = (pool: string[], count: number): string[] => {
  if (count <= 0 || pool.length === 0) return [];
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(pool[i % pool.length]);
  return out;
};

export const elementLanguageProfile = (dist: Vector4): ElementProfile => {
  const combined: ElementProfile = {
    atmospherePhrases: [],
    formPhrases: [],
    lightPhrases: [],
    materialBehaviorPhrases: [],
    contrastPhrases: [],
  };

  const atmSlots = allocateProportionalSlots(dist, 8);
  const formSlots = allocateProportionalSlots(dist, 6);
  const lightSlots = allocateProportionalSlots(dist, 6);
  const matSlots = allocateProportionalSlots(dist, 8);
  const conSlots = allocateProportionalSlots(dist, 4);

  ELEMENTS.forEach((el) => {
    const dict = DICTIONARY[el];
    combined.atmospherePhrases.push(...takePhrases(dict.atmospherePhrases, atmSlots[el]));
    combined.formPhrases.push(...takePhrases(dict.formPhrases, formSlots[el]));
    combined.lightPhrases.push(...takePhrases(dict.lightPhrases, lightSlots[el]));
    combined.materialBehaviorPhrases.push(...takePhrases(dict.materialBehaviorPhrases, matSlots[el]));
    combined.contrastPhrases.push(...takePhrases(dict.contrastPhrases, conSlots[el]));
  });

  return combined;
};
