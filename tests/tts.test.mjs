import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { speak } from '../src/tts.mjs';
const pack = JSON.parse(await readFile(new URL('../fixtures/sample-pack/pack.json', import.meta.url), 'utf8'));
function engine(t) {
  const original = { synth: globalThis.speechSynthesis, utterance: globalThis.SpeechSynthesisUtterance };
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = [], cancelled = [];
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  const synth = { getVoices: () => [{ lang: pack.locale }], cancel: () => cancelled.push(true), speak: utterance => calls.push(utterance) };
  globalThis.speechSynthesis = synth;
  t.after(() => { globalThis.speechSynthesis = original.synth; globalThis.SpeechSynthesisUtterance = original.utterance; });
  return { calls, cancelled, synth };
}
test('發音未開始：5 秒後取消、回傳提示並可再次播放', async t => {
  const { calls, cancelled } = engine(t);
  const result = speak('內容', pack, 1); let done = false; result.then(() => { done = true; });
  t.mock.timers.tick(4999); await Promise.resolve(); assert.equal(done, false);
  const lateEnd = calls[0].onend;
  t.mock.timers.tick(1); assert.match(await result, /未能開始/); assert.equal(cancelled.length, 2);
  assert.equal(calls[0].onstart, null); assert.equal(calls[0].onend, null); assert.equal(calls[0].onerror, null);
  lateEnd();
  const retry = speak('重試', pack, 1); calls[1].onstart(); calls[1].onend(); assert.equal(await retry, '');
});
test('發音已開始但未結束：30 秒後恢復，不被重複 start 延長', async t => {
  const { calls, cancelled } = engine(t);
  const result = speak('內容', pack, 1); let done = false; result.then(() => { done = true; });
  t.mock.timers.tick(4000); calls[0].onstart();
  t.mock.timers.tick(29999); calls[0].onstart(); await Promise.resolve(); assert.equal(done, false);
  t.mock.timers.tick(1); assert.match(await result, /發音逾時/); assert.equal(cancelled.length, 2);
  assert.equal(calls[0].onend, null);
});
for (const event of ['onend', 'onerror']) test(`正常 ${event} 清除逾時，不影響下一次播放`, async t => {
  const { calls, cancelled } = engine(t);
  const result = speak('內容', pack, 1); calls[0].onstart(); calls[0][event]();
  assert.equal(await result, event === 'onend' ? '' : '發音失敗，請檢查裝置語音設定');
  const retry = speak('重試', pack, 1); calls[1].onstart(); t.mock.timers.tick(20000);
  assert.equal(cancelled.length, 2); calls[1].onend(); assert.equal(await retry, '');
  t.mock.timers.tick(60000); assert.equal(cancelled.length, 2);
});
test('語音引擎同步拋錯仍回傳安全提示與清除逾時', async t => {
  const { synth, cancelled } = engine(t);
  synth.speak = () => { throw new Error('private-engine-content'); };
  assert.equal(await speak('內容', pack, 1), '發音失敗，請檢查裝置語音設定');
  t.mock.timers.tick(60000); assert.equal(cancelled.length, 2);
});
test('逾時取消也拋錯時，仍結束等待恢復操作', async t => {
  const { synth } = engine(t); const result = speak('內容', pack, 1);
  synth.cancel = () => { throw new Error('private-engine-content'); };
  t.mock.timers.tick(5000); assert.match(await result, /未能開始/);
});
