let ctx: AudioContext | null = null;

const getCtx = (): AudioContext | null => {
  if (ctx && ctx.state !== 'closed') return ctx;
  try { ctx = new AudioContext(); return ctx; } catch { return null; }
};

const resumeCtx = () => {
  const c = getCtx();
  if (c && c.state === 'suspended') c.resume();
  return c;
};

/* ═══════════════ AMBIENT MUSIC — gentle pad ═══════════════ */

let _ambientPlaying = false;
let _ambientMaster: GainNode | null = null;
let _ambientOscs: OscillatorNode[] = [];
let _ambientLFOs: OscillatorNode[] = [];
let _ambientVolume = 0.35;

const AMBIENT_NOTES = [
  { freq: 130.81, type: 'sine' as OscillatorType },
  { freq: 196.00, type: 'sine' as OscillatorType },
  { freq: 261.63, type: 'triangle' as OscillatorType },
  { freq: 329.63, type: 'sine' as OscillatorType },
  { freq: 392.00, type: 'sine' as OscillatorType },
];

const startAmbientInternal = () => {
  const c = resumeCtx();
  if (!c || _ambientPlaying) return;
  _ambientPlaying = true;

  _ambientMaster = c.createGain();
  _ambientMaster.gain.setValueAtTime(0, c.currentTime);
  _ambientMaster.gain.linearRampToValueAtTime(_ambientVolume * 0.08, c.currentTime + 3);

  const reverb = c.createBiquadFilter();
  reverb.type = 'lowpass';
  reverb.frequency.value = 1200;
  reverb.Q.value = 0.5;

  _ambientMaster.connect(reverb).connect(c.destination);

  _ambientOscs = [];
  _ambientLFOs = [];

  AMBIENT_NOTES.forEach((note, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    const lfo = c.createOscillator();
    const lfoGain = c.createGain();

    osc.type = note.type;
    osc.frequency.value = note.freq;

    lfo.type = 'sine';
    lfo.frequency.value = 0.08 + i * 0.03;
    lfoGain.gain.value = note.freq * 0.003;
    lfo.connect(lfoGain).connect(osc.frequency);

    const baseGain = 0.02 - i * 0.003;
    gain.gain.value = Math.max(baseGain, 0.005);

    osc.connect(gain).connect(_ambientMaster!);
    osc.start(c.currentTime + i * 0.8);
    lfo.start(c.currentTime);

    _ambientOscs.push(osc);
    _ambientLFOs.push(lfo);
  });
};

const stopAmbientInternal = () => {
  const c = getCtx();
  if (!c || !_ambientPlaying) return;
  _ambientPlaying = false;

  const oldMaster = _ambientMaster;
  const oldOscs = [..._ambientOscs];
  const oldLFOs = [..._ambientLFOs];
  _ambientMaster = null;
  _ambientOscs = [];
  _ambientLFOs = [];

  if (oldMaster) {
    oldMaster.gain.linearRampToValueAtTime(0, c.currentTime + 2);
  }

  setTimeout(() => {
    oldOscs.forEach(o => { try { o.stop(); } catch {} });
    oldLFOs.forEach(l => { try { l.stop(); } catch {} });
    if (oldMaster) { try { oldMaster.disconnect(); } catch {} }
  }, 2500);
};

export const isAmbientPlaying = () => _ambientPlaying;
export const startAmbient = () => startAmbientInternal();
export const stopAmbient = () => stopAmbientInternal();
export const toggleAmbient = (): boolean => {
  if (_ambientPlaying) { stopAmbientInternal(); return false; }
  startAmbientInternal();
  return true;
};
export const setAmbientVolume = (v: number) => {
  _ambientVolume = v;
  const c = getCtx();
  if (_ambientMaster && c) {
    _ambientMaster.gain.linearRampToValueAtTime(v * 0.08, c.currentTime + 0.3);
  }
};

/* ═══════════════ VOICE GUIDE (Speech Synthesis) ═══════════════ */

let _voiceReady = false;
let _speechWarmedUp = false;
let _preferredVoice: SpeechSynthesisVoice | null = null;

