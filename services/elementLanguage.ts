import { Vector4, Element } from '../types';

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

export const elementLanguageProfile = (dist: Vector4): ElementProfile => {
  // We aggregate phrases based on weight
  // > 40%: Primary driver (pick 2 from each category)
  // 20-40%: Support layer (pick 1 from each category)
  // 5-20%: Trace (pick 1 from atmosphere/material only)
  
  const combined: ElementProfile = {
    atmospherePhrases: [],
    formPhrases: [],
    lightPhrases: [],
    materialBehaviorPhrases: [],
    contrastPhrases: []
  };

  const elements: Element[] = ['earth', 'fire', 'water', 'air'];

  elements.forEach(el => {
    const weight = dist[el];
    const dict = DICTIONARY[el];
    
    if (weight >= 40) {
      combined.atmospherePhrases.push(...dict.atmospherePhrases.slice(0, 2));
      combined.formPhrases.push(...dict.formPhrases.slice(0, 2));
      combined.lightPhrases.push(...dict.lightPhrases.slice(0, 2));
      combined.materialBehaviorPhrases.push(...dict.materialBehaviorPhrases.slice(0, 2));
      combined.contrastPhrases.push(...dict.contrastPhrases.slice(0, 2));
    } else if (weight >= 20) {
      combined.atmospherePhrases.push(dict.atmospherePhrases[0]);
      combined.formPhrases.push(dict.formPhrases[0]);
      combined.lightPhrases.push(dict.lightPhrases[0]);
      combined.materialBehaviorPhrases.push(dict.materialBehaviorPhrases[0]);
      combined.contrastPhrases.push(dict.contrastPhrases[0]);
    } else if (weight >= 5) {
      combined.atmospherePhrases.push(dict.atmospherePhrases[2] || dict.atmospherePhrases[0]);
      combined.materialBehaviorPhrases.push(dict.materialBehaviorPhrases[2] || dict.materialBehaviorPhrases[0]);
    }
  });

  return combined;
};
