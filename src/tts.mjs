export function matchingVoice(voices, locale) {
  const target = locale.toLowerCase();
  return voices.find(voice => voice.lang.toLowerCase() === target) ??
    voices.find(voice => voice.lang.toLowerCase().split('-')[0] === target.split('-')[0]);
}
export async function speak(text, pack, rate, slow = false) {
  if (!pack.capabilities.includes('tts')) return '此題庫未啟用發音';
  const synth = globalThis.speechSynthesis;
  if (!synth || !globalThis.SpeechSynthesisUtterance) return '此裝置不支援發音';
  if (!synth.getVoices().length) await new Promise(resolve => {
    const done = () => { clearTimeout(timer); synth.removeEventListener('voiceschanged', done); resolve(); };
    const timer = setTimeout(done, 1500);
    synth.addEventListener('voiceschanged', done);
  });
  const voice = matchingVoice(synth.getVoices(), pack.locale);
  if (!voice) return `此裝置沒有 ${pack.locale} 的語音，請安裝相應語音後重試`;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = pack.locale; utterance.voice = voice; utterance.rate = slow ? rate * 0.65 : rate;
  return new Promise(resolve => {
    let settled = false, started = false;
    let timer;
    const finish = (message, cancel = false) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      utterance.onstart = utterance.onend = utterance.onerror = null;
      if (cancel) { try { synth.cancel(); } catch { /* 取消失敗仍恢復介面。 */ } }
      resolve(message);
    };
    timer = setTimeout(() => finish('發音未能開始，請檢查裝置語音設定後重試', true), 5000);
    utterance.onstart = () => {
      if (settled || started) return;
      started = true; clearTimeout(timer);
      timer = setTimeout(() => finish('發音逾時，已停止播放，請重試', true), 30000);
    };
    utterance.onend = () => finish('');
    utterance.onerror = () => finish('發音失敗，請檢查裝置語音設定');
    try { synth.speak(utterance); }
    catch { finish('發音失敗，請檢查裝置語音設定', true); }
  });
}
