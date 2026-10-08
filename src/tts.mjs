function normalizeLanguage(lang) {
  return typeof lang === 'string' ? lang.trim().replaceAll('_', '-').toLowerCase() : '';
}
export function matchingVoice(voices, locale) {
  const target = normalizeLanguage(locale);
  if (!target) return undefined;
  const valid = (Array.isArray(voices) ? voices : []).filter(voice => normalizeLanguage(voice?.lang));
  return valid.find(voice => normalizeLanguage(voice.lang) === target) ??
    valid.find(voice => normalizeLanguage(voice.lang).split('-')[0] === target.split('-')[0]);
}
export function languageVoices(voices, locale) {
  const language = normalizeLanguage(locale).split('-')[0];
  return language ? (Array.isArray(voices) ? voices : []).filter(voice =>
    normalizeLanguage(voice?.lang).split('-')[0] === language) : [];
}
export function voiceKey(voice) {
  return JSON.stringify([voice.voiceURI ?? '', voice.name ?? '', normalizeLanguage(voice.lang)]);
}
export function resolveVoice(voices, locale, preference = null) {
  const selected = preference ? languageVoices(voices, locale).find(voice => voiceKey(voice) === preference) : undefined;
  return { voice: selected ?? matchingVoice(voices, locale), fallback: Boolean(preference && !selected) };
}
export function voiceSettingKey(packId) { return JSON.stringify(['voice', packId]); }
export function voiceDiagnostics(voices, locale) {
  const list = Array.isArray(voices) ? voices : [];
  return { count: list.length, langs: list.filter(voice => typeof voice?.lang === 'string').map(voice => voice.lang),
    locale: typeof locale === 'string' ? locale : null, match: matchingVoice(list, locale)?.lang ?? null };
}
export async function speak(text, pack, rate, slow = false, preference = null) {
  if (!pack.capabilities.includes('tts')) return '此題庫未啟用發音';
  const synth = globalThis.speechSynthesis;
  if (!synth || !globalThis.SpeechSynthesisUtterance) return '此裝置不支援發音';
  if (!synth.getVoices().length) await new Promise(resolve => {
    const done = () => { clearTimeout(timer); synth.removeEventListener('voiceschanged', done); resolve(); };
    const timer = setTimeout(done, 1500);
    synth.addEventListener('voiceschanged', done);
  });
  const { voice, fallback } = resolveVoice(synth.getVoices(), pack.locale, preference);
  const fallbackMessage = fallback ? '選定的語音在此裝置上不存在，已退回自動。' : '';
  const missingVoice = `此裝置沒有 ${pack.locale} 的語音，請安裝相應語音後重試`;
  const failure = voice ? '發音失敗，請檢查裝置語音設定' : missingVoice;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = pack.locale; if (voice) utterance.voice = voice;
  utterance.rate = slow ? rate * 0.65 : rate;
  return new Promise(resolve => {
    let settled = false, started = false;
    let timer;
    const finish = (message, cancel = false) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      utterance.onstart = utterance.onend = utterance.onerror = null;
      if (cancel) { try { synth.cancel(); } catch { /* 取消失敗仍恢復介面。 */ } }
      resolve(fallbackMessage + message);
    };
    timer = setTimeout(() => finish(voice ? '發音未能開始，請檢查裝置語音設定後重試' : missingVoice, true), 5000);
    utterance.onstart = () => {
      if (settled || started) return;
      started = true; clearTimeout(timer);
      timer = setTimeout(() => finish('發音逾時，已停止播放，請重試', true), 30000);
    };
    utterance.onend = () => finish('');
    utterance.onerror = () => finish(failure);
    try { synth.speak(utterance); }
    catch { finish(failure, true); }
  });
}
