<script setup>
/**
 * StatsView.vue —— 成绩（对照小程序 stats.js）
 * 单次列表（含罚时/DNF）、最佳 PB、ao5/ao12（去头尾）、平均、段位；
 * ECharts 折线趋势图 + 近 7 天柱状图；成绩卡分享图（canvas 导出 PNG）。
 */
import { ref, computed, onMounted } from 'vue';
import { Trophy, Trash2, Share2, Flag } from 'lucide-vue-next';
import RecordChart from '../components/RecordChart.vue';
import WeekChart from '../components/WeekChart.vue';
import { useRecordsStore, MODE_NAME } from '../stores/records.js';
import { CUBE_COLORS } from '../engine/config/index.js';
import * as wca from '../engine/wcaRules.js';
import { useUiStore } from '../stores/ui.js';

const records = useRecordsStore();
const ui = useUiStore();
const shareCanvasRef = ref(null);
const sharing = ref(false);

const stats = computed(() => records.getStats('3x3'));
const level = computed(() => records.levelOf('3x3'));

const recent = computed(() =>
  stats.value.recent.map((r) => ({
    id: r.id,
    resultText: wca.formatResult(r.durationMs, r.penalty),
    isDNF: r.penalty === 'DNF',
    isPlus2: r.penalty === '+2',
    modeText: MODE_NAME[r.mode] || r.mode,
    dateText: (r.date || '').slice(5, 10).replace('-', '/')
  }))
);

// 趋势：最近 20 次有效成绩（时间顺序）
const trendTimes = computed(() =>
  stats.value.recent
    .filter((r) => r.penalty !== 'DNF')
    .slice(0, 20)
    .reverse()
    .map((r) => wca.effectiveMs(r.durationMs, r.penalty))
);

const weekDays = computed(() => {
  const WD = ['日', '一', '二', '三', '四', '五', '六'];
  return records.getPlaytimeDays(7).map((d, idx) => {
    const parts = d.date.split('-').map(Number);
    const wd = new Date(parts[0], parts[1] - 1, parts[2]).getDay();
    return {
      ...d,
      weekday: idx === 6 ? '今天' : '周' + WD[wd],
      isToday: idx === 6
    };
  });
});

const fmt = (v) => (v != null ? wca.formatMs(v) : '--');

onMounted(() => {});

async function clearAll() {
  if (!window.confirm('确定清空全部成绩记录吗？')) return;
  await records.clearRecords();
  ui.showToast('已清空', 'success');
}

