/**
 * AddCustomMaterialModal — lets the user define a material that is NOT
 * in the SHRE 4E canonical catalog so it still participates in the
 * generation prompt.
 *
 * Required:
 *   - Name (free-form, e.g. "Antiqued Brass Mesh" or "Client's Marble Sample")
 *   - Primary element (one of earth / fire / water / air)
 *
 * Optional:
 *   - Surface category (stone, wood, plaster, metal, glass, ceramic,
 *     textile, concrete, composite) — used by hardware-placement logic
 *   - Reference image (data-URL) — visible on the bead + the materials panel
 *   - Placement note — "use on kitchen island front" — feeds into the
 *     prompt so the model places this material where the user wants it
 *
 * The component is intentionally controlled by a parent (`open`,
 * `onCancel`, `onSave`). Persistence lives upstream in UserState.
 */

import React, { useState, useEffect, useRef } from 'react';
import type { Element, CustomMaterial, Vector4 } from '../types';
import { ELEMENT_COLORS } from '../constants';

interface AddCustomMaterialModalProps {
  open: boolean;
  /** Optional pre-fill — used when editing an existing custom material. */
  initial?: Partial<CustomMaterial>;
  onCancel: () => void;
  onSave: (material: CustomMaterial) => void;
}

const ELEMENT_OPTIONS: Element[] = ['earth', 'fire', 'water', 'air'];

const CATEGORY_OPTIONS: { id: string; label: string }[] = [
  { id: 'stone',     label: 'Stone' },
  { id: 'wood',      label: 'Wood' },
  { id: 'plaster',   label: 'Plaster' },
  { id: 'metal',     label: 'Metal' },
  { id: 'glass',     label: 'Glass' },
  { id: 'ceramic',   label: 'Ceramic' },
  { id: 'textile',   label: 'Textile' },
  { id: 'concrete',  label: 'Concrete' },
  { id: 'composite', label: 'Composite' },
];

// Read a single uploaded image file into a base64 data-URL for in-app preview.
const readImageAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

// Build an element-weight vector pure on a single element (1.0 there, 0
// everywhere else). The picker only exposes a primary element to keep
// the UX simple — power users can edit weights in a future iteration.
const weightsFromElement = (el: Element): Vector4 => ({
  earth: el === 'earth' ? 1 : 0,
  fire:  el === 'fire'  ? 1 : 0,
  water: el === 'water' ? 1 : 0,
  air:   el === 'air'   ? 1 : 0,
});

