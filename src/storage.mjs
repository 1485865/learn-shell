import { validateBundle } from './core/validate-pack.mjs';
const updateMessage = '本機資料版本較新，請更新 app';
export async function openStorage(factory = globalThis.indexedDB) {
  if (!factory) throw new Error('此瀏覽器不支援本機 IndexedDB 儲存');
  const db = await new Promise((resolve, reject) => {
    const request = factory.open('learn-shell', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('packs', { keyPath: 'id' });
      request.result.createObjectStore('settings', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error(request.error?.name === 'VersionError' ? updateMessage : '無法開啟本機資料庫'));
    request.onblocked = () => reject(new Error('請關閉其他分頁後重試本機資料庫'));
  });
  db.onversionchange = () => db.close();
  function run(store, mode, operation) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const request = operation(tx.objectStore(store));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = tx.onerror = () => reject(new Error('本機資料讀寫失敗，請確認儲存空間與瀏覽器權限'));
    });
  }
  function check(record) {
    if (record && record.schemaVersion !== 1) throw new Error(record.schemaVersion > 1 ? updateMessage : '本機資料版本不支援');
    return record;
  }
  return {
    async listPacks() { return (await run('packs', 'readonly', store => store.getAll())).map(record => validateBundle(check(record))); },
    async getPack(id) { const record = check(await run('packs', 'readonly', store => store.get(id))); return record ? validateBundle(record) : null; },
    async putPack(record) { validateBundle(check(record)); await run('packs', 'readwrite', store => store.put(record)); },
    async removePack(id) { await run('packs', 'readwrite', store => store.delete(id)); },
    async getSetting(id) { return check(await run('settings', 'readonly', store => store.get(id)))?.value; },
    async putSetting(id, value) { await run('settings', 'readwrite', store => store.put({ schemaVersion: 1, id, value })); },
    close() { db.close(); }
  };
}
