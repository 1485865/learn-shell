import { validatePack, validateItems, validateIndex, validateBundle } from './core/validate-pack.mjs';
export function normalizeSource(source) {
  if (source.kind === 'url') {
    let url;
    try { url = new URL(source.url); } catch { throw new Error('請輸入完整的公開題庫網址'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('題庫網址只接受沒有帳密、查詢或片段的 HTTP / HTTPS 網址');
    url.pathname = url.pathname.replace(/\/?$/, '/');
    return { kind: 'url', url: url.href };
  }
  if (source.kind !== 'github' || typeof source.owner !== 'string' || typeof source.repo !== 'string' || !/^[A-Za-z0-9-]+$/.test(source.owner) || !/^[A-Za-z0-9_.-]+$/.test(source.repo) || ['.', '..'].includes(source.repo)) throw new Error('請輸入有效的 GitHub owner 與 repo');
  if (source.branch !== undefined && typeof source.branch !== 'string') throw new Error('分支名稱無效');
  const branch = source.branch?.trim() || 'main';
  if (/[\x00-\x1f]/.test(branch)) throw new Error('分支名稱無效');
  return { kind: 'github', owner: source.owner, repo: source.repo, branch };
}
export async function readPackFile(source, path, pat = '', fetcher = fetch) {
  source = normalizeSource(source);
  if (!/^(pack\.json|items\.json|daily\/index\.json|daily\/\d{4}-\d{2}-\d{2}\.json)$/.test(path)) throw new Error('題庫檔案路徑無效');
  const headers = {};
  let url;
  if (source.kind === 'github') {
    url = `https://api.github.com/repos/${source.owner}/${source.repo}/contents/${path}?ref=${encodeURIComponent(source.branch)}`;
    headers.Accept = 'application/vnd.github.raw';
    headers['X-GitHub-Api-Version'] = '2022-11-28';
    if (pat) headers.Authorization = `Bearer ${pat}`;
  } else url = new URL(path, source.url).href;
  let response;
  try { response = await fetcher(url, { headers, credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20000) }); }
  catch { throw new Error('無法讀取題庫：請檢查連線、跨來源權限或重新導向設定'); }
  if (!response.ok) {
    const messages = source.kind === 'github'
      ? { 401: 'PAT 無效，請重新設定', 403: '權限不足或請求額度已用完，請檢查 Contents 讀取權限', 404: '找不到題庫檔案，請檢查來源、分支與 private repo 的存取權' }
      : { 401: '題庫網址需要授權，請使用可公開讀取的網址', 403: '無權存取題庫網址，請檢查伺服器的公開存取設定', 404: '找不到題庫檔案，請檢查公開網址與檔案路徑' };
    throw new Error(messages[response.status] ?? '題庫伺服器回應失敗，請稍後重試');
  }
  try { return await response.json(); } catch { throw new Error(`題庫格式錯誤：[${path}] 必須是有效的 JSON`); }
}
export async function downloadPack(source, pat = '', cached = null, fetcher = fetch) {
  source = normalizeSource(source);
  const read = path => readPackFile(source, path, pat, fetcher);
  const pack = validatePack(await read('pack.json'));
  if (cached && pack.id !== cached.pack.id) throw new Error('題庫格式錯誤：[pack.json] id 不可改變，保留既有資料；請另行安裝');
  const items = validateItems(await read('items.json'));
  const index = validateIndex(await read('daily/index.json'));
  const days = Object.create(null);
  for (const date of index.dates) days[date] = cached?.days[date] ?? await read(`daily/${date}.json`);
  // 保留歷史快取，供 S2 複習使用；新版索引不能刪除既有的日期。
  if (cached) for (const date of cached.index.dates) {
    if (!index.dates.includes(date)) throw new Error('題庫格式錯誤：[daily/index.json] 新索引移除了既有日期，保留原題庫');
  }
  return validateBundle({ schemaVersion: 1, id: pack.id, source, pack, items, index, days });
}
