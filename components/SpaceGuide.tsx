import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { speak, stopSpeaking, muteSpeech, unmuteSpeech } from '../services/soundService';

interface GuideStep {
  id: string;
  message: string;
  delay: number;
}

const WORKSPACE_STEPS: GuideStep[] = [
  {
    id: 'welcome',
    message: "Welcome to the Space Energy calibration system. I'll guide you through the interface. This tool translates elemental forces into spatial design — think of it as composing the DNA of your interior.",
    delay: 3000,
  },
  {
    id: 'core-explain',
    message: "At the center you see the core nucleus. This sphere represents the dominant energy of your space. Its color changes based on which element is strongest — warm tones for Earth and Fire, cool tones for Water and Air.",
    delay: 20000,
  },
  {
    id: 'how-to-rotate',
    message: "To change the balance, rotate the inner ring. You can scroll your mouse wheel over the diagram, or click and drag the ring directly. As you rotate, the percentage distribution of elements shifts continuously between ten and sixty-five percent.",
    delay: 38000,
  },
  {
    id: 'elements-meaning',
    message: "Each element shapes the character of your space. Earth brings raw materials like stone and wood. Fire adds intensity with copper and charred surfaces. Water introduces reflective calm with glass and marble. Air opens the space with light fabrics and transparent surfaces.",
    delay: 55000,
  },
  {
    id: 'brilliant-zone',
    message: "The Brilliant Zone is a key concept. When your elements reach a specific harmonic ratio — typically one dominant element around forty-five percent, a reinforcing element near twenty-five, and a supporting element around fifteen — the system recognizes an optimal composition. The core dial turns green and the Jupiter indicator at the top left will signal Brilliant Zone. This means your combination produces a cohesive, professionally balanced design.",
    delay: 72000,
  },
  {
    id: 'materials-ring',
    message: "The middle ring contains material beads. Click any bead to select or deselect a specific material. Materials are grouped by element — for example, Earth offers concrete, terracotta, and oak, while Water provides marble, dark glass, and polished stone. You can select up to seven materials total.",
    delay: 95000,
  },
  {
    id: 'atmosphere-ring',
    message: "The outer ring controls atmosphere — abstract qualities like warmth, tension, serenity, or luminosity. These descriptors guide the AI when generating your visualization.",
    delay: 112000,
  },
  {
    id: 'references',
    message: "At the bottom left, the moon button opens reference presets. These are professionally calibrated starting points — each one sets an optimal element ratio with its own signature name and concept. Try one to see how a balanced composition looks.",
    delay: 126000,
  },
  {
    id: 'diagnostic',
    message: "The planet at the top left is the diagnostic panel. Click it to see the current state of your composition, toggle Brilliant Mode on or off, and access the Generate function when you're ready to create your visualization.",
    delay: 140000,
  },
  {
    id: 'generate',
    message: "When you're satisfied with your calibration, press Generate. The system will translate your elemental composition, selected materials, and atmosphere into a fully realized interior concept. Take your time — the best designs come from thoughtful exploration.",
    delay: 155000,
  },
];

const GENERATE_STEPS: GuideStep[] = [
  {
    id: 'gen-welcome',
    message: "Your space has been generated based on your elemental calibration. The visualization reflects every choice you made — the element balance, materials, and atmosphere. Explore the different zones by clicking highlighted points on the image.",
    delay: 3000,
  },
  {
    id: 'gen-dna',
    message: "On the right side, the Material DNA panel shows your elemental breakdown — the percentages that define this design's unique character. This is your spatial fingerprint.",
    delay: 20000,
  },
  {
    id: 'gen-zoom',
    message: "Click the main image to zoom in and examine surface details and material textures. Use the navigation arrows to browse alternative interpretations. You can return to calibration at any time to adjust and regenerate.",
    delay: 35000,
  },
];

