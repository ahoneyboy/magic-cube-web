<script setup>
/**
 * PlayView.vue —— 玩转魔方（对照小程序 packageCube/pages/play/play.js）
 *
 * 视角规则（§5.1）：页面内禁止自转；「打乱」先复位视角到白顶绿前再开始、全程锁定；
 * 「复原」= 状态回复原态 + 视角复位 + 解锁自由玩。
 * 打乱中可「暂停/继续/跳过动画」，期间禁止手动转层；完成进入结果锁定。
 */
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { Shuffle, RotateCcw, Brain, Timer, Sparkles, Pause, Play, FastForward, Lock, ScanLine } from 'lucide-vue-next';
import Cube3D from '../components/Cube3D.vue';
import SolutionPanel from '../components/SolutionPanel.vue';
import SpeedCard from '../components/SpeedCard.vue';
import { useScramble } from '../composables/useScramble.js';
import { useSound } from '../composables/useSound.js';
import { kociembaStatus, onKociembaReady } from '../composables/useKociemba.js';
import { isSolvedUpToRotation } from '../engine/cube.js';
import { getType } from '../engine/cubeTypes.js';
import { useSettingsStore } from '../stores/settings.js';
import { useRecordsStore } from '../stores/records.js';
import { useGameStore } from '../stores/game.js';
import { useLessonsStore } from '../stores/lessons.js';
import { useUiStore } from '../stores/ui.js';

const router = useRouter();
const route = useRoute();
const settings = useSettingsStore();
const records = useRecordsStore();
const game = useGameStore();
const lessons = useLessonsStore();
const ui = useUiStore();
const { play } = useSound();

const scramble = useScramble();
const cubeRef = ref(null);

const status = ref('在魔方上滑动就能转动它！');
const solverReady = ref(kociembaStatus().ready);
onKociembaReady(() => {
  solverReady.value = true;
});
const resultLocked = ref(false); // 打乱完成后结果锁定（防误转破坏公式）
const solPanel = ref(false);
const solStartFacelet = ref('');

const interactive = computed(() => !scramble.scrambling.value && !resultLocked.value && !solPanel.value);
const touchEnabled = computed(() => !scramble.scrambling.value || !scramble.paused.value);

// 统一的交互锁同步（对照 play.js syncLockState）：
// 打乱中完全不可交互（暂停时仅放开视角）；结果锁定/面板打开 = 禁转层可看；其余自由玩
watch(interactive, (v) => cubeRef.value && cubeRef.value.setInteractive(v));
watch(touchEnabled, (v) => cubeRef.value && cubeRef.value.setTouchEnabled(v));

function lockNow() {
  if (!cubeRef.value) return;
  cubeRef.value.setInteractive(interactive.value);
  cubeRef.value.setTouchEnabled(touchEnabled.value);
}

onMounted(() => {
  lockNow();
  const type = getType('3x3');
  if (cubeRef.value) cubeRef.value.setState(type.SOLVED);
  // 拍照识别进入：载入识别出的状态并自动打开「看解法」（与打乱后一致）
  const facelet = route.query.facelet && String(route.query.facelet);
  if (route.query.fromScan && facelet && cubeRef.value) {
    cubeRef.value.setState(facelet, { resetView: true });
    scramble.sequence.value = ['—'];
    resultLocked.value = true;
    setTimeout(() => onShowSolution(), 350);
  }
});

