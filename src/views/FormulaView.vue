<script setup>
/**
 * FormulaView.vue —— 公式卡库（对照小程序 formula.js）
 * 基础公式（层先法）+ 2-Look OLL + PLL；点开 FormulaCard（3D 演示 + 计时训练）。
 */
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { ChevronLeft, Search } from 'lucide-vue-next';
import FormulaCard from '../components/FormulaCard.vue';
import { FORMULAS } from '../engine/config/lessonData.js';
import { OLL_2LOOK, PLL } from '../engine/config/algLibrary.js';

const router = useRouter();
const keyword = ref('');
const current = ref(null);

const basic = Object.keys(FORMULAS).map((k) => ({
  key: k,
  name: FORMULAS[k].name,
  icon: FORMULAS[k].icon,
  moves: FORMULAS[k].moves,
  movesText: FORMULAS[k].moves.join(' '),
  tip: FORMULAS[k].tip,
  usage: FORMULAS[k].usage
}));
const oll = OLL_2LOOK.map((a) => ({
  key: a.id,
  name: a.name,
  icon: '📐',
  moves: a.moves,
  movesText: a.moves.join(' '),
  tip: a.tip,
  usage: a.sub + ' · ' + a.usage
}));
const pll = PLL.map((a) => ({
  key: a.id,
  name: a.name,
  icon: '🏁',
  moves: a.moves,
  movesText: a.moves.join(' '),
  tip: a.tip,
  usage: a.sub + ' · ' + a.usage
}));

const groups = [
  { id: 'basic', title: '🧩 基础公式（层先法）', items: basic },
  { id: 'oll', title: '📐 高级公式 · 2-Look OLL', items: oll },
  { id: 'pll', title: '🏁 高级公式 · PLL（21 情形）', items: pll }
];

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  if (!kw) return groups;
  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter((x) => (x.name + x.movesText + x.usage).toLowerCase().includes(kw))
    }))
    .filter((g) => g.items.length);
});
</script>

<template>
  <div class="page">
    <header class="mb-3 flex items-center gap-3">
      <button class="tap rounded-xl px-2 text-subtle" @click="router.back()">←</button>
      <h1 class="text-2xl font-bold">公式卡</h1>
    </header>

    <div class="mb-3 flex items-center gap-2 rounded-2xl bg-white px-4 shadow-card">
      <Search class="h-4 w-4 shrink-0 text-faint" />
      <input
        v-model="keyword"
        placeholder="搜公式名 / 记号"
        class="h-12 w-full bg-transparent text-sm outline-none placeholder:text-faint"
      />
    </div>

    <div v-for="g in filtered" :key="g.id" class="mb-4">
      <h2 class="section-title mb-2 px-1">{{ g.title }}</h2>
      <div class="grid gap-2 md:grid-cols-2">
        <button v-for="f in g.items" :key="f.key" class="card tap flex items-center justify-between p-4 text-left" @click="current = f">
          <span class="min-w-0">
            <span class="text-sm font-semibold text-ink">{{ f.icon }} {{ f.name }}</span>
            <span class="mt-0.5 block break-words font-mono text-xs text-subtle">{{ f.movesText }}</span>
          </span>
          <span class="chip shrink-0">演示</span>
        </button>
      </div>
    </div>

    <FormulaCard :formula="current" :visible="!!current" @close="current = null" />
  </div>
</template>
