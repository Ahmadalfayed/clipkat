// تخزين الملفات الكبيرة (فيديوهات المستخدم) في IndexedDB
const DB = 'clipkat-blobs', STORE = 'blobs';
let dbp;
function db() {
  return (dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
}
function tx(mode, fn) {
  return db().then((d) => new Promise((res, rej) => {
    const t = d.transaction(STORE, mode); const req = fn(t.objectStore(STORE));
    t.oncomplete = () => res(req?.result); t.onerror = () => rej(t.error);
  }));
}
export const blobStore = {
  put: (key, blob) => tx('readwrite', (s) => s.put(blob, key)),
  get: (key) => tx('readonly', (s) => s.get(key)),
  del: (key) => tx('readwrite', (s) => s.delete(key)),
  clear: () => tx('readwrite', (s) => s.clear())
};
