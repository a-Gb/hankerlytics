/**
 * Frontpage mosaic rendering module.
 * @module frontpage
 */

import { FRONTPAGE_PREVIEW, TILE_BASE, TILE_SIZES } from "./config.js";
import { clamp } from "./utils.js";
import { svgEl, clearElement } from "./svg.js";
import { buildTree, computeDescendants, buildVisibleTree } from "./data.js";
import { assignLaneColors } from "./color.js";
import { getCachedThread } from "./cache.js";
import { fetchThreadLimited } from "./data.js";
import {
  getTitleFont,
  getMetaFont,
  wrapTextLines,
  ellipsizeToWidth,
} from "./text.js";
import icicleLayout from "./layouts/layout-icicle.js";

/** Storage for frontpage preview states. */
const frontpagePreviews = new Map();

/** Currently loaded frontpage items. */
export let frontpageItems = [];

/** Whether we need to fit the view on next render. */
let needsFit = false;

/** Render pending flag. */
let renderPending = false;

/**
 * Set the fit-needed flag.
 * @param {boolean} value
 */
export function setNeedsFit(value) {
  needsFit = value;
}

/**
 * Get the computed preview layout for a story.
 * @param {number} id - Story ID.
 * @returns {Object|null} Layout result or null.
 */
function getPreviewLayout(id) {
  const previewState = frontpagePreviews.get(id);
  if (!previewState?.tree) return null;

  if (!previewState._layout) {
    const visibleTree = buildVisibleTree(previewState.tree, previewState);
    previewState._layout = icicleLayout.compute(visibleTree, {
      state: previewState,
    });
  }
  return previewState._layout;
}

/**
 * Create a minimal state object for preview rendering.
 * @param {number} rootId - Root story ID.
 * @returns {Object} Preview state object.
 */
export function createPreviewState(rootId) {
  return {
    nodes: new Map(),
    rootId,
    tree: null,
    treeIndex: new Map(),
    depthMap: new Map(),
    descCount: new Map(),
    subtreeSize: new Map(),
    collapsed: new Set(),
    laneColors: new Map(),
    sentiment: new Map(),
    focus: { ancestors: new Set(), descendants: new Set(), active: false },
    selectedId: rootId,
    view: { scale: 1, tx: 0, ty: 0 },
  };
}

/**
 * Hydrate a preview state from fetched items.
 * @param {Object} previewState - Preview state to hydrate.
 * @param {Array} items - Array of HN items.
 * @param {Object} options - Limit options.
 * @returns {boolean} True if tree was built successfully.
 */
export function hydratePreviewState(previewState, items, options = {}) {
  const maxNodes = Number.isFinite(options.maxNodes)
    ? options.maxNodes
    : Infinity;
  const maxDepth = Number.isFinite(options.maxDepth)
    ? options.maxDepth
    : Infinity;

  const itemsById = new Map();
  for (const item of items ?? []) {
    if (item?.id != null) itemsById.set(item.id, item);
  }

  const queue = [{ id: previewState.rootId, depth: 0 }];
  let count = 0;

  while (queue.length && count < maxNodes) {
    const entry = queue.shift();
    if (!entry) break;
    const { id, depth } = entry;
    if (previewState.nodes.has(id)) continue;
    const item = itemsById.get(id);
    if (!item) continue;

    previewState.nodes.set(id, item);
    count++;

    if (item.kids?.length && depth < maxDepth) {
      for (const kid of item.kids) {
        queue.push({ id: kid, depth: depth + 1 });
      }
    }
  }

  previewState.tree = buildTree(previewState.rootId, previewState);
  if (!previewState.tree) return false;

  computeDescendants(previewState.tree, previewState);
  assignLaneColors(previewState);
  return true;
}

/**
 * Load a single frontpage preview.
 * @param {number} id - Story ID.
 * @param {Function} scheduleRender - Callback to schedule render.
 * @param {Object} options - Loading options.
 */
export async function loadFrontpagePreview(
  id,
  scheduleRender,
  options = FRONTPAGE_PREVIEW,
) {
  if (frontpagePreviews.has(id)) {
    scheduleRender();
    return;
  }

  const previewState = createPreviewState(id);
  const cached = await getCachedThread(String(id));

  if (cached?.items) {
    const ok = hydratePreviewState(previewState, cached.items, {
      maxNodes: options.maxNodes,
      maxDepth: options.maxDepth,
    });
    if (ok) {
      frontpagePreviews.set(id, previewState);
      scheduleRender();
      return;
    }
  }

  await fetchThreadLimited(id, previewState, null, {
    maxNodes: options.maxNodes,
    maxDepth: options.maxDepth,
    concurrency: options.concurrency,
  });

  previewState.tree = buildTree(id, previewState);
  if (!previewState.tree) return;

  computeDescendants(previewState.tree, previewState);
  assignLaneColors(previewState);
  frontpagePreviews.set(id, previewState);
  scheduleRender();
}

