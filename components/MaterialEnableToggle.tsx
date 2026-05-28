import React from 'react';

interface MaterialEnableToggleProps {
  enabled: boolean;
  color: string;
  onToggle: (e: React.MouseEvent) => void;
  title?: string;
  size?: number;
}

/**
 * Minimal on/off control for a selected material — filled dot = active in
 * generation, hollow ring = paused (still visible in the orbit).
 */
export const MaterialEnableToggle: React.FC<MaterialEnableToggleProps> = ({
  enabled,
  color,
  onToggle,
  title,
  size = 14,
}) => (
  <button
    type="button"
    onClick={onToggle}
    title={
      title
      ?? (enabled
        ? 'აქტიური გენერაციაში · active — click to pause'
        : 'გათიშული · paused — click to include')
    }
    className="shrink-0 flex items-center justify-center rounded-full transition-all duration-200 hover:scale-110"
    style={{
      width: size,
      height: size,
      background: enabled ? color : 'transparent',
      border: `1.5px solid ${enabled ? color : 'rgba(0,0,0,0.22)'}`,
      boxShadow: enabled ? `0 0 0 2px ${color}22` : 'none',
      opacity: enabled ? 1 : 0.55,
    }}
    aria-pressed={enabled}
    aria-label={enabled ? 'Material active' : 'Material paused'}
  />
);
