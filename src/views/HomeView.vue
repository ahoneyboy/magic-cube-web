<script setup>
/**
 * HomeView.vue —— 首页（对照小程序 home.js）：3D 魔方展示 + 功能入口 + 打卡/等级速览
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Play, Timer, Camera, GraduationCap, User, Flag, Flame, Star } from 'lucide-vue-next';
import Cube3D from '../components/Cube3D.vue';
import { useGameStore } from '../stores/game.js';
import { useRecordsStore } from '../stores/records.js';
import { useSettingsStore } from '../stores/settings.js';
import { useUiStore } from '../stores/ui.js';

const router = useRouter();
const game = useGameStore();
const records = useRecordsStore();
const settings = useSettingsStore();
const ui = useUiStore();
const cubeRef = ref(null);
const cubeReady = ref(false);

function onCubeReady() {
  cubeReady.value = true;
}

const entries = [
  { path: '/play', label: '玩转魔方', desc: '滑动转动 · WCA 打乱 · 八种解法', icon: Play, color: 'bg-brand/10 text-brand' },
  { path: '/scan', label: '拍照识别', desc: '拍六张照片，自动识别求解', icon: Camera, color: 'bg-emerald-50 text-emerald-500' },
  { path: '/wca', label: '🏁 赛场模式', desc: '15 秒观察 · 5 次一轮 ao5', icon: Flag, color: 'bg-blue-50 text-blue-500' },
  { path: '/timer', label: '计时挑战', desc: '对照 3D 状态复原实体魔方', icon: Timer, color: 'bg-orange-50 text-orange-500' },
  { path: '/learn', label: '分步教学', desc: '七课学会复原 + 进阶解法', icon: GraduationCap, color: 'bg-purple-50 text-purple-500' },
  { path: '/mine', label: '我的', desc: '成就徽章 · 打卡 · 设置', icon: User, color: 'bg-rose-50 text-rose-400' }
];

onMounted(() => {
  records.getStreak();
});

const greet = computed(() => {
  const h = new Date().getHours();
  if (h < 6) return '夜深了，早点休息';
  if (h < 12) return '早上好';
  if (h < 18) return '下午好';
  return '晚上好';
});
</script>

<template>
  <div class="page">
    <header class="mb-3 flex items-end justify-between">
      <div>
        <h1 class="text-2xl font-bold">魔力魔方</h1>
        <p class="muted">{{ greet }}，{{ settings.nickname }}</p>
      </div>
      <div class="flex gap-1.5">
        <span class="chip">
          <Flame class="h-3.5 w-3.5 text-orange-400" /> 连续 {{ records.getStreak() }} 天
        </span>
        <span class="chip">
          <Star class="h-3.5 w-3.5 text-brand" /> Lv.{{ game.level.level }} {{ game.level.name }}
        </span>
      </div>
    </header>

    <!-- 3D 展示（可拖动旋转，可自由玩） -->
    <div class="card overflow-hidden p-2">
      <div class="h-[38vh] min-h-[260px] w-full md:h-[420px]">
        <Cube3D ref="cubeRef" :auto-spin="true" @ready="onCubeReady" @solved="ui.celebrateOnce()" />
      </div>
      <p class="pb-2 text-center text-xs text-faint">拖一拖，转一转，先感受一下每一层</p>
    </div>

    <!-- 功能入口 -->
    <div class="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
      <button
        v-for="e in entries"
        :key="e.path"
        class="card tap flex flex-col items-start p-4 text-left"
        @click="router.push(e.path)"
      >
        <span class="mb-2 flex h-10 w-10 items-center justify-center rounded-2xl" :class="e.color">
          <component :is="e.icon" class="h-5 w-5" />
        </span>
        <span class="text-base font-semibold text-ink">{{ e.label }}</span>
        <span class="muted mt-0.5">{{ e.desc }}</span>
      </button>
    </div>
  </div>
</template>