// ---- 打乱 ----
async function onScramble() {
  if (!cubeRef.value || scramble.scrambling.value) return;
  if (cubeRef.value.isAnimating()) return;
  closeSolPanel();
  resultLocked.value = false;
  // 每次打乱从复原态 + 默认视角开始（白顶绿前），全程视角锁定
  const type = getType('3x3');
  cubeRef.value.setAutoSpin(false);
  cubeRef.value.setState(type.SOLVED, { resetView: true });
  scramble.scrambling.value = true;
  scramble.paused.value = false;
  scramble.skipping.value = false;
  scramble.sequence.value = [];
  scramble.activeIndex.value = -1;
  lockNow(); // 完全不可交互
  status.value = '生成 WCA 标准打乱中…';

  const { moves, mode } = await scramble.generate('3x3');
  if (!scramble.scrambling.value) return; // 生成期间已被「复原」取消
  scramble.sequence.value = moves;
  scramble.mode.value = mode === 'random-state' ? 'WCA 随机状态打乱' : 'WCA 随机步打乱';
  status.value = scramble.paused.value ? '已暂停：点「继续」开始演示' : '打乱演示中…';

  scramble.playSteps(cubeRef.value, moves, () => {
    // 打乱完成 → 结果锁定：禁止转层、仍可拖动视角
    resultLocked.value = true;
    cubeRef.value.setAutoSpin(false);
    cubeRef.value.resetView();
    status.value = '打乱完成！可「看解法」或「去计时」';
    lockNow();
  });
}

function onPauseScramble() {
  if (!scramble.scrambling.value) return;
  if (scramble.paused.value) {
    scramble.resume(cubeRef.value, scramble.sequence.value);
    status.value = '打乱演示中…';
  } else {
    scramble.pause();
    status.value = '已暂停：可拖动查看，点「继续」接着打乱';
  }
  lockNow();
}

function onSkipScramble() {
  if (!scramble.scrambling.value) return;
  scramble.skip(cubeRef.value, scramble.sequence.value);
  resultLocked.value = true;
  status.value = '打乱完成！可「看解法」或「去计时」';
  lockNow();
}

// ---- 复原（= 状态复位 + 视角复位 + 解锁自由玩）----
function onReset() {
  if (!cubeRef.value) return;
  scramble.abort();
  closeSolPanel();
  resultLocked.value = false;
  const type = getType('3x3');
  cubeRef.value.setState(type.SOLVED, { resetView: true });
  cubeRef.value.setAutoSpin(false);
  status.value = '已复原并解锁，自由玩吧！';
  lockNow();
}

// ---- 看解法（从打乱完成态演示）----
function onShowSolution() {
  if (!cubeRef.value || scramble.scrambling.value) return;
  const facelet = cubeRef.value.getFacelet();
  if (isSolvedUpToRotation(facelet)) {
    ui.showToast('魔方已经是复原态啦，先打乱吧', 'info');
    return;
  }
  solStartFacelet.value = facelet; // 面板打开时记录统一起点
  solPanel.value = true;
  lockNow();
}
function closeSolPanel() {
  solPanel.value = false;
  lockNow();
}
function onDemoFinished() {
  // 演示把魔方复原 → 打乱结果被消费，解除锁定
  resultLocked.value = false;
  status.value = '解法演示完成，魔方复原啦！🎉';
  lockNow();
}

// ---- 去计时（带打乱公式）----
function goTimer() {
  const seq = scramble.sequence.value.join(' ');
  router.push({ path: '/timer', query: seq ? { scramble: seq } : {} });
}

// ---- 自由玩复原庆祝（解法演示/打乱中不触发）----
function onCubeSolved() {
  if (solPanel.value || scramble.scrambling.value) return;
  const facelet = cubeRef.value && cubeRef.value.getFacelet();
  if (!facelet || !isSolvedUpToRotation(facelet)) return;
  play('success');
  ui.celebrateOnce();
  records.addRecord({ durationMs: 0, mode: 'free', cubeType: '3x3' });
  const ev = game.recordEvent(
    'solve',
    { cubeType: '3x3' },
    { stats: records.getStats('3x3'), streakDays: records.getStreak(), lessonsDone: lessons.getLessonsDone(), skillLevel: records.levelOf().id }
  );
  status.value = ev.newBadges.length
    ? `复原啦！解锁徽章：${ev.newBadges[0].name}`
    : '太棒了，复原啦！🎉';
}

// ---- 转一下（随机一步）----
function onLucky() {
  if (!cubeRef.value || cubeRef.value.isAnimating()) return;
  if (scramble.scrambling.value || resultLocked.value) return;
  closeSolPanel();
  const faces = ['U', 'D', 'L', 'R', 'F', 'B'];
  const m = faces[Math.floor(Math.random() * 6)] + ['', "'", '2'][Math.floor(Math.random() * 3)];
  cubeRef.value.move(m, { duration: 250 });
  status.value = '上一步：' + m;
}

