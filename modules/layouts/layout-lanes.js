import { clamp } from "../utils.js";
import { svgEl, clearElement } from "../svg.js";
import { getLaneColor } from "../color.js";
import { isFocusNode } from "../focus.js";

const CONFIG = {
  nodeSpacing: 36,
  depthSpacing: 220,
  laneGap: 80,
};

function layoutSubtree(root) {
  let nextY = 0;
  let maxDepth = root.depth;
  const nodes = [];
  const links = [];

  const assignY = (node) => {
    if (!node.children.length) {
      node.y = nextY;
      nextY += CONFIG.nodeSpacing;
      return node.y;
    }

    const childYs = node.children.map(assignY);
    node.y = (Math.min(...childYs) + Math.max(...childYs)) / 2;
    return node.y;
  };

  const assignX = (node) => {
    node.x = node.depth * CONFIG.depthSpacing;
    node.cx = node.x;
    node.cy = node.y;
    maxDepth = Math.max(maxDepth, node.depth);
    for (const child of node.children) assignX(child);
  };

  assignY(root);
  assignX(root);

  const walk = (node) => {
    nodes.push(node);
    for (const child of node.children) {
      links.push({ from: node, to: child, depth: node.depth });
      walk(child);
    }
  };

  walk(root);

  return {
    nodes,
    links,
    height: Math.max(nextY, CONFIG.nodeSpacing),
    maxDepth,
  };
}

function compute(root) {
  const nodes = [];
  const links = [];
  let yOffset = 0;
  let maxDepth = 0;
  const laneCenters = [];

  if (!root.children.length) {
    root.x = 0;
    root.y = 0;
    root.cx = 0;
    root.cy = 0;
    return {
      nodes: [root],
      links: [],
      bounds: {
        width: CONFIG.depthSpacing,
        height: CONFIG.nodeSpacing,
      },
    };
  }

  for (const laneRoot of root.children) {
    const laneLayout = layoutSubtree(laneRoot);
    for (const node of laneLayout.nodes) {
      node.y += yOffset;
      node.cy = node.y;
      node.cx = node.x;
    }
    nodes.push(...laneLayout.nodes);
    links.push(...laneLayout.links);
    laneCenters.push(laneRoot.y + yOffset);
    yOffset += laneLayout.height + CONFIG.laneGap;
    maxDepth = Math.max(maxDepth, laneLayout.maxDepth);
  }

  const totalHeight = Math.max(yOffset - CONFIG.laneGap, CONFIG.nodeSpacing);
  const rootY = laneCenters.length
    ? (Math.min(...laneCenters) + Math.max(...laneCenters)) / 2
    : 0;

  root.x = 0;
  root.y = rootY;
  root.cx = 0;
  root.cy = rootY;

  nodes.unshift(root);
  for (const laneRoot of root.children) {
    links.push({ from: root, to: laneRoot, depth: root.depth });
  }

  return {
    nodes,
    links,
    bounds: {
      width: (maxDepth + 1) * CONFIG.depthSpacing,
      height: totalHeight,
    },
  };
}

function render(layout, ctx) {
  const { state, layer } = ctx;
  const fragment = document.createDocumentFragment();
  const linkGroup = svgEl("g", { class: "lane-links" });
  const nodeGroup = svgEl("g", { class: "lane-nodes" });
  const isFocusActive = state.focus.active;
  const isFocus = (id) => isFocusNode(state, id);

  for (const link of layout.links) {
    const sx = link.from.x;
    const sy = link.from.y;
    const tx = link.to.x;
    const ty = link.to.y;
    const midX = (sx + tx) / 2;
    const focusClass =
      !isFocusActive || (isFocus(link.from.id) && isFocus(link.to.id))
        ? "focus-link"
        : "focus-dim";
    const d = `M ${sx} ${sy} C ${midX} ${sy}, ${midX} ${ty}, ${tx} ${ty}`;
    const path = svgEl("path", {
      d,
      class: `link depth-${link.depth} ${focusClass}`,
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

    const desc = state.descCount.get(node.id) || 0;
    const radius = clamp(5 + Math.log(desc + 1) * 2.1, 5, 13);

    group.setAttribute(
      "class",
      [
        "node",
        "lane-node",
        item?.type === "story" ? "root" : "",
        item?.deleted || item?.dead ? "deleted" : "",
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
    }

    const circle = svgEl("circle", { r: radius.toFixed(2) });
    const title = svgEl("title");
    const author = item?.by || "anonymous";
    title.textContent = `${author} - ${desc} replies`;

    group.appendChild(circle);
    group.appendChild(title);

    const showLabel = node.depth < 2 || node.id === state.selectedId;
    if (showLabel) {
      const label = svgEl("text", { x: radius + 6, y: 4 });
      const labelText =
        author.length > 16 ? `${author.slice(0, 14)}...` : author;
      label.textContent = labelText;
      group.appendChild(label);
    }

    nodeGroup.appendChild(group);
  }

  fragment.appendChild(linkGroup);
  fragment.appendChild(nodeGroup);

  clearElement(layer);
  layer.appendChild(fragment);
}

export default {
  id: "lanes",
  label: "Thread Lanes",
  description: "Swimlane-style lanes for top-level threads.",
  compute,
  render,
};