// ---- 成绩卡分享图（canvas 导出 PNG）----
async function onShare() {
  if (sharing.value) return;
  sharing.value = true;
  try {
    const canvas = shareCanvasRef.value;
    const W = 600;
    const H = 800;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#FFF3D6');
    bg.addColorStop(1, '#FFE3C2');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#3D3A37';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('魔力魔方 · 成绩卡', W / 2, 90);

    // 魔方图案（3x3 平面）
    const faceOrder = ['U', 'L', 'F', 'R', 'B', 'D'];
    const cell = 26;
    const faceW = cell * 3;
    const startX = W / 2 - faceW * 2 - 6;
    const startY = 130;
    faceOrder.forEach((f, i) => {
      const fx = startX + (i % 3) * (faceW + 6);
      const fy = startY + Math.floor(i / 3) * (faceW + 6);
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          ctx.fillStyle = CUBE_COLORS[f];
          roundRect(ctx, fx + c * (cell + 3), fy + r * (cell + 3), cell, cell, 6);
          ctx.fill();
        }
      }
    });

    const s = stats.value;
    ctx.fillStyle = '#FF8A3D';
    ctx.font = 'bold 96px sans-serif';
    ctx.fillText(s.best != null ? wca.formatMs(s.best) : '--', W / 2, 400);
    ctx.fillStyle = '#6B7075';
    ctx.font = '30px sans-serif';
    ctx.fillText('历史最佳（PB）· 共 ' + s.count + ' 次', W / 2, 448);

    ctx.fillStyle = '#3D3A37';
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText(level.value.name, W / 2, 528);
    ctx.font = '27px sans-serif';
    ctx.fillStyle = '#9AA0A6';
    const line = [];
    if (s.ao5 != null) line.push('ao5 ' + wca.formatMs(s.ao5));
    if (s.ao12 != null) line.push('ao12 ' + wca.formatMs(s.ao12));
    if (line.length) ctx.fillText(line.join(' · '), W / 2, 574);

    ctx.font = '24px sans-serif';
    ctx.fillStyle = '#B0B6BC';
    ctx.fillText('我在「魔力魔方」Web 版等你来挑战！', W / 2, 700);

    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = 'magic-cube-成绩卡.png';
    a.click();
    ui.showToast('成绩卡已保存', 'success');
  } finally {
    sharing.value = false;
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
</script>

<template>
  <div class="page">
    <header class="mb-3 flex items-center justify-between">
      <h1 class="text-2xl font-bold">我的成绩</h1>
      <div class="flex gap-1">
        <router-link to="/wca" class="tap flex items-center gap-1 rounded-xl px-2 text-sm text-brand">
          <Flag class="h-4 w-4" /> 赛场模式
        </router-link>
        <button class="tap flex items-center gap-1 rounded-xl px-2 text-sm text-red-400" @click="clearAll">
          <Trash2 class="h-4 w-4" />
        </button>
      </div>
    </header>

    <!-- 统计卡 -->
    <div class="grid grid-cols-2 gap-2 md:grid-cols-4">
      <div class="card p-4 text-center">
        <p class="muted">最佳（PB）</p>
        <p class="font-mono text-xl font-bold text-brand">{{ fmt(stats.best) }}</p>
      </div>
      <div class="card p-4 text-center">
        <p class="muted">ao5（去头尾）</p>
        <p class="font-mono text-xl font-bold text-ink">
          {{ stats.ao5 != null ? fmt(stats.ao5) : stats.ao5DNF ? 'DNF' : '--' }}
        </p>
      </div>
      <div class="card p-4 text-center">
        <p class="muted">ao12（去头尾）</p>
        <p class="font-mono text-xl font-bold text-ink">{{ fmt(stats.ao12) }}</p>
      </div>
      <div class="card p-4 text-center">
        <p class="muted">平均</p>
        <p class="font-mono text-xl font-bold text-ink">{{ fmt(stats.avg) }}</p>
      </div>
    </div>

    <!-- 段位 -->
    <div class="card mt-3 flex items-center justify-between p-4">
      <div class="flex items-center gap-3">
        <component :is="level.icon === 'trophy' ? Trophy : Flag" class="h-8 w-8 text-brand" />
        <div>
          <p class="section-title">当前段位：{{ level.name }}</p>
          <p class="muted">共 {{ stats.count }} 次 · DNF {{ stats.dnfCount }} · +2 {{ stats.plus2Count }} · 今日 {{ stats.todayCount }} 次</p>
        </div>
      </div>
      <button class="btn-ghost" :disabled="sharing || !stats.count" @click="onShare">
        <Share2 class="h-4 w-4" /> 成绩卡
      </button>
    </div>
    <canvas ref="shareCanvasRef" class="hidden" />

    <!-- 趋势图 -->
    <div class="card mt-3 p-4">
      <p class="section-title mb-2">成绩趋势（最近 ≤20 次）</p>
      <RecordChart :times="trendTimes" />
    </div>

    <!-- 近 7 天 -->
    <div class="card mt-3 p-4">
      <p class="section-title mb-2">近 7 天练习时长</p>
      <WeekChart :days="weekDays" :limit-min="30" />
    </div>

    <!-- 单次列表 -->
    <div class="card mt-3 p-4">
      <p class="section-title mb-2">单次记录</p>
      <div v-if="!recent.length" class="py-6 text-center text-xs text-faint">还没有成绩，去玩一局吧</div>
      <ul v-else class="divide-y divide-black/5">
        <li v-for="r in recent" :key="r.id" class="flex items-center justify-between py-2.5">
          <span class="font-mono text-sm" :class="r.isDNF ? 'text-red-400 line-through' : r.isPlus2 ? 'text-orange-500' : 'text-ink'">
            {{ r.resultText }}
          </span>
          <span class="muted">{{ r.modeText }} · {{ r.dateText }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>
