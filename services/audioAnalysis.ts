import { Element } from '../types';

export interface AudioEnergySnapshot {
  avgVolume: number;      // 0–1 average loudness
  peakVolume: number;     // 0–1 peak loudness
  avgPitch: number;       // Hz, estimated fundamental
  pitchVariance: number;  // how much pitch fluctuates
  tempo: number;          // speech pace (zero-crossing rate proxy)
  spectralCentroid: number; // brightness of sound (Hz)
  lowEnergy: number;      // bass ratio
  highEnergy: number;     // treble ratio
}

export interface AudioAnalysisResult {
  percentages: Record<Element, number>;
  energy: AudioEnergySnapshot;
  mood: string;
}

export class AudioEnergyAnalyzer {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private snapshots: AudioEnergySnapshot[] = [];
  private rafId: number | null = null;
  private onLiveUpdate?: (snapshot: AudioEnergySnapshot) => void;

  async start(onLiveUpdate?: (snapshot: AudioEnergySnapshot) => void): Promise<void> {
    this.onLiveUpdate = onLiveUpdate;
    this.snapshots = [];

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      throw new Error('Microphone access denied');
    }

    this.audioCtx = new AudioContext();
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;

    this.source = this.audioCtx.createMediaStreamSource(this.stream);
    this.source.connect(this.analyser);

