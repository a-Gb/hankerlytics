import { clamp, stripHtml } from "../utils.js";
import { svgEl, clearElement } from "../svg.js";
import { getLaneColor, hexToRgba } from "../color.js";
import { isFocusNode } from "../focus.js";
import { wrapText } from "../text.js";

const CONFIG = {
  columnWidth: 140,
  columnGap: 120,
  unitHeight: 10,
  minHeight: 12,
  nodeGap: 4,
};

const DETAIL_SCALE = 1.35;
const DETAIL_STEP = 0.35;

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
  const links = [];
  let maxDepth = 0;

  const place = (node, x, y, height) => {
    node.x = x;
    node.y = y;
    node.width = CONFIG.columnWidth;
    node.height = height;
    node.cx = x + CONFIG.columnWidth / 2;
    node.cy = y + height / 2;
    nodes.push(node);
    maxDepth = Math.max(maxDepth, node.depth);

    if (!node.children.length) return;
    let cursor = y;
    const totalGap = (node.children.length - 1) * CONFIG.nodeGap;
    const available = Math.max(height - totalGap, CONFIG.minHeight);
    const childHeights = node.children.map((child) =>
      Math.max(CONFIG.minHeight, available * (child.size / node.size)),
    );
    const sum = childHeights.reduce((a, b) => a + b, 0);
    const scale = sum > 0 ? Math.min(1, available / sum) : 1;

    node.children.forEach((child, index) => {
      const childHeight = childHeights[index] * scale;
      links.push({ from: node, to: child, depth: node.depth });
      place(
        child,
        x + CONFIG.columnWidth + CONFIG.columnGap,
        cursor,
        childHeight,
      );
      cursor += childHeight + CONFIG.nodeGap;
    });
  };

  const rootHeight = Math.max(root.size * CONFIG.unitHeight, CONFIG.minHeight);
  place(root, 0, 0, rootHeight);

  const bounds = {
    width: (maxDepth + 1) * (CONFIG.columnWidth + CONFIG.columnGap),
    height: rootHeight,
  };

  return { nodes, links, bounds, maxDepth };
}

function render(layout, ctx) {
  const { state, layer } = ctx;
  const fragment = document.createDocumentFragment();
  const linkGroup = svgEl("g", { class: "sankey-links" });
  const nodeGroup = svgEl("g", { class: "sankey-nodes" });
  const isFocusActive = state.focus.active;
  const isFocus = (id) => isFocusNode(state, id);
  const showDetails = state.view.scale >= DETAIL_SCALE;
  const detailLevel = showDetails
    ? clamp(
        Math.floor((state.view.scale - DETAIL_SCALE) / DETAIL_STEP) + 1,
        1,
        4,
      )
    : 0;

  for (const link of layout.links) {
    const sx = link.from.x + CONFIG.columnWidth;
    const sy = link.from.y + link.from.height / 2;
    const tx = link.to.x;
    const ty = link.to.y + link.to.height / 2;
    const midX = (sx + tx) / 2;
    const focusClass =
      !isFocusActive || (isFocus(link.from.id) && isFocus(link.to.id))
        ? "focus-link"
        : "focus-dim";
    const thickness = clamp(link.to.height * 0.45, 1.5, 22);
    const d = `M ${sx} ${sy} C ${midX} ${sy}, ${midX} ${ty}, ${tx} ${ty}`;
    const path = svgEl("path", {
      d,
      class: `sankey-link depth-${link.depth} ${focusClass}`,
      "stroke-width": thickness.toFixed(2),
    });
    linkGroup.appendChild(path);
  }

  for (const node of layout.nodes) {
    const item = state.nodes.get(node.id);
    const group = svgEl("g");
    const laneColor = getLaneColor(state, node.id);
    const focusClass = isFocus(node.id) ? "" : "focus-dim";
    const ancestorClass = state.focus.ancestors.has(node.id)
      ? "focus-ancestor"
      : "";
    const descClass = state.focus.descendants.has(node.id) ? "focus-desc" : "";

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

    group.setAttribute(
      "class",
      [
        "sankey-node",
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
    );
    group.setAttribute("transform", `translate(${node.x},${node.y})`);
    group.dataset.id = String(node.id);
    if (laneColor) {
      group.style.setProperty("--lane-color", laneColor);
      group.style.setProperty("--lane-fill", hexToRgba(laneColor, 0.28));
      group.style.setProperty("--lane-stroke", hexToRgba(laneColor, 0.55));
    }
    if (sentimentColor && !item?.deleted && !item?.dead) {
      group.style.setProperty(
        "--sentiment-fill",
        hexToRgba(sentimentColor, sentimentAlpha),
      );
      group.style.setProperty(
        "--sentiment-stroke",
        hexToRgba(sentimentColor, Math.min(sentimentAlpha + 0.2, 0.95)),
      );
    }

    const rect = svgEl("rect", {
      width: CONFIG.columnWidth,
      height: Math.max(node.height - CONFIG.nodeGap, CONFIG.minHeight),
      rx: 6,
      ry: 6,
      class: "sankey-rect",
    });

    const title = svgEl("title");
    const author = item?.by || "anonymous";
    title.textContent = `${author} - ${node.size - 1} replies`;

    group.appendChild(rect);
    rect.appendChild(title);

    const showLabel = node.height > 18;
    if (showLabel) {
      const label = svgEl("text", { x: 8, y: 18, class: "sankey-label" });
      const labelText =
        author.length > 18 ? `${author.slice(0, 16)}...` : author;
      label.textContent = labelText;
      group.appendChild(label);
    }

    if (showDetails && node.height > 32) {
      const content = item?.text
        ? stripHtml(item.text)
        : item?.title || item?.url || "";
      const maxChars = Math.max(12, Math.floor((CONFIG.columnWidth - 16) / 6));
      const maxLines = Math.min(
        4 + detailLevel,
        Math.max(1, Math.floor((node.height - 26) / 11)),
      );
      const lines = wrapText(content, maxChars, maxLines);
      if (lines.length) {
        const text = svgEl("text", {
          x: 8,
          y: 34,
          class: `sankey-comment level-${detailLevel}`,
        });
        lines.forEach((line, index) => {
          const tspan = svgEl("tspan", {
            x: 8,
            dy: index === 0 ? 0 : 12,
          });
          tspan.textContent = line;
          text.appendChild(tspan);
        });
        group.appendChild(text);
      }
    }

    nodeGroup.appendChild(group);
  }

  fragment.appendChild(linkGroup);
  fragment.appendChild(nodeGroup);
  clearElement(layer);
  layer.appendChild(fragment);
}

export default {
  id: "sankey",
  label: "Sankey",
  description: "Weighted flow view for thread context.",
  detailScale: DETAIL_SCALE,
  detailScaleStep: DETAIL_STEP,
  compute,
  render,
};
