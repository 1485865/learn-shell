export const knownTypes = ['choice', 'audio-choice', 'input', 'cloze'];
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const text = x => typeof x === 'string' && x.trim().length > 0;
function requireThat(ok, message) { if (!ok) throw new Error(`題庫格式錯誤：${message}`); }
export function validDate(date) {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
}
function strings(value, name) {
  requireThat(Array.isArray(value) && value.every(text) && new Set(value).size === value.length, name);
}
export function validatePack(pack) {
  requireThat(object(pack) && pack.formatVersion === 1, 'pack.formatVersion 必須是 1');
  for (const key of ['id', 'name', 'version', 'locale', 'timezone', 'itemLabel']) requireThat(text(pack[key]), `pack.${key} 必填`);
  try { new Intl.Locale(pack.locale); new Intl.DateTimeFormat(undefined, { timeZone: pack.timezone }); }
  catch { throw new Error('題庫格式錯誤：locale 或 timezone 無效'); }
  strings(pack.questionTypes, 'questionTypes 必須是無重複的字串陣列');
  strings(pack.capabilities, 'capabilities 必須是無重複的字串陣列');
  requireThat(object(pack.daily), 'daily 必填');
  for (const key of ['newItems', 'maxReviews']) requireThat(Number.isInteger(pack.daily[key]) && pack.daily[key] >= 0, `daily.${key} 必須是非負整數`);
  return pack;
}
function validateItem(item) {
  requireThat(object(item) && text(item.id) && text(item.front) && text(item.back), '項目的 id、front、back 必填');
  requireThat(object(item.fields) && Object.values(item.fields).every(x => typeof x === 'string'), 'fields 必須是字串鍵值');
}
export function validateItems(items) {
  requireThat(Array.isArray(items), 'items 必須是陣列');
  const ids = new Set();
  for (const item of items) { validateItem(item); requireThat(!ids.has(item.id), '項目 id 重複'); ids.add(item.id); }
  return items;
}
export function validateIndex(index) {
  requireThat(object(index) && Array.isArray(index.dates), 'index.dates 必須是陣列');
  requireThat(index.dates.every((date, i) => validDate(date) && (i === 0 || date > index.dates[i - 1])), '日期必須有效、遞增且不重複');
  return index;
}
export function validateDaily(day, pack, items, date) {
  requireThat(object(day) && day.formatVersion === 1 && day.packId === pack.id && day.date === date, 'daily 版本、packId 或日期不符');
  validateItems(day.items);
  const ids = new Set(items.map(item => item.id));
  requireThat(day.items.every(item => ids.has(item.id)), 'daily 項目不存在於 items.json');
  requireThat(Array.isArray(day.questions), 'questions 必須是陣列');
  const qids = new Set();
  for (const q of day.questions) {
    requireThat(object(q) && text(q.id) && text(q.type) && text(q.itemId) && ids.has(q.itemId), '題目的 id、type 或 itemId 無效');
    requireThat(!qids.has(q.id), '題目 id 重複'); qids.add(q.id);
    if (!knownTypes.includes(q.type)) continue;
    requireThat(text(q.answer) && text(q.explanation), 'answer 與 explanation 必填');
    if (q.type === 'audio-choice') requireThat(text(q.speak), '聽音題 speak 必填');
    else requireThat(text(q.prompt), 'prompt 必填');
    if (q.type === 'cloze') requireThat(q.prompt.includes('___'), '填空題必須包含 ___');
    if (q.speak !== undefined) requireThat(typeof q.speak === 'string', 'speak 必須是字串');
    if (q.type !== 'input' || q.options !== undefined) {
      strings(q.options, 'options 必須是無重複的字串陣列');
      requireThat(q.options.length >= 3 && q.options.length <= 5 && q.options.includes(q.answer), 'options 必須有 3–5 個並包含答案');
    }
  }
  return day;
}
export function validateBundle(bundle) {
  requireThat(object(bundle), '題庫必須是物件');
  validatePack(bundle.pack); validateItems(bundle.items); validateIndex(bundle.index);
  requireThat(bundle.id === bundle.pack.id, '本機題庫 id 不符');
  requireThat(object(bundle.days), 'daily 資料必填');
  const qids = new Set();
  for (const date of bundle.index.dates) {
    const day = validateDaily(bundle.days[date], bundle.pack, bundle.items, date);
    for (const q of day.questions) { requireThat(!qids.has(q.id), '跨日題目 id 重複'); qids.add(q.id); }
  }
  return bundle;
}
