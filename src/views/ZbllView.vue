<script setup>
/**
 * ZbllView.vue —— ZBLL 知识 + 1942 种公式按 5 个形态家族浏览（对照小程序 zbll.js）
 * 每条显示：待翻角位置与方向（classifyKey.desc）、待换位数（perm）、完整公式；40 条分页。
 */
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { ChevronLeft, ChevronRight, Copy, Check } from 'lucide-vue-next';
import { ZBLL_TABLE } from '../engine/config/zbllTable.js';
import { buildFamilies, classifyKey } from '../engine/zbll.js';
import { Cube, SOLVED } from '../engine/cube.js';
import { pieceArrays, CORNERS, EDGES } from '../engine/cubies.js';
import { useUiStore } from '../stores/ui.js';

const PAGE_SIZE = 40;
const router = useRouter();
const ui = useUiStore();

const mode = ref('home'); // home | family
const current = ref(null);
const allCases = ref([]);
const cases = ref([]);
const expanded = ref(-1);
const copiedIdx = ref(-1);

const total = ZBLL_TABLE.length;

// 家族（含每条情形的完整描述），一次性构建（约 2000 条，本地计算 <1s）
const families = computed(() =>
  buildFamiliesWithCases().map((f) => ({
    id: f.id,
    title: f.title,
    sub: f.sub,
    count: f.cases.length
  }))
);
let familiesWithCases = null;
function buildFamiliesWithCases() {
  if (familiesWithCases) return familiesWithCases;
  const base = buildFamilies(); // count only（引擎版不返回 cases）
  const byId = {};
  base.forEach((f) => {
    byId[f.id] = { id: f.id, title: f.title, sub: f.sub, cases: [] };
  });
  ZBLL_TABLE.forEach((entry) => {
    const key = entry[0];
    const cls = classifyKey(key);
    if (!cls || !byId[cls.id]) return;
    // 待换位数：由情形键重建状态后统计顶层置换
    const st = stateFromKeyAndAlg(key);
    let nc = 0;
    let ne = 0;
    if (st) {
      const pa = pieceArrays(st);
      for (let i = 0; i < 8; i++) {
        if (CORNERS[i].pos[1] === 1 && pa.cp[i] !== i) nc++;
      }
      for (let j = 0; j < 12; j++) {
        if (EDGES[j].pos[1] === 1 && pa.ep[j] !== j) ne++;
      }
    }
    byId[cls.id].cases.push({ key, alg: entry[1], desc: cls.desc, perm: `${nc} 角 ${ne} 棱待换位` });
  });
  familiesWithCases = Object.values(byId);
  return familiesWithCases;
}

// 由情形键重建状态（键 = 逆公式作用于复原态前的状态；用逆推实现）
function stateFromKeyAndAlg(key) {
  const entry = ZBLL_TABLE.find((e) => e[0] === key);
  if (!entry) return null;
  const c = new Cube(SOLVED);
  const moves = entry[1].split(' ').filter(Boolean);
  for (let k = moves.length - 1; k >= 0; k--) {
    const m = moves[k];
    c.move(m.length === 1 ? m + "'" : m[1] === '2' ? m : m[0]);
  }
  return c.getFacelet();
}

function openFamily(id) {
  const fam = buildFamiliesWithCases().find((f) => f.id === id);
  if (!fam) return;
  current.value = { id: fam.id, title: fam.title, sub: fam.sub };
  allCases.value = fam.cases;
  cases.value = fam.cases.slice(0, PAGE_SIZE);
  expanded.value = -1;
  mode.value = 'family';
}

function backHome() {
  mode.value = 'home';
  current.value = null;
  cases.value = [];
}

function loadMore() {
  const cur = cases.value.length;
  cases.value = cases.value.concat(allCases.value.slice(cur, cur + PAGE_SIZE));
}

function toggleCase(idx) {
  expanded.value = expanded.value === idx ? -1 : idx;
}

