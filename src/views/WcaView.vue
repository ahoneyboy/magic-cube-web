<script setup>
/**
 * WcaView.vue —— WCA 赛场模式（对照小程序 wca.js）
 * 15 秒观察（8/12 秒语音提示，超 15s +2、超 17s DNF）→ 复原计时 →
 * 5 次一轮，按 WCA 规则去头尾算 ao5；单次/罚时/DNF 格式化展示；一轮结束出汇总。
 */
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { Eye, Play, Square, ArrowRight, RefreshCw, BarChart3, Trophy } from 'lucide-vue-next';
import Cube3D from '../components/Cube3D.vue';
import { Cube, SOLVED } from '../engine/cube.js';
import { genRandomMoves, validateScramble } from '../engine/scrambler.js';
import * as wca from '../engine/wcaRules.js';
import { randomStateScramble3x3 } from '../composables/useKociemba.js';
import { useRecordsStore } from '../stores/records.js';
import { useGameStore } from '../stores/game.js';
import { useLessonsStore } from '../stores/lessons.js';
import { useUiStore } from '../stores/ui.js';
import { useSound } from '../composables/useSound.js';
import { useVoice } from '../composables/useVoice.js';

const ROUND_SIZE = 5;

const records = useRecordsStore();
const game = useGameStore();
const lessons = useLessonsStore();
const ui = useUiStore();
const { play } = useSound();
const voice = useVoice();

const cubeRef = ref(null);
const phase = ref('idle'); // idle | inspection | solving | done | round
const scrambleText = ref('生成中…');
const inspectionDisplay = ref('15.0');
const inspectionWarning = ref('');
const inspectionDanger = ref(false);
const solveDisplay = ref('0.00');
const resultText = ref('');
const results = ref([]);
const roundNo = ref(1);
const roundSummary = ref(null);
const scrambledFacelet = ref('');

let tickTimer = null;
let inspectionStart = 0;
let solveStart = 0;
let penalty = '';
let called8 = false;
let called12 = false;
let roundId = null;
let currentScramble = '';

function stopTicks() {
  clearInterval(tickTimer);
  tickTimer = null;
}

function scrambledFaceletOf(moves) {
  const c = new Cube(SOLVED);
  c.applyMoves(moves);
  return c.getFacelet();
}

async function newScramble() {
  stopTicks();
  phase.value = 'idle';
  inspectionWarning.value = '';
  inspectionDanger.value = false;
  resultText.value = '';
  solveDisplay.value = '0.00';
  inspectionDisplay.value = '15.0';
  scrambleText.value = '生成中…';
  const { moves, mode } = await randomStateScramble3x3();
  const check = validateScramble('3x3', moves);
  const list = check.ok ? moves : genRandomMoves('3x3', 20);
  currentScramble = list.join(' ');
  scrambleText.value = currentScramble + (mode === 'random-state' ? '' : '（随机步）');
  scrambledFacelet.value = scrambledFaceletOf(list);
  if (cubeRef.value && scrambledFacelet.value) {
    cubeRef.value.setState(scrambledFacelet.value, { resetView: true });
    cubeRef.value.setInteractive(false);
  }
}

onMounted(newScramble);
onBeforeUnmount(() => {
  stopTicks();
  voice.stop();
});

function startInspection() {
  if (phase.value !== 'idle') return;
  inspectionStart = Date.now();
  called8 = false;
  called12 = false;
  phase.value = 'inspection';
  play('pop');
  stopTicks();
  tickTimer = setInterval(tickInspection, 100);
}

function tickInspection() {
  if (phase.value !== 'inspection') {
    stopTicks();
    return;
  }
  const elapsed = Date.now() - inspectionStart;
  const left = wca.INSPECTION_LIMIT_MS - elapsed;
  inspectionDisplay.value = left >= 0 ? (left / 1000).toFixed(1) : '−' + (-left / 1000).toFixed(1);
  if (elapsed >= 8000 && !called8) {
    called8 = true;
    play('pop');
    navigator.vibrate && navigator.vibrate(60);
    voice.speak('八秒');
    inspectionWarning.value = '⏰ 八秒！';
  }
  if (elapsed >= 12000 && !called12) {
    called12 = true;
    play('pop');
    navigator.vibrate && navigator.vibrate([80, 40, 80]);
    voice.speak('十二秒');
    inspectionWarning.value = '⏰ 十二秒！';
  }
  if (elapsed > wca.INSPECTION_DNF_MS) {
    // 超 17 秒：DNF，本次不再计时
    stopTicks();
    phase.value = 'done';
    resultText.value = 'DNF';
    inspectionWarning.value = '超过 17 秒，成绩无效';
    recordResult(0, 'DNF');
    return;
  }
  if (elapsed > wca.INSPECTION_LIMIT_MS) {
    inspectionWarning.value = '已超时，开始将 +2 秒！';
    inspectionDanger.value = true;
  }
}

