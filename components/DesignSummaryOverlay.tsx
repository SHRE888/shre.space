import React, { useState, useEffect } from 'react';

interface DesignSummaryOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  bullets: string[];
}

export const DesignSummaryOverlay: React.FC<DesignSummaryOverlayProps> = ({
  isOpen, onClose, onConfirm, bullets
}) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 z-[100] bg-black/20 backdrop-blur-md flex items-center justify-center p-3 sm:p-8 transition-opacity duration-400 ${visible ? 'opacity-100' : 'opacity-0'}`}>
      <div className={`bg-white w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] max-h-[90dvh] transition-all duration-500 ${visible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-2'}`}>

        {/* Header */}
        <div className="px-4 sm:px-8 py-4 sm:py-6 border-b border-gray-50 flex justify-between items-center gap-3">
          <div className="min-w-0">
            <h2 className="text-[14px] sm:text-[19px] uppercase tracking-[0.3em] sm:tracking-[0.6em] font-semibold text-black">Design Brief</h2>
            <p className="text-[11px] sm:text-[13px] text-gray-300 uppercase tracking-[0.15em] sm:tracking-[0.3em] mt-1 sm:mt-1.5 font-light">Ready for Visualization</p>
          </div>
          <button
            onClick={onClose}
            className="text-[12px] sm:text-[13px] uppercase tracking-[0.2em] sm:tracking-[0.3em] text-gray-300 hover:text-black font-medium px-2 sm:px-3 py-1.5 rounded-md hover:bg-gray-50 transition-all shrink-0 touch-target-auto"
          >
            Close
          </button>
        </div>

        {/* Content */}
        <div className="px-4 sm:px-8 py-4 sm:py-6 overflow-y-auto custom-scroll flex-1">
          <div className="space-y-3 sm:space-y-4">
            {bullets.map((bullet, idx) => {
              const colonIdx = bullet.indexOf(':');
              const title = colonIdx > -1 ? bullet.slice(0, colonIdx) : null;
              const content = colonIdx > -1 ? bullet.slice(colonIdx + 1).trim() : bullet;
              return (
                <div
                  key={idx}
                  className="flex items-start gap-3 sm:gap-5 animate-fade-in-up"
                  style={{ animationDelay: `${idx * 60}ms` }}
                >
                  <span className="text-[13px] sm:text-[16px] font-light text-gray-200 tracking-[0.2em] w-5 sm:w-6 shrink-0 mt-0.5 font-mono tabular-nums">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <div className="text-[13px] sm:text-[19px] leading-[1.6] sm:leading-[1.8]">
                    {title ? (
                      <>
                        <span className="uppercase tracking-[0.15em] sm:tracking-[0.2em] font-medium text-black">{title}:</span>
                        <span className="text-gray-500 ml-1 sm:ml-2 font-light">{content}</span>
                      </>
                    ) : (
                      <span className="text-gray-500 font-light">{content}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-50 flex justify-between items-center gap-3">
          <button
            onClick={onClose}
            className="text-[11px] sm:text-[13px] uppercase tracking-[0.15em] sm:tracking-[0.3em] text-gray-300 hover:text-black font-medium transition-all px-2 sm:px-3 py-1.5 rounded-md hover:bg-gray-50 touch-target-auto"
          >
            Refine Further
          </button>
          <button
            onClick={onConfirm}
            className="px-6 sm:px-10 py-3 sm:py-3.5 bg-gray-900 text-white rounded-lg text-[13px] sm:text-[16px] uppercase tracking-[0.2em] sm:tracking-[0.4em] font-medium hover:bg-black transition-all active:scale-[0.97] shadow-md hover:shadow-lg touch-target-auto"
          >
            Visualize Now
          </button>
        </div>

      </div>
    </div>
  );
};
