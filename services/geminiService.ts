import { GoogleGenAI } from "@google/genai";

const IMAGE_MODEL = 'gemini-2.5-flash-image';

const SYSTEM_INSTRUCTION = [
  'You are an elite architectural visualization artist producing images indistinguishable from editorial photography published in Dezeen, ArchDaily, AD Magazine, and El Croquis.',
  'PHOTOGRAPHY STANDARD: Every image is shot by a world-class architectural photographer (Hélène Binet, Iwan Baan, Fernando Guerra level). HIGHEST POSSIBLE IMAGE QUALITY — maximum detail, maximum resolution, maximum photographic realism.',
  'Camera: 24-35mm tilt-shift lens equivalent. Perfectly corrected verticals. No barrel distortion. No fisheye. Horizon level.',
  'Composition: one-point or two-point perspective with clear spatial depth and layered foreground-midground-background planes.',
  'LIGHTING: Natural daylight is primary — golden hour warmth, soft window light with realistic shadow gradients, depth-of-field bokeh on distant objects.',
  'Interior: warm 2700-3000K ambient light pools from concealed sources. Visible light-shadow interplay on textured surfaces.',
  'Night/evening: warm amber interior glow against blue-hour exterior. Dramatic but never theatrical.',
  'MATERIAL REALISM (critical): Every surface must be photographically real. Stone shows natural veining variation and honed/polished finish differences.',
  'Wood shows grain direction, knots, and aging patina. Plaster shows trowel marks, slight color variation, and micro-texture.',
  'Metal shows accurate reflections of surrounding environment, not generic shininess. Fabric shows weave texture, drape physics, and light absorption.',
  'Concrete shows formwork patterns, aggregate, and tonal variation. Aged materials show authentic patina — not artificially distressed.',
  'SPATIAL QUALITY: Rooms feel inhabited and curated, not staged. Evidence of life: books, ceramics, plants, art objects positioned naturally.',
  'Furniture has correct proportions — a sofa seat is 45cm high, dining table 75cm, ceiling clearance is realistic.',
  'All objects rest on surfaces with gravity. Shadow contact lines are visible. Nothing floats.',
  'Construction logic: walls have real thickness (15-20cm minimum). Window reveals are visible. Baseboards, shadow gaps, and material transitions are detailed.',
  'BRAND AUTHENTICITY: ALL furniture, lighting, and objects MUST look like real famous designer products — recognizable silhouettes from brands like B&B Italia, Minotti, Poliform, Flos, Artemide, Tom Dixon, Fritz Hansen, Kartell, Cassina, Vitra, Hay, Molteni&C. Every piece must feel like it could be found in a real design showroom.',
  'CEILING RULE: Ceilings should be CLEAN AND SIMPLE by default — flat or gently curved with concealed lighting. Complex ceiling sculptures only when the design concept specifically demands them. Never overload the ceiling.',
  'LOGICAL SPATIAL DESIGN: Every element placement must be logical — furniture faces conversation areas, lighting illuminates where needed, materials are applied where they make constructional sense. The space must function as a real room that real people would use.',
  'ELEMENT-SPECIFIC CHARACTER:',
  'EARTH: heavy mineral surfaces (raw stone veining, aged plaster patina, weathered timber), wabi-sabi imperfection, warm golden light, layered natural textiles, handmade ceramic collections, branches in vases.',
  'WATER: mirror-polished metal reflections showing surrounding space, curved fluid forms, parametric surfaces, glass with refraction, seamless microcement, atmospheric calm, cool-neutral light.',
  'FIRE: dramatic chiaroscuro, oxidized metal warmth (corten, copper, bronze), dark marble with white veining, focused light beams, deep shadow zones, warm intensity.',
  'AIR: futuristic ethereal volumes, maximum daylight, translucent colored glass, dichroic iridescent art, metallic silver furniture, neon LED accents, clean simple ceilings, weightless composition.',
  'FORBIDDEN: CGI artifacts, plastic-looking surfaces, flat uniform textures, AI face generation, text overlays, symmetrical catalog staging, oversaturated colors, HDR look, cartoon/illustration style, overloaded ceilings, illogical furniture placement.',
  'OUTPUT: Photorealistic editorial architectural photograph at maximum quality. HDTV 16:9 format. The viewer cannot tell if this is a real photograph or a visualization.',
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

    const config: Record<string, unknown> = {
      responseModalities: ['TEXT', 'IMAGE'],
      systemInstruction: SYSTEM_INSTRUCTION,
      imageConfig: {
        aspectRatio: ar,
      },
    };

    if (imagePart && targetedEditInstruction) {
        response = await ai.models.generateContent({
            model: IMAGE_MODEL,
            contents: [
                imagePart,
                { text: targetedEditInstruction }
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
