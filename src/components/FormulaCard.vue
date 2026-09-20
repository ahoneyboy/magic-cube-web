<script setup>
/**
 * FormulaCard.vue —— 公式卡弹层（对照小程序 formula.js）
 * 点开 3D 演示 + 口诀 + 用法 + 公式计时训练（任选公式连做 5 次，记录单次/平均/TPS，存个人最佳）。
 */
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { X, Play, Square, Timer, Dumbbell, Trophy } from 'lucide-vue-next';
import Cube3D from './Cube3D.vue';
import { SOLVED } from '../engine/cube.js';
import { dbGet, dbSet, DB_KEYS } from '../stores/db.js';
import { useSound } from '../composables/useSound.js';
import { useUiStore } from '../stores/ui.js';

const props = defineProps({
  formula: { type: Object, default: null }, // { key, name, icon, moves, movesText, tip, usage }
  visible: { type: Boolean, default: false }
});
const emit = defineEmits(['close']);

const { play } = useSound();
const ui = useUiStore();
const cubeRef = ref(null);

const playing = ref(false);
const pb = ref(null); // { bestMs, bestText, tps }

// ---- 训练 ----
const drill = ref(null); // { idx, reps[], display, running, resultText }
const drillDisplay = ref('0.00');
let demoTimer = null;
let drillTimer = null;
let drillStart = 0;
let drillReps = [];

watch(
  () => props.visible,
  async (v) => {
    if (v && props.formula) {
      playing.value = false;
      drill.value = null;
      pb.value = await dbGet(DB_KEYS.DRILL, {});
      pb.value = (pb.value && pb.value[props.formula.key]) || null;
    } else {
      stopAll();
    }
  }
);

function stopAll() {
  clearTimeout(demoTimer);
  clearInterval(drillTimer);
  demoTimer = null;
  drillTimer = null;
  playing.value = false;
}

onBeforeUnmount(stopAll);

function onCubeReady() {
  if (cubeRef.value) {
    cubeRef.value.setState(SOLVED, { resetView: true });
    cubeRef.value.setInteractive(false);
  }
}

function onPlay() {
  const f = props.formula;
  if (!f || playing.value || !cubeRef.value) return;
  cubeRef.value.setState(SOLVED, { resetView: true });
  cubeRef.value.setInteractive(false);
  playing.value = true;
  let i = 0;
  const step = () => {
    if (!playing.value) return;
    if (i >= f.moves.length) {
      playing.value = false;
      return;
    }
    cubeRef.value.move(f.moves[i], { duration: 340 });
    play('turn');
    i++;
    demoTimer = setTimeout(step, 420);
  };
  step();
}

// ---- 公式计时训练：实体魔方上连做 5 次 ----
async function onDrillStart() {
  drillReps = [];
  drill.value = { idx: 1, reps: [], running: false, resultText: '' };
  drillDisplay.value = '0.00';
}

function onDrillTap() {
  const d = drill.value;
  if (!d) return;
  if (!d.running) {
    drillStart = Date.now();
    d.running = true;
    drillDisplay.value = '0.00';
    play('pop');
    clearInterval(drillTimer);
    drillTimer = setInterval(() => {
      if (!drill.value || !drill.value.running) return;
      drillDisplay.value = ((Date.now() - drillStart) / 1000).toFixed(2);
    }, 47);
    return;
  }
  // 停表
  clearInterval(drillTimer);
  const ms = Date.now() - drillStart;
  drillReps = drillReps.concat([ms]);
  play('turn');
  const f = props.formula;
  const done = drillReps.length >= 5;
  const moves = (f && f.moves.length) || 1;
  d.running = false;
  d.reps = drillReps.map((t) => (t / 1000).toFixed(2));
  d.idx = drillReps.length + 1;
  drillDisplay.value = (ms / 1000).toFixed(2);
  if (!done) {
    // 休息一下继续
  } else {
    const bestMs = Math.min(...drillReps);
    const avgMs = Math.round(drillReps.reduce((a, b) => a + b, 0) / drillReps.length);
    const tps = moves / (bestMs / 1000);
    saveDrillPb(f.key, bestMs, tps);
    d.resultText = `最佳 ${(bestMs / 1000).toFixed(2)}s · 平均 ${(avgMs / 1000).toFixed(2)}s · 手速 ${tps.toFixed(2)} TPS`;
    drill.value = null;
    ui.showToast('完成 5 次！' + d.resultText, 'success', 4000);
  }
}

