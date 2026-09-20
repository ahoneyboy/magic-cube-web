/**
 * useSound.js —— Web Audio 合成音效（对照小程序 utils/sound.js 职责 + scripts/gen-audio.js 合成参数）
 *
 * - turn：160ms 木质"哒"（带通噪声瞬态 + 阻尼共鸣），±12% 随机音量防机关枪感
 * - pop：短促"啵"（正弦 + 快速衰减）
 * - success：上行三音琶音
 * 复用同一个 AudioContext；开关读设置（settings.sound）。
 */
import { useSettingsStore } from '../stores/settings.js';

let ctx = null;

function audioCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

/** 木质"哒"：噪声瞬态（带通 900Hz）+ 阻尼共鸣（430Hz / 720Hz 双模式） */
function synthTurn() {
  const ac = audioCtx();
  if (!ac) return;
  const t0 = ac.currentTime;
  const out = ac.createGain();
  out.gain.value = 0.88 + Math.random() * 0.24; // ±12% 随机音量
  out.connect(ac.destination);

  // 1) 带通噪声瞬态（转轴摩擦）
  const len = Math.floor(ac.sampleRate * 0.05);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
  }
  const noise = ac.createBufferSource();
  noise.buffer = buf;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 900 + Math.random() * 250;
  bp.Q.value = 1.1;
  const nGain = ac.createGain();
  nGain.gain.setValueAtTime(0.5, t0);
  nGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.06);
  noise.connect(bp).connect(nGain).connect(out);
  noise.start(t0);

  // 2) 阻尼共鸣（木壳腔体）
  [430, 720].forEach((freq, i) => {
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq * (0.97 + Math.random() * 0.06);
    const g = ac.createGain();
    g.gain.setValueAtTime(i === 0 ? 0.22 : 0.1, t0);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.16);
    osc.connect(g).connect(out);
    osc.start(t0);
    osc.stop(t0 + 0.17);
  });
}

/** 短促"啵"（按钮/提示） */
function synthPop() {
  const ac = audioCtx();
  if (!ac) return;
  const t0 = ac.currentTime;
  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(620, t0);
  osc.frequency.exponentialRampToValueAtTime(300, t0 + 0.09);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.3, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + 0.13);
}

/** 上行三音琶音（成功） */
function synthSuccess() {
  const ac = audioCtx();
  if (!ac) return;
  const t0 = ac.currentTime;
  [523.25, 659.25, 783.99].forEach((freq, i) => {
    const osc = ac.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const g = ac.createGain();
    const start = t0 + i * 0.11;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(0.26, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, start + 0.42);
    osc.connect(g).connect(ac.destination);
    osc.start(start);
    osc.stop(start + 0.45);
  });
}

const SYNTHS = { turn: synthTurn, pop: synthPop, success: synthSuccess };

export function useSound() {
  function play(name) {
    const settings = useSettingsStore();
    if (settings.loaded && settings.sound === false) return;
    const fn = SYNTHS[name];
    if (fn) {
      try {
        fn();
      } catch (e) {
        /* 音频失败不影响功能 */
      }
    }
  }
  return { play };
}
