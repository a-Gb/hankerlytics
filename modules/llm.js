/**
 * LLM integration for thread analysis.
 * @module llm
 */

import { stripHtml } from "./utils.js";
import { getDb, requestToPromise, txComplete } from "./db.js";

function buildPayloadItem(state, node) {
  const item = state.nodes.get(node.id);
  const text = item?.text ? stripHtml(item.text) : "";
  return {
    id: node.id,
    parentId: node.parentId ?? null,
    depth: node.depth,
    type: item?.type || "comment",
    author: item?.by || null,
    time: item?.time ? new Date(item.time * 1000).toISOString() : null,
    title: item?.title || null,
    url: item?.url || null,
    score: item?.score ?? null,
    deleted: Boolean(item?.deleted),
    dead: Boolean(item?.dead),
    replies: item?.kids ? item.kids.length : 0,
    text,
  };
}

function buildRootSummary(state, rootId) {
  const rootItem = state.nodes.get(rootId);
  return {
    id: rootId,
    type: rootItem?.type || "comment",
    title: rootItem?.title || null,
    author: rootItem?.by || null,
    time: rootItem?.time ? new Date(rootItem.time * 1000).toISOString() : null,
    url: rootItem?.url || null,
    hnUrl: `https://news.ycombinator.com/item?id=${rootId}`,
    totalReplies: state.descCount.get(rootId) || 0,
  };
}

export function buildThreadPayload(state, rootId) {
  const rootNode = state.treeIndex.get(rootId);
  if (!rootNode) return null;

  const items = [];

  const walk = (node) => {
    items.push(buildPayloadItem(state, node));
    for (const child of node.children || []) {
      walk(child);
    }
  };

  walk(rootNode);

  return {
    root: buildRootSummary(state, rootId),
    totalItems: items.length,
    items,
  };
}

export function buildStackPayload(state, targetId) {
  const targetNode = state.treeIndex.get(targetId);
  if (!targetNode) return null;

  const items = [];
  const seen = new Set();

  const pushNode = (node) => {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    items.push(buildPayloadItem(state, node));
  };

  const path = [];
  let cursor = targetNode;
  while (cursor) {
    path.push(cursor);
    if (cursor.parentId == null) break;
    cursor = state.treeIndex.get(cursor.parentId) || null;
  }
  path.reverse().forEach(pushNode);

  const walkDescendants = (node) => {
    for (const child of node.children || []) {
      pushNode(child);
      walkDescendants(child);
    }
  };
  walkDescendants(targetNode);

  const rootId = state.rootId ?? path[0]?.id ?? targetId;

  return {
    root: buildRootSummary(state, rootId),
    selection: {
      id: targetId,
      mode: "stack",
      path: path.map((node) => node.id),
      pathLength: path.length,
      subtreeItems: state.subtreeSize.get(targetId) || 1,
    },
    totalItems: items.length,
    items,
  };
}

export function buildPrompt(prompt, payload) {
  const serialized = JSON.stringify(payload, null, 2);
  return `${prompt}\n\nTHREAD_DATA:\n${serialized}`;
}

function extractOutputText(response) {
  if (!response) return "No response.";
  if (Array.isArray(response.output)) {
    const messages = response.output.filter((item) => item.type === "message");
    if (messages.length) {
      return messages.map((item) => item.content).join("\n\n");
    }
  }
  if (response.output_text) return response.output_text;
  if (Array.isArray(response.choices)) {
    const texts = response.choices
      .map((choice) => choice.message?.content || choice.text)
      .filter(Boolean);
    if (texts.length) return texts.join("\n\n");
  }
  return JSON.stringify(response, null, 2);
}

export async function sendToLocalLLM(config, payload) {
  const headers = {
    "Content-Type": "application/json",
  };
  if (config.token) {
    headers.Authorization = `Bearer ${config.token}`;
  }

  const prompt = buildPrompt(config.prompt, payload);
  let body = null;

  if (config.api === "responses") {
    body = {
      input: config.system ? `${config.system}\n\n${prompt}` : prompt,
    };
    if (config.model) body.model = config.model;
  } else {
    body = {
      input: prompt,
      system_prompt: config.system || undefined,
      temperature: 0.2,
    };
    if (config.model) body.model = config.model;
  }

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM error ${response.status}: ${text}`);
  }

  const data = await response.json();
  return {
    raw: data,
    text: extractOutputText(data),
  };
}

export async function saveLlmResult(entry) {
  const db = await getDb();
  const tx = db.transaction("llm", "readwrite");
  const store = tx.objectStore("llm");
  const key = `${entry.rootId}:${entry.branchId}`;
  store.put({ key, ...entry });
  await txComplete(tx);
}

export async function loadLastLlmResult(rootId, branchId) {
  const db = await getDb();
  const tx = db.transaction("llm", "readonly");
  const store = tx.objectStore("llm");
  const key = `${rootId}:${branchId}`;
  const entry = await requestToPromise(store.get(key));
  await txComplete(tx);
  return entry || null;
}
