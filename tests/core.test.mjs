import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateBundle, validatePack, validDate } from '../src/core/validate-pack.mjs';
import { todayInZone, earliestUnlearned } from '../src/core/dates.mjs';
import { createSession, nextCard, answerQuestion, nextQuestion } from '../src/core/session.mjs';
const read = async path => JSON.parse(await readFile(new URL(`../fixtures/sample-pack/${path}`, import.meta.url), 'utf8'));
const pack = await read('pack.json'), items = await read('items.json'), index = await read('daily/index.json');
const days = Object.fromEntries(await Promise.all(index.dates.map(async date => [date, await read(`daily/${date}.json`)])));
export const bundle = { schemaVersion: 1, id: pack.id, pack, items, index, days };
test('示範題庫完整驗證', () => assert.equal(validateBundle(bundle), bundle));
const broken = [
  ['版本', b => b.pack.formatVersion = 2],
  ['本機 id 不符', b => b.id = 'other'],
  ['必要欄位', b => delete b.pack.locale],
  ['無效時區', b => b.pack.timezone = 'invalid'],
  ['無效語言', b => b.pack.locale = '!'],
  ['每日數量', b => b.pack.daily.maxReviews = -1],
  ['重複項目', b => b.items.push(b.items[0])],
  ['非字串欄位', b => b.items[0].fields.bad = {}],
  ['日期不存在', b => b.index.dates[0] = '2026-02-30'],
  ['日期未排序', b => b.index.dates.reverse()],
  ['缺每日檔', b => delete b.days[index.dates[0]]],
  ['每日日期錯位', b => b.days[index.dates[0]].date = index.dates[1]],
  ['未知項目', b => b.days[index.dates[0]].questions[0].itemId = 'missing'],
  ['重複選項', b => b.days[index.dates[0]].questions[0].options[1] = b.days[index.dates[0]].questions[0].options[0]],
  ['答案不在選項', b => b.days[index.dates[0]].questions[0].answer = 'missing'],
  ['缺解釋', b => delete b.days[index.dates[0]].questions[0].explanation],
  ['缺朗讀內容', b => delete b.days[index.dates[0]].questions[1].speak],
  ['填空無標記', b => b.days[index.dates[0]].questions[3].prompt = 'missing'],
  ['跨日重複題目', b => b.days[index.dates[1]].questions[0].id = b.days[index.dates[0]].questions[0].id]
];
for (const [name, mutate] of broken) test(`拒絕壞資料：${name}`, () => { const b = structuredClone(bundle); mutate(b); assert.throws(() => validateBundle(b), /題庫格式錯誤/); });
test('不可信 HTML 保留為資料，不當作格式語法', () => {
  const b = structuredClone(bundle); b.items[0].front = '<img src=x onerror=alert(1)>'; assert.doesNotThrow(() => validateBundle(b));
});
test('未知題型驗證後跳過，已知題仍可完成', () => {
  const b = structuredClone(bundle); b.days[index.dates[0]].questions.push({ id: 'future', itemId: items[0].id, type: 'future-type' });
  validateBundle(b); const s = createSession(b.days[index.dates[0]]); assert.equal(s.skipped, true); assert.equal(s.questions.length, 4);
});
test('日期依題庫時區與跨午夜計算', () => {
  const time = '2026-01-01T16:00:00Z';
  assert.equal(todayInZone(time, pack.timezone), '2026-01-02');
  assert.equal(todayInZone(time, 'UTC'), '2026-01-01');
  assert.equal(validDate('2024-02-29'), true); assert.equal(validDate('2026-02-29'), false);
});
test('依最早未學日期；不取未來日期、不跳過缺席內容', () => {
  assert.equal(earliestUnlearned(index.dates, [], '2026-10-05'), index.dates[0]);
  assert.equal(earliestUnlearned(index.dates, [index.dates[0]], '2026-10-05'), index.dates[1]);
  assert.equal(earliestUnlearned(index.dates, [], '2025-12-31'), null);
  assert.equal(earliestUnlearned(index.dates, index.dates, '2026-10-05'), null);
});
test('四題型與卡片順序、錯誤解釋、重複提交與完成', () => {
  let s = createSession(days[index.dates[0]]);
  assert.equal(s.phase, 'cards'); s = nextCard(s); assert.equal(s.phase, 'cards'); s = nextCard(s);
  for (let i = 0; i < 4; i++) {
    assert.equal(s.phase, 'questions'); assert.equal(nextQuestion(s), s);
    const q = s.questions[i]; s = answerQuestion(s, i === 0 ? 'missing' : ` ${q.answer} `.trim());
    assert.equal(s.correct, i !== 0); if (!s.correct) assert.ok(q.explanation);
    assert.equal(answerQuestion(s, q.answer), s); s = nextQuestion(s);
  }
  assert.equal(s.phase, 'complete'); assert.equal(answerQuestion(s, 'anything'), s);
});
test('輸入比對忽略大小寫及前後空白', () => {
  const q = { id: 'case', itemId: 's01', type: 'input', prompt: '?', answer: 'MiXeD', explanation: '測試' };
  const s = createSession({ date: index.dates[0], items: [], questions: [q] });
  assert.equal(answerQuestion(s, ' mixed ').correct, true);
  assert.equal(answerQuestion(s, 'mix ed').correct, false);
});
test('空每日資料直接完成，不索引不存在的卡片', () => assert.equal(createSession({ date: index.dates[0], items: [], questions: [] }).phase, 'complete'));
test('沒有 capabilities 的欄位不能省略', () => { const p = structuredClone(pack); delete p.capabilities; assert.throws(() => validatePack(p)); });
for (const [file, rule, mutate] of [
  ['pack.json', /locale/, b => b.pack.locale = 'private-file-content!'],
  ['pack.json', /timezone/, b => b.pack.timezone = 'private-file-content'],
  ['pack.json', /daily.maxReviews/, b => b.pack.daily.maxReviews = 'private-file-content'],
  ['items.json', /\[0\].*fields/, b => b.items[0].fields = 'private-file-content'],
  ['daily/index.json', /dates\[0\].*有效日期/, b => b.index.dates[0] = 'private-file-content'],
  ['daily/2026-01-01.json', /items\[0\].*front/, b => b.days[index.dates[0]].items[0].front = {}],
  ['daily/2026-01-01.json', /questions\[0\].*explanation/, b => {
    const q = b.days[index.dates[0]].questions[0]; q.id = 'private-file-content'; q.prompt = 'private-file-content'; delete q.explanation;
  }],
  ['daily/2026-01-01.json', /questions\[0\].*options/, b => b.days[index.dates[0]].questions[0].options = ['private-file-content']],
  ['daily/2026-01-01.json', /daily 必須是物件/, b => delete b.days[index.dates[0]]],
  ['daily/2026-01-02.json', /questions\[0\].*跨日重複/, b => b.days[index.dates[1]].questions[0].id = b.days[index.dates[0]].questions[0].id]
]) test(`驗證定位 ${file} ${rule}`, () => {
  const b = structuredClone(bundle); mutate(b);
  assert.throws(() => validateBundle(b), error => {
    assert.ok(error.message.includes(`[${file}]`)); assert.match(error.message, rule);
    assert.doesNotMatch(error.message, /private-file-content/); return true;
  });
});