function startSolve() {
  if (phase.value !== 'inspection' && phase.value !== 'idle') return;
  const elapsed = phase.value === 'inspection' ? Date.now() - inspectionStart : 0;
  stopTicks();
  const verdict = wca.classifyInspection(elapsed);
  penalty = verdict.penalty;
  solveStart = Date.now();
  phase.value = 'solving';
  solveDisplay.value = '0.00';
  inspectionWarning.value = verdict.penalty
    ? '观察超时：' + (verdict.penalty === '+2' ? '本次 +2 秒' : 'DNF')
    : '';
  play('pop');
  tickTimer = setInterval(() => {
    if (phase.value !== 'solving') return;
    solveDisplay.value = ((Date.now() - solveStart) / 1000).toFixed(2);
  }, 47);
}

function finishSolve() {
  if (phase.value !== 'solving') return;
  stopTicks();
  const ms = Date.now() - solveStart;
  const p = penalty || '';
  solveDisplay.value = (ms / 1000).toFixed(2);
  resultText.value = wca.formatResult(ms, p);
  phase.value = 'done';
  play('success');
  recordResult(ms, p);
}

function recordResult(ms, p) {
  if (!roundId) roundId = 'w' + Date.now();
  records.addRecord({
    durationMs: ms,
    penalty: p,
    mode: 'wca',
    cubeType: '3x3',
    scramble: currentScramble,
    roundId
  });
  if (p !== 'DNF') {
    game.recordEvent(
      'timer',
      { cubeType: '3x3', durationMs: ms },
      { stats: records.getStats('3x3'), streakDays: records.getStreak(), lessonsDone: lessons.getLessonsDone(), skillLevel: records.levelOf().id }
    );
  }
  results.value = results.value.concat([{ ms, penalty: p, resultText: wca.formatResult(ms, p) }]);
  if (results.value.length >= ROUND_SIZE) {
    const avg = wca.averageOf(results.value, ROUND_SIZE);
    roundSummary.value = {
      list: results.value.slice(),
      best: wca.formatMs(wca.bestOf(results.value)),
      ao5: avg && !avg.isDNF ? wca.formatMs(avg.value) : 'DNF',
      ao5IsDNF: !!(avg && avg.isDNF)
    };
    phase.value = 'round';
    play('success');
    ui.celebrateOnce();
  }
}

function nextSolve() {
  newScramble();
}
function nextRound() {
  roundId = null;
  results.value = [];
  roundSummary.value = null;
  roundNo.value += 1;
  newScramble();
}

</script>

