/**
 * Color assignment and manipulation utilities.
 * @module color
 */

/** Color palette for lane coloring. */
const PALETTE = [
  "#6ee7ff",
  "#ffb86c",
  "#f6d35f",
  "#8ef2b5",
  "#a68bff",
  "#ff8aa1",
  "#7dd3a7",
  "#6fa3ff",
  "#ff9f6e",
  "#9ad0ff",
];

export function assignLaneColors(state) {
  state.laneColors.clear();
  if (!state.tree || !state.tree.children) return;

  state.tree.children.forEach((child, index) => {
    state.laneColors.set(child.id, PALETTE[index % PALETTE.length]);
  });
}

export function getLaneColor(state, id) {
  if (!id) return null;
  if (!state.treeIndex || !state.treeIndex.size) return null;
  const node = state.treeIndex.get(id);
  if (!node) return null;

  if (node.parentId === state.rootId) {
    return state.laneColors.get(node.id) || null;
  }

  let current = node;
  while (current && current.parentId && current.parentId !== state.rootId) {
    current = state.treeIndex.get(current.parentId);
  }

  if (!current || current.parentId !== state.rootId) return null;
  return state.laneColors.get(current.id) || null;
}

export function hexToRgba(hex, alpha = 1) {
  if (!hex) return null;
  const cleaned = hex.replace("#", "");
  if (cleaned.length === 3) {
    const r = parseInt(cleaned[0] + cleaned[0], 16);
    const g = parseInt(cleaned[1] + cleaned[1], 16);
    const b = parseInt(cleaned[2] + cleaned[2], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (cleaned.length !== 6) return null;
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
