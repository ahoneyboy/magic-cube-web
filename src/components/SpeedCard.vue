<script setup>
/**
 * SpeedCard.vue —— 速度卡片（§5.1）：打乱与演示两个独立滑动条
 * 0.5~10 秒/步，步进 0.5s，互不影响；语义 = 每步总时长（转动固定 500ms + 等待剩余）
 */
import { computed } from 'vue';
import { Gauge } from 'lucide-vue-next';
import { useSettingsStore } from '../stores/settings.js';
import { SPEED_MIN_SEC, SPEED_MAX_SEC } from '../stores/recordsMath.js';

const settings = useSettingsStore();

// 滑动条以"0.5s 一档"的档位序号工作（0 = 0.5s，19 = 10s）
const STEP = 0.5;
const stepsToSec = (v) => Math.round((SPEED_MIN_SEC + v * STEP) * 10) / 10;
const secToSteps = (sec) => Math.round((sec - SPEED_MIN_SEC) / STEP);

const scrambleModel = computed({
  get: () => secToSteps(settings.scrambleSec),
  set: (v) => settings.setScrambleSec(stepsToSec(v))
});
const demoModel = computed({
  get: () => secToSteps(settings.demoSec),
  set: (v) => settings.setDemoSec(stepsToSec(v))
});

function label(sec) {
  return sec < 1 ? `${Math.round(sec * 10) / 10}s/步` : `${sec}s/步`;
}
</script>

<template>
  <div class="card p-4">
    <div class="mb-3 flex items-center gap-2">
      <Gauge class="h-4 w-4 text-brand" />
      <span class="section-title">速度设置</span>
      <span class="muted">每步总时长 = 转动 0.5s + 等待</span>
    </div>
    <div class="space-y-4">
      <div>
        <div class="mb-1 flex items-center justify-between">
          <span class="text-sm text-subtle">打乱速度</span>
          <span class="text-sm font-semibold text-brand">{{ label(settings.scrambleSec) }}</span>
        </div>
        <input
          v-model.number="scrambleModel"
          type="range"
          :min="0"
          :max="Math.round((SPEED_MAX_SEC - SPEED_MIN_SEC) / STEP)"
          :step="1"
          class="h-11 w-full accent-[#FF8A3D]"
          aria-label="打乱速度"
        />
      </div>
      <div>
        <div class="mb-1 flex items-center justify-between">
          <span class="text-sm text-subtle">演示速度</span>
          <span class="text-sm font-semibold text-brand">{{ label(settings.demoSec) }}</span>
        </div>
        <input
          v-model.number="demoModel"
          type="range"
          :min="0"
          :max="Math.round((SPEED_MAX_SEC - SPEED_MIN_SEC) / STEP)"
          :step="1"
          class="h-11 w-full accent-[#FF8A3D]"
          aria-label="演示速度"
        />
      </div>
    </div>
  </div>
</template>
