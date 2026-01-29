/**
 * IndexedDB wrapper for persistent storage.
 * @module db
 */

const DB_NAME = "hn-thread-atlas";
const DB_VERSION = 2;

let dbPromise = null;

export function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function txComplete(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function getDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("threads")) {
        const store = db.createObjectStore("threads", { keyPath: "id" });
        store.createIndex("fetchedAt", "fetchedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains("llm")) {
        const store = db.createObjectStore("llm", { keyPath: "key" });
        store.createIndex("savedAt", "savedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains("frontpage")) {
        const store = db.createObjectStore("frontpage", { keyPath: "key" });
        store.createIndex("fetchedAt", "fetchedAt", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}