async function saveDrillPb(key, bestMs, tps) {
  const all = (await dbGet(DB_KEYS.DRILL, {})) || {};
  const prev = all[key];
  const isNew = !prev || bestMs < prev.bestMs;
  if (isNew) {
    all[key] = { bestMs, bestText: (bestMs / 1000).toFixed(2), tps: tps.toFixed(2) };
    await dbSet(DB_KEYS.DRILL, all);
    pb.value = all[key];
  }
}

const pbText = computed(() =>
  pb.value ? `个人最佳 ${pb.value.bestText}s（TPS ${pb.value.tps}）` : ''
);
</script>

<template>
  <transition name="sheet">
    <div
      v-if="visible && formula"
      class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center"
      @click.self="emit('close')"
    >
      <div class="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 md:rounded-3xl">
        <header class="mb-3 flex items-start justify-between">
          <div>
            <h3 class="text-base font-semibold">{{ formula.icon }} {{ formula.name }}</h3>
            <p class="muted mt-0.5">{{ formula.usage }}</p>
          </div>
          <button class="tap rounded-xl px-2 text-subtle" @click="emit('close')">
            <X class="h-5 w-5" />
          </button>
        </header>

        <!-- 3D 演示 -->
        <div class="rounded-2xl bg-cream p-2">
          <div class="mx-auto h-64 max-w-xs md:h-72">
            <Cube3D ref="cubeRef" :interactive="false" @ready="onCubeReady" />
          </div>
          <div class="flex justify-center gap-2 py-2">
            <button class="btn-primary" :disabled="playing" @click="onPlay">
              <Play class="h-4 w-4" /> {{ playing ? '演示中…' : '播放演示' }}
            </button>
          </div>
        </div>

        <!-- 公式 + 口诀 -->
        <div class="mt-3 rounded-2xl bg-cream p-3.5">
          <p class="break-words text-center font-mono text-lg font-bold tracking-wide text-ink">
            {{ formula.movesText }}
          </p>
          <p class="mt-2 text-center text-sm text-subtle">💡 {{ formula.tip }}</p>
          <p v-if="pbText" class="mt-1 flex items-center justify-center gap-1 text-xs font-semibold text-brand">
            <Trophy class="h-3.5 w-3.5" /> {{ pbText }}
          </p>
        </div>

        <!-- 计时训练 -->
        <div class="mt-3 rounded-2xl bg-cream p-3.5">
          <div class="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
            <Dumbbell class="h-4 w-4 text-brand" /> 公式计时训练（实体魔方连做 5 次）
          </div>
          <template v-if="!drill">
            <button class="btn-ghost w-full" @click="onDrillStart">
              <Timer class="h-4 w-4" /> 开始训练
            </button>
          </template>
          <template v-else>
            <div class="text-center">
              <p class="muted">
                {{ drill.running ? '计时中！做完这条公式马上点停表' : `第 ${drill.idx} 次 · 准备好后点「开始」` }}
              </p>
              <div class="my-2 font-mono text-4xl font-bold tabular-nums" :class="drill.running ? 'text-brand' : 'text-ink'">
                {{ drillDisplay }}
              </div>
              <button
                class="btn-primary w-full"
                :class="drill.running ? 'bg-red-500 shadow-[0_4px_0_rgba(0,0,0,0.2)]' : ''"
                @click="onDrillTap"
              >
                <component :is="drill.running ? Square : Play" class="h-4 w-4" />
                {{ drill.running ? '停表' : `开始第 ${drill.idx} 次` }}
              </button>
              <div v-if="drill.reps.length" class="mt-2 flex flex-wrap justify-center gap-1.5">
                <span v-for="(r, i) in drill.reps" :key="i" class="rounded-lg bg-white px-2 py-1 font-mono text-xs text-ink">
                  {{ r }}s
                </span>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.sheet-enter-active,
.sheet-leave-active {
  transition: all 0.25s ease;
}
.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}
.sheet-enter-from > div,
.sheet-leave-to > div {
  transform: translateY(30px);
}
</style>
