/**
 * HN Thread Atlas - Main application entry point.
 * Interactive visualization for Hacker News discussion threads.
 * @module app
 */

import { state, resetState } from "./modules/state.js";
import { el } from "./modules/dom.js";
import {
  parseInput,
  fetchAllItems,
  fetchStoryIds,
  fetchItemsByIds,
  buildTree,
  computeDescendants,
  buildVisibleTree,
} from "./modules/data.js";
import { layoutList, getLayout } from "./modules/layouts/index.js";
import {
  clamp,
  extractJson,
  renderMarkdown,
  sanitizeHtml,
  escapeHtml,
  formatTime,
} from "./modules/utils.js";
import {
  setStatus,
  updateDetails,
  updateStats,
  updateBranchView,
} from "./modules/ui.js";
import { assignLaneColors } from "./modules/color.js";
import { computeFocus } from "./modules/focus.js";
import {
  buildThreadPayload,
  buildStackPayload,
  sendToLocalLLM,
  saveLlmResult,
  loadLastLlmResult,
} from "./modules/llm.js";
import {
  getCachedThread,
  getCachedFrontpage,
  setCachedFrontpage,
  setCachedThread,
  diffThreads,
  formatAge,
} from "./modules/cache.js";
import {
  DEFAULT_ID,
  DEFAULT_MODEL,
  SENTIMENT_INSTRUCTIONS,
} from "./modules/config.js";
import {
  frontpageItems,
  setFrontpageItems,
  clearPreviews,
  setNeedsFit,
  loadFrontpagePreviews,
  renderFrontpageMosaic,
} from "./modules/frontpage.js";

let llmBusy = false;

function withSentimentPrompt(prompt) {
  const trimmed = prompt ? prompt.trim() : "";
  if (!trimmed) return SENTIMENT_INSTRUCTIONS;
  return `${trimmed}\n\n${SENTIMENT_INSTRUCTIONS}`;
}

function setLlmStatus(message, isError = false) {
  if (!el.llmStatus) return;
  el.llmStatus.textContent = message;
  el.llmStatus.classList.toggle("error", isError);
}

function setLlmOutput(value) {
  if (!el.llmOutput) return;
  const html = renderMarkdown(value || "");
  el.llmOutput.innerHTML = html || "<p>No response.</p>";
}

let lastThreadLayout = "sankey";

/** Render context for frontpage module. */
function getFrontpageContext() {
  return {
    state,
    layer: el.graphLayer,
    graph: el.graph,
    applyTransform,
  };
}

/** Schedule frontpage render using module. */
function scheduleFrontpageRender() {
  const ctx = getFrontpageContext();
  if (ctx.state.activeLayout === "frontpage") {
    renderFrontpageMosaic(ctx);
  }
}

function findNodeMeta(target, stopEl) {
  let current = target;
  let isIcicle = false;
  while (current && current !== stopEl) {
    if (current.classList && current.classList.contains("icicle-cell")) {
      isIcicle = true;
    }
    if (current.dataset && current.dataset.id) {
      const value = Number(current.dataset.id);
      if (Number.isNaN(value)) return null;
      return { id: value, isIcicle };
    }
    current = current.parentNode;
  }
  return null;
}

function findStoryMeta(target, stopEl) {
  if (target?.closest) {
    const hit = target.closest("[data-story-id]");
    if (hit?.dataset?.storyId) {
      const value = Number(hit.dataset.storyId);
      if (!Number.isNaN(value)) return { id: value };
    }
  }
  let current = target;
  while (current && current !== stopEl) {
    if (current.dataset && current.dataset.storyId) {
      const value = Number(current.dataset.storyId);
      if (Number.isNaN(value)) return null;
      return { id: value };
    }
    current = current.parentNode;
  }
  return null;
}

function findStoryMetaFromEvent(event, stopEl) {
  if (event?.composedPath) {
    const path = event.composedPath();
    for (const node of path) {
      if (node?.dataset?.storyId) {
        const value = Number(node.dataset.storyId);
        if (!Number.isNaN(value)) return { id: value };
      }
      if (node === stopEl) break;
    }
  }
  return findStoryMeta(event.target, stopEl);
}

function findNodeMetaFromPoint(x, y, stopEl) {
  const hit = document.elementFromPoint(x, y);
  if (!hit) return null;
  return findNodeMeta(hit, stopEl);
}

