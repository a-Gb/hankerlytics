/**
 * Focus state computation for highlighting related nodes.
 * @module focus
 */

/**
 * Compute ancestors and descendants for focus highlighting.
 * @param {Object} state - Application state.
 * @param {number} id - Selected node ID.
 */
export function computeFocus(state, id) {
  state.focus.ancestors.clear();
  state.focus.descendants.clear();
  state.focus.active = false;

  if (!id || !state.treeIndex || !state.treeIndex.size) return;

  const node = state.treeIndex.get(id);
  if (!node) return;

  let current = node;
  while (
    current &&
    current.parentId !== null &&
    current.parentId !== undefined
  ) {
    const parentId = current.parentId;
    if (parentId === null || parentId === undefined) break;
    state.focus.ancestors.add(parentId);
    current = state.treeIndex.get(parentId);
    if (!current) break;
  }

  const walk = (root) => {
    for (const child of root.children || []) {
      state.focus.descendants.add(child.id);
      walk(child);
    }
  };

  walk(node);
  state.focus.active = true;
}

export function isFocusNode(state, id) {
  if (!state.focus.active) return true;
  if (state.selectedId === id) return true;
  if (state.focus.ancestors.has(id)) return true;
  if (state.focus.descendants.has(id)) return true;
  return false;
}