/**
 * Load multiple previews with concurrency control.
 * @param {number[]} queue - Queue of IDs to load.
 * @param {number} concurrency - Max concurrent loads.
 * @param {Function} scheduleRender - Render callback.
 * @param {Object} options - Loading options.
 */
async function loadPreviewQueue(queue, concurrency, scheduleRender, options) {
  const inflight = new Set();

  const pump = async () => {
    while (queue.length && inflight.size < concurrency) {
      const id = queue.shift();
      if (!id) continue;
      const task = loadFrontpagePreview(id, scheduleRender, options).finally(
        () => {
          inflight.delete(task);
        },
      );
      inflight.add(task);
    }
  };

  await pump();
  while (inflight.size) {
    await Promise.race(inflight);
    await pump();
  }
}

/**
 * Load all frontpage previews with priority ordering.
 * @param {Array} items - Frontpage items.
 * @param {Function} scheduleRender - Render callback.
 */
export async function loadFrontpagePreviews(items, scheduleRender) {
  const queue = items.map((item) => item.id);
  const priority = queue.splice(0, FRONTPAGE_PREVIEW.priorityCount);

  await loadPreviewQueue(
    priority,
    FRONTPAGE_PREVIEW.queueConcurrency,
    scheduleRender,
    FRONTPAGE_PREVIEW,
  );

  if (!queue.length) return;

  const runRest = () =>
    loadPreviewQueue(
      queue,
      Math.max(2, FRONTPAGE_PREVIEW.queueConcurrency - 1),
      scheduleRender,
      FRONTPAGE_PREVIEW,
    );

  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(() => runRest());
  } else {
    setTimeout(() => runRest(), 120);
  }
}

/**
 * Set the frontpage items array.
 * @param {Array} items
 */
export function setFrontpageItems(items) {
  frontpageItems = items;
}

/**
 * Clear all frontpage previews.
 */
export function clearPreviews() {
  frontpagePreviews.clear();
}

/**
 * Render the frontpage mosaic.
 * @param {Object} ctx - Render context.
 * @param {Object} ctx.state - App state.
 * @param {HTMLElement} ctx.layer - SVG layer element.
 * @param {HTMLElement} ctx.graph - Graph container element.
 * @param {Function} ctx.applyTransform - Transform apply function.
 */
