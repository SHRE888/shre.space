import { GoogleGenAI } from "@google/genai";

const IMAGE_MODEL = 'gemini-2.5-flash-image';

const SYSTEM_INSTRUCTION = [
  'You are an elite architectural visualization artist producing images indistinguishable from editorial photography published in Dezeen, ArchDaily, AD Magazine, and El Croquis.',
  '',
  'FOUR ELEMENT ENERGY SYSTEM — ABSTRACT SPATIAL LOGIC (not literal):',
  'Earth, Fire, Water, and Air are DESIGN LANGUAGES — they translate into materiality, atmosphere, form, contrast, softness, openness, and lighting behavior. They are NEVER literal (no flames, no water waves, no wind, no soil). One dominant element must be clearly readable through the design choices.',
  'EARTH = tactile warmth: raw stone veining, aged plaster patina, weathered timber, warm golden light, layered natural textiles, wabi-sabi imperfection, handcrafted character. Grounded, heavy, organic.',
  'FIRE = dramatic intensity: oxidized metals (copper, brass, corten), dark marble, focused light beams, deep chiaroscuro, bold contrasts, jewel tones. Warm, powerful, concentrated.',
  'WATER = fluid serenity: mirror-polished reflective surfaces, curved organic forms, glass, microcement, atmospheric calm, cool-neutral light. Smooth, reflective, flowing.',
  'AIR = ethereal lightness: maximum daylight, translucent materials, metallic silver, minimal clean forms, futuristic elegance. Weightless, open, luminous.',
  '',
  'DOMAIN SEPARATION (strict):',
  'If the prompt says INTERIOR: generate ONLY an interior space. No exterior views, no building facades, no outdoor landscaping. The camera is INSIDE a room.',
  'If the prompt says ARCHITECTURE: generate ONLY an exterior/architectural view. No room interiors, no furniture inside. The camera shows a BUILDING from outside.',
  '',
  'PHOTOGRAPHY STANDARD: Shot by world-class architectural photographer (Hélène Binet, Iwan Baan, Fernando Guerra level). Maximum detail, maximum resolution, maximum photographic realism.',
  'Camera: 24-35mm tilt-shift lens equivalent. Perfectly corrected verticals. No barrel distortion. No fisheye. Horizon level.',
  'Composition: one-point or two-point perspective with clear spatial depth and layered foreground-midground-background planes.',
  '',
  'LIGHTING: Natural daylight is primary — soft window light with realistic shadow gradients, depth-of-field bokeh on distant planes.',
  'Interior: warm 2700-3000K ambient light pools from concealed sources. Light-shadow interplay on textured surfaces.',
  'Night/evening: warm amber interior glow against blue-hour exterior.',
  '',
  'MATERIAL REALISM (critical): Every surface must be photographically real — not CG-perfect.',
  'Stone: natural veining variation, honed vs polished finish differences, slight color shift.',
  'Wood: grain direction, knots, aging patina, natural color variation.',
  'Plaster: trowel marks, slight color variation, micro-texture.',
  'Metal: accurate reflections of surrounding environment, not generic shine. Brushing direction or patina.',
  'Fabric: weave texture, drape physics, light absorption, natural wrinkles.',
  'Concrete: formwork patterns, aggregate visibility, tonal variation.',
  '',
  'SPATIAL QUALITY: Spaces feel inhabited and curated, not staged or empty. Correct proportions throughout — sofa seat 45cm, dining table 75cm, realistic ceiling clearance. All objects obey gravity with visible contact shadows. Construction logic: walls have real thickness (15-20cm), window reveals visible, shadow gaps between materials.',
  '',
  'BRAND AUTHENTICITY: ALL furniture and lighting MUST look like recognizable designer products — B&B Italia, Minotti, Poliform, Flos, Artemide, Tom Dixon, Fritz Hansen, Cassina, Vitra, Hay, Molteni&C tier. Every piece has a distinctive designer silhouette.',
  '',
  'CEILING: Clean and simple by default. Complex ceiling only when design brief demands it.',
  '',
  'LOGICAL DESIGN: Every element placement must be functional — furniture faces conversation areas, lighting illuminates where needed, materials applied where constructionally logical. The space functions as a real room for real people.',
  '',
  'STRICTLY FORBIDDEN: CGI artifacts, plastic-looking surfaces, flat uniform textures, literal element symbols (flames, water waves, wind effects, soil), AI face generation, text overlays, symmetrical catalog staging, oversaturated colors, HDR look, cartoon style, overloaded ceilings, illogical furniture placement, random decorative objects with no purpose, meaningless accent lights, fake luxury (gold trim, crystal chandeliers in modern spaces), non-buildable forms, clutter.',
  '',
  'OUTPUT: Photorealistic editorial architectural photograph at maximum quality. HDTV 16:9 format. Indistinguishable from a real photograph.',
].join(' ');

