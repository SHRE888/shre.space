/**
 * Material thumbnail map.
 *
 * Earlier revisions of this module rendered procedural SVG fallbacks (hand
 * drawn veining, grain, brushed-metal stripes…) for every catalog entry that
 * lacked a photographic texture. The user found these "lines" distracting
 * and visually unconvincing — they wanted EITHER a real photo OR a clean
 * element-coloured sphere, with absolutely no faux pattern in between.
 *
 * What this module does now:
 *  - Reads `localOverrides`, a `label → /materials/foo.png` map produced by
 *    `constants.tsx`.
 *  - Returns ONLY the labels that have a real PNG, in a STRICT 1:1 mapping.
 *  - Labels without a PNG receive no entry — the consuming UI is expected to
 *    show a plain element-coloured sphere (already handled in CoreDiagram
 *    and WorkspacePage).
 *
 * This file deliberately contains no procedural rendering, no base64
 * encoding, no `btoa`, and no SVG. All previous code paths are removed.
 */

import { CANONICAL_MATERIAL_BY_LABEL } from '../materialsCatalog';

/**
 * Build a `label → /materials/<file>.png` map filtered to keys that exist in
 * the canonical catalog. Anything not present in `localOverrides` is omitted.
 */
export function buildMaterialThumbnailMap(
  localOverrides: Record<string, string> = {},
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const label of Object.keys(CANONICAL_MATERIAL_BY_LABEL)) {
    if (localOverrides[label]) {
      out[label] = localOverrides[label];
    }
  }
  return out;
}

/**
 * Compatibility export. Always returns an empty string — callers that fell
 * back to a procedural thumbnail must now render a clean element-coloured
 * sphere instead.
 */
export function buildMaterialThumbnail(_label: string): string {
  return '';
}
