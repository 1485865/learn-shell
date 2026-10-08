import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { speak, matchingVoice, voiceDiagnostics, languageVoices, voiceKey, resolveVoice, voiceSettingKey } from '../src/tts.mjs';
const pack = JSON.parse(await readFile(new URL('../fixtures/sample-pack/pack.json', import.meta.url), 'utf8'));
const fixture = JSON.parse(await readFile(new URL('../fixtures/voices.json', import.meta.url), 'utf8'));
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
for (const lang of fixture.variants) test(`正規化完全比對：${fixture.variants.indexOf(lang)}`, () => {
  const voice = { lang }; assert.equal(matchingVoice([voice], pack.locale), voice);
  assert.equal(matchingVoice([{lang:pack.locale}], lang).lang, pack.locale);
});
test('同語言不同地區與完全相同的優先順序', () => {
  const regional = { lang: fixture.regional }, exact = { lang: fixture.variants[0] };
  assert.equal(matchingVoice([regional], pack.locale), regional);
  assert.equal(matchingVoice([{lang:fixture.otherRegion}, exact], pack.locale), exact);
  assert.equal(matchingVoice([{lang:fixture.distinctLanguage}], pack.locale), undefined);
});
test('缺少、空白、非字串語言與空項目不拋例外或誤匹配', () => {
  const invalid = [null, {}, {lang:null}, {lang:42}, {lang:''}, {lang:'   '}];
  assert.equal(matchingVoice(invalid, pack.locale), undefined);
  assert.equal(matchingVoice(fixture.voices, null), undefined);
});
test('診斷保留原始格式且不回傳名稱或其他欄位', () => {
  const voices = [{lang:fixture.variants[0],name:'must-not-display',localService:true}, fixture.voices[0], {}, {lang:42}];
  assert.deepEqual(voiceDiagnostics(voices, pack.locale), {count:4,langs:[fixture.variants[0],fixture.voices[0].lang],locale:pack.locale,match:fixture.variants[0]});
  assert.deepEqual(voiceDiagnostics([], pack.locale), {count:0,langs:[],locale:pack.locale,match:null});
  assert.deepEqual(voiceDiagnostics(fixture.voices, undefined), {count:2,langs:fixture.voices.map(v=>v.lang),locale:null,match:null});
});
for (const empty of [true, false]) test(`無指定語音仍播放成功：${empty ? '空清單' : '無符合語音'}`, async t => {
  const { synth, calls } = engine(t); synth.getVoices = () => empty ? [] : [fixture.voices[0]];
  let listener; synth.addEventListener = (_, fn) => { listener = fn; }; synth.removeEventListener = (_, fn) => { assert.equal(fn, listener); listener = null; };
  const result = speak('內容', pack, 1);
  if (empty) { t.mock.timers.tick(1500); await Promise.resolve(); assert.equal(listener, null); }
  assert.equal(calls.length, 1); assert.equal(calls[0].lang, pack.locale); assert.equal(Object.hasOwn(calls[0], 'voice'), false);
  calls[0].onend(); assert.equal(await result, ''); t.mock.timers.tick(60000);
});
test('語音清單非同步載入後採用符合語音，並清理監聽', async t => {
  const { synth, calls } = engine(t); let voices = [], listener;
  synth.getVoices = () => voices;
  synth.addEventListener = (_, fn) => { listener = fn; }; synth.removeEventListener = () => { listener = null; };
  const result = speak('內容', pack, 1); voices = [{lang:fixture.variants[0]}]; listener(); await Promise.resolve();
  assert.equal(listener, null); assert.equal(calls[0].voice, voices[0]); calls[0].onend(); assert.equal(await result, '');
});
for (const event of ['error','timeout']) test(`無指定語音實際失敗才提示沒有語音：${event}`, async t => {
  const { synth, calls } = engine(t); synth.getVoices = () => [fixture.voices[0]];
  const result = speak('內容', pack, 1);
  if (event === 'error') calls[0].onerror(); else t.mock.timers.tick(5000);
  assert.equal(await result, `此裝置沒有 ${pack.locale} 的語音，請安裝相應語音後重試`);
  assert.equal(calls[0].onend, null); t.mock.timers.tick(60000);
});
test('無指定語音開始後逾時仍使用播放逾時提示', async t => {
  const { synth, calls } = engine(t); synth.getVoices = () => [fixture.voices[0]];
  const result = speak('內容', pack, 1); calls[0].onstart(); t.mock.timers.tick(30000);
  assert.match(await result, /發音逾時/);
});
test('可選清單包含同語言所有地區，排除其他語言與無效資料', () => {
  const voices = [{lang:pack.locale,name:'Exact'}, {lang:fixture.regional,name:'Regional'}, {lang:fixture.variants[0],name:'Alternative'}, fixture.voices[0], {}, null];
  assert.deepEqual(languageVoices(voices, pack.locale), voices.slice(0,3));
  assert.deepEqual(languageVoices(voices, null), []);
});
test('使用者選擇優先於自動；缺少或不同語言的選擇退回自動', () => {
  const exact = {lang:pack.locale,name:'Exact',voiceURI:'one'}, region = {lang:fixture.regional,name:'Regional',voiceURI:'two'};
  assert.deepEqual(resolveVoice([exact,region],pack.locale), {voice:exact,fallback:false});
  assert.deepEqual(resolveVoice([exact,region],pack.locale,voiceKey(region)), {voice:region,fallback:false});
  assert.deepEqual(resolveVoice([exact],pack.locale,voiceKey(region)), {voice:exact,fallback:true});
  assert.deepEqual(resolveVoice([],pack.locale,voiceKey(region)), {voice:undefined,fallback:true});
  assert.equal(resolveVoice([exact,fixture.voices[0]],pack.locale,voiceKey(fixture.voices[0])).fallback,true);
});
test('同語言多個語音可分辨，儲存鍵依題庫隔離', () => {
  const a={lang:pack.locale,name:'A',voiceURI:'a'}, b={...a,name:'B',voiceURI:'b'};
  assert.notEqual(voiceKey(a),voiceKey(b));
  assert.equal(resolveVoice([a,b],pack.locale,voiceKey(b)).voice,b);
  assert.notEqual(voiceSettingKey('pack-a'),voiceSettingKey('pack-b'));
  assert.notEqual(voiceSettingKey('pat'),'pat');
});
test('一般與慢速播放都採用選擇，保留題庫的原始 locale', async t => {
  const {synth,calls}=engine(t); const chosen={lang:fixture.regional,name:'Selected',voiceURI:'selected'};
  synth.getVoices=()=>[{lang:pack.locale},chosen];
  for (const slow of [false,true]) {
    const result=speak('內容',pack,1.2,slow,voiceKey(chosen));
    const utterance=calls.at(-1); assert.equal(utterance.voice,chosen); assert.equal(utterance.lang,pack.locale);
    assert.equal(utterance.rate,slow?1.2*.65:1.2); utterance.onend(); assert.equal(await result,'');
  }
});
test('選定語音消失：成功播放自動語音仍提示備援', async t => {
  const {calls}=engine(t); const result=speak('內容',pack,1,false,'missing-selection');
  assert.equal(calls[0].voice.lang,pack.locale); calls[0].onend(); assert.match(await result,/已退回自動/);
});
test('選定語音消失且沒有符合語音：交給系統，失敗訊息保留備援提示', async t => {
  const {synth,calls}=engine(t); synth.getVoices=()=>[fixture.voices[0]];
  const result=speak('內容',pack,1,false,'missing-selection');
  assert.equal(Object.hasOwn(calls[0],'voice'),false); calls[0].onerror();
  const message=await result; assert.match(message,/已退回自動/); assert.ok(message.includes(pack.locale));
});
