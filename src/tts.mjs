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
    utterance.onend = () => resolve('');
    utterance.onerror = () => resolve('發音失敗，請檢查裝置語音設定');
    synth.speak(utterance);
  });
}
