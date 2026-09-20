<script setup>
/**
 * SolutionPanel.vue —— 「看解法」面板（§5.1：八种算法各自独立标签）
 *
 * ⚡最优解（Kociemba，LBL 兜底）/ 🚀CFOP / 🏆CFOP+ZBLL / 📚层先法 /
 * 🌉桥式 / ⚡ZZ / 🧱Petrus / 🙈盲拧（字母串与字母对）
 *
 * 演示统一起点：打开面板时记录打乱完成态 facelet（props.startFacelet），
 * 切标签与从头演示前先复位（useDemo.resetToStart）。演示速度用「演示」设置。
 */
import { ref, reactive, computed, watch, nextTick } from 'vue';
import { X, Play, Pause, RotateCcw, BookOpen, ChevronDown, Info } from 'lucide-vue-next';
import { solveLbl } from '../engine/lblSolver.js';
import { solveCFOP } from '../engine/cfopSolver.js';
import { analyzeState } from '../engine/cubies.js';
import { isSolvedUpToRotation } from '../engine/cube.js';
import { buildExplain } from '../engine/solveExplain.js';
import { METHODS } from '../engine/advancedMethods.js';
import { OLL_2LOOK, PLL, ADVANCED_NOTES } from '../engine/config/algLibrary.js';
import { solveOptimal, solveAdvancedViaWorker } from '../composables/useKociemba.js';
import { useDemo } from '../composables/useDemo.js';
import { useUiStore } from '../stores/ui.js';

const props = defineProps({
  visible: { type: Boolean, default: false },
  startFacelet: { type: String, required: true },
  cube: { type: Object, default: null } // Cube3D 组件实例
});
const emit = defineEmits(['close', 'finished']);

const ui = useUiStore();
const demo = useDemo();

const loading = ref(true);
const loadingText = ref('求解中…');
const sols = reactive({});
const currentTab = ref('optimal');
const libExpanded = ref(false);
const stageListRef = ref(null);
const moveStripRef = ref(null);

const TAB_DEFS = [
  { key: 'optimal', label: '⚡ 最优解' },
  { key: 'cfop', label: '🚀 CFOP' },
  { key: 'zbll', label: '🏆 CFOP+ZBLL' },
  { key: 'lbl', label: '📚 层先法' },
  { key: 'roux', label: '🌉 桥式' },
  { key: 'zz', label: '⚡ ZZ' },
  { key: 'petrus', label: '🧱 Petrus' },
  { key: 'blind', label: '🙈 盲拧' }
];

const STAGE_EMOJI = {
  cross: '✝️', corners: '🟨', middle: '🟩', ucross: '✨', uface: '🟡',
  'uperm-corners': '🎯', 'uperm-edges': '🏆', fb: '🌉', sb: '🌉', cmll: '🎯',
  'lse-4a': '🔚', 'lse-4b': '🔚', 'lse-4c': '🔚', eo: '🧭', line: '📏',
  block223: '🧱', dedge: '📏', 'blind-edges': '🙈', 'blind-corners': '🙈',
  'blind-parity': '⚖️', zbll: '🏆', 'lbl-tail': '🧩'
};

const tabs = computed(() =>
  TAB_DEFS.filter((t) => sols[t.key]).map((t) => ({
    ...t,
    count: sols[t.key].err ? '—' : (sols[t.key].moves || []).length
  }))
);

const current = computed(() => sols[currentTab.value] || null);
const visibleStages = computed(() =>
  ((current.value && current.value.stages) || []).filter((s) => (s.moves || []).length > 0)
);
const currentMoves = computed(() => (current.value && current.value.moves) || []);

function stageOf(i) {
  for (const s of visibleStages.value) {
    if (i >= s.from && i < s.from + s.moves.length) return s;
  }
  return null;
}

