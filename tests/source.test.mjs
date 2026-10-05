import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readPackFile, normalizeSource, downloadPack } from '../src/pack-source.mjs';
import { matchingVoice, speak } from '../src/tts.mjs';
const fakeCredential = 'test-only-placeholder';
const samplePack = JSON.parse(await readFile(new URL('../fixtures/sample-pack/pack.json', import.meta.url), 'utf8'));
const voiceFixture = JSON.parse(await readFile(new URL('../fixtures/voices.json', import.meta.url), 'utf8'));
test('公開網址絕不送出共用 PAT，也不跟隨重新導向', async () => {
  await readPackFile({ kind: 'url', url: 'https://example.test/content' }, 'pack.json', fakeCredential, async (url, init) => {
    assert.equal(url, 'https://example.test/content/pack.json'); assert.equal(init.headers.Authorization, undefined);
    assert.equal(init.credentials, 'omit'); assert.equal(init.redirect, 'error'); return { ok: true, json: async () => ({}) };
  });
});
test('GitHub 固定 API 網域、raw Accept、分支編碼', async () => {
  await readPackFile({ kind: 'github', owner: 'sample', repo: 'pack', branch: 'topic/a?x' }, 'items.json', fakeCredential, async (url, init) => {
    assert.equal(new URL(url).origin, 'https://api.github.com'); assert.equal(new URL(url).searchParams.get('ref'), 'topic/a?x');
    assert.equal(init.headers.Accept, 'application/vnd.github.raw'); assert.equal(init.headers.Authorization, `Bearer ${fakeCredential}`); assert.equal(init.redirect, 'error');
    return { ok: true, json: async () => [] };
  });
  assert.equal(normalizeSource({ kind: 'github', owner: 'sample', repo: 'pack' }).branch, 'main');
});
for (const [code, expected] of [[401, /PAT 無效/], [403, /權限不足/], [404, /找不到/], [500, /伺服器/]]) test(`HTTP ${code} 明確提示而不回傳敏感回應`, async () => {
  await assert.rejects(readPackFile({ kind: 'github', owner: 'sample', repo: 'pack' }, 'pack.json', fakeCredential, async () => ({ ok: false, status: code, json: async () => ({ secret: fakeCredential }) })), expected);
});
for (const [code, expected] of [[401, /需要授權/], [403, /無權存取/], [404, /找不到/]]) test(`網址 HTTP ${code} 提示不提 GitHub 授權`, async () => {
  await assert.rejects(readPackFile({ kind: 'url', url: 'https://example.test/' }, 'pack.json', fakeCredential,
    async () => ({ ok: false, status: code })), error => {
    assert.match(error.message, expected);
    assert.doesNotMatch(error.message, /PAT|Contents|private repo|test-only-placeholder/);
    return true;
  });
});
test('JSON 解析失敗指出檔案與規則，不顯示解析器的原文', async () => {
  const path = 'daily/2026-01-01.json';
  await assert.rejects(readPackFile({ kind: 'url', url: 'https://example.test/' }, path, '',
    async () => ({ ok: true, json: async () => { throw new SyntaxError('private-file-content'); } })), error => {
    assert.ok(error.message.includes(path)); assert.match(error.message, /有效的 JSON/);
    assert.doesNotMatch(error.message, /private-file-content/); return true;
  });
});
test('網路例外與 JSON 例外不洩漏憑證', async () => {
  for (const fetcher of [async () => { throw new Error(fakeCredential); }, async () => ({ ok: true, json: async () => { throw new Error(fakeCredential); } })]) {
    await assert.rejects(readPackFile({ kind: 'url', url: 'https://example.test/' }, 'pack.json', fakeCredential, fetcher), error => !error.message.includes(fakeCredential));
  }
});
test('拒絕危險來源與非固定檔案路徑', async () => {
  for (const url of ['file:///tmp/', 'javascript:alert(1)', 'https://user:secret@example.test/', 'https://example.test/?secret=x', 'https://example.test/#x']) assert.throws(() => normalizeSource({ kind: 'url', url }));
  assert.throws(() => normalizeSource({ kind: 'github', owner: 'https://bad.test', repo: 'pack' }));
  assert.throws(() => normalizeSource({ kind: 'github' }));
  await assert.rejects(readPackFile({ kind: 'url', url: 'https://example.test/' }, '../outside.json'));
});
test('首次下載所有 daily，更新只下載新增日期，錯誤不改既有資料', async () => {
  const fetched = [];
  const fetcher = async url => {
    const path = new URL(url).pathname.replace('/content/', ''); fetched.push(path);
    return { ok: true, json: async () => JSON.parse(await readFile(new URL(`../fixtures/sample-pack/${path}`, import.meta.url), 'utf8')) };
  };
  const source = { kind: 'url', url: 'https://example.test/content/' };
  const full = await downloadPack(source, '', null, fetcher); assert.equal(fetched.length, 5);
  fetched.length = 0;
  const old = structuredClone(full); old.index.dates.pop(); delete old.days['2026-01-02'];
  const newer = await downloadPack(source, '', old, fetcher);
  assert.deepEqual(fetched, ['pack.json', 'items.json', 'daily/index.json', 'daily/2026-01-02.json']); assert.equal(newer.index.dates.length, 2); assert.equal(old.index.dates.length, 1);
  fetched.length = 0; await downloadPack(source, '', full, fetcher); assert.equal(fetched.length, 3);
  const before = JSON.stringify(full);
  const badFetcher = async url => {
    const response = await fetcher(url); const data = await response.json();
    if (url.endsWith('daily/index.json')) data.dates = ['2026-01-02'];
    return { ok: true, json: async () => data };
  };
  await assert.rejects(downloadPack(source, '', full, badFetcher), /移除了既有日期/);
  assert.equal(JSON.stringify(full), before);
});
test('語音依題庫 locale 選擇，沒有相應語音不借用其他語言', () => {
  const voices = voiceFixture.voices;
  assert.equal(matchingVoice(voices, samplePack.locale), voices[1]); assert.equal(matchingVoice(voices, voiceFixture.missingLocale), undefined);
});
test('TTS 無支援或題庫未啟用時有明確提示', async () => {
  assert.match(await speak('內容', { ...samplePack, capabilities: [] }, 1), /未啟用/);
  assert.match(await speak('內容', samplePack, 1), /不支援/);
});
test('TTS 使用題庫語言、可調語速與慢速；缺語音有提示', async () => {
  const originalSynth = globalThis.speechSynthesis, originalUtterance = globalThis.SpeechSynthesisUtterance;
  const calls = [];
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  globalThis.speechSynthesis = { getVoices: () => voiceFixture.voices, cancel() {}, speak(utterance) { calls.push(utterance); utterance.onend(); } };
  try {
    assert.equal(await speak('內容', samplePack, 1.2), '');
    assert.equal(await speak('內容', samplePack, 1.2, true), '');
    assert.equal(calls[0].lang, samplePack.locale); assert.equal(calls[0].rate, 1.2); assert.equal(calls[1].rate, 1.2 * .65);
    assert.match(await speak('內容', { ...samplePack, locale: voiceFixture.missingLocale }, 1), /沒有.*語音/);
  } finally { globalThis.speechSynthesis = originalSynth; globalThis.SpeechSynthesisUtterance = originalUtterance; }
});
