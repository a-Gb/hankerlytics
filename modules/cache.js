/**
 * Caching layer for threads and frontpage data.
 * @module cache
 */

import { getDb, requestToPromise, txComplete } from "./db.js";

/** Maximum number of threads to keep cached. */
const MAX_THREADS = 3;
const MAX_FRONTPAGE = 5;

export async function getCachedThread(id) {
  try {
    const db = await getDb();
    const tx = db.transaction("threads", "readonly");
    const store = tx.objectStore("threads");
    const entry = await requestToPromise(store.get(String(id)));
    await txComplete(tx);
    if (!entry || !entry.items) return null;
    return entry;
  } catch (error) {
    console.warn("Cache load failed", error);
    return null;
  }
}

async function pruneThreads() {
  const db = await getDb();
  const tx = db.transaction("threads", "readwrite");
  const store = tx.objectStore("threads");
  const entries = await requestToPromise(store.getAll());
  if (entries.length <= MAX_THREADS) {
    await txComplete(tx);
    return;
  }
  const sorted = entries
    .map((entry) => ({ id: entry.id, time: entry.fetchedAt || "" }))
    .sort((a, b) => a.time.localeCompare(b.time));
  while (sorted.length > MAX_THREADS) {
    const drop = sorted.shift();
    if (drop) store.delete(drop.id);
  }
  await txComplete(tx);
}

export async function setCachedThread(id, items) {
  try {
    const db = await getDb();
    const tx = db.transaction("threads", "readwrite");
    const store = tx.objectStore("threads");
    const entry = {
      id: String(id),
      fetchedAt: new Date().toISOString(),
      items,
    };
    store.put(entry);
    await txComplete(tx);
    await pruneThreads();
  } catch (error) {
    console.warn("Cache save failed", error);
  }
}

export async function getCachedFrontpage(kind) {
  try {
    const db = await getDb();
    const tx = db.transaction("frontpage", "readonly");
    const store = tx.objectStore("frontpage");
    const entry = await requestToPromise(store.get(String(kind)));
    await txComplete(tx);
    if (!entry || !entry.items) return null;
    return entry;
  } catch (error) {
    console.warn("Frontpage cache load failed", error);
    return null;
  }
}

async function pruneFrontpage() {
  const db = await getDb();
  const tx = db.transaction("frontpage", "readwrite");
  const store = tx.objectStore("frontpage");
  const entries = await requestToPromise(store.getAll());
  if (entries.length <= MAX_FRONTPAGE) {
    await txComplete(tx);
    return;
  }
  const sorted = entries
    .map((entry) => ({ key: entry.key, time: entry.fetchedAt || "" }))
    .sort((a, b) => a.time.localeCompare(b.time));
  while (sorted.length > MAX_FRONTPAGE) {
    const drop = sorted.shift();
    if (drop) store.delete(drop.key);
  }
  await txComplete(tx);
}

export async function setCachedFrontpage(kind, items) {
  try {
    const db = await getDb();
    const tx = db.transaction("frontpage", "readwrite");
    const store = tx.objectStore("frontpage");
    const entry = {
      key: String(kind),
      fetchedAt: new Date().toISOString(),
      items,
    };
    store.put(entry);
    await txComplete(tx);
    await pruneFrontpage();
  } catch (error) {
    console.warn("Frontpage cache save failed", error);
  }
}

export function formatAge(iso) {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function fingerprint(item) {
  return [
    item.id,
    item.by || "",
    item.time || "",
    item.deleted ? "1" : "0",
    item.dead ? "1" : "0",
    item.text || "",
    item.title || "",
    item.url || "",
    item.score || "",
    item.kids ? item.kids.length : 0,
  ].join("|");
}

export function diffThreads(oldItems, newItems) {
  const oldMap = new Map();
  for (const item of oldItems || []) {
    oldMap.set(item.id, fingerprint(item));
  }

  let added = 0;
  let updated = 0;

  for (const item of newItems || []) {
    const prev = oldMap.get(item.id);
    if (!prev) {
      added += 1;
    } else if (prev !== fingerprint(item)) {
      updated += 1;
    }
  }

  return { added, updated };
}
