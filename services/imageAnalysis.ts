import { Element } from '../types';

interface RGB { r: number; g: number; b: number }
interface HSL { h: number; s: number; l: number }

function rgbToHsl({ r, g, b }: RGB): HSL {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: h * 360, s, l };
}

function colorWarmth({ r, g, b }: RGB): number {
  return (r * 1.2 + g * 0.3 - b * 0.8) / 255;
}

function extractDominantColors(imageData: ImageData, sampleCount = 12): RGB[] {
  const { data, width, height } = imageData;
  const pixels: RGB[] = [];
  const step = Math.max(1, Math.floor((width * height) / 5000));

  for (let i = 0; i < data.length; i += step * 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 128) continue;
    pixels.push({ r, g, b });
  }

  if (pixels.length === 0) return [{ r: 128, g: 128, b: 128 }];

  // K-means clustering
  let centroids: RGB[] = [];
  for (let i = 0; i < sampleCount; i++) {
    centroids.push(pixels[Math.floor(Math.random() * pixels.length)]);
  }

  for (let iter = 0; iter < 10; iter++) {
    const clusters: RGB[][] = centroids.map(() => []);
    for (const px of pixels) {
      let minDist = Infinity, closest = 0;
      for (let c = 0; c < centroids.length; c++) {
        const d = (px.r - centroids[c].r) ** 2 + (px.g - centroids[c].g) ** 2 + (px.b - centroids[c].b) ** 2;
        if (d < minDist) { minDist = d; closest = c; }
      }
      clusters[closest].push(px);
    }
    centroids = clusters.map((cl, i) => {
      if (cl.length === 0) return centroids[i];
      return {
        r: Math.round(cl.reduce((s, p) => s + p.r, 0) / cl.length),
        g: Math.round(cl.reduce((s, p) => s + p.g, 0) / cl.length),
        b: Math.round(cl.reduce((s, p) => s + p.b, 0) / cl.length),
      };
    });
  }

  return centroids.sort((a, b) => {
    const la = 0.299 * a.r + 0.587 * a.g + 0.114 * a.b;
    const lb = 0.299 * b.r + 0.587 * b.g + 0.114 * b.b;
    return lb - la;
  });
}

function mapColorToElements(color: RGB): Record<Element, number> {
  const hsl = rgbToHsl(color);
  const warmth = colorWarmth(color);
  const scores: Record<Element, number> = { earth: 0, fire: 0, water: 0, air: 0 };

  // Hue-based mapping
  const h = hsl.h;
  if (h < 30 || h > 340) {
    // Red-orange zone → fire
    scores.fire += 3;
    scores.earth += 1;
  } else if (h >= 30 && h < 70) {
    // Orange-yellow → earth + fire
    scores.earth += 2.5;
    scores.fire += 1.5;
  } else if (h >= 70 && h < 150) {
    // Yellow-green → earth + water
    scores.earth += 2;
    scores.water += 1;
  } else if (h >= 150 && h < 210) {
    // Cyan-teal → water
    scores.water += 3;
    scores.air += 1;
  } else if (h >= 210 && h < 270) {
    // Blue → water + air
    scores.water += 2;
    scores.air += 2;
  } else if (h >= 270 && h < 340) {
    // Purple-magenta → air + fire
    scores.air += 2;
    scores.fire += 1.5;
  }

  // Saturation mapping
  if (hsl.s < 0.15) {
    // Very desaturated → air (neutral/ethereal)
    scores.air += 2;
  } else if (hsl.s > 0.6) {
    // Highly saturated → fire (intensity)
    scores.fire += 1;
  }

  // Lightness mapping
  if (hsl.l < 0.2) {
    // Very dark → earth (grounding, heavy)
    scores.earth += 2;
  } else if (hsl.l > 0.8) {
    // Very light → air (lightness, openness)
    scores.air += 2;
  } else if (hsl.l > 0.5 && hsl.l < 0.7) {
    // Mid-light → water (flow, medium)
    scores.water += 0.5;
  }

  // Warmth mapping
  if (warmth > 0.4) {
    scores.fire += 1;
    scores.earth += 0.5;
  } else if (warmth < -0.1) {
    scores.water += 1;
    scores.air += 0.5;
  }

  // Brown detection (earth signature)
  if (hsl.s > 0.1 && hsl.s < 0.7 && h > 15 && h < 50 && hsl.l < 0.55) {
    scores.earth += 2;
  }

  // Grey/silver detection (air signature)
  if (hsl.s < 0.1 && hsl.l > 0.3 && hsl.l < 0.75) {
    scores.air += 1.5;
  }

  return scores;
}