<template>
  <div class="page">
    <header class="mb-3 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">🏁 赛场模式</h1>
        <p class="muted">WCA 正规比赛规则 · 第 {{ roundNo }} 轮（{{ results.length }}/5）</p>
      </div>
      <router-link to="/stats" class="tap flex items-center gap-1 rounded-xl px-2 text-sm text-brand">
        <BarChart3 class="h-4 w-4" /> 成绩
      </router-link>
    </header>

    <!-- 3D 展示 -->
    <div class="card overflow-hidden p-2">
      <div class="h-[38vh] min-h-[240px] w-full md:h-[400px]">
        <Cube3D ref="cubeRef" :interactive="false" :touch-enabled="true" :facelet="scrambledFacelet" />
      </div>
    </div>

    <!-- 打乱公式 -->
    <p class="muted mt-2 break-words text-center font-mono">{{ scrambleText }}</p>

    <!-- 观察阶段 -->
    <div v-if="phase === 'idle' || phase === 'inspection'" class="card mt-3 p-5 text-center">
      <p class="section-title mb-1">观察阶段</p>
      <p class="muted mb-3">15 秒内开始正常 · 超 15 秒 +2 · 超 17 秒 DNF</p>
      <div
        class="font-mono text-5xl font-bold tabular-nums"
        :class="inspectionDanger ? 'text-red-500' : 'text-ink'"
      >
        {{ inspectionDisplay }}
      </div>
      <p v-if="inspectionWarning" class="mt-2 text-sm font-semibold" :class="inspectionDanger ? 'text-red-500' : 'text-brand'">
        {{ inspectionWarning }}
      </p>
      <div class="mt-4 flex items-center justify-center gap-3">
        <button v-if="phase === 'idle'" class="btn-primary min-w-[128px]" @click="startInspection">
          <Eye class="h-4 w-4" /> 开始观察
        </button>
        <button v-if="phase === 'inspection'" class="btn-primary min-w-[128px]" @click="startSolve">
          <Play class="h-4 w-4" /> 开始复原
        </button>
        <button v-if="phase === 'idle'" class="btn-ghost" @click="startSolve">
          跳过观察
        </button>
      </div>
    </div>

    <!-- 计时阶段 -->
    <div v-else-if="phase === 'solving'" class="card mt-3 p-5 text-center">
      <div class="font-mono text-6xl font-bold tabular-nums text-brand">{{ solveDisplay }}</div>
      <p v-if="inspectionWarning" class="mt-1 text-sm text-orange-500">{{ inspectionWarning }}</p>
      <button class="btn-primary mt-4 min-w-[160px] bg-red-500 shadow-[0_4px_0_rgba(0,0,0,0.2)]" @click="finishSolve">
        <Square class="h-5 w-5" /> 停表
      </button>
    </div>

    <!-- 单次结果 -->
    <div v-else-if="phase === 'done'" class="card mt-3 p-5 text-center">
      <p class="muted">本次成绩</p>
      <div class="font-mono text-5xl font-bold" :class="resultText === 'DNF' ? 'text-red-500' : 'text-ink'">
        {{ resultText }}
      </div>
      <button class="btn-primary mt-4 min-w-[140px]" @click="nextSolve">
        <ArrowRight class="h-4 w-4" /> 下一把（{{ results.length }}/5）
      </button>
    </div>

    <!-- 一轮汇总 -->
    <div v-else-if="phase === 'round'" class="card mt-3 p-5">
      <h2 class="section-title mb-3 text-center">🎉 本轮结束！</h2>
      <div class="mx-auto mb-3 grid max-w-xs grid-cols-2 gap-2 text-center">
        <div class="rounded-2xl bg-cream p-3">
          <p class="muted">单次最好</p>
          <p class="font-mono text-lg font-bold text-ink">{{ roundSummary.best }}</p>
        </div>
        <div class="rounded-2xl bg-brand/10 p-3">
          <p class="muted">ao5（去头尾）</p>
          <p class="font-mono text-lg font-bold" :class="roundSummary.ao5IsDNF ? 'text-red-500' : 'text-brand'">
            {{ roundSummary.ao5 }}
          </p>
        </div>
      </div>
      <div class="no-scrollbar flex justify-center gap-1.5 overflow-x-auto">
        <span
          v-for="(r, i) in roundSummary.list"
          :key="i"
          class="shrink-0 rounded-lg px-2 py-1 font-mono text-sm"
          :class="r.penalty === 'DNF' ? 'bg-red-50 text-red-500' : r.penalty === '+2' ? 'bg-orange-50 text-orange-500' : 'bg-cream text-ink'"
        >{{ r.resultText }}</span>
      </div>
      <div class="mt-4 flex justify-center gap-2">
        <button class="btn-primary" @click="nextRound">
          <RefreshCw class="h-4 w-4" /> 下一轮
        </button>
        <router-link to="/stats" class="btn-ghost">
          <Trophy class="h-4 w-4" /> 看成绩
        </router-link>
      </div>
    </div>

    <!-- 本轮单次列表 -->
    <div v-if="results.length && phase !== 'round'" class="card mt-3 p-4">
      <p class="section-title mb-2">本轮已完赛</p>
      <div class="flex flex-wrap gap-1.5">
        <span
          v-for="(r, i) in results"
          :key="i"
          class="rounded-lg px-2 py-1 font-mono text-sm"
          :class="r.penalty === 'DNF' ? 'bg-red-50 text-red-500' : r.penalty === '+2' ? 'bg-orange-50 text-orange-500' : 'bg-cream text-ink'"
        >{{ r.resultText }}</span>
      </div>
    </div>

    <p class="muted mt-4 text-center">
      超时语音报时（八秒 / 十二秒）{{ voice.isAvailable ? '' : '（当前浏览器不支持语音，已文字提示）' }}
    </p>
  </div>
</template>