const ROTATION_PHRASES = [
  "Nice flow — you're finding a rhythm with the elements.",
  "That's a beautiful shift. Keep exploring, you're doing great.",
  "I like where this is going — the balance feels intentional.",
  "Interesting choice. The energy is responding to you.",
  "You've got a natural feel for this. The composition is evolving nicely.",
  "That combination is intriguing — try scrolling a bit more to refine it.",
  "Great instinct. The spatial character is really coming together.",
  "You're close to something special — the harmony is building.",
];

export const SpaceGuide: React.FC = () => {
  const location = useLocation();
  const [speaking, setSpeaking] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [rotationCount, setRotationCount] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const cancelSpeechRef = useRef<(() => void) | null>(null);
  const playedRef = useRef<Set<string>>(new Set());
  const isWorkspace = location.pathname === '/core';
  const isGenerate = location.pathname === '/generate';

  const dismissedRef = useRef(dismissed);
  dismissedRef.current = dismissed;

  const sayStep = useCallback((step: GuideStep) => {
    if (dismissedRef.current || playedRef.current.has(step.id)) return;
    playedRef.current.add(step.id);
    setSpeaking(true);
    cancelSpeechRef.current = speak(step.message, () => setSpeaking(false));
  }, []);

  const sayText = useCallback((text: string) => {
    if (dismissedRef.current) return;
    setSpeaking(true);
    cancelSpeechRef.current = speak(text, () => setSpeaking(false));
  }, []);

  const startGuideSteps = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    playedRef.current.clear();
    const steps = isWorkspace ? WORKSPACE_STEPS : isGenerate ? GENERATE_STEPS : [];
    steps.forEach(step => {
      const t = setTimeout(() => sayStep(step), step.delay);
      timersRef.current.push(t);
    });
  }, [isWorkspace, isGenerate, sayStep]);

  const startGuideStepsRef = useRef(startGuideSteps);
  startGuideStepsRef.current = startGuideSteps;

  useEffect(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    stopSpeaking();
    setSpeaking(false);
    setRotationCount(0);

    const enabledKey = `guide_voice_enabled_${location.pathname}`;
    if (sessionStorage.getItem(enabledKey)) {
      setDismissed(false);
      unmuteSpeech();
      setTimeout(() => startGuideStepsRef.current(), 200);
    } else {
      setDismissed(true);
      muteSpeech();
    }

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      stopSpeaking();
    };
  }, [location.pathname]);

  useEffect(() => {
    if (!isWorkspace) return;
    const handler = () => setRotationCount(c => c + 1);
    window.addEventListener('space-guide-rotation', handler);
    return () => window.removeEventListener('space-guide-rotation', handler);
  }, [isWorkspace]);

  useEffect(() => {
    if (rotationCount > 0 && rotationCount % 18 === 0 && !dismissed && !speaking) {
      const msg = ROTATION_PHRASES[Math.floor(Math.random() * ROTATION_PHRASES.length)];
      sayText(msg);
    }
  }, [rotationCount, dismissed, speaking, sayText]);

  useEffect(() => {
    const handleDismiss = () => {
      muteSpeech();
      setSpeaking(false);
      setDismissed(true);
      dismissedRef.current = true;
      sessionStorage.removeItem(`guide_voice_enabled_${location.pathname}`);
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
    const handleEnable = () => {
      unmuteSpeech();
      sessionStorage.setItem(`guide_voice_enabled_${location.pathname}`, '1');
      setDismissed(false);
      dismissedRef.current = false;
      startGuideSteps();
    };
    const handleToggle = () => {
      if (dismissed) handleEnable();
      else handleDismiss();
    };
    window.addEventListener('guide-voice-dismiss', handleDismiss);
    window.addEventListener('guide-voice-enable', handleEnable);
    window.addEventListener('guide-voice-toggle', handleToggle);
    return () => {
      window.removeEventListener('guide-voice-dismiss', handleDismiss);
      window.removeEventListener('guide-voice-enable', handleEnable);
      window.removeEventListener('guide-voice-toggle', handleToggle);
    };
  }, [dismissed, location.pathname, startGuideSteps]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('guide-voice-state', { detail: { dismissed, speaking } }));
  }, [dismissed, speaking]);

  if (!isWorkspace && !isGenerate) return null;
  return null;
};

export default SpaceGuide;
