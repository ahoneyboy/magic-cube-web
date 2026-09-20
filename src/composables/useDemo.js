/**
 * useDemo.js —— 解法/公式逐步演示编排（对照 play.js playSol + lesson.js playDemo）
 *
 * 统一语义：转动固定 500ms，速度设置 = 每步总时长（500ms + 等待剩余）。
 * 统一起点：演示前由调用方把魔方复位到起始 facelet（切标签 / 从头演示时必须复位）。
 */
import { ref, computed } from 'vue';
import { useSettingsStore } from '../stores/settings.js';
import { useSound } from './useSound.js';

export function useDemo() {
  const settings = useSettingsStore();
  const { play: playSound } = useSound();

  const playing = ref(false);
  const activeIndex = ref(-1);
  const caption = ref('');

  let timer = null;
  let startFacelet = null;
  let onFinish = null;

  const progressLabel = computed(() =>
    activeIndex.value >= 0 ? `${activeIndex.value + 1}` : ''
  );

  /** 记录统一起点（打乱完成态 / 课程起始态） */
  function setStartFacelet(facelet) {
    startFacelet = facelet;
  }

  /** 复位到统一起点（中止进行中的演示与动画） */
  function resetToStart(cube) {
    stopTimer();
    if (cube && startFacelet) {
      cube.setState(startFacelet);
      cube.setInteractive(false);
    }
  }

  function stopTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  /**
   * 开始 / 继续演示
   * @param {Object} cube Cube3D 组件实例
   * @param {string[]} moves 序列
   * @param {Object} opts { fromIndex, resetFirst, stepMs, captions(i, m), finished, highlight }
   */
  function play(cube, moves, opts = {}) {
    if (playing.value) {
      pause();
      return;
    }
    if (!moves.length || !cube) return false;
    playing.value = true;
    cube.setInteractive(false);
    let from = opts.fromIndex != null ? opts.fromIndex : activeIndex.value + 1;
    if (from >= moves.length) from = 0; // 已播完：重新从头
    if (from === 0 || opts.resetFirst) {
      resetToStart(cube); // 从头播：必须回到统一起点
    }
    if (opts.finished) onFinish = opts.finished;
    step(cube, moves, from, opts);
    return true;
  }

  function step(cube, moves, i, opts) {
    if (!playing.value) return;
    if (i >= moves.length) {
      playing.value = false;
      activeIndex.value = -1;
      const cb = onFinish;
      onFinish = null;
      if (cb) cb();
      return;
    }
    activeIndex.value = i;
    const m = moves[i];
    caption.value = opts.captions ? opts.captions(i, m) : m;
    if (opts.highlight !== false && cube.highlight) {
      cube.highlight(m);
    }
    playSound('turn');
    const turnMs = opts.turnMs || 500;
    const stepMs = opts.stepMs || settings.demoDurationMs;
    const waitMs = Math.max(0, stepMs - turnMs);
    cube.move(m, {
      duration: turnMs,
      onDone: () => {
        if (!playing.value) return;
        stopTimer();
        timer = setTimeout(() => {
          timer = null;
          if (!playing.value) return;
          if (opts.highlight !== false && cube.clearHighlight) cube.clearHighlight();
          step(cube, moves, i + 1, opts);
        }, waitMs);
      }
    });
  }

  function pause() {
    playing.value = false;
    stopTimer();
    if (onFinish) onFinish = null;
  }

  function stop(cube) {
    pause();
    activeIndex.value = -1;
    caption.value = '';
    if (cube && cube.clearHighlight) cube.clearHighlight();
  }

  return {
    playing,
    activeIndex,
    caption,
    progressLabel,
    setStartFacelet,
    resetToStart,
    play,
    pause,
    stop
  };
}
