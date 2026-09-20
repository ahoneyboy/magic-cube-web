<script setup>
/**
 * TimerView.vue —— 计时挑战（对照小程序 timer.js）
 * 3D 显示打乱后状态且禁止转层（可拖视角对照实体魔方）；Date.now 差值计时；
 * 停止即记录并复位（状态 + 视角）。
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';
import { Play, Square, RefreshCw, BarChart3, Trophy } from 'lucide-vue-next';
import Cube3D from '../components/Cube3D.vue';
import { getType } from '../engine/cubeTypes.js';
import { genRandomMoves } from '../engine/scrambler.js';
import { useRecordsStore, MODE_NAME } from '../stores/records.js';
import { useGameStore } from '../stores/game.js';
import { useLessonsStore } from '../stores/lessons.js';
import { useUiStore } from '../stores/ui.js';
import { useSound } from '../composables/useSound.js';
import { formatDuration } from '../stores/recordsMath.js';

const route = useRoute();
const records = useRecordsStore();
const game = useGameStore();
const lessons = useLessonsStore();
const ui = useUiStore();
const { play } = useSound();

const cubeRef = ref(null);
const scrambleText = ref('');
const state = ref('ready'); // ready | running | done
const display = ref('0.00');
const newBadges = ref([]);

let startAt = 0;
let tickTimer = null;

// 由打乱公式计算最终 facelet（从复原态应用一遍，供 3D 瞬时展示）
function scrambledFacelet(moves) {
  const c = getType('3x3').createCube(getType('3x3').SOLVED);
  c.applyMoves(moves);
  return c.getFacelet();
}

function applyScramble(seq) {
  scrambleText.value = seq || '（自定义打乱）';
  const moves = (seq || '').split(/\s+/).filter(Boolean);
  if (!moves.length) return;
  if (cubeRef.value) {
    // 瞬时切换到打乱状态（不播动画），禁止转层、可拖视角
    cubeRef.value.setState(scrambledFacelet(moves));
    cubeRef.value.setInteractive(false);
  }
}

function regenerate() {
  const moves = genRandomMoves('3x3', 20);
  state.value = 'ready';
  display.value = '0.00';
  newBadges.value = [];
  applyScramble(moves.join(' '));
}

onMounted(() => {
  const seq = (route.query.scramble && String(route.query.scramble)) || '';
  if (seq) applyScramble(seq);
  else regenerate();
});

onBeforeUnmount(() => clearInterval(tickTimer));

function resetCubeView() {
  if (cubeRef.value) cubeRef.value.resetView();
}

function onStartStop() {
  if (state.value === 'ready' || state.value === 'done') {
    startAt = Date.now();
    state.value = 'running';
    play('pop');
    tickTimer = setInterval(() => {
      if (state.value !== 'running') return;
      display.value = formatDuration(Date.now() - startAt);
    }, 47);
  } else if (state.value === 'running') {
    stop();
  }
}

function stop() {
  clearInterval(tickTimer);
  const ms = Date.now() - startAt;
  display.value = formatDuration(ms);
  state.value = 'done';
  play('success');
  // 停表后自动复位：3D 回复原态 + 视角复位
  if (cubeRef.value) cubeRef.value.setState(getType('3x3').SOLVED);
  resetCubeView();
  records.addRecord({ durationMs: ms, mode: 'timer', cubeType: '3x3', scramble: scrambleText.value });
  const ev = game.recordEvent(
    'timer',
    { cubeType: '3x3', durationMs: ms },
    { stats: records.getStats('3x3'), streakDays: records.getStreak(), lessonsDone: lessons.getLessonsDone(), skillLevel: records.levelOf().id }
  );
  newBadges.value = ev.newBadges || [];
  if (ev.newBadges.length) {
    ui.celebrateOnce();
  }
}

const stateText = computed(
  () =>
    ({
      ready: '对照 3D 状态复原实体魔方，点「开始」计时',
      running: '复原中…完成后点「停止」',
      done: '已记录成绩，点「重新打乱」再来一局'
    })[state.value]
);
</script>

<template>
  <div class="page">
    <header class="mb-3 flex items-center justify-between">
      <h1 class="text-2xl font-bold">计时挑战</h1>
      <router-link to="/stats" class="tap flex items-center gap-1 rounded-xl px-2 text-sm text-brand">
        <BarChart3 class="h-4 w-4" /> 我的成绩
      </router-link>
    </header>

    <!-- 3D 展示（禁止转层） -->
    <div class="card overflow-hidden p-2">
      <div class="h-[42vh] min-h-[280px] w-full md:h-[440px]">
        <Cube3D ref="cubeRef" :interactive="false" :touch-enabled="true" />
      </div>
      <p class="min-h-[20px] px-2 pb-2 text-center text-sm text-subtle">{{ stateText }}</p>
    </div>

    <!-- 打乱公式 -->
    <div class="card mt-3 p-4">
      <p class="section-title mb-1">打乱公式</p>
      <p class="break-words font-mono text-sm leading-relaxed text-subtle">{{ scrambleText }}</p>
    </div>

    <!-- 计时器 -->
    <div class="card mt-3 p-6 text-center">
      <div
        class="font-mono font-bold tabular-nums"
        :class="state === 'running' ? 'text-brand' : 'text-ink'"
        :style="{ fontSize: 'clamp(3rem, 14vw, 5rem)', lineHeight: 1.1 }"
      >
        {{ display }}
      </div>
      <div class="mt-4 flex items-center justify-center gap-3">
        <button v-if="state !== 'running'" class="btn-primary min-w-[140px]" @click="onStartStop">
          <Play class="h-5 w-5" /> 开始
        </button>
        <button v-else class="btn-primary min-w-[140px] bg-red-500 shadow-[0_4px_0_rgba(0,0,0,0.2)]" @click="onStartStop">
          <Square class="h-5 w-5" /> 停止
        </button>
        <button class="btn-ghost" :disabled="state === 'running'" @click="regenerate">
          <RefreshCw class="h-4 w-4" /> 重新打乱
        </button>
      </div>
      <div v-if="newBadges.length" class="mt-4 inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1.5 text-sm font-semibold text-brand">
        <Trophy class="h-4 w-4" /> 解锁徽章：{{ newBadges[0].name }}
      </div>
    </div>

    <p class="muted mt-4 text-center">
      计时用 Date.now 差值防漂移 · 停止后自动复位 3D 与视角 · 成绩记入「{{ MODE_NAME.timer }}」
    </p>
  </div>
</template>
