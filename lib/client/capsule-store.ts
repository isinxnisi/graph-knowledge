import type { DatasetMode } from "../domain/dataset";
import { CAPSULE_DOCUMENT_LIMITS } from "../domain/capsule-document";
import { CapsuleError, capsuleSchema, readCapsules, type LocalCapsule } from "./local-capsules";

const DATABASE = "plunode-capsules";
export const CAPSULE_STORE_EVENT = "plunode-capsules-changed";
async function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore("capsules", { keyPath: "id" }); request.result.createObjectStore("metadata", { keyPath: "id" }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new CapsuleError("storage"));
    request.onblocked = () => reject(new CapsuleError("storage"));
  });
}
function requested<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(new CapsuleError("storage")); });
}
export async function listBrowserCapsules(dataset: DatasetMode): Promise<LocalCapsule[]> {
  const legacy = readCapsules(localStorage, dataset);
  const db = await openStore();
  try {
    const records = (await requested(db.transaction("capsules").objectStore("capsules").getAll())).map(v => capsuleSchema.parse(v)).filter(v => v.dataset === dataset);
    return [...records, ...legacy.filter(v => !records.some(n => n.id === v.id))].sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt));
  } finally { db.close(); }
}
export async function saveBrowserCapsule(value: LocalCapsule, expected: LocalCapsule | null): Promise<void> {
  const parsed = capsuleSchema.parse(value);
  if (new TextEncoder().encode(JSON.stringify(parsed)).byteLength > CAPSULE_DOCUMENT_LIMITS.bytes) throw new CapsuleError("limit");
  const legacy = readCapsules(localStorage, value.dataset).find(v => v.id === value.id);
  const db = await openStore();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("capsules", "readwrite"), store = tx.objectStore("capsules");
      let failure: CapsuleError | null = null;
      const current = store.get(value.id);
      current.onsuccess = () => {
        const previous = current.result ?? legacy;
        if (expected ? !previous || JSON.stringify(previous) !== JSON.stringify(expected) : previous) { failure = new CapsuleError("conflict"); tx.abort(); return; }
        const all = store.getAll();
        all.onsuccess = () => {
          const records = all.result.filter((v: LocalCapsule) => v.dataset === value.dataset && v.id !== value.id);
          if (records.length >= 100 || records.reduce((sum, v) => sum + new TextEncoder().encode(JSON.stringify(v)).byteLength, 0) + new TextEncoder().encode(JSON.stringify(parsed)).byteLength > 50_000_000) { failure = new CapsuleError("limit"); tx.abort(); return; }
          store.put(parsed);
        };
      };
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(failure ?? new CapsuleError("storage"));
    });
    window.dispatchEvent(new Event(CAPSULE_STORE_EVENT));
  } finally { db.close(); }
}
export type CapsuleMetadata = { id: string; favorite: boolean; lastOpened: string | null };
export async function capsuleMetadata(id: string, update?: Partial<Omit<CapsuleMetadata, "id">>): Promise<CapsuleMetadata> {
  const db = await openStore();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("metadata", update ? "readwrite" : "readonly"), store = tx.objectStore("metadata"), request = store.get(id);
      let value: CapsuleMetadata;
      request.onsuccess = () => { value = { id, favorite: false, lastOpened: null, ...request.result, ...update }; if (update) store.put(value); };
      tx.oncomplete = () => resolve(value);
      tx.onabort = tx.onerror = () => reject(new CapsuleError("storage"));
    });
  } finally { db.close(); }
}
