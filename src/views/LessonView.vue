<script setup>
/**
 * LessonView.vue —— 课程详情（对照小程序 lesson.js）
 * 三件套：🎬 3D 演示 / 💡 口诀+公式 / 🙋 跟着做（facelet 判定过关 → 解锁下一课 + 星级 + XP）
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { PlayCircle, Lightbulb, Hand, CheckCircle2, RotateCcw, Play, Star } from 'lucide-vue-next';
import Cube3D from '../components/Cube3D.vue';
import FormulaCard from '../components/FormulaCard.vue';
import { STAGES, ADVANCED, FORMULAS } from '../engine/config/lessonData.js';
import { checkPractice } from '../engine/lessonCheck.js';
import { Cube, SOLVED } from '../engine/cube.js';
import { useLessonsStore } from '../stores/lessons.js';
import { useGameStore } from '../stores/game.js';
import { useRecordsStore } from '../stores/records.js';
import { useUiStore } from '../stores/ui.js';
import { useSound } from '../composables/useSound.js';
import { useVoice } from '../composables/useVoice.js';
import { useSettingsStore } from '../stores/settings.js';

const route = useRoute();
const router = useRouter();
const lessons = useLessonsStore();
const game = useGameStore();
const records = useRecordsStore();
const ui = useUiStore();
const { play } = useSound();
const voice = useVoice();
const settings = useSettingsStore();

const tab = ref('demo');
const caption = ref('');
const practicing = ref(false);
const practiceResult = ref(null);
const moveCount = ref(0);
const progressPct = ref(0);
const formulaCard = ref(null);
const demoCubeRef = ref(null);
const practiceCubeRef = ref(null);

const stage = computed(() => {
  const id = Number(route.params.id) || 1;
  return STAGES.find((s) => s.id === id) || ADVANCED.find((s) => s.id === id) || STAGES[0];
});
const isAdvanced = computed(() => stage.value.group === 'advanced');
const formula = computed(() => (stage.value.formula ? FORMULAS[stage.value.formula] : null));
const formulas = computed(() => (stage.value.formulas || []).map((k) => FORMULAS[k]).filter(Boolean));

// 演示序列：用层先法求解器对固定起点跑一遍，取本课阶段的真实解法
let demoMoves = [];
let practiceStart = [];
const demoStartFacelet = ref('');
const practiceStartFacelet = ref('');

onMounted(() => {
  const s = stage.value;
  // 与小程序一致：演示序列 = 数据里的固定演示（stage.demo.moves）
  demoMoves = s.demo.moves;
  const startScramble = s.practice.startScramble;
  const c = new Cube(SOLVED);
  c.applyMoves(startScramble);
  practiceStartFacelet.value = c.getFacelet();
  practiceStart = startScramble;
  // 演示起点：进阶课有 demo.scramble，否则复原态
  if (s.demo.scramble && s.demo.scramble.length) {
    const c2 = new Cube(SOLVED);
    c2.applyMoves(s.demo.scramble);
    demoStartFacelet.value = c2.getFacelet();
  } else {
    demoStartFacelet.value = SOLVED;
  }
});

onBeforeUnmount(() => {
  voice.stop();
  clearTimeout(demoTimer);
});

let demoTimer = null;
let demoPlaying = ref(false);

function playDemo() {
  if (!demoCubeRef.value) return;
  clearTimeout(demoTimer);
  demoCubeRef.value.setState(demoStartFacelet.value, { resetView: true });
  demoCubeRef.value.setInteractive(false);
  demoPlaying.value = true;
  let i = 0;
  const segTitle = (idx) => {
    const segs = stage.value.demo.segments || [];
    for (const s of segs) {
      if (idx >= s.from && idx < s.from + s.len) return s.title;
    }
    return '';
  };
  const step = () => {
    if (tab.value !== 'demo' || !demoPlaying.value) return;
    if (i >= demoMoves.length) {
      caption.value = stage.value.demo.caption + '（再放一遍？点「重播」）';
      demoPlaying.value = false;
      return;
    }
    const m = demoMoves[i];
    const seg = segTitle(i);
    caption.value = (seg ? '【' + seg + '】' : '') + `${stage.value.demo.caption} · ${i + 1}/${demoMoves.length}: ${m}`;
    if (demoCubeRef.value.highlight) demoCubeRef.value.highlight(m);
    demoCubeRef.value.move(m, { duration: 500 });
    play('turn');
    i++;
    demoTimer = setTimeout(() => {
      if (demoCubeRef.value.clearHighlight) demoCubeRef.value.clearHighlight();
      step();
    }, settings.demoDurationMs);
  };
  step();
}

function replayDemo() {
  demoPlaying.value = false;
  clearTimeout(demoTimer);
  setTimeout(playDemo, 30);
}

function switchTab(t) {
  tab.value = t;
  if (t === 'demo') {
    playDemo();
  } else {
    demoPlaying.value = false;
    clearTimeout(demoTimer);
    voice.stop();
  }
  if (t === 'tip') {
    voice.speak(stage.value.tip);
  }
}

// ---- 跟着做 ----
function startPractice() {
  practicing.value = true;
  practiceResult.value = null;
  moveCount.value = 0;
  progressPct.value = 0;
  setTimeout(() => {
    if (practiceCubeRef.value) {
      practiceCubeRef.value.setState(practiceStartFacelet.value, { resetView: true });
      practiceCubeRef.value.setAutoSpin(false);
    }
  }, 30);
}

function onPracticeMove() {
  moveCount.value += 1;
  checkNow(true);
}

function checkNow(silentPass = false) {
  const facelet = practiceCubeRef.value ? practiceCubeRef.value.getFacelet() : null;
  if (!facelet) return;
  const r = checkPractice(stage.value.practice.checkId, facelet, moveCount.value);
  progressPct.value = Math.round(r.progress * 100);
  if (r.pass) {
    passPractice();
  } else if (!silentPass) {
    play('pop');
    practiceResult.value = { pass: false, message: '还差一点点！' + stage.value.practice.hint };
  }
}

async function passPractice() {
  const first = await lessons.completeLesson(stage.value.id, 3);
  let badgeNote = '';
  if (first) {
    const ev = game.recordEvent(
      'lesson_done',
      {},
      { stats: records.getStats('3x3'), streakDays: records.getStreak(), lessonsDone: lessons.getLessonsDone(), skillLevel: records.levelOf().id }
    );
    if (ev.newBadges.length) badgeNote = ' 徽章：' + ev.newBadges[0].name;
  }
  play('success');
  ui.celebrateOnce();
  practicing.value = false;
  practiceResult.value = {
    pass: true,
    message: first ? '太棒了！下一课解锁啦！' + badgeNote : '温故而知新，完成！'
  };
  voice.speak('做得真棒！');
}

function resetPractice() {
  if (practiceCubeRef.value) {
    practiceCubeRef.value.setState(practiceStartFacelet.value, { resetView: true });
  }
  moveCount.value = 0;
  practiceResult.value = null;
  progressPct.value = 0;
}

const nextLessonId = computed(() => {
  if (isAdvanced.value) return null;
  return stage.value.id < 7 ? stage.value.id + 1 : null;
});
</script>

<template>
  <div class="page">
    <header class="mb-3 flex items-center gap-3">
      <button class="tap rounded-xl px-2 text-subtle" @click="router.back()">←</button>
      <div class="min-w-0">
        <h1 class="truncate text-2xl font-bold">{{ stage.emoji }} {{ stage.title }}</h1>
        <p class="muted">{{ isAdvanced ? '进阶解法课' : '第' + stage.id + '课 · 七步学会复原' }}</p>
      </div>
    </header>

    <p class="card mb-3 p-4 text-sm leading-relaxed text-subtle">{{ stage.intro }}</p>

    <!-- 三件套切换 -->
    <div class="mb-3 grid grid-cols-3 gap-2">
      <button v-for="t in [
        { id: 'demo', label: '3D 演示', icon: PlayCircle },
        { id: 'tip', label: '口诀+公式', icon: Lightbulb },
        { id: 'practice', label: '跟着做', icon: Hand }
      ]" :key="t.id" class="tap flex flex-col items-center justify-center gap-1 rounded-2xl py-2 text-sm font-medium" :class="tab === t.id ? 'bg-brand text-white shadow-[0_3px_0_rgba(247,103,7,0.4)]' : 'bg-white text-subtle shadow-card'" @click="switchTab(t.id)">
        <component :is="t.icon" class="h-4 w-4" />
        {{ t.label }}
      </button>
    </div>

    <!-- 🎬 演示 -->
    <div v-if="tab === 'demo'" class="card overflow-hidden p-2">
      <div class="h-[42vh] min-h-[280px] w-full md:h-[440px]">
        <Cube3D ref="demoCubeRef" :interactive="false" :touch-enabled="false" />
      </div>
      <p class="min-h-[40px] px-3 pb-2 text-center text-sm font-medium text-brand">{{ caption || stage.demo.caption }}</p>
      <div class="flex justify-center gap-2 pb-2">
        <button class="btn-primary" @click="replayDemo">
          <RotateCcw class="h-4 w-4" /> 重播
        </button>
      </div>
    </div>

    <!-- 💡 口诀 + 公式 -->
    <div v-if="tab === 'tip'" class="space-y-3">
      <div class="card p-5 text-center">
        <Lightbulb class="mx-auto mb-2 h-8 w-8 text-brand" />
        <p class="text-lg font-bold leading-relaxed text-ink">{{ stage.tip }}</p>
        <p class="mt-2 text-sm leading-relaxed text-subtle">{{ stage.keyPoint }}</p>
        <button class="btn-ghost mx-auto mt-3" @click="voice.speak(stage.tip)">
          🔊 念一遍
        </button>
      </div>
      <button
        v-for="f in [formula, ...formulas].filter(Boolean)"
        :key="f ? f.key : f"
        class="card tap flex w-full items-center justify-between p-4 text-left"
        @click="formulaCard = f"
      >
        <span>
          <span class="text-base font-semibold text-ink">{{ f.icon }} {{ f.name }}</span>
          <span class="mt-0.5 block break-words font-mono text-xs text-subtle">{{ f.movesText }}</span>
        </span>
        <span class="chip shrink-0">点开演示</span>
      </button>
      <div v-if="isAdvanced && stage.idea" class="card p-4">
        <p class="section-title mb-2">💡 解法思路</p>
        <p class="text-sm leading-relaxed text-subtle">{{ stage.idea }}</p>
      </div>
      <div v-if="isAdvanced" class="card p-4">
        <p class="section-title mb-2">阶段表</p>
        <ol class="space-y-2">
          <li v-for="(s, i) in stage.stageList" :key="i" class="flex items-start gap-2 text-sm text-subtle">
            <span class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">{{ s.emoji }}</span>
            <span><b class="text-ink">{{ s.name }}</b> · {{ s.desc }}</span>
          </li>
        </ol>
      </div>
    </div>

    <!-- 🙋 跟着做 -->
    <div v-if="tab === 'practice'" class="card p-4">
      <template v-if="!practicing && !(practiceResult && practiceResult.pass)">
        <p class="section-title">练习目标</p>
        <p class="mt-1 text-sm leading-relaxed text-subtle">{{ stage.practice.goal }}</p>
        <button class="btn-primary mt-4 w-full" @click="startPractice">
          <Play class="h-4 w-4" /> 开始跟着做
        </button>
      </template>

      <template v-else-if="practicing">
        <div class="mb-2 flex items-center justify-between">
          <span class="section-title">在下方魔方上操作</span>
          <span class="chip">{{ moveCount }} 步</span>
        </div>
        <div class="h-2 overflow-hidden rounded-full bg-cream">
          <div class="h-full rounded-full bg-emerald-400 transition-all" :style="{ width: progressPct + '%' }" />
        </div>
        <div class="mt-2 h-[40vh] min-h-[260px] md:h-[380px]">
          <Cube3D ref="practiceCubeRef" :interactive="true" :touch-enabled="true" :allow-slices="false" @move="onPracticeMove" />
        </div>
        <p class="muted mt-1 text-center">{{ stage.practice.hint }}</p>
        <div class="mt-2 grid grid-cols-2 gap-2">
          <button class="btn-ghost" @click="resetPractice">
            <RotateCcw class="h-4 w-4" /> 重来
          </button>
          <button class="btn-primary" @click="checkNow(false)">
            <CheckCircle2 class="h-4 w-4" /> 检查一下
          </button>
        </div>
        <p v-if="practiceResult && !practiceResult.pass" class="mt-2 rounded-xl bg-orange-50 p-2.5 text-center text-sm text-orange-500">
          {{ practiceResult.message }}
        </p>
      </template>

      <template v-else>
        <div class="py-6 text-center">
          <div class="mb-2 flex justify-center gap-1">
            <Star v-for="i in 3" :key="i" class="h-8 w-8 fill-brand text-brand" />
          </div>
          <p class="text-lg font-bold text-ink">过关啦！</p>
          <p class="mt-1 text-sm text-subtle">{{ practiceResult.message }}</p>
          <div class="mt-4 flex justify-center gap-2">
            <button class="btn-ghost" @click="startPractice">
              再练一次
            </button>
            <button v-if="nextLessonId" class="btn-primary" @click="router.replace('/lesson/' + nextLessonId)">
              下一课 →
            </button>
            <button v-else class="btn-primary" @click="router.push('/learn')">
              返回课程表
            </button>
          </div>
        </div>
      </template>
    </div>

    <FormulaCard :formula="formulaCard" :visible="!!formulaCard" @close="formulaCard = null" />
  </div>
</template>