onBeforeUnmount(() => {
  scramble.abort();
});
</script>

<template>
  <div class="page">
    <header class="mb-3 flex items-center justify-between">
      <h1 class="text-2xl font-bold">玩转魔方</h1>
      <router-link to="/scan" class="tap flex items-center gap-1 rounded-xl px-2 text-sm text-brand">
        <ScanLine class="h-4 w-4" /> 拍照识别
      </router-link>
    </header>

    <!-- 3D 魔方 -->
    <div class="card overflow-hidden p-2">
      <div class="h-[46vh] min-h-[300px] w-full md:h-[480px]">
        <Cube3D
          ref="cubeRef"
          :interactive="interactive"
          :touch-enabled="touchEnabled"
          :auto-spin="false"
          :allow-slices="settings.allowSlices"
          @move="play('turn')"
          @solved="onCubeSolved"
        />
      </div>
      <p class="min-h-[20px] px-2 pb-2 text-center text-sm text-subtle">{{ status }}</p>
      <p class="pb-2 text-center text-xs text-faint">
        {{ solverReady ? '⚡ 最优解引擎已就绪' : '⚡ 最优解引擎预热中…第一次求解会慢一点' }}
      </p>
    </div>

    <!-- 打乱公式卡 -->
    <div v-if="scramble.sequence.value.length" class="card mt-3 p-4">
      <div class="mb-2 flex items-center justify-between">
        <span class="section-title">
          打乱公式
          <span class="muted ml-1">{{ scramble.mode.value }}</span>
        </span>
        <span v-if="resultLocked && !scramble.scrambling.value" class="chip">
          <Lock class="h-3 w-3" /> 结果已锁定
        </span>
      </div>
      <div class="no-scrollbar flex flex-wrap gap-1.5">
        <span
          v-for="(m, i) in scramble.sequence.value"
          :key="i"
          class="rounded-lg px-2 py-1 font-mono text-sm transition"
          :class="i === scramble.activeIndex.value ? 'bg-brand text-white' : i < scramble.activeIndex.value ? 'bg-brand/10 text-brand' : 'bg-cream text-ink'"
        >{{ m }}</span>
      </div>
    </div>

    <!-- 操作区 -->
    <div class="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
      <button v-if="!scramble.scrambling.value" class="btn-primary" @click="onScramble">
        <Shuffle class="h-4 w-4" /> ✨ 打乱
      </button>
      <template v-else>
        <button class="btn-primary" @click="onPauseScramble">
          <component :is="scramble.paused.value ? Play : Pause" class="h-4 w-4" />
          {{ scramble.paused.value ? '继续' : '暂停' }}
        </button>
        <button class="btn-ghost" @click="onSkipScramble">
          <FastForward class="h-4 w-4" /> 跳过动画
        </button>
      </template>
      <button class="btn-ghost" @click="onReset">
        <RotateCcw class="h-4 w-4" /> 🔄 复原
      </button>
      <button class="btn-ghost" :disabled="scramble.scrambling.value" @click="onShowSolution">
        <Brain class="h-4 w-4" /> 🧠 看解法
      </button>
      <button class="btn-ghost" :disabled="!resultLocked" @click="goTimer">
        <Timer class="h-4 w-4" /> ⏱️ 去计时
      </button>
      <button class="btn-ghost col-span-2 md:col-span-1" :disabled="scramble.scrambling.value || resultLocked" @click="onLucky">
        <Sparkles class="h-4 w-4" /> 转一下
      </button>
    </div>

    <!-- 解法面板（八标签） -->
    <SolutionPanel
      :visible="solPanel"
      :start-facelet="solStartFacelet"
      :cube="cubeRef"
      @close="closeSolPanel"
      @finished="onDemoFinished"
    />

    <!-- 速度卡片 -->
    <SpeedCard class="mt-3" />

    <p class="muted mt-4 text-center">
      中层转动默认关闭，可在「我的 → 设置」开启 · 打乱全程视角锁定（白顶绿前）
    </p>
  </div>
</template>