const initVoice = () => {
  if (typeof speechSynthesis === 'undefined') return;
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return;
  _voiceReady = true;
  const eng = voices.filter(v => v.lang.startsWith('en'));
  _preferredVoice =
    eng.find(v => /Google.*UK.*Male/i.test(v.name)) ||
    eng.find(v => /Google.*US.*Male/i.test(v.name)) ||
    eng.find(v => /Daniel/i.test(v.name)) ||
    eng.find(v => /Microsoft.*Guy/i.test(v.name)) ||
    eng.find(v => /Microsoft.*David/i.test(v.name)) ||
    eng.find(v => /Microsoft.*Mark/i.test(v.name)) ||
    eng.find(v => /Microsoft.*Ryan/i.test(v.name)) ||
    eng.find(v => /Alex/i.test(v.name) && v.lang.startsWith('en')) ||
    eng.find(v => /Aaron/i.test(v.name)) ||
    eng.find(v => /Google.*UK/i.test(v.name)) ||
    eng.find(v => /Google.*US/i.test(v.name)) ||
    eng.find(v => v.lang === 'en-GB') ||
    eng.find(v => v.lang === 'en-US') ||
    eng[0] || voices[0];
};

if (typeof speechSynthesis !== 'undefined') {
  speechSynthesis.onvoiceschanged = initVoice;
  setTimeout(initVoice, 50);
  setTimeout(initVoice, 300);
  setTimeout(initVoice, 1000);
  initVoice();
}

export const warmupSpeech = () => {
  if (_speechWarmedUp || typeof speechSynthesis === 'undefined') return;
  _speechWarmedUp = true;
  initVoice();
  const utt = new SpeechSynthesisUtterance('');
  utt.volume = 0;
  try { speechSynthesis.speak(utt); } catch {}
};

if (typeof document !== 'undefined') {
  const doWarmup = () => {
    warmupSpeech();
    document.removeEventListener('click', doWarmup);
    document.removeEventListener('pointerdown', doWarmup);
    document.removeEventListener('keydown', doWarmup);
  };
  document.addEventListener('click', doWarmup, { once: true });
  document.addEventListener('pointerdown', doWarmup, { once: true });
  document.addEventListener('keydown', doWarmup, { once: true });
}

let _speakTimer: ReturnType<typeof setTimeout> | null = null;
let _currentUtt: SpeechSynthesisUtterance | null = null;

export const speak = (text: string, onEnd?: () => void): (() => void) => {
  if (!text || typeof speechSynthesis === 'undefined' || _speechMuted) {
    onEnd?.();
    return () => {};
  }
  initVoice();

  if (_speakTimer) { clearTimeout(_speakTimer); _speakTimer = null; }
  try { speechSynthesis.cancel(); } catch {}
  _currentUtt = null;

  const doSpeak = () => {
    initVoice();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 0.92;
    utt.pitch = 0.9;
    utt.volume = 0.85;
    if (_preferredVoice) utt.voice = _preferredVoice;
    utt.onend = () => { _currentUtt = null; onEnd?.(); };
    utt.onerror = () => { _currentUtt = null; onEnd?.(); };
    _currentUtt = utt;
    try { speechSynthesis.speak(utt); } catch { _currentUtt = null; onEnd?.(); }
  };

  _speakTimer = setTimeout(doSpeak, 80);

  return () => {
    if (_speakTimer) { clearTimeout(_speakTimer); _speakTimer = null; }
    _currentUtt = null;
    try { speechSynthesis.cancel(); } catch {}
  };
};

let _speechMuted = true;
export const muteSpeech = () => { _speechMuted = true; stopSpeaking(); };
export const unmuteSpeech = () => { _speechMuted = false; };
export const isSpeechMuted = () => _speechMuted;

export const stopSpeaking = () => {
  if (_speakTimer) { clearTimeout(_speakTimer); _speakTimer = null; }
  _currentUtt = null;
  if (typeof speechSynthesis !== 'undefined') {
    try { speechSynthesis.cancel(); } catch {}
    setTimeout(() => { try { speechSynthesis.cancel(); } catch {} }, 50);
    setTimeout(() => { try { speechSynthesis.cancel(); } catch {} }, 200);
  }
};

