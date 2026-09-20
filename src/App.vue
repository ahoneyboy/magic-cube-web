<script setup>
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { House, GraduationCap, User, PartyPopper } from 'lucide-vue-next';
import { useSettingsStore } from './stores/settings.js';
import { useUiStore } from './stores/ui.js';

const route = useRoute();
const settings = useSettingsStore();
const ui = useUiStore();

const TABS = [
  { path: '/', label: '首页', icon: House },
  { path: '/learn', label: '学习', icon: GraduationCap },
  { path: '/mine', label: '我的', icon: User }
];

const isTab = computed(() => !!route.meta.tab);
const rootClass = computed(() => ({
  'large-font': settings.largeFont
}));

// 路由切换时滚回顶部（PWA standalone 下保持 app 观感）
watch(
  () => route.fullPath,
  () => window.scrollTo(0, 0)
);

const CONFETTI_COLORS = ['#FF8A3D', '#FFD93D', '#51CF66', '#339AF0', '#FF6B6B', '#FFA94D'];
function confettiStyle(i) {
  // 伪随机但固定：同一序号每次形态一致
  const left = (i * 37) % 100;
  const delay = (i % 12) * 0.12;
  const dur = 2 + (i % 5) * 0.4;
  const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
  const size = 6 + (i % 4) * 3;
  const round = i % 3 === 0 ? '50%' : '2px';
  return {
    left: left + '%',
    top: '-4%',
    width: size + 'px',
    height: size * 1.4 + 'px',
    background: color,
    borderRadius: round,
    animation: `confetti-fall ${dur}s linear ${delay}s infinite`
  };
}
</script>

<template>
  <div :class="rootClass" class="min-h-screen">
    <router-view />

    <!-- 底部导航（三个主 tab，与小程序一致） -->
    <nav
      v-if="isTab"
      class="fixed inset-x-0 bottom-0 z-40 border-t border-black/5 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <div class="mx-auto flex max-w-3xl">
        <router-link
          v-for="t in TABS"
          :key="t.path"
          :to="t.path"
          class="tap flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5"
        >
          <span
            class="flex h-8 w-14 items-center justify-center rounded-full transition"
            :class="route.path === t.path ? 'bg-brand/15' : ''"
          >
            <component
              :is="t.icon"
              class="h-5 w-5"
              :class="route.path === t.path ? 'text-brand' : 'text-faint'"
              :stroke-width="2.2"
            />
          </span>
          <span class="text-[11px]" :class="route.path === t.path ? 'font-semibold text-brand' : 'text-faint'">
            {{ t.label }}
          </span>
        </router-link>
      </div>
    </nav>

    <!-- 轻提示 -->
    <transition name="toast">
      <div v-if="ui.toast" class="pointer-events-none fixed inset-x-0 top-14 z-50 flex justify-center px-6">
        <div
          class="rounded-2xl px-4 py-2.5 text-sm text-white shadow-lg"
          :class="ui.toast.tone === 'warn' ? 'bg-red-500/95' : ui.toast.tone === 'success' ? 'bg-emerald-500/95' : 'bg-ink/90'"
        >
          {{ ui.toast.text }}
        </div>
      </div>
    </transition>

    <!-- 庆祝动画（彩带粒子，CSS 实现） -->
    <div v-if="ui.celebrate" class="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      <span v-for="i in 42" :key="i" class="confetti" :style="confettiStyle(i)" />
      <div class="absolute inset-x-0 top-1/3 flex flex-col items-center gap-2">
        <PartyPopper class="h-12 w-12 text-brand" />
        <div class="rounded-2xl bg-white/95 px-5 py-2 text-base font-semibold text-ink shadow-card-lg">太棒了！🎉</div>
      </div>
    </div>
  </div>
</template>

<style>
@keyframes confetti-fall {
  0% {
    transform: translateY(-5vh) rotate(0deg);
    opacity: 1;
  }
  100% {
    transform: translateY(110vh) rotate(540deg);
    opacity: 0.9;
  }
}
.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
