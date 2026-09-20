/**
 * useScramble.js —— 打乱编排（对照小程序 play.js 打乱段）
 *
 * WCA 随机状态打乱（Worker 多次求解取 ≤20 最短，回退随机步）；
 * 动画播放：每步总时长 = 设置秒数，转动固定 500ms + 等待剩余；
 * 支持暂停 / 继续 / 跳过动画；跳过时一次性应用剩余步。
 */
import { ref } from 'vue';
import { getType } from '../engine/cubeTypes.js';
import { validateScramble, genRandomMoves } from '../engine/scrambler.js';
import { randomStateScramble3x3 } from './useKociemba.js';
import { useSettingsStore } from '../stores/settings.js';
import { useSound } from './useSound.js';

export function useScramble() {
  const settings = useSettingsStore();
  const { play } = useSound();

  const scrambling = ref(false);
  const paused = ref(false);
  const skipping = ref(false);
  const sequence = ref([]); // 公式列表
  const activeIndex = ref(-1);
  const mode = ref(''); // 'random-state' | 'random-move'

  let timers = [];
  let inflight = false;
  let onFinished = null;

  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  /** 生成 WCA 打乱公式（random-state 优先，校验失败回退随机步） */
  async function generate(cubeType) {
    if (cubeType === '3x3') {
      const { moves, mode: m } = await randomStateScramble3x3();
      const check = validateScramble('3x3', moves);
      if (check.ok) return { moves, mode: m };
    }
    return { moves: genRandomMoves(cubeType, cubeType === '2x2' ? 11 : 20), mode: 'random-move' };
  }

  /**
   * 开始打乱动画（cube 组件需已复位到复原态并锁定）
   * @param {Object} cube Cube3D 组件实例（有 move/applyMoves）
   * @param {string[]} moves 公式
   * @param {Function} finished 全部完成后回调
   */
  function playSteps(cube, moves, finished) {
    onFinished = finished;
    // 新打乱开始时才重置跳过标志：上一次 skip 之后保持 true，
    // 进行中那一步动画的 onDone 依赖它直接返回（见 finish 注释）
    skipping.value = false;
    playStep(cube, moves, 0);
  }

  function playStep(cube, moves, i) {
    if (skipping.value) return; // 跳过由 skip() 统一处理
    if (paused.value) return; // 暂停：停在当前步
    if (i >= moves.length) {
      finish(cube, moves);
      return;
    }
    activeIndex.value = i;
    const isLast = i === moves.length - 1;
    inflight = true;
    play('turn');
    const { turnMs, waitMs } = stepTimingsOf(settings.scrambleSec);
    cube.move(moves[i], {
      duration: turnMs,
      onDone: () => {
        inflight = false;
        if (skipping.value || paused.value) return;
        const t = setTimeout(() => {
          if (skipping.value || paused.value) return;
          if (isLast) finish(cube, moves);
          else playStep(cube, moves, i + 1);
        }, waitMs);
        timers.push(t);
      }
    });
  }

  function finish(cube, moves) {
    clearTimers();
    // 注意：这里不清除 skipping —— 正在播放的那一步动画结束后，它的 onDone 依赖
    // skipping=true 直接返回以终止链式播放（剩余步数已由 skip() 一次性应用；
    // 若在此清除会导致链条复活、剩余步数被二次应用——对照小程序 play.js finishScramble）。
    // skipping 在下一次 playSteps / abort 时才重置。
    paused.value = false;
    inflight = false;
    scrambling.value = false;
    activeIndex.value = moves.length - 1;
    if (onFinished) {
      const cb = onFinished;
      onFinished = null;
      cb();
    }
  }

  /** 生成期间已点「跳过」：公式生成完毕后一次性应用整条并收尾（对照小程序 onScramble 的 then 分支） */
  function finishSkippedInstantly(cube, moves, finished) {
    sequence.value = moves;
    activeIndex.value = moves.length - 1;
    if (cube && moves.length) {
      cube.applyMoves(moves, { duration: 90 });
    }
    onFinished = finished;
    finish(cube, moves);
  }

  /** 暂停：只放开视角（由调用方设置 cube.setTouchEnabled），停在下一条 */
  function pause() {
    if (!scrambling.value || skipping.value) return;
    clearTimers();
    paused.value = true;
  }

  /** 继续：从当前步的下一条重新启动播放链；有动画在飞时由其 onDone 接上 */
  function resume(cube, moves) {
    if (!paused.value) return;
    paused.value = false;
    if (inflight) return;
    const next = activeIndex.value + 1;
    if (next < moves.length) playStep(cube, moves, next);
    else finish(cube, moves);
  }

  /** 跳过动画：剩余步一次性应用（快速动画追平）并收尾 */
  function skip(cube, moves) {
    if (!scrambling.value || skipping.value) return;
    skipping.value = true;
    clearTimers();
    paused.value = false;
    const from = activeIndex.value + 1;
    if (cube && from < moves.length) {
      cube.applyMoves(moves.slice(from), { duration: 90 });
    }
    finish(cube, moves);
  }

  /** 中止（不打乱收尾状态） */
  function abort() {
    clearTimers();
    skipping.value = false;
    paused.value = false;
    inflight = false;
    scrambling.value = false;
    onFinished = null;
  }

  function stepTimingsOf(sec) {
    const totalMs = Math.round(sec * 1000);
    return { turnMs: 500, waitMs: Math.max(0, totalMs - 500) };
  }

  return {
    scrambling,
    paused,
    skipping,
    sequence,
    activeIndex,
    mode,
    generate,
    playSteps,
    pause,
    resume,
    skip,
    abort,
    finishSkippedInstantly,
    stepTimingsOf
  };
}