function buildTooltipHtml(item) {
  if (!item) return "";
  const author = item.by || "anonymous";
  const timeLabel = formatTime(item.time);
  const isStory = item.type === "story";
  const header = isStory
    ? escapeHtml(item.title || "Story")
    : `Comment by ${escapeHtml(author)}`;
  const metaParts = [
    timeLabel ? escapeHtml(timeLabel) : "",
    `#${item.id}`,
  ].filter(Boolean);
  const meta = metaParts.length ? metaParts.join(" · ") : "";
  let body = "";
  if (item.deleted || item.dead) {
    body = "<em>Deleted or dead.</em>";
  } else if (item.text) {
    body = sanitizeHtml(item.text);
  } else if (item.url) {
    const url = escapeHtml(item.url);
    body = `<a href="${url}" target="_blank" rel="noopener">${url}</a>`;
  } else {
    body = "No text available.";
  }

  return `
    <div class="tooltip-title">${header}</div>
    ${meta ? `<div class="tooltip-meta">${meta}</div>` : ""}
    <div class="tooltip-body">${body}</div>
  `;
}

function getLlmConfig() {
  return {
    endpoint: el.llmEndpoint?.value?.trim() || "",
    api: el.llmApi?.value || "lmstudio",
    scope: el.llmScope?.value || "stack",
    model: el.llmModel?.value?.trim() || DEFAULT_MODEL,
    token: el.llmToken?.value?.trim() || "",
    system: el.llmSystem?.value?.trim() || "",
    prompt: el.llmPrompt?.value?.trim() || "",
    sentiment: Boolean(el.llmSentiment?.checked),
  };
}

function normalizeSentimentLabel(label, score) {
  if (label) {
    const cleaned = String(label).trim().toLowerCase();
    if (["positive", "negative", "neutral", "mixed"].includes(cleaned)) {
      return cleaned;
    }
    if (cleaned.startsWith("pos")) return "positive";
    if (cleaned.startsWith("neg")) return "negative";
    if (cleaned.startsWith("neu")) return "neutral";
    if (cleaned.startsWith("mix")) return "mixed";
  }
  if (typeof score === "number") {
    if (score > 0.2) return "positive";
    if (score < -0.2) return "negative";
    return "neutral";
  }
  return null;
}

function parseSentimentList(text) {
  const data = extractJson(text);
  if (!data) return null;
  const list =
    data.sentiments || data.sentiment || data.items || data.labels || null;
  if (!Array.isArray(list)) return null;

  const normalized = [];
  for (const entry of list) {
    const rawId = entry.id ?? entry.item_id ?? entry.comment_id;
    const id = Number(rawId);
    if (!Number.isFinite(id)) continue;
    if (!state.nodes.has(id)) continue;
    const score =
      typeof entry.score === "number"
        ? entry.score
        : typeof entry.polarity === "number"
          ? entry.polarity
          : null;
    const label = normalizeSentimentLabel(
      entry.label || entry.sentiment,
      score,
    );
    if (!label) continue;
    normalized.push({ id, label, score });
  }
  return normalized.length ? normalized : null;
}

function applySentiments(list) {
  if (!list || !list.length) return 0;
  let count = 0;
  const timestamp = new Date().toISOString();
  for (const item of list) {
    state.sentiment.set(item.id, {
      label: item.label,
      score: item.score,
      updatedAt: timestamp,
    });
    count += 1;
  }
  if (count) {
    renderGraph();
    applyTransform();
    updateDetails(state, el);
    updateBranchView(state, el, { limit: 200 });
  }
  return count;
}