    this.collectLoop();
  }

  private collectLoop = () => {
    if (!this.analyser) return;

    const bufferLength = this.analyser.frequencyBinCount;
    const freqData = new Uint8Array(bufferLength);
    const timeData = new Uint8Array(this.analyser.fftSize);

    this.analyser.getByteFrequencyData(freqData);
    this.analyser.getByteTimeDomainData(timeData);

    const snapshot = this.computeSnapshot(freqData, timeData, this.audioCtx!.sampleRate);
    this.snapshots.push(snapshot);

    if (this.onLiveUpdate) this.onLiveUpdate(snapshot);

    this.rafId = requestAnimationFrame(this.collectLoop);
  };

  private computeSnapshot(freqData: Uint8Array, timeData: Uint8Array, sampleRate: number): AudioEnergySnapshot {
    const bufLen = freqData.length;

    // Volume
    let sumFreq = 0, maxFreq = 0;
    for (let i = 0; i < bufLen; i++) {
      sumFreq += freqData[i];
      if (freqData[i] > maxFreq) maxFreq = freqData[i];
    }
    const avgVolume = (sumFreq / bufLen) / 255;
    const peakVolume = maxFreq / 255;

    // Spectral centroid (brightness)
    let weightedSum = 0, totalWeight = 0;
    for (let i = 0; i < bufLen; i++) {
      const freq = (i * sampleRate) / (bufLen * 2);
      weightedSum += freq * freqData[i];
      totalWeight += freqData[i];
    }
    const spectralCentroid = totalWeight > 0 ? weightedSum / totalWeight : 300;

    // Low vs high energy
    const midBin = Math.floor(bufLen * 0.25);
    let lowSum = 0, highSum = 0;
    for (let i = 0; i < midBin; i++) lowSum += freqData[i];
    for (let i = midBin; i < bufLen; i++) highSum += freqData[i];
    const totalEnergy = lowSum + highSum || 1;
    const lowEnergy = lowSum / totalEnergy;
    const highEnergy = highSum / totalEnergy;

    // Pitch estimate (dominant frequency bin)
    let peakBin = 0, peakVal = 0;
    for (let i = 2; i < bufLen; i++) {
      if (freqData[i] > peakVal) { peakVal = freqData[i]; peakBin = i; }
    }
    const avgPitch = (peakBin * sampleRate) / (bufLen * 2);

    // Tempo proxy via zero-crossing rate
    let zeroCrossings = 0;
    for (let i = 1; i < timeData.length; i++) {
      if ((timeData[i - 1] < 128 && timeData[i] >= 128) || (timeData[i - 1] >= 128 && timeData[i] < 128)) {
        zeroCrossings++;
      }
    }
    const tempo = zeroCrossings / timeData.length;

    const pitchVariance = 0; // computed later across snapshots

    return { avgVolume, peakVolume, avgPitch, pitchVariance, tempo, spectralCentroid, lowEnergy, highEnergy };
  }

  stop(): AudioAnalysisResult {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    if (this.source) { try { this.source.disconnect(); } catch {} }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      try { this.audioCtx.close(); } catch {}
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
    }

    return this.analyze();
  }

  private analyze(): AudioAnalysisResult {
    if (this.snapshots.length === 0) {
      return {
        percentages: { earth: 25, fire: 25, water: 25, air: 25 },
        energy: { avgVolume: 0, peakVolume: 0, avgPitch: 0, pitchVariance: 0, tempo: 0, spectralCentroid: 0, lowEnergy: 0.5, highEnergy: 0.5 },
        mood: 'Balanced & Neutral',
      };
    }

    // Aggregate across all snapshots
    const n = this.snapshots.length;
    const avg = (fn: (s: AudioEnergySnapshot) => number) =>
      this.snapshots.reduce((sum, s) => sum + fn(s), 0) / n;

    const avgVol = avg(s => s.avgVolume);
    const peakVol = Math.max(...this.snapshots.map(s => s.peakVolume));
    const avgPitch = avg(s => s.avgPitch);
    const tempoAvg = avg(s => s.tempo);
    const centroid = avg(s => s.spectralCentroid);
    const lowE = avg(s => s.lowEnergy);
    const highE = avg(s => s.highEnergy);

    // Pitch variance
    const pitches = this.snapshots.map(s => s.avgPitch).filter(p => p > 50);
    const meanPitch = pitches.length > 0 ? pitches.reduce((a, b) => a + b, 0) / pitches.length : 200;
    const pitchVar = pitches.length > 1
      ? Math.sqrt(pitches.reduce((s, p) => s + (p - meanPitch) ** 2, 0) / pitches.length)
      : 0;

    const energy: AudioEnergySnapshot = {
      avgVolume: avgVol, peakVolume: peakVol, avgPitch: meanPitch,
      pitchVariance: pitchVar, tempo: tempoAvg, spectralCentroid: centroid,
      lowEnergy: lowE, highEnergy: highE,
    };

    const scores: Record<Element, number> = { earth: 0, fire: 0, water: 0, air: 0 };

    // --- Volume → energy level ---
    if (avgVol > 0.35) { scores.fire += 3; scores.earth += 1; }
    else if (avgVol > 0.15) { scores.water += 1; scores.earth += 1; }
    else { scores.water += 2; scores.air += 2; }

    // --- Peak volume → intensity ---
    if (peakVol > 0.7) scores.fire += 2;
    else if (peakVol < 0.3) scores.air += 1.5;

    // --- Pitch → lightness vs groundedness ---
    if (meanPitch > 400) { scores.air += 3; scores.fire += 1; }
    else if (meanPitch > 250) { scores.water += 1.5; scores.air += 1; }
    else if (meanPitch > 150) { scores.earth += 1; scores.water += 1; }
    else { scores.earth += 3; }

    // --- Pitch variance → dynamic vs steady ---
    if (pitchVar > 80) { scores.fire += 2; scores.air += 1; }
    else if (pitchVar > 40) { scores.water += 1; scores.fire += 0.5; }
    else { scores.earth += 2; scores.water += 1; }

    // --- Tempo (ZCR) → pace ---
    if (tempoAvg > 0.15) { scores.fire += 2; scores.air += 1; }
    else if (tempoAvg > 0.08) { scores.air += 1; scores.water += 0.5; }
    else { scores.earth += 1.5; scores.water += 1.5; }

    // --- Spectral centroid → brightness ---
    if (centroid > 2000) { scores.air += 2; scores.fire += 1; }
    else if (centroid > 800) { scores.water += 1; scores.air += 0.5; }
    else { scores.earth += 2; }

    // --- Bass vs treble ratio ---
    if (lowE > 0.65) { scores.earth += 2; scores.fire += 0.5; }
    if (highE > 0.45) { scores.air += 1.5; scores.water += 0.5; }

    // --- Silence detection (very low volume) → air ---
    const silentSnapshots = this.snapshots.filter(s => s.avgVolume < 0.02).length;
    const silenceRatio = silentSnapshots / n;
    if (silenceRatio > 0.5) { scores.air += 2; }
    else if (silenceRatio > 0.2) { scores.water += 1; }

    // Normalize
    const total = Object.values(scores).reduce((s, v) => s + v, 0) || 1;
    const percentages: Record<Element, number> = { earth: 25, fire: 25, water: 25, air: 25 };
    (['earth', 'fire', 'water', 'air'] as Element[]).forEach(el => {
      percentages[el] = Math.round((scores[el] / total) * 100);
    });
    const sum = Object.values(percentages).reduce((s, v) => s + v, 0);
    if (sum !== 100) {
      const sorted = (['earth', 'fire', 'water', 'air'] as Element[]).sort((a, b) => percentages[b] - percentages[a]);
      percentages[sorted[0]] += 100 - sum;
    }

    // Determine mood
    const dominant = (['earth', 'fire', 'water', 'air'] as Element[]).sort((a, b) => percentages[b] - percentages[a])[0];
    const moodMap: Record<Element, string[]> = {
      earth: ['Deep & Grounded Voice', 'Steady & Anchored Tone', 'Rich & Warm Resonance'],
      fire: ['Dynamic & Passionate Energy', 'Bold & Expressive Tone', 'Intense & Driven Voice'],
      water: ['Calm & Flowing Rhythm', 'Soft & Reflective Tone', 'Gentle & Adaptive Voice'],
      air: ['Light & Open Expression', 'Ethereal & Spacious Tone', 'Clear & Elevated Voice'],
    };
    const mood = moodMap[dominant][Math.floor(Math.random() * 3)];

    return { percentages, energy, mood };
  }
}

/**
 * Merge text-based and audio-based element percentages.
 * textWeight controls how much the spoken words matter vs voice energy.
 */
export function mergeTextAndAudioPercentages(
  textPct: Record<Element, number>,
  audioPct: Record<Element, number>,
  textWeight = 0.55,
): Record<Element, number> {
  const audioWeight = 1 - textWeight;
  const merged: Record<Element, number> = { earth: 0, fire: 0, water: 0, air: 0 };

  (['earth', 'fire', 'water', 'air'] as Element[]).forEach(el => {
    merged[el] = Math.round(textPct[el] * textWeight + audioPct[el] * audioWeight);
  });

  const sum = Object.values(merged).reduce((s, v) => s + v, 0);
  if (sum !== 100) {
    const sorted = (['earth', 'fire', 'water', 'air'] as Element[]).sort((a, b) => merged[b] - merged[a]);
    merged[sorted[0]] += 100 - sum;
  }

  return merged;
}
