export const knownTypes = ['choice', 'audio-choice', 'input', 'cloze'];
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const text = x => typeof x === 'string' && x.trim().length > 0;
// 檔案名稱與規則由程式指定；不把輸入值、題目 id 或欄位內容放入訊息。
function checks(file, location = '') {
  return (ok, rule) => { if (!ok) throw new Error(`題庫格式錯誤：[${file}] ${location}${rule}`); };
}
export function validDate(date) {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
}
function strings(value, rule, check) {
  check(Array.isArray(value) && value.every(text) && new Set(value).size === value.length, rule);
}
export function validatePack(pack) {
  const check = checks('pack.json');
  check(object(pack) && pack.formatVersion === 1, 'formatVersion 必須是 1');
  for (const key of ['id', 'name', 'version', 'locale', 'timezone', 'itemLabel']) check(text(pack[key]), `${key} 必填`);
  try { new Intl.Locale(pack.locale); } catch { check(false, 'locale 必須是有效語言代碼'); }
  try { new Intl.DateTimeFormat(undefined, { timeZone: pack.timezone }); } catch { check(false, 'timezone 必須是有效時區'); }
  strings(pack.questionTypes, 'questionTypes 必須是無重複的字串陣列', check);
  strings(pack.capabilities, 'capabilities 必須是無重複的字串陣列', check);
  check(object(pack.daily), 'daily 必填');
  for (const key of ['newItems', 'maxReviews']) check(Number.isInteger(pack.daily[key]) && pack.daily[key] >= 0, `daily.${key} 必須是非負整數`);
  return pack;
}
function validateItem(item, check) {
  check(object(item), '項目必須是物件');
  for (const key of ['id', 'front', 'back']) check(text(item[key]), `${key} 必填`);
  check(object(item.fields) && Object.values(item.fields).every(x => typeof x === 'string'), 'fields 必須是字串鍵值');
}
export function validateItems(items, file = 'items.json', location = '') {
  checks(file)(Array.isArray(items), `${location || 'items'} 必須是陣列`);
  const ids = new Set();
  for (const [i, item] of items.entries()) {
    const check = checks(file, `${location}[${i}]：`);
    validateItem(item, check); check(!ids.has(item.id), '項目 id 不可重複'); ids.add(item.id);
  }
  return items;
}
export function validateIndex(index) {
  const check = checks('daily/index.json');
  check(object(index) && Array.isArray(index.dates), 'dates 必須是陣列');
  for (const [i, date] of index.dates.entries()) {
    check(validDate(date), `dates[${i}] 必須是有效日期`);
    check(i === 0 || date > index.dates[i - 1], `dates[${i}] 必須遞增且不重複`);
  }
  return index;
}
export function validateDaily(day, pack, items, date) {
  const file = validDate(date) ? `daily/${date}.json` : 'daily/YYYY-MM-DD.json';
  const check = checks(file);
  check(object(day), 'daily 必須是物件');
  check(day.formatVersion === 1, 'formatVersion 必須是 1');
  check(day.packId === pack.id, 'packId 必須符合 pack.json');
  check(day.date === date, 'date 必須符合檔名日期');
  validateItems(day.items, file, 'items');
  const ids = new Set(items.map(item => item.id));
  for (const [i, item] of day.items.entries()) check(ids.has(item.id), `items[${i}].id 必須存在於 items.json`);
  check(Array.isArray(day.questions), 'questions 必須是陣列');
  const qids = new Set();
  for (const [i, q] of day.questions.entries()) {
    const qcheck = checks(file, `questions[${i}]：`);
    qcheck(object(q), '題目必須是物件');
    for (const key of ['id', 'type', 'itemId']) qcheck(text(q[key]), `${key} 必填`);
    qcheck(ids.has(q.itemId), 'itemId 必須存在於 items.json');
    qcheck(!qids.has(q.id), '題目 id 不可重複'); qids.add(q.id);
    if (!knownTypes.includes(q.type)) continue;
    qcheck(text(q.answer), 'answer 必填'); qcheck(text(q.explanation), 'explanation 必填');
    if (q.type === 'audio-choice') qcheck(text(q.speak), 'speak 必填');
    else qcheck(text(q.prompt), 'prompt 必填');
    if (q.type === 'cloze') qcheck(q.prompt.includes('___'), 'prompt 必須包含 ___');
    if (q.speak !== undefined) qcheck(typeof q.speak === 'string', 'speak 必須是字串');
    if (q.type !== 'input' || q.options !== undefined) {
      strings(q.options, 'options 必須是無重複的字串陣列', qcheck);
      qcheck(q.options.length >= 3 && q.options.length <= 5, 'options 必須有 3–5 個');
      qcheck(q.options.includes(q.answer), 'answer 必須在 options 中');
    }
  }
  return day;
}
export function validateBundle(bundle) {
  const check = checks('pack.json');
  check(object(bundle), '本機題庫必須是物件');
  validatePack(bundle.pack); validateItems(bundle.items); validateIndex(bundle.index);
  check(bundle.id === bundle.pack.id, '本機題庫 id 必須符合 pack.id');
  checks('daily/index.json')(object(bundle.days), '索引對應的 daily 資料必填');
  const qids = new Set();
  for (const date of bundle.index.dates) {
    const day = validateDaily(bundle.days[date], bundle.pack, bundle.items, date);
    for (const [i, q] of day.questions.entries()) {
      checks(`daily/${date}.json`)(!qids.has(q.id), `questions[${i}].id 不可跨日重複`); qids.add(q.id);
    }
  }
  return bundle;
}
