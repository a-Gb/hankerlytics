import { clamp } from "../utils.js";
import { svgEl, clearElement } from "../svg.js";
import { getLaneColor, hexToRgba } from "../color.js";
import { isFocusNode } from "../focus.js";

const CONFIG = {
  depthHeight: 110,
  unitWidth: 12,
  cellGap: 1,
};

const SENTIMENT_COLORS = {
  positive: "#4ade80",
  negative: "#f87171",
  neutral: "#60a5fa",
  mixed: "#fbbf24",
};

function computeSizes(node) {
  let size = 1;
  for (const child of node.children) {
    size += computeSizes(child);
  }
  node.size = size;
  return size;
}

function compute(root) {
  computeSizes(root);
  const nodes = [];
  let maxDepth = 0;

  const place = (node, x, y, width) => {
    const height = CONFIG.depthHeight;
    node.x = x;
    node.y = y;
    node.width = width;
    node.height = height;
    node.cx = x + width / 2;
    node.cy = y + height / 2;
    nodes.push(node);
    maxDepth = Math.max(maxDepth, node.depth);

    if (!node.children.length) return;
    let cursor = x;
    for (const child of node.children) {
      const childWidth = (width * child.size) / node.size;
      place(child, cursor, y + height, childWidth);
      cursor += childWidth;
    }
  };

  const totalWidth = root.size * CONFIG.unitWidth;
  place(root, 0, 0, totalWidth);

  return {
    nodes,
    links: [],
    bounds: {
      width: Math.max(totalWidth, 1),
      height: (maxDepth + 1) * CONFIG.depthHeight,
    },
    maxDepth,
  };
}

function render(layout, ctx) {
  const { state, layer } = ctx;
  const fragment = document.createDocumentFragment();
  const group = svgEl("g", { class: "icicle" });
  const bandGroup = svgEl("g", { class: "icicle-bands" });
  const isFocusActive = state.focus.active;
  const isFocus = (id) => isFocusNode(state, id);

  const maxDepth = layout.maxDepth ?? 0;
  for (let depth = 0; depth <= maxDepth; depth += 1) {
    const band = svgEl("rect", {
      x: 0,
      y: depth * CONFIG.depthHeight,
      width: layout.bounds.width,
      height: Math.max(CONFIG.depthHeight, 1),
      class: "icicle-band",
    });
    bandGroup.appendChild(band);
  }
  fragment.appendChild(bandGroup);

  for (const node of layout.nodes) {
    const item = state.nodes.get(node.id);
    const height = clamp(node.height - CONFIG.cellGap, 6, node.height);
    const laneColor = getLaneColor(state, node.id);
    const fill = laneColor ? hexToRgba(laneColor, 0.28) : null;
    const stroke = laneColor ? hexToRgba(laneColor, 0.55) : null;
    const sentiment = state.sentiment?.get(node.id);
    const sentimentLabel = sentiment?.label;
    const sentimentScore =
      typeof sentiment?.score === "number" ? sentiment.score : null;
    const sentimentColor = sentimentLabel
      ? SENTIMENT_COLORS[sentimentLabel]
      : null;
    const sentimentAlpha =
      sentimentScore !== null
        ? clamp(0.25 + Math.min(Math.abs(sentimentScore), 1) * 0.45, 0.25, 0.8)
        : 0.45;
    const focusClass = isFocus(node.id) ? "" : "focus-dim";
    const ancestorClass = state.focus.ancestors.has(node.id)
      ? "focus-ancestor"
      : "";
    const descClass = state.focus.descendants.has(node.id) ? "focus-desc" : "";
    const rect = svgEl("rect", {
      x: node.x,
      y: node.y,
      width: node.width - CONFIG.cellGap,
      height,
      rx: 3,
      ry: 3,
      class: [
        "icicle-cell",
        item?.type === "story" ? "root" : "",
        item?.deleted || item?.dead ? "deleted" : "",
        sentimentLabel ? "sentiment" : "",
        sentimentLabel ? `sentiment-${sentimentLabel}` : "",
        state.selectedId === node.id ? "selected" : "",
        focusClass,
        ancestorClass,
        descClass,
      ]
        .filter(Boolean)
        .join(" "),
    });
    rect.dataset.id = String(node.id);
    if (fill) rect.style.setProperty("--lane-fill", fill);
    if (stroke) rect.style.setProperty("--lane-stroke", stroke);
    if (sentimentColor && !item?.deleted && !item?.dead) {
      rect.style.setProperty(
        "--sentiment-fill",
        hexToRgba(sentimentColor, sentimentAlpha),
      );
      rect.style.setProperty(
        "--sentiment-stroke",
        hexToRgba(sentimentColor, Math.min(sentimentAlpha + 0.2, 0.95)),
      );
    }

    const title = svgEl("title");
    const author = item?.by || "anonymous";
    const sentimentTitle = sentimentLabel
      ? ` | ${sentimentLabel}${sentimentScore !== null ? ` (${sentimentScore.toFixed(2)})` : ""}`
      : "";
    title.textContent = `${author} - ${node.size - 1} replies${sentimentTitle}`;
    rect.appendChild(title);

    group.appendChild(rect);

    const shouldLabel =
      (node.depth <= 1 || state.selectedId === node.id) &&
      node.width > 140 &&
      height > 24;
    if (shouldLabel) {
      const label = svgEl("text", {
        x: node.x + 8,
        y: node.y + Math.min(20, height - 8),
        class: "icicle-label",
      });
      const labelText =
        author.length > 18 ? `${author.slice(0, 16)}...` : author;
      label.textContent = labelText;
      group.appendChild(label);
    }
  }

  fragment.appendChild(group);
  clearElement(layer);
  layer.appendChild(fragment);
}

export default {
  id: "icicle",
  label: "Icicle",
  description: "Flame-graph style overview.",
  compute,
  render,
};
