import React from 'react';
import { HarmonySignalResult } from '../services/harmonySignal';

interface HarmonySignalProps {
  signal: HarmonySignalResult;
}

export const HarmonySignal: React.FC<HarmonySignalProps> = ({ signal }) => {
  const dotColor = {
    green: 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.3)] animate-pulse-dot',
    yellow: 'bg-amber-300',
    red: 'bg-red-300',
  }[signal.level];

  const textColor = {
    green: 'text-emerald-600',
    yellow: 'text-amber-500',
    red: 'text-red-400',
  }[signal.level];

  return (
    <div className="px-4 py-3 flex items-center gap-3 rounded-lg transition-all duration-500">
      <div className={`w-2 h-2 rounded-full transition-all duration-700 ${dotColor}`} />
      <span className={`text-[13px] uppercase tracking-[0.3em] font-medium transition-colors duration-500 ${textColor}`}>
        {signal.label}
      </span>
    </div>
  );
};
