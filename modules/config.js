/**
 * Application configuration constants.
 * @module config
 */

/** Default Hacker News item ID to load on startup. */
export const DEFAULT_ID = 46616488;

/** Default LLM model name. */
export const DEFAULT_MODEL = "nvidia/nemotron-3-nano";

/** Frontpage preview loading configuration. */
export const FRONTPAGE_PREVIEW = {
  maxNodes: 160,
  maxDepth: 5,
  concurrency: 6,
  queueConcurrency: 4,
  priorityCount: 8,
};

/** Tile grid base dimensions for frontpage mosaic. */
export const TILE_BASE = {
  column: 240,
  gap: 18,
};

/** Tile size presets for frontpage mosaic. */
export const TILE_SIZES = {
  large: {
    span: 2,
    padding: 18,
    headerLine: 20,
    metaLine: 14,
    previewPad: 12,
    footer: 22,
    titleLines: 2,
    depthScale: 26,
    previewMin: 160,
    previewMax: 260,
  },
  medium: {
    span: 1,
    padding: 16,
    headerLine: 18,
    metaLine: 13,
    previewPad: 10,
    footer: 18,
    titleLines: 2,
    depthScale: 24,
    previewMin: 120,
    previewMax: 210,
  },
  small: {
    span: 1,
    padding: 14,
    headerLine: 16,
    metaLine: 12,
    previewPad: 9,
    footer: 16,
    titleLines: 1,
    depthScale: 22,
    previewMin: 90,
    previewMax: 170,
  },
};

/** Font scaling factors for tile title text. */
export const TITLE_FONT_SCALE = {
  large: 1,
  medium: 0.88,
  small: 0.8,
};

/** Font scaling factors for tile meta text. */
export const META_FONT_SCALE = {
  large: 0.74,
  medium: 0.7,
  small: 0.62,
};

/**
 * Sentiment analysis prompt addition for LLM.
 */
export const SENTIMENT_INSTRUCTIONS = `
Also tag each comment in THREAD_DATA with sentiment.
Append a JSON object in a fenced block with the shape:
\`\`\`json
{ "sentiments": [ { "id": 123, "label": "positive|negative|neutral|mixed", "score": -1 } ] }
\`\`\`
Only include ids present in THREAD_DATA.items.
Score is a float between -1 and 1.
`.trim();