export const AddCustomMaterialModal: React.FC<AddCustomMaterialModalProps> = ({ open, initial, onCancel, onSave }) => {
  const [name, setName] = useState(initial?.name ?? '');
  const [element, setElement] = useState<Element>(initial?.element ?? 'earth');
  const [category, setCategory] = useState<string>('');
  const [placementNote, setPlacementNote] = useState<string>(initial?.placementNote ?? '');
  const [imageDataUrl, setImageDataUrl] = useState<string>(initial?.referenceImageDataUrl ?? '');
  const [error, setError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset state when the modal is opened so it doesn't carry stale data
  // from a previous session.
  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setElement(initial?.element ?? 'earth');
      setCategory('');
      setPlacementNote(initial?.placementNote ?? '');
      setImageDataUrl(initial?.referenceImageDataUrl ?? '');
      setError('');
    }
  }, [open, initial]);

  if (!open) return null;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please pick an image file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image is over 5 MB — please pick a smaller file.');
      return;
    }
    setError('');
    try {
      const url = await readImageAsDataUrl(file);
      setImageDataUrl(url);
    } catch {
      setError('Could not read the image — please try another file.');
    }
  };

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give the material a name.');
      return;
    }
    const id = (initial?.id) ?? `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const material: CustomMaterial = {
      id,
      name: trimmed,
      element,
      elementWeights: weightsFromElement(element),
      isShared: false,
      isCustom: true,
      image: imageDataUrl || undefined,
      placementNote: placementNote.trim() || undefined,
      referenceImageDataUrl: imageDataUrl || undefined,
      createdAt: initial?.createdAt ?? Date.now(),
    };
    // Attach category info on the material if the user picked one — the
    // prompt engine reads `category` when present.
    if (category) (material as CustomMaterial & { category?: string }).category = category;
    onSave(material);
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center px-4"
      style={{ background: 'rgba(20,20,22,0.55)', backdropFilter: 'blur(6px)' }}
      onClick={onCancel}
    >
      <div
        className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl"
        style={{ border: '1px solid rgba(0,0,0,0.06)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/5">
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#999' }}>Custom Material</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#1a1a1a', letterSpacing: '-0.01em', marginTop: 2 }}>{initial?.id ? 'Edit material' : 'Add a new material'}</div>
          </div>
          <button
            onClick={onCancel}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-black/5 transition"
            aria-label="Close"
          >
            <svg width="12" height="12" viewBox="0 0 8 8" stroke="#777" strokeWidth="1.4"><line x1="1" y1="1" x2="7" y2="7" /><line x1="7" y1="1" x2="1" y2="7" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {/* Name */}
          <div>
            <label className="block text-[11px] uppercase tracking-[0.18em] font-medium text-neutral-500 mb-2">Name</label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Antiqued brass mesh"
              className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-md outline-none focus:border-neutral-400 transition"
              style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
            />
          </div>

          {/* Element */}
          <div>
            <label className="block text-[11px] uppercase tracking-[0.18em] font-medium text-neutral-500 mb-2">Primary Element</label>
            <div className="grid grid-cols-4 gap-2">
              {ELEMENT_OPTIONS.map((el) => {
                const active = element === el;
                const color = ELEMENT_COLORS[el];
                return (
                  <button
                    key={el}
                    onClick={() => setElement(el)}
                    className="flex flex-col items-center justify-center py-2 rounded-md transition"
                    style={{
                      background: active ? `${color}14` : '#fafafa',
                      border: active ? `1px solid ${color}` : '1px solid rgba(0,0,0,0.08)',
                    }}
                  >
                    <span className="w-2.5 h-2.5 rounded-full mb-1.5" style={{ background: color }} />
                    <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: active ? color : '#666' }}>{el}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Category (optional) */}
          <div>
            <label className="block text-[11px] uppercase tracking-[0.18em] font-medium text-neutral-500 mb-2">Category <span className="text-neutral-400 normal-case tracking-normal">(optional)</span></label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_OPTIONS.map((c) => {
                const active = category === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setCategory(active ? '' : c.id)}
                    className="px-2.5 py-1 rounded-full transition"
                    style={{
                      background: active ? '#1a1a1a' : 'transparent',
                      border: active ? '1px solid #1a1a1a' : '1px solid rgba(0,0,0,0.12)',
                      color: active ? '#fff' : '#444',
                      fontSize: 11,
                      fontWeight: 500,
                    }}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Image upload */}
          <div>
            <label className="block text-[11px] uppercase tracking-[0.18em] font-medium text-neutral-500 mb-2">Reference image <span className="text-neutral-400 normal-case tracking-normal">(optional)</span></label>
            <div className="flex items-center gap-3">
              <div
                className="w-16 h-16 rounded-md flex items-center justify-center overflow-hidden shrink-0"
                style={{
                  background: imageDataUrl ? 'transparent' : '#fafafa',
                  border: '1px dashed rgba(0,0,0,0.15)',
                }}
              >
                {imageDataUrl ? (
                  <img src={imageDataUrl} alt="preview" className="w-full h-full object-cover" />
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="M21 15l-5-5L5 21" /></svg>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 text-xs font-medium rounded-md transition"
                  style={{ background: '#1a1a1a', color: '#fff' }}
                >
                  {imageDataUrl ? 'Replace image' : 'Upload image'}
                </button>
                {imageDataUrl && (
                  <button
                    onClick={() => setImageDataUrl('')}
                    className="px-3 py-1 text-[11px] text-neutral-500 hover:text-neutral-800 transition"
                  >
                    Remove
                  </button>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
            </div>
          </div>

          {/* Placement note */}
          <div>
            <label className="block text-[11px] uppercase tracking-[0.18em] font-medium text-neutral-500 mb-2">Where should this material go? <span className="text-neutral-400 normal-case tracking-normal">(optional)</span></label>
            <textarea
              value={placementNote}
              onChange={(e) => setPlacementNote(e.target.value)}
              placeholder="e.g. kitchen island front panel, feature wall behind sofa, fireplace surround…"
              rows={3}
              className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-md outline-none focus:border-neutral-400 transition resize-none"
              style={{ fontFamily: "'IBM Plex Sans', sans-serif", lineHeight: 1.5 }}
            />
            <div className="text-[11px] text-neutral-500 mt-1.5 leading-snug">
              The generator will read this and try to place the material exactly where you describe it.
            </div>
          </div>

          {error && (
            <div className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-black/5 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 transition rounded-md"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="px-4 py-2 text-sm font-medium rounded-md transition"
            style={{
              background: name.trim() ? '#1a1a1a' : '#cccccc',
              color: '#fff',
              cursor: name.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            {initial?.id ? 'Save changes' : 'Add material'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddCustomMaterialModal;
