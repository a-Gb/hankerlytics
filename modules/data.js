/**
 * Data fetching and tree-building utilities.
 * @module data
 */

const API_BASE = "https://hacker-news.firebaseio.com/v0";

/** Maps feed type names to API endpoint names. */
const FEED_MAP = {
  top: "topstories",
  new: "newstories",
  best: "beststories",
  ask: "askstories",
  show: "showstories",
  job: "jobstories",
};

export function parseInput(value) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const match = trimmed.match(/item\?id=(\d+)/i);
  if (match) return Number(match[1]);
  return null;
}

async function fetchItem(id) {
  const response = await fetch(`${API_BASE}/item/${id}.json`);
  if (!response.ok) throw new Error(`Failed to load ${id}`);
  return response.json();
}

export async function fetchStoryIds(kind = "top") {
  const feed = FEED_MAP[kind] || FEED_MAP.top;
  const response = await fetch(`${API_BASE}/${feed}.json`);
  if (!response.ok) throw new Error(`Failed to load ${feed}`);
  return response.json();
}

export async function fetchItemsByIds(ids, onProgress) {
  const queue = [...ids];
  const inflight = new Set();
  const concurrency = 12;
  const items = new Map();
  let fetched = 0;

  const pump = async () => {
    while (queue.length && inflight.size < concurrency) {
      const id = queue.shift();
      if (items.has(id)) continue;
      const task = fetchItem(id)
        .then((item) => {
          if (!item) return;
          items.set(item.id, item);
          fetched += 1;
          if (onProgress && fetched % 5 === 0) {
            onProgress(fetched);
          }
        })
        .catch((error) => {
          console.warn("Fetch failed", id, error);
        })
        .finally(() => {
          inflight.delete(task);
        });
      inflight.add(task);
    }
  };

  await pump();
  while (inflight.size) {
    await Promise.race(inflight);
    await pump();
  }

  if (onProgress) onProgress(fetched, true);
  return items;
}

export async function fetchAllItems(rootId, state, onProgress) {
  const queue = [rootId];
  const inflight = new Set();
  const concurrency = 12;
  let fetched = 0;

  const pump = async () => {
    while (queue.length && inflight.size < concurrency) {
      const id = queue.shift();
      if (state.nodes.has(id)) continue;

      const task = fetchItem(id)
        .then((item) => {
          if (!item) return;
          state.nodes.set(item.id, item);
          fetched += 1;
          if (item.kids && item.kids.length) {
            queue.push(...item.kids);
          }
          if (onProgress && fetched % 25 === 0) {
            onProgress(fetched);
          }
        })
        .catch((error) => {
          console.warn("Fetch failed", id, error);
        })
        .finally(() => {
          inflight.delete(task);
        });

      inflight.add(task);
    }
  };

  await pump();
  while (inflight.size) {
    await Promise.race(inflight);
    await pump();
  }

  if (onProgress) onProgress(fetched, true);
}

export async function fetchThreadLimited(
  rootId,
  state,
  onProgress,
  options = {},
) {
  const maxNodes = Number.isFinite(options.maxNodes)
    ? options.maxNodes
    : Infinity;
  const maxDepth = Number.isFinite(options.maxDepth)
    ? options.maxDepth
    : Infinity;
  const concurrency = Number.isFinite(options.concurrency)
    ? options.concurrency
    : 10;

  const queue = [{ id: rootId, depth: 0 }];
  const inflight = new Set();
  let fetched = 0;

  const pump = async () => {
    while (queue.length && inflight.size < concurrency) {
      const entry = queue.shift();
      if (!entry) continue;
      const { id, depth } = entry;
      if (state.nodes.has(id)) continue;
      if (fetched >= maxNodes) continue;

      const task = fetchItem(id)
        .then((item) => {
          if (!item) return;
          state.nodes.set(item.id, item);
          fetched += 1;
          if (item.kids && item.kids.length && depth < maxDepth) {
            for (const kid of item.kids) {
              queue.push({ id: kid, depth: depth + 1 });
            }
          }
          if (onProgress && fetched % 25 === 0) {
            onProgress(fetched);
          }
        })
        .catch((error) => {
          console.warn("Fetch failed", id, error);
        })
        .finally(() => {
          inflight.delete(task);
        });

      inflight.add(task);
    }
  };

  await pump();
  while (inflight.size) {
    await Promise.race(inflight);
    await pump();
  }

  if (onProgress) onProgress(fetched, true);
}

export function buildTree(id, state, depth = 0, parentId = null) {
  const item = state.nodes.get(id);
  if (!item) return null;

  state.depthMap.set(id, depth);

  const node = {
    id,
    depth,
    parentId,
    children: [],
  };

  state.treeIndex.set(id, node);

  if (item.kids && item.kids.length) {
    for (const kid of item.kids) {
      const child = buildTree(kid, state, depth + 1, id);
      if (child) node.children.push(child);
    }
  }

  return node;
}

export function computeDescendants(node, state) {
  let total = 0;
  for (const child of node.children) {
    total += 1 + computeDescendants(child, state);
  }
  state.descCount.set(node.id, total);
  state.subtreeSize.set(node.id, total + 1);
  return total;
}

export function buildVisibleTree(node, state) {
  const visible = {
    ...node,
    children: [],
  };

  if (!state.collapsed.has(node.id)) {
    for (const child of node.children) {
      visible.children.push(buildVisibleTree(child, state));
    }
  }

  return visible;
}