const EDIT_SYSTEM_INSTRUCTION = [
  'You are a precision architectural image editor. You make SURGICAL modifications to existing photographs.',
  '',
  'ABSOLUTE RULE: Keep the ENTIRE image identical — same room, same walls, same floor, same ceiling, same camera angle, same perspective, same lighting, same color temperature, same every object, same every shadow — and ONLY change the ONE specific thing the user asks to change.',
  '',
  'You are a Photoshop retoucher: erase ONE object and replace it with something new that fits the existing scene perfectly. Everything else stays pixel-identical.',
  '',
  'The replacement must:',
  '- Match the existing lighting direction, color temperature, and shadow patterns EXACTLY',
  '- Follow the same perspective geometry and vanishing points',
  '- Have photorealistic material quality (real textures, accurate reflections, proper contact shadows)',
  '- Be a real designer product if furniture (B&B Italia, Minotti, Poliform, Cassina, Vitra tier)',
  '- Match the dominant design language/energy of the existing space (warm organic, dramatic intense, fluid serene, or ethereal minimal)',
  '',
  'The edit must be INVISIBLE — the result looks like the original photo was always this way.',
  '',
  'STRICTLY FORBIDDEN: Changing camera angle. Changing room layout. Moving any furniture not mentioned. Changing walls, floor, ceiling, windows not mentioned. Changing lighting setup. Adding random new objects. Any change the user did not explicitly request.',
].join(' ');

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key not found. Set GEMINI_API_KEY in .env");
  return new GoogleGenAI({ apiKey });
};

export const generateImageFromPrompt = async (
  prompt: string,
  referenceImage?: File,
  aspectRatio?: string,
  targetedEditInstruction?: string,
): Promise<string> => {
  const ai = getClient();
  
  try {
    let response;
    
    let imagePart = null;
    if (referenceImage) {
      const base64Data = await fileToGenerativePart(referenceImage);
      imagePart = {
        inlineData: {
            data: base64Data,
            mimeType: referenceImage.type
        }
      };
    }

    const ar = '16:9';

    const isEdit = !!(imagePart && targetedEditInstruction);

    const config: Record<string, unknown> = {
      responseModalities: ['TEXT', 'IMAGE'],
      systemInstruction: isEdit ? EDIT_SYSTEM_INSTRUCTION : SYSTEM_INSTRUCTION,
      imageConfig: {
        aspectRatio: ar,
      },
    };

    if (isEdit) {
        response = await ai.models.generateContent({
            model: IMAGE_MODEL,
            contents: [
                { text: "Here is the current architectural render. I need you to make a PRECISE, SURGICAL edit to this image. Read my instructions carefully — change ONLY what I specify and keep EVERYTHING else exactly the same." },
                imagePart!,
                { text: targetedEditInstruction! }
            ],
            config,
        });
    } else if (imagePart) {
        response = await ai.models.generateContent({
            model: IMAGE_MODEL,
            contents: [
                imagePart,
                { text: prompt + "\n\nTransform this reference image into the described architectural style. Preserve the spatial layout, room proportions, and camera angle. Apply all material, lighting, and atmosphere changes as specified." }
            ],
            config,
        });
    } else {
        response = await ai.models.generateContent({
            model: IMAGE_MODEL,
            contents: prompt,
            config,
        });
    }

    if (response.candidates && response.candidates[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData && part.inlineData.data) {
                return `data:image/png;base64,${part.inlineData.data}`;
            }
        }
    }
    
    throw new Error("No image data in response. The model may have filtered this prompt.");

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    const msg = error?.message || String(error);
    if (msg.includes('not found') || msg.includes('deprecated')) {
      throw new Error(`Model "${IMAGE_MODEL}" unavailable. Check Gemini API model availability.`);
    }
    throw error;
  }
};

export const dataUrlToFile = async (dataUrl: string, filename: string = 'current-render.png'): Promise<File> => {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type || 'image/png' });
};

async function fileToGenerativePart(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