function analyzeTexture(imageData: ImageData): Record<Element, number> {
  const { data, width, height } = imageData;
  const scores: Record<Element, number> = { earth: 0, fire: 0, water: 0, air: 0 };

  let edgeCount = 0;
  let smoothCount = 0;
  const step = 3;

  for (let y = step; y < height - step; y += step * 2) {
    for (let x = step; x < width - step; x += step * 2) {
      const idx = (y * width + x) * 4;
      const idxR = (y * width + x + step) * 4;
      const idxD = ((y + step) * width + x) * 4;

      const gx = Math.abs(data[idx] - data[idxR]) + Math.abs(data[idx + 1] - data[idxR + 1]) + Math.abs(data[idx + 2] - data[idxR + 2]);
      const gy = Math.abs(data[idx] - data[idxD]) + Math.abs(data[idx + 1] - data[idxD + 1]) + Math.abs(data[idx + 2] - data[idxD + 2]);
      const edge = (gx + gy) / 6;

      if (edge > 30) edgeCount++;
      else if (edge < 8) smoothCount++;
    }
  }

  const totalSamples = Math.max(1, edgeCount + smoothCount);
  const edgeRatio = edgeCount / totalSamples;
  const smoothRatio = smoothCount / totalSamples;

  // High contrast/edges → fire (dynamic, angular)
  if (edgeRatio > 0.5) scores.fire += 2;
  else if (edgeRatio > 0.3) scores.fire += 1;

  // Smooth, low contrast → water (flowing, calm)
  if (smoothRatio > 0.6) scores.water += 2;
  else if (smoothRatio > 0.4) scores.water += 1;

  // Medium texture → earth (natural, organic)
  if (edgeRatio > 0.15 && edgeRatio < 0.4) scores.earth += 1.5;

  // Very uniform → air (clean, minimal)
  if (smoothRatio > 0.75) scores.air += 1.5;

  return scores;
}

function analyzeBrightness(imageData: ImageData): Record<Element, number> {
  const { data } = imageData;
  const scores: Record<Element, number> = { earth: 0, fire: 0, water: 0, air: 0 };
  let totalBrightness = 0;
  let pixelCount = 0;
  let darkPixels = 0;
  let brightPixels = 0;

  for (let i = 0; i < data.length; i += 16) {
    const brightness = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
    totalBrightness += brightness;
    pixelCount++;
    if (brightness < 0.25) darkPixels++;
    if (brightness > 0.75) brightPixels++;
  }

  const avgBrightness = totalBrightness / Math.max(pixelCount, 1);
  const darkRatio = darkPixels / Math.max(pixelCount, 1);
  const brightRatio = brightPixels / Math.max(pixelCount, 1);

  if (avgBrightness < 0.35) { scores.earth += 2; scores.fire += 1; }
  else if (avgBrightness > 0.65) { scores.air += 2; scores.water += 0.5; }

  if (darkRatio > 0.4) scores.earth += 1;
  if (brightRatio > 0.4) scores.air += 1.5;

  const contrast = brightRatio + darkRatio;
  if (contrast > 0.5) scores.fire += 1.5;

  return scores;
}

export interface ImageAnalysisResult {
  percentages: Record<Element, number>;
  dominantColors: string[];
  mood: string;
}

export async function analyzeImage(file: File): Promise<ImageAnalysisResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const maxDim = 400;
      const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);

      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas not supported')); return; }

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      const dominantColors = extractDominantColors(imageData, 8);

      // Aggregate scores from all analysis methods
      const totalScores: Record<Element, number> = { earth: 0, fire: 0, water: 0, air: 0 };

      // Color analysis (strongest signal)
      dominantColors.forEach((color, i) => {
        const weight = 1 / (1 + i * 0.3);
        const colorScores = mapColorToElements(color);
        (['earth', 'fire', 'water', 'air'] as Element[]).forEach(el => {
          totalScores[el] += colorScores[el] * weight;
        });
      });

      // Texture analysis
      const texScores = analyzeTexture(imageData);
      (['earth', 'fire', 'water', 'air'] as Element[]).forEach(el => {
        totalScores[el] += texScores[el] * 0.6;
      });

      // Brightness analysis
      const brightScores = analyzeBrightness(imageData);
      (['earth', 'fire', 'water', 'air'] as Element[]).forEach(el => {
        totalScores[el] += brightScores[el] * 0.4;
      });

      // Normalize to percentages
      const total = Object.values(totalScores).reduce((s, v) => s + v, 0);
      const percentages: Record<Element, number> = { earth: 25, fire: 25, water: 25, air: 25 };
      if (total > 0) {
        (['earth', 'fire', 'water', 'air'] as Element[]).forEach(el => {
          percentages[el] = Math.round((totalScores[el] / total) * 100);
        });
        // Ensure sum = 100
        const sum = Object.values(percentages).reduce((s, v) => s + v, 0);
        if (sum !== 100) {
          const sorted = (['earth', 'fire', 'water', 'air'] as Element[]).sort((a, b) => percentages[b] - percentages[a]);
          percentages[sorted[0]] += 100 - sum;
        }
      }

      // Determine dominant element and mood
      const domEl = (['earth', 'fire', 'water', 'air'] as Element[]).sort((a, b) => percentages[b] - percentages[a])[0];
      const moods: Record<Element, string[]> = {
        earth: ['Grounded & Natural', 'Warm & Organic', 'Rich & Tactile'],
        fire: ['Bold & Dynamic', 'Warm & Energetic', 'Dramatic & Intense'],
        water: ['Calm & Flowing', 'Cool & Serene', 'Fluid & Reflective'],
        air: ['Light & Open', 'Minimal & Ethereal', 'Clean & Spacious'],
      };
      const mood = moods[domEl][Math.floor(Math.random() * 3)];

      const hexColors = dominantColors.slice(0, 5).map(c =>
        `#${c.r.toString(16).padStart(2, '0')}${c.g.toString(16).padStart(2, '0')}${c.b.toString(16).padStart(2, '0')}`
      );

      URL.revokeObjectURL(url);
      resolve({ percentages, dominantColors: hexColors, mood });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}
