/**
 * Text measurement and manipulation utilities.
 * @module text
 */

import { TITLE_FONT_SCALE, META_FONT_SCALE } from "./config.js";

let textMeasureCtx = null;
const fontCache = new Map();

/**
 * Get or create a canvas 2D context for text measurement.
 * @returns {CanvasRenderingContext2D|null}
 */
function getTextMeasureContext() {
  if (textMeasureCtx) return textMeasureCtx;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  textMeasureCtx = canvas.getContext("2d");
  return textMeasureCtx;
}

/**
 * Get the computed font string for title text at a given size.
 * @param {"large"|"medium"|"small"} sizeKey - Tile size key.
 * @returns {string} CSS font string.
 */
export function getTitleFont(sizeKey) {
  const cacheKey = `title-${sizeKey}`;
  if (fontCache.has(cacheKey)) return fontCache.get(cacheKey);
  if (typeof document === "undefined") return "600 14px sans-serif";

  const rootSize = parseFloat(
    getComputedStyle(document.documentElement).fontSize,
  );
  const fontFamily =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--sans")
      .trim() || "sans-serif";
  const scale = TITLE_FONT_SCALE[sizeKey] ?? TITLE_FONT_SCALE.medium;
  const font = `600 ${Math.max(12, rootSize * scale)}px ${fontFamily}`;

  fontCache.set(cacheKey, font);
  return font;
}

/**
 * Get the computed font string for meta text at a given size.
 * @param {"large"|"medium"|"small"} sizeKey - Tile size key.
 * @returns {string} CSS font string.
 */
export function getMetaFont(sizeKey) {
  const cacheKey = `meta-${sizeKey}`;
  if (fontCache.has(cacheKey)) return fontCache.get(cacheKey);
  if (typeof document === "undefined") return "500 11px sans-serif";

  const rootSize = parseFloat(
    getComputedStyle(document.documentElement).fontSize,
  );
  const fontFamily =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--sans")
      .trim() || "sans-serif";
  const scale = META_FONT_SCALE[sizeKey] ?? META_FONT_SCALE.medium;
  const font = `500 ${Math.max(10, rootSize * scale)}px ${fontFamily}`;

  fontCache.set(cacheKey, font);
  return font;
}

/**
 * Measure text width using canvas.
 * @param {string} text - Text to measure.
 * @param {string} font - CSS font string.
 * @returns {number} Width in pixels.
 */
export function measureTextWidth(text, font) {
  const ctx = getTextMeasureContext();
  if (!ctx || !font) return text.length * 7;
  ctx.font = font;
  return ctx.measureText(text).width;
}

/**
 * Truncate text to fit within a maximum pixel width.
 * @param {string} text - Text to truncate.
 * @param {number} maxWidth - Maximum width in pixels.
 * @param {string} font - CSS font string.
 * @returns {string} Truncated text with ellipsis if needed.
 */
export function ellipsizeToWidth(text, maxWidth, font) {
  if (!text) return text;
  if (!maxWidth || !font) return text;
  if (measureTextWidth(text, font) <= maxWidth) return text;

  let trimmed = text;
  while (trimmed.length > 1) {
    trimmed = trimmed.slice(0, -1);
    if (measureTextWidth(`${trimmed}…`, font) <= maxWidth) {
      return `${trimmed}…`;
    }
  }
  return "…";
}

/**
 * Wrap text into multiple lines with optional pixel-based measurement.
 * @param {string} text - Text to wrap.
 * @param {Object|number} options - Options object or max character count.
 * @param {number} [options.maxChars] - Maximum characters per line.
 * @param {number} [options.maxWidth] - Maximum width in pixels (requires font).
 * @param {string} [options.font] - CSS font string for pixel measurement.
 * @param {number} [options.maxLines] - Maximum number of lines.
 * @param {number} [maxLines] - Fallback max lines when options is a number.
 * @returns {string[]} Array of text lines.
 */
export function wrapTextLines(text, options, maxLines) {
  if (!text) return [];

  const opts =
    typeof options === "object" ? options : { maxChars: options, maxLines };

  const limit = opts.maxLines ?? maxLines ?? 1;
  const maxChars = opts.maxChars ?? 0;
  const maxWidth = opts.maxWidth ?? 0;
  const font = opts.font;
  const useMeasure = Boolean(maxWidth && font);

  const words = text.split(/\s+/);
  const lines = [];
  let current = "";
  let hasMore = false;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const next = current ? `${current} ${word}` : word;
    const fits = useMeasure
      ? measureTextWidth(next, font) <= maxWidth
      : next.length <= maxChars;

    if (fits) {
      current = next;
      continue;
    }

    if (current) {
      lines.push(current);
    } else {
      const clipped = useMeasure
        ? ellipsizeToWidth(word, maxWidth, font)
        : word.slice(0, Math.max(1, maxChars - 1));
      lines.push(clipped);
    }

    if (lines.length >= limit) {
      hasMore = i < words.length - 1;
      current = "";
      break;
    }
    current = word;
  }

  if (current && lines.length < limit) lines.push(current);
  if (lines.length > limit) {
    lines.length = limit;
    hasMore = true;
  }

  if (hasMore && lines.length) {
    const lastIndex = lines.length - 1;
    if (useMeasure) {
      lines[lastIndex] = ellipsizeToWidth(lines[lastIndex], maxWidth, font);
    } else if (maxChars) {
      const last = lines[lastIndex];
      lines[lastIndex] =
        last.length > maxChars - 1
          ? `${last.slice(0, maxChars - 1)}…`
          : `${last}…`;
    }
  }

  return lines;
}

/**
 * Simple text wrapping by character count (for layout use).
 * @param {string} text - Text to wrap.
 * @param {number} maxChars - Maximum characters per line.
 * @param {number} maxLines - Maximum number of lines.
 * @returns {string[]} Array of text lines.
 */
export function wrapText(text, maxChars, maxLines) {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length >= maxLines) break;
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  if (lines.length === maxLines && words.length > 1) {
    const last = lines[lines.length - 1];
    if (last.length < maxChars - 1) {
      lines[lines.length - 1] = `${last}…`;
    } else {
      lines[lines.length - 1] = `${last.slice(0, maxChars - 1)}…`;
    }
  }

  return lines;
}