// ---- 计算（每个 facelet 只算一次）----
let computedFor = '';
async function computeAll(facelet) {
  if (computedFor === facelet) return;
  computedFor = facelet;
  Object.keys(sols).forEach((k) => delete sols[k]);
  loading.value = true;

  const check = analyzeState(facelet);
  if (!check.ok) {
    loading.value = false;
    ui.showToast(check.message || '当前状态无法求解', 'warn', 3500);
    return;
  }

  const jobs = [
    { text: '求最优解…', run: async () => {
      const r = await solveOptimal(facelet);
      sols.optimal = {
        moves: r.moves,
        backend: r.backend,
        explain: buildExplain('optimal', [], {
          total: r.moves.length,
          backend: r.backend === 'lbl' ? '层先法（兜底）' : 'Kociemba 两阶段搜索'
        })
      };
    } },
    { text: '整理层先法…', run: async () => {
      const r = solveLbl(facelet);
      sols.lbl = { moves: r.moves, stages: r.stages, explain: buildExplain('lbl', r.stages, { total: r.moves.length }) };
    } },
    { text: '计算 CFOP…', run: async () => {
      const rStd = solveCFOP(facelet);
      sols.cfop = {
        moves: rStd.moves, stages: rStd.stages, pllName: rStd.pllOneLookName,
        explain: buildExplain('cfop', rStd.stages, { total: rStd.moves.length, pllName: rStd.pllOneLookName })
      };
      const rZ = solveCFOP(facelet, { zbll: true });
      sols.zbll = { moves: rZ.moves, stages: rZ.stages, explain: buildExplain('zbll', rZ.stages, { total: rZ.moves.length }) };
    } }
  ];
  METHODS.forEach((m) => {
    jobs.push({
      text: `计算${m.name}…`,
      run: async () => {
        try {
          const r = await solveAdvancedViaWorker(facelet, m.id);
          sols[m.id] = {
            moves: r.moves, stages: r.stages, memo: r.memo, meta: m,
            explain: buildExplain(m.id, r.stages, { total: r.moves.length, memo: r.memo })
          };
        } catch (e) {
          sols[m.id] = { err: (e && e.message) || '该方法暂时没找到解', meta: m };
        }
      }
    });
  });

  for (const job of jobs) {
    loadingText.value = job.text;
    await new Promise((r) => setTimeout(r, 15)); // 让出事件循环保持界面响应
    try {
      await job.run();
    } catch (e) {
      /* 单个解法失败不影响其它标签 */
    }
  }
  loading.value = false;
  const first = tabs.value[0];
  if (first) applyTab(first.key);
}

watch(
  () => props.visible,
  async (v) => {
    if (v && props.startFacelet) {
      demo.setStartFacelet(props.startFacelet);
      if (props.cube) props.cube.setInteractive(false);
      await nextTick();
      computeAll(props.startFacelet);
    } else if (!v) {
      demo.stop(props.cube);
    }
  }
);

watch(
  () => props.startFacelet,
  (f) => {
    computedFor = ''; // 打乱了新状态：下次打开重新计算
    if (props.visible && f) computeAll(f);
  }
);

// ---- 标签切换 / 演示 ----
function applyTab(key) {
  const d = sols[key];
  if (!d) return;
  demo.stop(props.cube);
  currentTab.value = key;
}

function switchTab(t) {
  if (t === currentTab.value) return;
  // 切标签：魔方回到打乱完成态（统一起点）
  demo.resetToStart(props.cube);
  applyTab(t);
}

function togglePlay() {
  const d = current.value;
  if (!d || d.err || !currentMoves.value.length) {
    ui.showToast('这个状态暂时没有可演示的解法', 'warn');
    return;
  }
  if (demo.playing.value) {
    demo.pause();
    return;
  }
  // 演示完成时：通知父级（结果被消费，解除锁定）
  demo.play(props.cube, currentMoves.value, {
    captions: (i, m) => {
      const st = stageOf(i);
      return `${st ? st.title + ' · ' : ''}${i + 1}/${currentMoves.value.length}: ${m}`;
    },
    finished: () => {
      emit('finished');
      ui.showToast('解法演示完成，魔方复原啦！🎉', 'success');
    }
  });
}