async function sendSelectedToLlm(source = "manual", branchId = null) {
  if (llmBusy) return;
  const config = getLlmConfig();
  if (!config.endpoint || !config.prompt) {
    setLlmStatus("Missing endpoint or prompt.", true);
    return;
  }
  if (config.api === "responses" && !config.model) {
    setLlmStatus("Model is required for /v1/responses.", true);
    return;
  }

  const targetId = branchId ?? state.selectedId;
  const scope = config.scope === "branch" ? "stack" : config.scope;
  const resolvedTargetId = scope === "thread" ? state.rootId : targetId;
  if (!resolvedTargetId) {
    setLlmStatus(
      scope === "thread"
        ? "No thread loaded to send."
        : "Select a node to send its stack.",
      true,
    );
    return;
  }

  let payload = null;
  if (scope === "thread") {
    payload = buildThreadPayload(state, state.rootId);
  } else if (scope === "subtree") {
    payload = buildThreadPayload(state, resolvedTargetId);
  } else {
    payload = buildStackPayload(state, resolvedTargetId);
  }
  if (!payload) {
    setLlmStatus("No payload to send.", true);
    return;
  }

  const requestConfig = {
    ...config,
    prompt: config.sentiment
      ? withSentimentPrompt(config.prompt)
      : config.prompt,
  };

  try {
    llmBusy = true;
    if (el.llmSend) el.llmSend.disabled = true;
    setLlmStatus(`Sending ${payload.totalItems} items...`, false);
    setLlmOutput("Waiting for response...");
    const result = await sendToLocalLLM(requestConfig, payload);
    const sentiments = config.sentiment
      ? parseSentimentList(result.text)
      : null;
    const tagged = sentiments ? applySentiments(sentiments) : 0;
    setLlmOutput(result.text || "No text response.");
    setLlmStatus(
      `Done (${source}).${tagged ? ` Tagged ${tagged} comments.` : ""}`,
      false,
    );
    saveLlmResult({
      rootId: state.rootId,
      branchId: resolvedTargetId,
      savedAt: new Date().toISOString(),
      endpoint: config.endpoint,
      model: config.model,
      scope: config.scope,
      prompt: config.prompt,
      system: config.system,
      output: result.text || "",
      raw: result.raw,
      sentiment: sentiments || null,
    }).catch((error) => {
      console.warn("LLM cache save failed", error);
    });
  } catch (error) {
    console.error(error);
    setLlmStatus(error.message || "LLM request failed.", true);
    setLlmOutput(String(error));
  } finally {
    llmBusy = false;
    if (el.llmSend) el.llmSend.disabled = false;
  }
}

function applyTransform() {
  const { tx, ty, scale } = state.view;
  el.graphLayer.setAttribute(
    "transform",
    `translate(${tx},${ty}) scale(${scale})`,
  );
}

function fitToView() {
  if (!state.tree && state.activeLayout !== "frontpage") return;
  const bbox = el.graphLayer.getBBox();
  const rect = el.graph.getBoundingClientRect();
  const margin = 80;

  if (bbox.width === 0 || bbox.height === 0) return;

  const scale = clamp(
    Math.min(
      (rect.width - margin * 2) / bbox.width,
      (rect.height - margin * 2) / bbox.height,
      1.4,
    ),
    0.2,
    2.4,
  );

  state.view.scale = scale;
  state.view.tx = rect.width / 2 - (bbox.x + bbox.width / 2) * scale;
  state.view.ty = rect.height / 2 - (bbox.y + bbox.height / 2) * scale;
  applyTransform();
}

function centerOnRoot() {
  if (!state.tree) return;
  const root = state.layout.get(state.rootId);
  if (!root) return;
  const rect = el.graph.getBoundingClientRect();

  state.view.tx = rect.width / 2 - root.cx * state.view.scale;
  state.view.ty = rect.height / 2 - root.cy * state.view.scale;
  applyTransform();
}

function renderGraph(options = {}) {
  const layout = getLayout(state.activeLayout);
  if (layout?.frontpage) {
    if (el.graphShell) el.graphShell.classList.remove("has-focus");
    renderFrontpageMosaic(getFrontpageContext());
    return;
  }

  if (!state.tree) return;
  const visibleTree = buildVisibleTree(state.tree, state);
  const result = layout.compute(visibleTree, { state });

  state.layout.clear();
  for (const node of result.nodes) {
    state.layout.set(node.id, node);
  }

  layout.render(result, { state, layer: el.graphLayer });
  if (el.graphShell) {
    el.graphShell.classList.toggle("has-focus", state.focus.active);
  }

  el.graphLayer.classList.add("fade-in");
  requestAnimationFrame(() => {
    el.graphLayer.classList.remove("fade-in");
  });
}

function hydrateFromItems(id, items, sourceLabel) {
  state.nodes.clear();
  state.depthMap.clear();
  state.descCount.clear();
  state.subtreeSize.clear();
  state.treeIndex.clear();
  state.collapsed.clear();
  state.layout.clear();
  state.laneColors.clear();
  state.sentiment.clear();
  state.focus.ancestors.clear();
  state.focus.descendants.clear();
  state.focus.active = false;
  for (const item of items) {
    state.nodes.set(item.id, item);
  }
  state.rootId = id;
  state.tree = buildTree(id, state);
  if (!state.tree) return false;

  computeDescendants(state.tree, state);
  assignLaneColors(state);
  state.selectedId = id;
  computeFocus(state, id);
  renderGraph();
  fitToView();
  updateStats(state, el);
  updateDetails(state, el);
  updateBranchView(state, el, { limit: 200 });
  if (sourceLabel) setStatus(el, sourceLabel);
  return true;
}

