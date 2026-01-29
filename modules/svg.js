/**
 * SVG element utilities.
 * @module svg
 */

/** SVG namespace URI. */
export const svgNS = "http://www.w3.org/2000/svg";

export function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) continue;
    el.setAttribute(key, String(value));
  }
  return el;
}

export function clearElement(el) {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}