export const isSpeaking = () => _currentUtt !== null;

/* ═══════════════ UI SOUNDS — minimal, professional ═══════════════ */

export const tick = (muted?: boolean) => {
  if (muted) return;
  const c = resumeCtx();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'sine';
  o.frequency.value = 3200;
  g.gain.setValueAtTime(0.03, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.04);
  o.connect(g).connect(c.destination);
  o.start(); o.stop(c.currentTime + 0.04);
};

/* ═══════════════ ROTATION SOUNDS — per-ring, velocity-responsive ═══════════════ */

const RING_TONES: Record<string, { base: number; type: OscillatorType; harmonic: number; hType: OscillatorType }> = {
  energy: { base: 880, type: 'sine', harmonic: 1320, hType: 'sine' },
  core:   { base: 880, type: 'sine', harmonic: 1320, hType: 'sine' },
  mat:    { base: 520, type: 'triangle', harmonic: 780, hType: 'sine' },
  atmo:   { base: 340, type: 'sine', harmonic: 680, hType: 'triangle' },
};

let _rotTickCounter = 0;

export const rotationTick = (ring: string, velocity: number, muted?: boolean) => {
  if (muted) return;
  const c = resumeCtx();
  if (!c) return;
  const tone = RING_TONES[ring] || RING_TONES.energy;
  const speed = Math.min(Math.abs(velocity), 4);
  const vol = 0.02 + speed * 0.012;
  const dur = 0.05 + (1 - speed / 4) * 0.04;

  _rotTickCounter++;
  const pitchWander = Math.sin(_rotTickCounter * 0.7) * 30;

  const o = c.createOscillator();
  const g = c.createGain();
  o.type = tone.type;
  o.frequency.setValueAtTime(tone.base + pitchWander, c.currentTime);
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  o.connect(g).connect(c.destination);
  o.start(); o.stop(c.currentTime + dur);

  if (_rotTickCounter % 3 === 0) {
    const o2 = c.createOscillator();
    const g2 = c.createGain();
    o2.type = tone.hType;
    o2.frequency.value = tone.harmonic + pitchWander * 0.5;
    g2.gain.setValueAtTime(vol * 0.3, c.currentTime);
    g2.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur * 1.5);
    o2.connect(g2).connect(c.destination);
    o2.start(); o2.stop(c.currentTime + dur * 1.5);
  }
};

export const rotationStart = (ring: string, muted?: boolean) => {
  if (muted) return;
  const c = resumeCtx();
  if (!c) return;
  const tone = RING_TONES[ring] || RING_TONES.energy;

  const o = c.createOscillator();
  const g = c.createGain();
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(tone.base * 0.5, c.currentTime);
  filter.frequency.exponentialRampToValueAtTime(tone.base * 2, c.currentTime + 0.15);
  filter.Q.value = 2;
  o.type = tone.type;
  o.frequency.setValueAtTime(tone.base * 0.7, c.currentTime);
  o.frequency.exponentialRampToValueAtTime(tone.base, c.currentTime + 0.12);
  g.gain.setValueAtTime(0.04, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.18);
  o.connect(filter).connect(g).connect(c.destination);
  o.start(); o.stop(c.currentTime + 0.18);

  const bufLen = c.sampleRate * 0.12;
  const buf = c.createBuffer(1, bufLen, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) d[i] = (Math.random() * 2 - 1);
  const ns = c.createBufferSource();
  ns.buffer = buf;
  const nf = c.createBiquadFilter();
  nf.type = 'bandpass';
  nf.frequency.value = tone.base * 1.5;
  nf.Q.value = 1.5;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.015, c.currentTime);
  ng.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.12);
  ns.connect(nf).connect(ng).connect(c.destination);
  ns.start(); ns.stop(c.currentTime + 0.12);
};