function selectNode(id) {
  state.selectedId = id;
  computeFocus(state, id);
  renderGraph();
  applyTransform();
  updateDetails(state, el);
  updateBranchView(state, el, { limit: 200 });
}

function toggleCollapse(id) {
  if (!id) return;
  if (state.collapsed.has(id)) {
    state.collapsed.delete(id);
  } else {
    state.collapsed.add(id);
  }
  computeFocus(state, state.selectedId);
  renderGraph();
  applyTransform();
  updateDetails(state, el);
  updateBranchView(state, el, { limit: 200 });
}

async function loadFrontpage(options = {}) {
  if (!el.frontpageKind || !el.frontpageLimit) return;
  const kind = el.frontpageKind.value || "top";
  const limit = Math.max(
    5,
    Math.min(60, Number(el.frontpageLimit.value) || 30),
  );
  el.frontpageLimit.value = String(limit);

  state.activeLayout = "frontpage";
  if (el.layoutSelect) el.layoutSelect.value = "frontpage";
  state.view.scale = 1;
  state.view.tx = 0;
  state.view.ty = 0;
  state.view.detailBucket = 0;
  setNeedsFit(true);
  setStatus(el, `Loading ${kind} stories...`);

  if (!options.forceRefresh) {
    const cached = await getCachedFrontpage(kind);
    if (cached?.items?.length) {
      setFrontpageItems(cached.items.slice(0, limit));
      clearPreviews();
      renderFrontpageMosaic(getFrontpageContext());
      const age = formatAge(cached.fetchedAt);
      setStatus(el, `Frontpage cache (${age}).`);
      loadFrontpagePreviews(frontpageItems, scheduleFrontpageRender);
      return;
    }
  }

  try {
    const ids = await fetchStoryIds(kind);
    if (!Array.isArray(ids) || !ids.length) {
      setStatus(el, "No stories returned.");
      return;
    }

    const slice = ids.slice(0, limit);
    const itemsMap = await fetchItemsByIds(slice, (count) => {
      setStatus(el, `Loaded ${count}/${slice.length} stories...`);
    });

    const items = slice.map((id) => itemsMap.get(id)).filter(Boolean);
    setFrontpageItems(items);

    clearPreviews();
    renderFrontpageMosaic(getFrontpageContext());
    setStatus(el, `Loaded ${items.length} stories.`);
    setCachedFrontpage(kind, items);
    loadFrontpagePreviews(frontpageItems, scheduleFrontpageRender);
  } catch (error) {
    console.error(error);
    setStatus(el, "Failed to load frontpage.");
  }
}

async function loadThread(options = {}) {
  if (state.activeLayout === "frontpage") {
    state.activeLayout = lastThreadLayout;
    if (el.layoutSelect) el.layoutSelect.value = lastThreadLayout;
  }
  const id = parseInput(el.input.value) ?? DEFAULT_ID;
  el.input.value = String(id);

  resetState();
  state.activeLayout = el.layoutSelect.value || "sankey";
  state.view.scale = 1;
  state.view.tx = 0;
  state.view.ty = 0;

  el.graphLayer.innerHTML = "";
  setStatus(el, "Loading thread...");

  const cached = await getCachedThread(String(id));
  if (cached && cached.items && !options.forceRefresh) {
    const age = formatAge(cached.fetchedAt);
    const ok = hydrateFromItems(
      id,
      cached.items,
      `Loaded from cache (${age}).`,
    );
    if (ok && !options.forceRefresh) {
      return;
    }
  }

  try {
    await fetchAllItems(id, state, (count, done) => {
      if (done) {
        setStatus(el, `Loaded ${count} items.`);
      } else {
        setStatus(el, `Loaded ${count} items...`);
      }
    });
  } catch (error) {
    setStatus(el, "Unable to load data.");
    console.error(error);
    return;
  }

  const items = Array.from(state.nodes.values());
  if (!items.length) {
    setStatus(el, "Thread not found.");
    return;
  }

  let diffMessage = "";
  if (cached && cached.items) {
    const diff = diffThreads(cached.items, items);
    diffMessage = ` (+${diff.added} new, ${diff.updated} updated)`;
  }

  await setCachedThread(String(id), items);
  hydrateFromItems(id, items, `Thread loaded.${diffMessage}`);
}

