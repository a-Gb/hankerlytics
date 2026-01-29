import { clamp } from "../utils.js";
import { svgEl, clearElement } from "../svg.js";
import { getLaneColor } from "../color.js";
import { isFocusNode } from "../focus.js";

const CONFIG = {
  nodeSpacing: 42,
  depthSpacing: 220,
};

function compute(root) {
  let nextY = 0;
  let maxDepth = 0;
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
      links.push({
        from: node,
        to: child,
        depth: node.depth,
      });
      walk(child);
    }
  };

  walk(root);

  return {
    nodes,
    links,
    bounds: {
      width: (maxDepth + 1) * CONFIG.depthSpacing,
      height: Math.max(nextY, 1),
    },
  };
}

function render(layout, ctx) {
  const { state, layer } = ctx;
  const fragment = document.createDocumentFragment();
  const linkGroup = svgEl("g");
  const nodeGroup = svgEl("g");

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
    const radius = clamp(5 + Math.log(desc + 1) * 2.2, 5, 14);

    group.setAttribute(
      "class",
      [
        "node",
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
  id: "tidy",
  label: "Tidy Tree",
  description: "Classic tidy tree layout.",
  compute,
  render,
};
