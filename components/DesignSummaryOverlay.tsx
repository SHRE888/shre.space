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
    <div className={`fixed inset-0 z-[100] bg-black/20 backdrop-blur-md flex items-center justify-center p-8 transition-opacity duration-400 ${visible ? 'opacity-100' : 'opacity-0'}`}>
      <div className={`bg-white w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] transition-all duration-500 ${visible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-2'}`}>

        {/* Header */}
        <div className="p-8 border-b border-gray-50 flex justify-between items-center">
          <div>
            <h2 className="text-[19px] uppercase tracking-[0.6em] font-semibold text-black">Design Brief</h2>
            <p className="text-[13px] text-gray-300 uppercase tracking-[0.3em] mt-1.5 font-light">Ready for Visualization</p>
          </div>
          <button
            onClick={onClose}
            className="text-[13px] uppercase tracking-[0.3em] text-gray-300 hover:text-black font-medium px-3 py-1.5 rounded-md hover:bg-gray-50 transition-all"
          >
            Close
          </button>
        </div>

        {/* Content */}
        <div className="p-8 overflow-y-auto custom-scroll">
          <div className="space-y-4">
            {bullets.map((bullet, idx) => {
              const colonIdx = bullet.indexOf(':');
              const title = colonIdx > -1 ? bullet.slice(0, colonIdx) : null;
              const content = colonIdx > -1 ? bullet.slice(colonIdx + 1).trim() : bullet;
              return (
                <div
                  key={idx}
                  className="flex items-start gap-5 animate-fade-in-up"
                  style={{ animationDelay: `${idx * 60}ms` }}
                >
                  <span className="text-[16px] font-light text-gray-200 tracking-[0.2em] w-6 shrink-0 mt-0.5 font-mono tabular-nums">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <div className="text-[19px] leading-[1.8]">
                    {title ? (
                      <>
                        <span className="uppercase tracking-[0.2em] font-medium text-black">{title}:</span>
                        <span className="text-gray-500 ml-2 font-light">{content}</span>
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
        <div className="p-6 border-t border-gray-50 flex justify-between items-center">
          <button
            onClick={onClose}
            className="text-[13px] uppercase tracking-[0.3em] text-gray-300 hover:text-black font-medium transition-all px-3 py-1.5 rounded-md hover:bg-gray-50"
          >
            Refine Further
          </button>
          <button
            onClick={onConfirm}
            className="px-10 py-3.5 bg-gray-900 text-white rounded-lg text-[16px] uppercase tracking-[0.4em] font-medium hover:bg-black transition-all active:scale-[0.97] shadow-md hover:shadow-lg"
          >
            Visualize Now
          </button>
        </div>

      </div>
    </div>
  );
};
