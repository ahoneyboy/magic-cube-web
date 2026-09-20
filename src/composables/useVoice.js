/**
 * useVoice.js —— 语音提示（Web 替代：SpeechSynthesis TTS，对照小程序 utils/voice.js 职责）
 * 语音缺失不影响任何功能；开关读设置（settings.voice）。
 */
import { useSettingsStore } from '../stores/settings.js';

let available = typeof window !== 'undefined' && 'speechSynthesis' in window;

export function useVoice() {
  function speak(text) {
    const settings = useSettingsStore();
    if (!available || settings.loaded === false) return;
    if (settings.voice === false) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(text).slice(0, 150));
      u.lang = 'zh-CN';
      u.rate = 1.05;
      window.speechSynthesis.speak(u);
    } catch (e) {
      /* 静默降级为文字（调用方保证文案同时渲染在界面上） */
    }
  }
  function stop() {
    if (!available) return;
    try {
      window.speechSynthesis.cancel();
    } catch (e) {
      /* 忽略 */
    }
  }
  return { speak, stop, isAvailable: available };
}
