/**
 * UI update functions for the detail panel.
 * @module ui
 */

import { formatTime, sanitizeHtml, stripHtml } from "./utils.js";

export function setStatus(el, message) {
  el.status.textContent = message;
}

function snippetFromItem(item, fallback) {
  if (!item) return fallback;
  if (item.deleted || item.dead) return "[deleted]";
  if (item.text) {
    const text = stripHtml(item.text);
    return text || fallback;
  }
  if (item.title) return item.title;
  if (item.url) return item.url;
  return fallback;
}

export function updateDetails(state, el) {
  const id = state.selectedId;
  if (!id) {
    if (el.selection) el.selection.textContent = "Selected: none";
    el.detailTitle.textContent = "Select a node";
    el.detailMeta.textContent = "";
    el.detailBody.textContent =
      "Click a node to read its content and explore that branch.";
    el.collapseBtn.disabled = true;
    el.hnLink.href = "https://news.ycombinator.com";
    return;
  }

  const item = state.nodes.get(id);
  if (!item) return;

  const isStory = item.type === "story";
  const author = item.by || "anonymous";
  const timeLabel = formatTime(item.time);
  const kids = item.kids ? item.kids.length : 0;
  const depth = state.depthMap.get(id) ?? 0;
  const desc = state.descCount.get(id) ?? 0;
  const sentiment = state.sentiment?.get(id);
  const sentimentSummary = buildSentimentSummary(state, id);
  if (el.selection) {
    el.selection.textContent = `Selected: ${author} (#${id})`;
  }

  el.detailTitle.textContent = isStory
    ? item.title || "Story"
    : `Comment by ${author}`;
  el.detailMeta.innerHTML = [
    `<span>ID ${id}</span>`,
    `<span>${isStory ? "Story" : "Comment"}</span>`,
    `<span>Depth ${depth}</span>`,
    `<span>${kids} direct replies</span>`,
    `<span>${desc} total replies</span>`,
    sentimentSummary
      ? `<span>Sentiment avg ${sentimentSummary.average.toFixed(2)} (${sentimentSummary.count} tagged)</span>`
      : "",
    sentiment?.label
      ? `<span>Node ${sentiment.label}${typeof sentiment.score === "number" ? ` ${sentiment.score.toFixed(2)}` : ""}</span>`
      : "",
    timeLabel ? `<span>${timeLabel}</span>` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  let body = "";
  if (item.deleted || item.dead) {
    body = "This comment is deleted or marked dead.";
  } else if (item.text) {
    body = sanitizeHtml(item.text);
  } else if (item.url) {
    body = `<a href=\"${item.url}\" target=\"_blank\" rel=\"noopener\">${item.url}</a>`;
  } else {
    body = "No text available for this item.";
  }

  el.detailBody.innerHTML = body;
  el.collapseBtn.disabled = !(item.kids && item.kids.length);
  el.collapseBtn.textContent = state.collapsed.has(id) ? "Expand" : "Collapse";
  el.hnLink.href = `https://news.ycombinator.com/item?id=${id}`;
}

function buildSentimentSummary(state, rootId) {
  if (!state.sentiment || state.sentiment.size === 0) return null;
  const rootNode = state.treeIndex.get(rootId);
  if (!rootNode) return null;

  const counts = {
    positive: 0,
    negative: 0,
    neutral: 0,
    mixed: 0,
  };
  let total = 0;
  let count = 0;

  const walk = (node) => {
    const entry = state.sentiment.get(node.id);
    if (entry) {
      const label = entry.label;
      if (counts[label] !== undefined) counts[label] += 1;
      const score = typeof entry.score === "number" ? entry.score : 0;
      total += score;
      count += 1;
    }
    for (const child of node.children || []) {
      walk(child);
    }
  };

  walk(rootNode);
  if (!count) return null;
  return {
    count,
    average: total / count,
    counts,
  };
}

export function updateStats(state, el) {
  const items = Array.from(state.nodes.values());
  if (!items.length) {
    el.stats.innerHTML = "";
    return;
  }

  const comments = items.filter((item) => item.type === "comment");
  const maxDepth = Math.max(...Array.from(state.depthMap.values()));
  const topBranch = [...state.descCount.entries()].sort(
    (a, b) => b[1] - a[1],
  )[0];

  const authorCounts = new Map();
  for (const item of comments) {
    if (!item.by) continue;
    authorCounts.set(item.by, (authorCounts.get(item.by) || 0) + 1);
  }

  const topAuthor = [...authorCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  const chips = [
    `<span class=\"stat-chip\"><strong>${comments.length}</strong> comments</span>`,
    `<span class=\"stat-chip\"><strong>${maxDepth}</strong> max depth</span>`,
  ];

  if (topBranch) {
    chips.push(
      `<span class=\"stat-chip\"><strong>${topBranch[1]}</strong> replies under a node</span>`,
    );
  }

  if (topAuthor) {
    chips.push(
      `<span class=\"stat-chip\"><strong>${topAuthor[0]}</strong> ${topAuthor[1]} posts</span>`,
    );
  }

  el.stats.innerHTML = chips.join("");
}

export function updateBranchView(state, el, options = {}) {
  const id = state.selectedId;
  if (!id || !el.branchBody || !el.branchView) return;

  const limit = options.limit || 200;
  const rootNode = state.treeIndex.get(id);
  const summary = el.branchView.querySelector("summary");

  if (!rootNode) {
    el.branchBody.textContent = "Branch not available.";
    if (summary) summary.textContent = "Branch view";
    return;
  }

  const rootItem = state.nodes.get(id);
  const rootSnippet = snippetFromItem(rootItem, "(no text)");
  if (summary) {
    summary.textContent = `Branch view (${state.descCount.get(id) || 0} replies)`;
  }

  el.branchBody.innerHTML = "";

  const stats = { count: 0, truncated: false };
  const container = document.createElement("ul");
  container.className = "branch-list";

  const buildList = (node, depth) => {
    if (stats.count >= limit) {
      stats.truncated = true;
      return null;
    }

    stats.count += 1;
    const item = state.nodes.get(node.id);
    const li = document.createElement("li");
    li.className = `branch-item${node.id === id ? " selected" : ""}`;
    li.dataset.id = String(node.id);

    const header = document.createElement("div");
    header.className = "branch-header";

    const author = item?.by || "anonymous";
    const replies = item?.kids ? item.kids.length : 0;
    const label = item?.type === "story" ? "Story" : `@${author}`;

    const headerText = document.createElement("span");
    headerText.textContent = `${label} | depth ${depth} | ${replies} replies`;
    header.appendChild(headerText);

    const sentiment = state.sentiment?.get(node.id);
    if (sentiment?.label) {
      const badge = document.createElement("span");
      badge.className = `sentiment-chip ${sentiment.label}`;
      badge.textContent = sentiment.label;
      header.appendChild(badge);
    }

    const text = document.createElement("div");
    text.className = "branch-text";
    const snippet =
      node.id === id ? rootSnippet : snippetFromItem(item, "(no text)");
    text.textContent =
      snippet.length > 160 ? `${snippet.slice(0, 157)}...` : snippet;

    li.appendChild(header);
    li.appendChild(text);

    if (node.children.length) {
      const ul = document.createElement("ul");
      ul.className = "branch-children";
      for (const child of node.children) {
        const childEl = buildList(child, depth + 1);
        if (childEl) ul.appendChild(childEl);
        if (stats.truncated) break;
      }
      if (ul.childNodes.length) li.appendChild(ul);
    }

    return li;
  };

  const rootLi = buildList(rootNode, state.depthMap.get(id) ?? 0);
  if (rootLi) container.appendChild(rootLi);

  el.branchBody.appendChild(container);

  if (stats.truncated) {
    const notice = document.createElement("div");
    notice.className = "branch-truncated";
    notice.textContent = `Truncated after ${limit} items.`;
    el.branchBody.appendChild(notice);
  }
}