function replayFromStart() {
  demo.pause();
  demo.resetToStart(props.cube);
  demo.play(props.cube, currentMoves.value, {
    fromIndex: 0,
    captions: (i, m) => {
      const st = stageOf(i);
      return `${st ? st.title + ' · ' : ''}${i + 1}/${currentMoves.value.length}: ${m}`;
    },
    finished: () => {
      emit('finished');
      ui.showToast('解法演示完成，魔方复原啦！🎉', 'success');
    }
  });
}

// 当前步高亮滚动
watch(
  () => demo.activeIndex.value,
  async (i) => {
    if (i < 0) return;
    await nextTick();
    const strip = moveStripRef.value;
    const el = strip && strip.querySelector(`[data-mi="${i}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    const list = stageListRef.value;
    const st = list && list.querySelector(`[data-si="${stageOf(i) ? visibleStages.value.indexOf(stageOf(i)) : -1}"]`);
    if (st) st.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (props.cube && currentMoves.value[i]) props.cube.highlight(currentMoves.value[i]);
  }
);

const algGroups = [
  { id: 'oll', title: '📐 2-Look OLL 公式', items: OLL_2LOOK },
  { id: 'pll', title: '🏁 PLL 公式', items: PLL },
  { id: 'notes', title: '🌟 其他高级方法', notes: ADVANCED_NOTES }
];
</script>

<template>
  <transition name="panel">
    <section v-if="visible" class="card mt-4 overflow-hidden">
      <!-- 头部 -->
      <header class="flex items-center justify-between border-b border-black/5 px-4 py-3">
        <h3 class="section-title">🧠 看解法（八种算法）</h3>
        <button class="tap flex items-center gap-1 rounded-xl px-3 text-subtle" @click="emit('close')">
          <X class="h-4 w-4" /> 收起
        </button>
      </header>

      <!-- 求解中 -->
      <div v-if="loading" class="flex items-center justify-center gap-3 px-4 py-10 text-subtle">
        <span class="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        {{ loadingText }}
      </div>

      <template v-else>
        <!-- 标签行 -->
        <div class="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3">
          <button
            v-for="t in tabs"
            :key="t.key"
            class="tap shrink-0 rounded-full px-3.5 text-sm font-medium"
            :class="t.key === currentTab ? 'bg-brand text-white shadow-[0_3px_0_rgba(247,103,7,0.4)]' : 'bg-cream text-subtle'"
            @click="switchTab(t.key)"
          >
            {{ t.label }}<span class="ml-1 opacity-80">{{ t.count }}</span>
          </button>
        </div>

        <!-- 当前标签内容 -->
        <div v-if="current" class="px-4 pb-4">
          <!-- 方法没求出解 -->
          <div v-if="current.err" class="rounded-2xl bg-cream p-4 text-sm leading-relaxed text-subtle">
            {{ current.meta ? current.meta.desc : '' }}
            <template v-if="current.meta && current.meta.hint">　💡 {{ current.meta.hint }}</template>
            （这个状态暂时没求出该解法的完整步骤，可以点「🔄 复原」重新打乱再试，或看其它解法标签）
            <span class="mt-1 block text-xs text-faint">原因：{{ current.err }}</span>
          </div>

          <template v-else>
            <!-- 本次解法说明 -->
            <div v-if="current.explain" class="rounded-2xl bg-cream p-3.5 text-sm leading-relaxed text-subtle">
              <div class="mb-1 flex items-center gap-1.5 font-semibold text-ink">
                <BookOpen class="h-4 w-4 text-brand" /> 本次解法说明
              </div>
              <p>{{ current.explain.idea }}</p>
              <p class="mt-1">{{ current.explain.steps }}</p>
            </div>

            <!-- 盲拧 memo -->
            <div v-if="currentTab === 'blind' && current.memo" class="mt-3 rounded-2xl bg-cream p-3.5 text-sm">
              <div class="mb-1 flex items-center gap-1.5 font-semibold text-ink">
                <Info class="h-4 w-4 text-brand" /> 字母编码（Speffz：角缓冲 ULB=A · 棱缓冲 UB=A）
              </div>
              <p class="text-subtle">棱：{{ current.memo.edgeText || '（无）' }}</p>
              <p class="text-subtle">角：{{ current.memo.cornerText || '（无）' }}</p>
              <p class="mt-1 text-xs text-faint">
                {{ current.memo.summary }}
                <template v-if="current.memo.parity">（存在奇偶：两角两棱互换）</template>
              </p>
            </div>

            <!-- 控制条 -->
            <div class="mt-3 flex items-center gap-2">
              <button class="btn-primary flex-1" @click="togglePlay">
                <Pause v-if="demo.playing.value" class="h-4 w-4" />
                <Play v-else class="h-4 w-4" />
                {{ demo.playing.value ? '暂停演示' : '逐步演示' }}
              </button>
              <button class="btn-ghost" title="从头演示（先复位魔方）" @click="replayFromStart">
                <RotateCcw class="h-4 w-4" />
              </button>
            </div>
            <p v-if="demo.caption.value" class="mt-2 text-center text-sm font-medium text-brand">
              {{ demo.caption.value }}
            </p>

            <!-- 阶段列表 -->
            <ol ref="stageListRef" class="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
              <li
                v-for="(s, si) in visibleStages"
                :key="s.id + si"
                :data-si="si"
                class="rounded-2xl bg-cream/70 p-3"
              >
                <div class="flex items-center justify-between">
                  <span class="text-sm font-semibold text-ink">
                    {{ STAGE_EMOJI[s.id] || '📌' }} {{ s.title }}
                  </span>
                  <span class="chip">{{ s.moves.length }} 步</span>
                </div>
                <p v-if="s.hint" class="muted mt-0.5">{{ s.hint }}</p>
                <div
                  ref="moveStripRef"
                  class="no-scrollbar mt-1.5 flex gap-1.5 overflow-x-auto"
                >
                  <span
                    v-for="(m, mi) in s.moves"
                    :key="s.from + mi"
                    :data-mi="s.from + mi"
                    class="shrink-0 rounded-lg px-2 py-1 font-mono text-xs"
                    :class="demo.activeIndex.value === s.from + mi ? 'bg-brand text-white' : 'bg-white text-ink'"
                  >{{ m }}</span>
                </div>
              </li>
            </ol>

            <!-- 进阶公式库（折叠） -->
            <button
              class="tap mt-3 flex w-full items-center justify-between rounded-2xl bg-cream px-4 text-sm font-semibold text-ink"
              @click="libExpanded = !libExpanded"
            >
              📐 进阶公式库
              <ChevronDown class="h-4 w-4 transition" :class="libExpanded ? 'rotate-180' : ''" />
            </button>
            <div v-if="libExpanded" class="mt-2 space-y-3">
              <div v-for="g in algGroups" :key="g.id" class="rounded-2xl bg-cream/70 p-3">
                <p class="mb-2 text-sm font-semibold text-ink">{{ g.title }}</p>
                <div class="grid gap-1.5 md:grid-cols-2">
                  <template v-if="g.items">
                    <div v-for="a in g.items" :key="a.id" class="rounded-xl bg-white p-2.5">
                      <p class="text-xs font-semibold text-ink">{{ a.name }}</p>
                      <p class="mt-0.5 break-words font-mono text-[11px] leading-relaxed text-subtle">
                        {{ a.moves.join(' ') }}
                      </p>
                    </div>
                  </template>
                  <template v-else>
                    <div v-for="n in g.notes" :key="n.id" class="rounded-xl bg-white p-2.5">
                      <p class="text-xs font-semibold text-ink">{{ n.icon }} {{ n.name }}</p>
                      <p class="mt-0.5 text-[11px] leading-relaxed text-subtle">{{ n.desc }}</p>
                    </div>
                  </template>
                </div>
              </div>
            </div>
          </template>
        </div>
      </template>
    </section>
  </transition>
</template>

<style scoped>
.panel-enter-active,
.panel-leave-active {
  transition: all 0.28s ease;
}
.panel-enter-from,
.panel-leave-to {
  opacity: 0;
  transform: translateY(14px);
}
</style>