async function copyAlg(idx) {
  const c = cases.value[idx];
  if (!c) return;
  try {
    await navigator.clipboard.writeText(c.alg);
    copiedIdx.value = idx;
    ui.showToast('公式已复制', 'success');
    setTimeout(() => {
      copiedIdx.value = -1;
    }, 1500);
  } catch (e) {
    ui.showToast('复制失败，长按公式手动复制', 'warn');
  }
}
</script>

<template>
  <div class="page">
    <header class="mb-3 flex items-center gap-3">
      <button class="tap rounded-xl px-2 text-subtle" @click="mode === 'family' ? backHome() : router.back()">←</button>
      <div class="min-w-0">
        <h1 class="truncate text-2xl font-bold">{{ mode === 'family' ? current.title : 'ZBLL 公式表' }}</h1>
        <p class="muted">{{ mode === 'family' ? `共 ${allCases.length} 种情形` : `${total} 种顶层情形 · 一条公式完成顶层` }}</p>
      </div>
    </header>

    <!-- 知识讲解 -->
    <template v-if="mode === 'home'">
      <div class="card mb-3 p-4 text-sm leading-relaxed text-subtle">
        <p class="section-title mb-1">什么是 ZBLL？</p>
        <p>
          前两层（F2L）完成、顶面十字也完成后，顶层只剩「角块翻色 + 角棱换位」的组合。
          普通做法要两条公式（OLL + PLL），ZBLL 用<b class="text-ink">一条公式</b>直接复原整个顶层。
        </p>
        <p class="mt-2">
          识别方法：只看<b class="text-ink">顶层 4 个角的朝向形态</b>，分成 5 个家族
          （角全朝上 71 / 一角朝上 576 / 相邻两角 575 / 对角两角 288 / 四角 432），
          再结合棱块换位挑公式。
        </p>
      </div>

      <div class="grid gap-2 md:grid-cols-2">
        <button v-for="f in families" :key="f.id" class="card tap flex items-center justify-between p-4 text-left" @click="openFamily(f.id)">
          <span class="min-w-0">
            <span class="text-sm font-semibold text-ink">{{ f.title }}</span>
            <span class="muted mt-0.5 block truncate">{{ f.sub }}</span>
          </span>
          <span class="chip shrink-0">{{ f.count }} 种</span>
        </button>
      </div>
    </template>

    <!-- 家族列表 -->
    <template v-else>
      <div class="space-y-2">
        <div v-for="(c, idx) in cases" :key="c.key" class="card overflow-hidden">
          <button class="tap flex w-full items-center justify-between p-4 text-left" @click="toggleCase(idx)">
            <span class="min-w-0 pr-2">
              <span class="block truncate text-sm text-subtle">{{ c.desc }}</span>
              <span class="muted mt-0.5 block">{{ c.perm }}</span>
            </span>
            <span class="chip shrink-0 font-mono">{{ c.alg.split(' ').length }} 步</span>
          </button>
          <div v-if="expanded === idx" class="border-t border-black/5 bg-cream px-4 py-3">
            <p class="break-words text-center font-mono text-sm font-semibold leading-relaxed text-ink">{{ c.alg }}</p>
            <button class="btn-ghost mx-auto mt-2 flex" @click="copyAlg(idx)">
              <component :is="copiedIdx === idx ? Check : Copy" class="h-4 w-4" />
              {{ copiedIdx === idx ? '已复制' : '复制公式' }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="cases.length < allCases.length" class="mt-3 text-center">
        <button class="btn-ghost" @click="loadMore">
          加载更多（{{ cases.length }}/{{ allCases.length }}）
          <ChevronRight class="h-4 w-4" />
        </button>
      </div>
      <p class="muted mt-4 flex items-center justify-center gap-1 text-center">
        每页 {{ PAGE_SIZE }} 条 · <ChevronLeft class="h-3 w-3" /> 适用于前两层完成 + 顶面十字已成
      </p>
    </template>
  </div>
</template>