export function renderFrontpageMosaic(ctx) {
  const { state, layer, graph, applyTransform } = ctx;
  if (!layer) return;

  clearElement(layer);

  if (!frontpageItems.length) {
    const empty = svgEl("text", { x: 24, y: 40, class: "frontpage-empty" });
    empty.textContent = "Loading frontpage...";
    layer.appendChild(empty);

    if (needsFit) {
      state.view.scale = 1;
      state.view.tx = 24;
      state.view.ty = 24;
      needsFit = false;
    }
    applyTransform();
    return;
  }

  const rect = graph.getBoundingClientRect();
  const columns = Math.max(
    1,
    Math.floor(
      (rect.width + TILE_BASE.gap) / (TILE_BASE.column + TILE_BASE.gap),
    ),
  );
  const columnHeights = Array(columns).fill(0);
  const columnX = Array.from(
    { length: columns },
    (_, i) => i * (TILE_BASE.column + TILE_BASE.gap),
  );

  for (let index = 0; index < frontpageItems.length; index++) {
    const item = frontpageItems[index];
    const sizeKey =
      columns >= 2 && index < 4 ? "large" : index < 12 ? "medium" : "small";
    const size = TILE_SIZES[sizeKey];
    const span = Math.min(size.span, columns);
    const width =
      TILE_BASE.column * span + TILE_BASE.gap * Math.max(0, span - 1);

    const layout = getPreviewLayout(item.id);
    const depth = layout?.maxDepth ?? 0;
    const previewHeight = clamp(
      (depth + 1) * size.depthScale,
      size.previewMin,
      size.previewMax,
    );

    const titleFont = getTitleFont(sizeKey);
    const titleLines = wrapTextLines(item.title || "Untitled story", {
      maxWidth: width - size.padding * 2,
      maxLines: size.titleLines,
      font: titleFont,
      maxChars: Math.max(18, Math.floor((width - size.padding * 2) / 7)),
    });

    const headerHeight =
      size.padding + titleLines.length * size.headerLine + size.metaLine + 6;
    const tileHeight =
      headerHeight + previewHeight + size.previewPad * 2 + size.footer;

    // Find best column placement
    let col = 0;
    let bestY = Infinity;
    for (let i = 0; i <= columns - span; i++) {
      const slice = columnHeights.slice(i, i + span);
      const height = Math.max(...slice);
      if (height < bestY) {
        bestY = height;
        col = i;
      }
    }

    const x = columnX[col];
    const y = bestY;
    for (let i = col; i < col + span; i++) {
      columnHeights[i] = y + tileHeight + TILE_BASE.gap;
    }

    const tile = svgEl("g", {
      class: `frontpage-tile size-${sizeKey}${state.rootId === item.id ? " selected" : ""}`,
      transform: `translate(${x}, ${y})`,
    });
    tile.dataset.storyId = String(item.id);
    tile.style.pointerEvents = "all";

    // Background
    const bg = svgEl("rect", {
      class: "tile-bg",
      width,
      height: tileHeight,
      rx: 16,
      ry: 16,
    });
    tile.appendChild(bg);

    // Clip paths
    const previewY = headerHeight;
    const previewX = size.padding;
    const previewWidth = width - size.padding * 2;

    const defs = svgEl("defs");
    const headerClipId = `tile-header-${item.id}`;
    const previewClipId = `tile-preview-${item.id}`;

    const headerClip = svgEl("clipPath", {
      id: headerClipId,
      clipPathUnits: "userSpaceOnUse",
    });
    headerClip.appendChild(
      svgEl("rect", {
        x: size.padding,
        y: Math.max(0, size.padding - 2),
        width: width - size.padding * 2,
        height: Math.max(0, headerHeight - size.padding + 6),
        rx: 8,
        ry: 8,
      }),
    );
    defs.appendChild(headerClip);

    const previewClip = svgEl("clipPath", {
      id: previewClipId,
      clipPathUnits: "userSpaceOnUse",
    });
    previewClip.appendChild(
      svgEl("rect", {
        x: previewX,
        y: previewY,
        width: previewWidth,
        height: previewHeight + size.previewPad * 2,
        rx: 10,
        ry: 10,
      }),
    );
    defs.appendChild(previewClip);
    tile.appendChild(defs);

    // Header group
    const headerGroup = svgEl("g", { "clip-path": `url(#${headerClipId})` });

    const titleText = svgEl("text", {
      x: size.padding,
      y: size.padding + size.headerLine,
      class: "frontpage-title",
    });
    titleLines.forEach((line, i) => {
      const tspan = svgEl("tspan", {
        x: size.padding,
        dy: i === 0 ? 0 : size.headerLine,
      });
      tspan.textContent = line;
      titleText.appendChild(tspan);
    });
    headerGroup.appendChild(titleText);

    // Meta line
    const score = item.score ?? 0;
    const comments = item.descendants ?? item.kids?.length ?? 0;
    const author = item.by || "anonymous";
    const authorLabel = author.length > 18 ? `${author.slice(0, 16)}…` : author;
    const metaFont = getMetaFont(sizeKey);
    const metaLineRaw = `${score} pts · ${comments} cmts · ${authorLabel}`;
    const metaLine = ellipsizeToWidth(
      metaLineRaw,
      width - size.padding * 2,
      metaFont,
    );

    const meta = svgEl("text", {
      x: size.padding,
      y: size.padding + titleLines.length * size.headerLine + size.metaLine,
      class: "frontpage-meta",
    });
    meta.textContent = metaLine;
    headerGroup.appendChild(meta);
    tile.appendChild(headerGroup);

    // Preview background
    const previewBg = svgEl("rect", {
      class: "frontpage-preview-bg",
      x: previewX,
      y: previewY,
      width: previewWidth,
      height: previewHeight + size.previewPad * 2,
      rx: 12,
      ry: 12,
    });
    tile.appendChild(previewBg);

    // Preview content
    if (layout) {
      const scale = Math.min(
        previewWidth / layout.bounds.width,
        previewHeight / layout.bounds.height,
      );
      const previewGroup = svgEl("g", {
        class: "frontpage-preview-layer",
        transform: `translate(${previewX}, ${previewY + size.previewPad}) scale(${scale})`,
        "clip-path": `url(#${previewClipId})`,
      });
      icicleLayout.render(layout, {
        state: frontpagePreviews.get(item.id),
        layer: previewGroup,
      });
      tile.appendChild(previewGroup);
    } else {
      const loading = svgEl("text", {
        x: previewX + 10,
        y: previewY + 22,
        class: "frontpage-meta",
        "clip-path": `url(#${previewClipId})`,
      });
      loading.textContent = "Loading preview...";
      tile.appendChild(loading);
    }

    layer.appendChild(tile);
  }

  const mosaicWidth =
    columns * TILE_BASE.column + (columns - 1) * TILE_BASE.gap;
  const mosaicHeight = Math.max(...columnHeights) - TILE_BASE.gap + 24;
  const offsetX = Math.max(24, (rect.width - mosaicWidth) / 2);
  const offsetY = Math.max(24, (rect.height - mosaicHeight) / 2);

  if (needsFit) {
    state.view.scale = 1;
    state.view.tx = offsetX;
    state.view.ty = offsetY;
    needsFit = false;
  }
  applyTransform();
}

/**
 * Schedule a frontpage render on next animation frame.
 * @param {Object} ctx - Render context.
 */
export function scheduleFrontpageRender(ctx) {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => {
    renderPending = false;
    if (ctx.state.activeLayout === "frontpage") {
      renderFrontpageMosaic(ctx);
    }
  });
}
