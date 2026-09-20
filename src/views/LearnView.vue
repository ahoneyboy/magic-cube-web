<script setup>
/**
 * LearnView.vue —— 学习 tab（对照小程序 learn.js）
 * 层先法 7 课（过关解锁、星级）+ 进阶解法 4 课 + 公式卡 + ZBLL 知识入口。
 */
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { Lock, Star, Layers, Zap, BookOpen, Table2, ChevronRight } from 'lucide-vue-next';
import { STAGES, ADVANCED } from '../engine/config/lessonData.js';
import { useLessonsStore } from '../stores/lessons.js';
import { useGameStore } from '../stores/game.js';
import { useUiStore } from '../stores/ui.js';

const router = useRouter();
const lessons = useLessonsStore();
const game = useGameStore();
const ui = useUiStore();

const stages = computed(() =>
  STAGES.map((s) => ({
    id: s.id,
    title: s.title,
    emoji: s.emoji,
    tip: s.tip,
    locked: !lessons.isUnlocked(s.id, s.id),
    stars: lessons.completed[s.id] || 0,
    done: !!lessons.completed[s.id]
  }))
);

const advanced = computed(() =>
  ADVANCED.map((a) => ({
    id: a.id,
    title: a.title,
    emoji: a.emoji,
    tip: a.tip,
    stageCount: a.stageList.length,
    done: !!lessons.completed[a.id]
  }))
);

function openLesson(id) {
  const stage = stages.value.find((s) => s.id === id);
  if (stage && stage.locked) {
    ui.showToast(`先完成第 ${id - 1} 课再来吧`, 'info');
    return;
  }
  router.push('/lesson/' + id);
}
</script>

<template>
  <div class="page">
    <header class="mb-3 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">学习</h1>
        <p class="muted">七步学会复原 · Lv.{{ game.level.level }} {{ game.level.name }}</p>
      </div>
      <router-link to="/zbll" class="tap flex items-center gap-1 rounded-xl px-2 text-sm text-brand">
        <Table2 class="h-4 w-4" /> ZBLL
      </router-link>
    </header>

    <!-- 进度 -->
    <div class="card mb-3 p-4">
      <div class="mb-2 flex items-center justify-between">
        <span class="section-title">七步学会复原</span>
        <span class="chip">{{ lessons.getLessonsDone() }}/7 课</span>
      </div>
      <div class="h-2 overflow-hidden rounded-full bg-cream">
        <div class="h-full rounded-full bg-brand transition-all" :style="{ width: (lessons.getLessonsDone() / 7) * 100 + '%' }" />
      </div>
    </div>

    <!-- 7 课 -->
    <ul class="space-y-2">
      <li v-for="s in stages" :key="s.id">
        <button
          class="card tap flex w-full items-center gap-3 p-4 text-left"
          :class="s.locked ? 'opacity-60' : ''"
          @click="openLesson(s.id)"
        >
          <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cream text-xl">
            {{ s.locked ? '🔒' : s.emoji }}
          </span>
          <span class="min-w-0 flex-1">
            <span class="flex items-center gap-1.5">
              <span class="text-base font-semibold text-ink">第{{ s.id }}课 {{ s.title }}</span>
              <Lock v-if="s.locked" class="h-3.5 w-3.5 text-faint" />
            </span>
            <span class="muted mt-0.5 block truncate">{{ s.tip }}</span>
            <span v-if="s.done" class="mt-1 flex items-center gap-0.5">
              <Star v-for="i in 3" :key="i" class="h-3.5 w-3.5" :class="i <= s.stars ? 'fill-brand text-brand' : 'text-faint/40'" />
            </span>
          </span>
          <ChevronRight class="h-5 w-5 shrink-0 text-faint" />
        </button>
      </li>
    </ul>

    <!-- 公式卡入口 -->
    <router-link to="/formula" class="card tap mt-4 flex items-center gap-3 p-4">
      <span class="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand/10 text-brand">
        <BookOpen class="h-5 w-5" />
      </span>
      <span class="flex-1">
        <span class="text-base font-semibold text-ink">公式卡</span>
        <span class="muted mt-0.5 block">右手 / 左右插 / 小鱼 / 换位 · 2-Look OLL / PLL · 计时训练</span>
      </span>
      <ChevronRight class="h-5 w-5 text-faint" />
    </router-link>

    <!-- 进阶解法 -->
    <div class="mt-4 mb-2 flex items-center gap-2 px-1">
      <Zap class="h-4 w-4 text-brand" />
      <h2 class="section-title">进阶解法（随时可看，不锁）</h2>
    </div>
    <ul class="space-y-2">
      <li v-for="a in advanced" :key="a.id">
        <button class="card tap flex w-full items-center gap-3 p-4 text-left" @click="router.push('/lesson/' + a.id)">
          <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cream text-xl">{{ a.emoji }}</span>
          <span class="min-w-0 flex-1">
            <span class="flex items-center gap-1.5">
              <span class="text-base font-semibold text-ink">{{ a.title }}</span>
              <span v-if="a.done" class="chip !bg-brand/10 !text-brand">已完成</span>
            </span>
            <span class="muted mt-0.5 block truncate">{{ a.tip }}</span>
            <span class="muted mt-0.5 flex items-center gap-1">
              <Layers class="h-3 w-3" /> {{ a.stageCount }} 个阶段
            </span>
          </span>
          <ChevronRight class="h-5 w-5 shrink-0 text-faint" />
        </button>
      </li>
    </ul>
  </div>
</template>