function populateLayoutOptions() {
  if (!el.layoutSelect) return;
  el.layoutSelect.innerHTML = layoutList
    .map((layout) => `<option value=\"${layout.id}\">${layout.label}</option>`)
    .join("");
  el.layoutSelect.value = state.activeLayout;
}

function setupControls() {
  const setFrontpageControlsEnabled = (enabled) => {
    if (el.frontpageKind) el.frontpageKind.disabled = !enabled;
    if (el.frontpageLimit) el.frontpageLimit.disabled = !enabled;
    if (el.frontpageRefresh) el.frontpageRefresh.disabled = !enabled;
  };

  el.loadBtn.addEventListener("click", () => {
    loadThread();
  });

  if (el.frontpageRefresh) {
    el.frontpageRefresh.addEventListener("click", () => {
      loadFrontpage({ forceRefresh: true });
    });
  }

  if (el.frontpageKind) {
    el.frontpageKind.addEventListener("change", () => {
      if (state.activeLayout === "frontpage") {
        loadFrontpage({ forceRefresh: true });
      }
    });
  }

  if (el.refreshBtn) {
    el.refreshBtn.addEventListener("click", () => {
      loadThread({ forceRefresh: true });
    });
  }

  el.input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      loadThread();
    }
  });

  el.layoutSelect.addEventListener("change", () => {
    const nextLayout = el.layoutSelect.value;
    if (nextLayout === "frontpage") {
      state.activeLayout = "frontpage";
      setNeedsFit(true);
      loadFrontpage();
      setFrontpageControlsEnabled(true);
      return;
    }
    state.activeLayout = nextLayout;
    lastThreadLayout = nextLayout;
    setFrontpageControlsEnabled(false);
    if (!state.tree) {
      loadThread();
      return;
    }
    renderGraph();
    fitToView();
  });

  el.fitBtn.addEventListener("click", fitToView);
  el.centerBtn.addEventListener("click", centerOnRoot);

  el.collapseBtn.addEventListener("click", () => {
    toggleCollapse(state.selectedId);
  });

  el.graph.addEventListener("click", (event) => {
    if (state.activeLayout === "frontpage") {
      if (didPan) {
        didPan = false;
        return;
      }
      const story = findStoryMetaFromEvent(event, el.graph);
      if (!story) return;
      state.activeLayout = lastThreadLayout;
      if (el.layoutSelect) el.layoutSelect.value = lastThreadLayout;
      el.input.value = String(story.id);
      loadThread();
      return;
    }
    if (didPan) {
      didPan = false;
      return;
    }
    const meta = findNodeMetaFromPoint(event.clientX, event.clientY, el.graph);
    if (!meta) return;
    selectNode(meta.id);
    if (
      meta.isIcicle &&
      state.activeLayout === "icicle" &&
      el.llmAutosend?.checked
    ) {
      sendSelectedToLlm("icicle", meta.id);
    }
  });

  el.graph.addEventListener("dblclick", (event) => {
    if (state.activeLayout === "frontpage") return;
    const meta = findNodeMetaFromPoint(event.clientX, event.clientY, el.graph);
    if (!meta) return;
    toggleCollapse(meta.id);
  });

  if (el.branchBody) {
    el.branchBody.addEventListener("click", (event) => {
      const meta = findNodeMeta(event.target, el.branchBody);
      if (!meta) return;
      selectNode(meta.id);
    });
  }

  let isPanning = false;
  let startX = 0;
  let startY = 0;
  let startTx = 0;
  let startTy = 0;
  let didPan = false;
  let hasCapture = false;
  let hoverId = null;
  let hoverRaf = 0;
  let lastHoverEvent = null;

  const hideTooltip = () => {
    if (!el.graphTooltip) return;
    el.graphTooltip.classList.remove("visible");
    el.graphTooltip.setAttribute("aria-hidden", "true");
    hoverId = null;
  };

  const positionTooltip = (clientX, clientY) => {
    if (!el.graphTooltip || !el.graphShell) return;
    const shellRect = el.graphShell.getBoundingClientRect();
    const padding = 16;
    let x = clientX - shellRect.left + 16;
    let y = clientY - shellRect.top + 16;
    const tipRect = el.graphTooltip.getBoundingClientRect();
    if (x + tipRect.width > shellRect.width - padding) {
      x = shellRect.width - tipRect.width - padding;
    }
    if (y + tipRect.height > shellRect.height - padding) {
      y = shellRect.height - tipRect.height - padding;
    }
    if (x < padding) x = padding;
    if (y < padding) y = padding;
    el.graphTooltip.style.left = `${x}px`;
    el.graphTooltip.style.top = `${y}px`;
  };

  const handleHover = (event) => {
    if (!el.graphTooltip) return;
    if (state.activeLayout === "frontpage" || isPanning) {
      hideTooltip();
      return;
    }
    const meta = findNodeMetaFromPoint(event.clientX, event.clientY, el.graph);
    if (!meta) {
      hideTooltip();
      return;
    }
    const item = state.nodes.get(meta.id);
    if (!item) {
      hideTooltip();
      return;
    }
    if (hoverId !== meta.id) {
      el.graphTooltip.innerHTML = buildTooltipHtml(item);
      el.graphTooltip.classList.add("visible");
      el.graphTooltip.setAttribute("aria-hidden", "false");
      hoverId = meta.id;
    }
    positionTooltip(event.clientX, event.clientY);
  };

  el.graph.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    isPanning = true;
    startX = event.clientX;
    startY = event.clientY;
    startTx = state.view.tx;
    startTy = state.view.ty;
    didPan = false;
    hasCapture = false;
    hideTooltip();
  });

  el.graph.addEventListener("pointermove", (event) => {
    if (!isPanning) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      didPan = true;
      if (!hasCapture) {
        el.graph.setPointerCapture(event.pointerId);
        hasCapture = true;
      }
    }
    if (didPan) {
      state.view.tx = startTx + dx;
      state.view.ty = startTy + dy;
      applyTransform();
    }
  });

  el.graph.addEventListener("pointerup", (event) => {
    isPanning = false;
    if (hasCapture) {
      el.graph.releasePointerCapture(event.pointerId);
    }
    hasCapture = false;
  });

  el.graph.addEventListener("pointerleave", () => {
    isPanning = false;
    hideTooltip();
  });

  el.graph.addEventListener("mousemove", (event) => {
    if (!el.graphTooltip) return;
    lastHoverEvent = event;
    if (hoverRaf) return;
    hoverRaf = requestAnimationFrame(() => {
      hoverRaf = 0;
      if (lastHoverEvent) handleHover(lastHoverEvent);
    });
  });

  el.graph.addEventListener("mouseleave", () => {
    hideTooltip();
  });

  el.graph.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const rect = el.graph.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      const zoom = Math.exp(-event.deltaY * 0.0012);
      const layout = getLayout(state.activeLayout);
      const detailScale =
        typeof layout?.detailScale === "number" ? layout.detailScale : null;
      const detailStep =
        typeof layout?.detailScaleStep === "number"
          ? layout.detailScaleStep
          : null;
      const wasDetail = detailScale ? state.view.scale >= detailScale : false;
      const prevBucket = detailStep
        ? Math.floor(state.view.scale / detailStep)
        : state.view.detailBucket;
      const nextScale = clamp(state.view.scale * zoom, 0.2, 3);

      const worldX = (offsetX - state.view.tx) / state.view.scale;
      const worldY = (offsetY - state.view.ty) / state.view.scale;

      state.view.scale = nextScale;
      state.view.tx = offsetX - worldX * nextScale;
      state.view.ty = offsetY - worldY * nextScale;
      applyTransform();

      const isDetail = detailScale ? nextScale >= detailScale : false;
      const nextBucket = detailStep
        ? Math.floor(nextScale / detailStep)
        : prevBucket;
      state.view.detailBucket = nextBucket;
      if (
        (detailScale && wasDetail !== isDetail) ||
        nextBucket !== prevBucket
      ) {
        renderGraph();
        applyTransform();
      }
    },
    { passive: false },
  );

  window.addEventListener("resize", () => {
    fitToView();
  });

  if (el.llmSend) {
    el.llmSend.addEventListener("click", () => {
      sendSelectedToLlm("manual");
    });
  }

  if (el.llmLoad) {
    el.llmLoad.addEventListener("click", async () => {
      const rootId = state.selectedId || state.rootId;
      if (!rootId) return;
      const entry = await loadLastLlmResult(state.rootId, rootId);
      if (!entry) {
        setLlmStatus("No saved result for this branch.", true);
        return;
      }
      setLlmOutput(entry.output || "No output stored.");
      const tagged = entry.sentiment ? applySentiments(entry.sentiment) : 0;
      setLlmStatus(
        `Loaded ${entry.savedAt}.${tagged ? ` Tagged ${tagged} comments.` : ""}`,
        false,
      );
    });
  }

  setFrontpageControlsEnabled(state.activeLayout === "frontpage");
}

populateLayoutOptions();
setupControls();
loadFrontpage();
