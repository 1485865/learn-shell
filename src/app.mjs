import { openStorage } from './storage.mjs';
import { downloadPack } from './pack-source.mjs';
import { todayInZone, earliestUnlearned } from './core/dates.mjs';
import { createSession, nextCard, answerQuestion, nextQuestion } from './core/session.mjs';
import { speak } from './tts.mjs';
const screen = document.querySelector('#screen');
const status = document.querySelector('#status');
let storage, packs = [], selected, page = 'today', session = null, busy = false, rate = 1;
// S1 場次只存在記憶體；S2 接入逐包進度與每日鎖定的持久化。
const learned = new Map(), finished = new Map();
function node(tag, text, parent = screen) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  parent.append(element); return element;
}
function message(text) { status.textContent = text; }
function button(text, action, parent = screen, primary = false) {
  const element = node('button', text, parent); element.type = 'button';
  if (primary) element.className = 'primary';
  element.addEventListener('click', () => void guarded(action)); return element;
}
async function guarded(action) {
  if (busy) return;
  busy = true;
  document.querySelectorAll('button').forEach(el => { el.disabled = true; });
  try { await action(); } catch (error) { message(error instanceof Error ? error.message : '操作失敗，請重試'); }
  finally { busy = false; render(); }
}
function field(title, value, parent, type = 'text') {
  const label = node('label', title, parent); const input = node('input', undefined, label);
  input.type = type; input.value = value; return input;
}
function current() { return packs.find(record => record.id === selected); }
function packToday(record) { return todayInZone(Date.now(), record.pack.timezone); }
function actions() { const el = node('div'); el.className = 'actions'; return el; }
function speechButtons(text, record, parent) {
  if (!record.pack.capabilities.includes('tts')) return;
  button('播放發音', async () => message(await speak(text, record.pack, rate)), parent);
  button('慢速播放', async () => message(await speak(text, record.pack, rate, true)), parent);
}
function showToday() {
  const record = current(); node('h2', record?.pack.name ?? '今日');
  if (!record) { node('p', '請先到設定安裝題庫。'); button('前往設定', () => { page = 'settings'; }, actions(), true); return; }
  const today = packToday(record);
  node('p', `${today} · ${record.pack.timezone}`);
  if (finished.get(selected) === today) { node('p', '今日學習已完成。'); return; }
  if (session?.phase === 'complete') session = null;
  const date = earliestUnlearned(record.index.dates, learned.get(selected) ?? [], today);
  if (!date) { node('p', '沒有可學的新內容。到期複習將於 S2 提供。'); return; }
  node('p', `本次學習：${date}，${record.days[date].items.length} 個${record.pack.itemLabel}`);
  button(session ? '繼續學習' : '開始學習', () => {
    session ??= createSession(record.days[date]); page = 'quiz';
    if (session.skipped) message('此份題庫含未支援的題型，已跳過。');
    completeIfNeeded();
  }, actions(), true);
}
function completeIfNeeded() {
  if (session?.phase !== 'complete') return;
  const dates = learned.get(selected) ?? [];
  if (!dates.includes(session.date)) learned.set(selected, [...dates, session.date]);
  finished.set(selected, packToday(current()));
}
function showQuiz() {
  const record = current(); node('h2', '作答');
  if (!record || !session) { node('p', '請從今日畫面開始學習。'); return; }
  if (session.phase === 'complete') { node('p', '今日學習已完成。'); button('回到今日', () => { page = 'today'; }, actions()); return; }
  if (session.phase === 'cards') {
    const item = session.items[session.card];
    node('p', `${record.pack.itemLabel} ${session.card + 1} / ${session.items.length}`);
    const card = node('article'); card.className = 'card';
    node('p', item.front, card).className = 'front'; node('p', item.back, card);
    const fields = node('dl', undefined, card);
    for (const [key, value] of Object.entries(item.fields)) { node('dt', key, fields); node('dd', value, fields); }
    const controls = actions(); speechButtons(item.front, record, controls);
    button(session.card + 1 === session.items.length ? '開始作答' : '下一個', () => { session = nextCard(session); completeIfNeeded(); }, controls, true);
    return;
  }
  const q = session.questions[session.question];
  node('p', `第 ${session.question + 1} / ${session.questions.length} 題`);
  if (q.type === 'audio-choice') node('p', '請聽題目並選擇答案。');
  else node('p', q.prompt);
  const controls = actions();
  if (q.speak) speechButtons(q.speak, record, controls);
  if (q.type === 'audio-choice' && !record.pack.capabilities.includes('tts')) node('p', '此題庫未啟用發音，無法播放此題。');
  const submit = value => { session = answerQuestion(session, value); };
  if (q.type === 'input') {
    const form = node('form'); const input = field('答案', '', form); input.required = true; input.autocomplete = 'off';
    const submitButton = node('button', '送出答案', form); submitButton.type = 'submit'; submitButton.disabled = session.answered;
    input.disabled = session.answered;
    form.addEventListener('submit', event => { event.preventDefault(); void guarded(() => submit(input.value)); });
  } else for (const option of q.options) button(option, () => submit(option), controls).disabled = session.answered;
  if (session.answered) {
    node('p', session.correct ? '答對了。' : '答錯了。', screen);
    if (!session.correct) { node('p', `正確答案：${q.answer}`); node('p', q.explanation); }
    button('下一題', () => { session = nextQuestion(session); completeIfNeeded(); }, actions(), true);
  }
}
async function install(source) {
  message('正在下載並驗證題庫……');
  const record = await downloadPack(source, await storage.getSetting('pat') ?? '');
  if (packs.some(pack => pack.id === record.id)) throw new Error('此題庫已安裝，每次開啟時會自動檢查更新');
  await storage.putPack(record);
  // 介面使用的內容也重新從 IndexedDB 取得。
  packs = await storage.listPacks(); selected = record.id;
  await storage.putSetting('selected', selected); session = null; page = 'today'; message('題庫已儲存，可離線學習。');
}
function showSettings() {
  node('h2', '設定');
  if (!storage) { node('p', '本機資料庫不可用，請檢查瀏覽器儲存權限後重新載入。'); return; }
  node('h3', '已安裝題庫');
  for (const record of packs) {
    node('p', record.pack.name);
    button(record.id === selected ? '目前題庫' : '切換題庫', async () => {
      selected = record.id; session = null; await storage.putSetting('selected', selected); page = 'today';
    }).disabled = record.id === selected;
    button('移除題庫', async () => {
      if (!confirm(`確定移除「${record.pack.name}」？學習進度將保留。`)) return;
      await storage.removePack(record.id); packs = await storage.listPacks();
      if (selected === record.id) { selected = packs[0]?.id; session = null; await storage.putSetting('selected', selected); }
      message('題庫已移除。');
    });
  }
  node('h3', '安裝題庫');
  const form = node('form');
  const label = node('label', '來源', form); const kind = node('select', undefined, label);
  for (const [value, title] of [['url', '公開網址'], ['github', 'GitHub repo']]) { const opt = node('option', title, kind); opt.value = value; }
  const publicFields = node('div', undefined, form), repoFields = node('div', undefined, form); repoFields.hidden = true;
  const url = field('公開 base URL', '', publicFields, 'url');
  const owner = field('Owner', '', repoFields), repo = field('Repo', '', repoFields), branch = field('分支', 'main', repoFields);
  kind.addEventListener('change', () => { publicFields.hidden = kind.value !== 'url'; repoFields.hidden = kind.value !== 'github'; });
  const submit = node('button', '安裝', form); submit.type = 'submit';
  form.addEventListener('submit', event => { event.preventDefault(); const source = kind.value === 'url' ? { kind: 'url', url: url.value.trim() } : { kind: 'github', owner: owner.value.trim(), repo: repo.value.trim(), branch: branch.value }; void guarded(() => install(source)); });
  node('h3', '共用 GitHub PAT');
  node('p', 'PAT 只存本機 IndexedDB，僅送往 GitHub API。題庫需 Contents 唯讀；未來進度同步需 Contents 讀寫。');
  const patForm = node('form'); const credential = field('PAT（留空可清除）', '', patForm, 'password'); credential.autocomplete = 'off';
  const save = node('button', '儲存 PAT', patForm); save.type = 'submit';
  patForm.addEventListener('submit', event => { event.preventDefault(); const value = credential.value.trim(); credential.value = ''; void guarded(async () => { await storage.putSetting('pat', value); message(value ? 'PAT 已儲存。' : 'PAT 已清除。'); }); });
  const speed = field('語速（0.5–1.5）', String(rate), screen, 'range'); speed.min = '.5'; speed.max = '1.5'; speed.step = '.1';
  speed.addEventListener('change', () => void guarded(async () => { rate = Number(speed.value); await storage.putSetting('rate', rate); }));
  const font = field('字體大小（16–28）', String(parseInt(document.documentElement.style.fontSize) || 18), screen, 'range'); font.min = '16'; font.max = '28';
  font.addEventListener('change', () => void guarded(async () => { document.documentElement.style.fontSize = `${font.value}px`; await storage.putSetting('font', Number(font.value)); }));
}
async function refresh() {
  if (!navigator.onLine) { message('目前離線，使用已儲存的題庫。'); return; }
  const pat = await storage.getSetting('pat') ?? '';
  const errors = [];
  for (const record of packs) {
    try { await storage.putPack(await downloadPack(record.source, pat, record)); }
    catch (error) { errors.push(error.message); }
  }
  packs = await storage.listPacks();
  message(errors.length ? `題庫更新失敗；既有資料仍可使用。${errors.join('；')}` : '題庫檢查完成。');
}
function render() {
  screen.replaceChildren();
  for (const nav of document.querySelectorAll('nav button')) { nav.disabled = busy; if (nav.dataset.page === page) nav.setAttribute('aria-current', 'page'); else nav.removeAttribute('aria-current'); }
  if (page === 'today') showToday(); else if (page === 'quiz') showQuiz(); else if (page === 'settings') showSettings();
  else { node('h2', '統計'); node('p', '統計將於 S3 提供。'); }
}
for (const nav of document.querySelectorAll('nav button')) nav.addEventListener('click', () => { page = nav.dataset.page; render(); });
window.addEventListener('online', () => void guarded(refresh));
window.addEventListener('offline', () => message('目前離線，已儲存的題庫仍可使用。'));
async function start() {
  storage = await openStorage(); packs = await storage.listPacks();
  selected = await storage.getSetting('selected'); if (!packs.some(pack => pack.id === selected)) selected = packs[0]?.id;
  rate = await storage.getSetting('rate') ?? 1;
  document.documentElement.style.fontSize = `${await storage.getSetting('font') ?? 18}px`;
  render(); if (navigator.onLine) await refresh(); else message('目前離線，使用已儲存的題庫。');
}
void guarded(start);
