/**
 * Application state module.
 * @module state
 */

/** Global application state. */
export const state = {
  nodes: new Map(),
  rootId: null,
  tree: null,
  treeIndex: new Map(),
  layout: new Map(),
  depthMap: new Map(),
  descCount: new Map(),
  subtreeSize: new Map(),
  collapsed: new Set(),
  laneColors: new Map(),
  sentiment: new Map(),
  focus: {
    ancestors: new Set(),
    descendants: new Set(),
    active: false,
  },
  selectedId: null,
  activeLayout: "frontpage",
  view: {
    scale: 1,
    tx: 0,
    ty: 0,
    detailBucket: 0,
  },
};

export function resetState() {
  state.nodes.clear();
  state.depthMap.clear();
  state.descCount.clear();
  state.subtreeSize.clear();
  state.collapsed.clear();
  state.layout.clear();
  state.treeIndex.clear();
  state.laneColors.clear();
  state.sentiment.clear();
  state.focus.ancestors.clear();
  state.focus.descendants.clear();
  state.focus.active = false;
  state.selectedId = null;
  state.tree = null;
  state.rootId = null;
  state.view.detailBucket = 0;
}