export const rotationSettle = (ring: string, muted?: boolean) => {
  if (muted) return;
  const c = resumeCtx();
  if (!c) return;
  const tone = RING_TONES[ring] || RING_TONES.energy;

  [0, 0.06].forEach((delay, i) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(tone.base * (i === 0 ? 1.2 : 1), c.currentTime + delay);
    o.frequency.exponentialRampToValueAtTime(tone.base * (i === 0 ? 1 : 0.8), c.currentTime + delay + 0.2);
    g.gain.setValueAtTime(0.035, c.currentTime + delay);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + 0.25);
    o.connect(g).connect(c.destination);
    o.start(c.currentTime + delay); o.stop(c.currentTime + delay + 0.25);
  });

  const o3 = c.createOscillator();
  const g3 = c.createGain();
  o3.type = tone.hType;
  o3.frequency.value = tone.harmonic;
  g3.gain.setValueAtTime(0.02, c.currentTime + 0.08);
  g3.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.4);
  o3.connect(g3).connect(c.destination);
  o3.start(c.currentTime + 0.08); o3.stop(c.currentTime + 0.4);
};

export const calibrate = (muted?: boolean) => {
  if (muted) return;
  const c = resumeCtx();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(800, c.currentTime);
  o.frequency.exponentialRampToValueAtTime(1200, c.currentTime + 0.12);
  g.gain.setValueAtTime(0.05, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.15);
  o.connect(g).connect(c.destination);
  o.start(); o.stop(c.currentTime + 0.15);
};

export const snap = (muted?: boolean) => {
  if (muted) return;
  const c = resumeCtx();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'triangle';
  o.frequency.value = 2400;
  g.gain.setValueAtTime(0.06, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.06);
  o.connect(g).connect(c.destination);
  o.start(); o.stop(c.currentTime + 0.06);
};

export const whoosh = (muted?: boolean) => {
  if (muted) return;
  const c = resumeCtx();
  if (!c) return;
  const bufferSize = c.sampleRate * 0.25;
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1);
  const noise = c.createBufferSource();
  noise.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(600, c.currentTime);
  filter.frequency.exponentialRampToValueAtTime(2000, c.currentTime + 0.15);
  filter.Q.value = 0.8;
  const g = c.createGain();
  g.gain.setValueAtTime(0.08, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.25);
  noise.connect(filter).connect(g).connect(c.destination);
  noise.start(); noise.stop(c.currentTime + 0.25);
};

export const chime = (muted?: boolean) => {
  if (muted) return;
  const c = resumeCtx();
  if (!c) return;
  [523.25, 659.25, 783.99].forEach((freq, i) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    const t = c.currentTime + i * 0.06;
    g.gain.setValueAtTime(0.04, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(c.destination);
    o.start(t); o.stop(t + 0.3);
  });
};

export const materialize = (muted?: boolean) => {
  if (muted) return;
  const c = resumeCtx();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(200, c.currentTime);
  o.frequency.exponentialRampToValueAtTime(600, c.currentTime + 0.4);
  g.gain.setValueAtTime(0.06, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.5);
  o.connect(g).connect(c.destination);
  o.start(); o.stop(c.currentTime + 0.5);
};

export const softThud = (muted?: boolean) => {
  if (muted) return;
  const c = resumeCtx();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(120, c.currentTime);
  o.frequency.exponentialRampToValueAtTime(60, c.currentTime + 0.1);
  g.gain.setValueAtTime(0.1, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.12);
  o.connect(g).connect(c.destination);
  o.start(); o.stop(c.currentTime + 0.12);
};

export const brilliantShimmer = (muted?: boolean) => {
  if (muted) return;
  const c = resumeCtx();
  if (!c) return;
  const master = c.createGain();
  master.gain.setValueAtTime(0.012, c.currentTime);
  master.gain.linearRampToValueAtTime(0.018, c.currentTime + 0.4);
  master.gain.linearRampToValueAtTime(0, c.currentTime + 2.2);
  master.connect(c.destination);
  [392, 523.25, 659.25, 784].forEach((freq, i) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, c.currentTime);
    o.frequency.linearRampToValueAtTime(freq * 1.005, c.currentTime + 2);
    const t = c.currentTime + i * 0.15;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.3);
    g.gain.linearRampToValueAtTime(0, t + 2);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + 2.2);
  });
};
