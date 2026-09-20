<script setup>
/**
 * ParentView.vue —— 家长模式（对照小程序 parent.js）
 * 4 位 PIN 锁（可重置）→ 练习报告（累计复原/课程进度/连续打卡/近 7 天时长 ECharts 柱状图，
 * 超阈值红标）+ 每日时长提醒滑条 + 「今日练习计划」卡片（canvas 导出分享图）。
 */
import { ref, computed, onMounted, nextTick } from 'vue';
import { ChevronLeft, Lock, Trash2, Share2, ClipboardList, FileText } from 'lucide-vue-next';
import WeekChart from '../components/WeekChart.vue';
import { useRecordsStore } from '../stores/records.js';
import { useLessonsStore } from '../stores/lessons.js';
import { useSettingsStore } from '../stores/settings.js';
import { useUiStore } from '../stores/ui.js';
import { STAGES } from '../engine/config/lessonData.js';
import * as wca from '../engine/wcaRules.js';
import { CUBE_COLORS } from '../engine/config/index.js';

const records = useRecordsStore();
const lessons = useLessonsStore();
const settings = useSettingsStore();
const ui = useUiStore();

const locked = ref(true);
const pin = ref('');
const pinError = ref('');
const hasPin = computed(() => !!records.getParentPin());
const viewMode = ref('report'); // report | plan
const planCanvasRef = ref(null);
const sharing = ref(false);

// 报告
const stats = computed(() => records.getStats('3x3'));
const level = computed(() => records.levelOf('3x3'));
const todayMinutes = computed(() => Math.round(records.getPlaytimeToday()));
const dailyLimit = computed(() => settings.dailyLimitMin || 30);

const WD = ['日', '一', '二', '三', '四', '五', '六'];
const weekDays = computed(() =>
  records.getPlaytimeDays(7).map((d, idx) => {
    const parts = d.date.split('-').map(Number);
    const wd = new Date(parts[0], parts[1] - 1, parts[2]).getDay();
    return {
      ...d,
      weekday: idx === 6 ? '今天' : '周' + WD[wd],
      isToday: idx === 6
    };
  })
);

const plan = computed(() => {
  const nextLesson = STAGES.find((s) => !lessons.completed[s.id]) || STAGES[STAGES.length - 1];
  return {
    lesson: nextLesson,
    goalSolves: Math.max(3, (stats.value.todayCount || 0) + 3),
    streak: records.getStreak()
  };
});

onMounted(() => {
  locked.value = hasPin.value;
});

// ---- PIN ----
function tapDigit(d) {
  if (pin.value.length >= 4) return;
  pin.value += d;
  pinError.value = '';
  if (pin.value.length === 4) setTimeout(confirmPin, 120);
}
function backspace() {
  pin.value = pin.value.slice(0, -1);
}

async function confirmPin() {
  if (!hasPin.value) {
    // 设置新 PIN
    if (!/^\d{4}$/.test(pin.value)) {
      pinError.value = '请输入 4 位数字';
      pin.value = '';
      return;
    }
    await records.setParentPin(pin.value);
    locked.value = false;
    pin.value = '';
    return;
  }
  if (pin.value === records.getParentPin()) {
    locked.value = false;
    pin.value = '';
  } else {
    pinError.value = 'PIN 不对哦';
    pin.value = '';
  }
}

async function onResetPin() {
  if (!window.confirm('仅家长可操作：重置后需重新设置 4 位 PIN。确定重置吗？')) return;
  await records.setParentPin('');
  locked.value = false;
  pin.value = '';
  pinError.value = '';
}

async function onDisablePin() {
  if (!window.confirm('关闭后进入家长模式不再需要密码，确定吗？（之后可随时重新设置）')) return;
  await records.setParentPin('');
  pin.value = '';
}

function onLimitChange(e) {
  const v = Number(e.target.value);
  settings.update({ dailyLimitMin: v });
}

function switchView(v) {
  viewMode.value = v;
}

// ---- 今日练习计划分享图 ----
async function onMakePlan() {
  if (sharing.value) return;
  sharing.value = true;
  try {
    await nextTick();
    const canvas = planCanvasRef.value;
    const W = 600;
    const H = 760;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#E7F5FF');
    bg.addColorStop(1, '#D3F9D8');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#3D3A37';
    ctx.font = 'bold 42px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('今日练习计划 🎯', W / 2, 90);

    ctx.font = '28px sans-serif';
    ctx.fillStyle = '#6B7075';
    const today = new Date();
    ctx.fillText(`${today.getMonth() + 1}月${today.getDate()}日 · 连续打卡 ${plan.value.streak} 天`, W / 2, 140);

    const items = [
      `📚 复习课程：第${plan.value.lesson.id}课「${plan.value.lesson.title}」`,
      `🎯 目标口诀：${plan.value.lesson.tip}`,
      `🧊 完成复原：至少 ${plan.value.goalSolves} 次`,
      `⏱️ 挑战一次计时模式`
    ];
    ctx.textAlign = 'left';
    ctx.font = '30px sans-serif';
    let y = 240;
    items.forEach((it) => {
      ctx.fillStyle = '#FFFFFF';
      roundRect(ctx, 50, y - 36, W - 100, 56, 16);
      ctx.fill();
      ctx.fillStyle = '#3D3A37';
      ctx.fillText(it, 76, y);
      y += 84;
    });

    ctx.textAlign = 'center';
    ctx.fillStyle = '#FF8A3D';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText('家长陪练小贴士：多鼓励，不比较 💛', W / 2, y + 40);
    ctx.fillStyle = '#B0B6BC';
    ctx.font = '22px sans-serif';
    ctx.fillText('来自「魔力魔方」Web 版', W / 2, H - 50);

    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = 'magic-cube-今日练习计划.png';
    a.click();
    ui.showToast('计划卡已保存', 'success');
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

const fmt = (v) => (v != null ? wca.formatMs(v) : '--');
</script>

<template>
  <div class="page">
    <header class="mb-3 flex items-center gap-3">
      <button class="tap rounded-xl px-2 text-subtle" @click="$router.back()">
        <ChevronLeft class="h-5 w-5" />
      </button>
      <h1 class="text-2xl font-bold">家长模式</h1>
    </header>

    <!-- PIN 锁 -->
    <div v-if="locked" class="card mx-auto max-w-sm p-6 text-center">
      <Lock class="mx-auto mb-3 h-10 w-10 text-brand" />
      <p class="section-title">{{ hasPin ? '输入 4 位 PIN' : '设置 4 位 PIN' }}</p>
      <p class="muted mt-1">{{ hasPin ? '进入家长模式需要验证' : '用于保护练习报告' }}</p>
      <div class="mx-auto my-4 flex max-w-[200px] justify-center gap-3">
        <span
          v-for="i in 4"
          :key="i"
          class="h-3.5 w-3.5 rounded-full"
          :class="pin.length >= i ? 'bg-brand' : 'bg-gray-200'"
        />
      </div>
      <p v-if="pinError" class="mb-2 text-sm text-red-500">{{ pinError }}</p>
      <div class="mx-auto grid max-w-[260px] grid-cols-3 gap-2">
        <button v-for="d in [1, 2, 3, 4, 5, 6, 7, 8, 9]" :key="d" class="tap rounded-2xl bg-cream py-3 font-mono text-lg font-bold" @click="tapDigit(d)">
          {{ d }}
        </button>
        <button class="tap col-span-2 rounded-2xl bg-cream py-3 text-sm text-subtle" @click="confirmPin">确认</button>
        <button class="tap rounded-2xl bg-cream py-3 text-sm text-subtle" @click="backspace">⌫</button>
      </div>
      <button v-if="hasPin" class="mt-4 text-xs text-faint underline" @click="onResetPin">忘记 PIN？重置</button>
    </div>

    <template v-else>
      <!-- 视图切换 -->
      <div class="mb-3 grid grid-cols-2 gap-2">
        <button class="tap flex items-center justify-center gap-1.5 rounded-2xl py-2.5 text-sm font-semibold" :class="viewMode === 'report' ? 'bg-brand text-white' : 'bg-white text-subtle shadow-card'" @click="switchView('report')">
          <FileText class="h-4 w-4" /> 练习报告
        </button>
        <button class="tap flex items-center justify-center gap-1.5 rounded-2xl py-2.5 text-sm font-semibold" :class="viewMode === 'plan' ? 'bg-brand text-white' : 'bg-white text-subtle shadow-card'" @click="switchView('plan')">
          <ClipboardList class="h-4 w-4" /> 今日练习计划
        </button>
      </div>

      <!-- 报告 -->
      <template v-if="viewMode === 'report'">
        <div class="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div class="card p-4 text-center">
            <p class="muted">累计复原</p>
            <p class="font-mono text-xl font-bold text-ink">{{ stats.count }}</p>
          </div>
          <div class="card p-4 text-center">
            <p class="muted">课程进度</p>
            <p class="font-mono text-xl font-bold text-ink">{{ lessons.getLessonsDone() }}/7 课</p>
          </div>
          <div class="card p-4 text-center">
            <p class="muted">连续打卡</p>
            <p class="font-mono text-xl font-bold text-ink">{{ records.getStreak() }} 天</p>
          </div>
          <div class="card p-4 text-center">
            <p class="muted">今日时长</p>
            <p class="font-mono text-xl font-bold" :class="todayMinutes > dailyLimit ? 'text-red-500' : 'text-ink'">
              {{ todayMinutes }} 分钟
            </p>
          </div>
        </div>

        <div class="card mt-3 p-4">
          <p class="section-title mb-2">近 7 天使用时长</p>
          <WeekChart :days="weekDays" :limit-min="dailyLimit" />
        </div>

        <div class="card mt-3 p-4">
          <div class="mb-1 flex items-center justify-between">
            <span class="section-title">每日时长提醒</span>
            <span class="font-semibold text-brand">{{ dailyLimit }} 分钟</span>
          </div>
          <input
            type="range"
            :min="10"
            :max="120"
            :step="5"
            :value="dailyLimit"
            class="h-11 w-full accent-[#FF8A3D]"
            aria-label="每日时长提醒阈值"
            @change="onLimitChange"
          />
          <p class="muted">超过阈值当天柱状图会变红，并温和提醒（不打扰）</p>
        </div>

        <div class="card mt-3 p-4">
          <p class="section-title mb-2">成绩速览</p>
          <div class="grid grid-cols-4 gap-2 text-center">
            <div><p class="muted">最佳</p><p class="font-mono text-sm font-bold">{{ fmt(stats.best) }}</p></div>
            <div><p class="muted">ao5</p><p class="font-mono text-sm font-bold">{{ stats.ao5 != null ? fmt(stats.ao5) : '--' }}</p></div>
            <div><p class="muted">平均</p><p class="font-mono text-sm font-bold">{{ fmt(stats.avg) }}</p></div>
            <div><p class="muted">段位</p><p class="text-sm font-bold text-brand">{{ level.name }}</p></div>
          </div>
        </div>

        <div class="mt-3 flex justify-center gap-2">
          <button class="btn-ghost" @click="onDisablePin">
            <Trash2 class="h-4 w-4" /> 关闭 PIN 保护
          </button>
        </div>
      </template>

      <!-- 今日练习计划 -->
      <template v-else>
        <div class="card p-5">
          <p class="section-title mb-3">🎯 今日练习计划</p>
          <ul class="space-y-2.5">
            <li class="rounded-2xl bg-cream p-3.5 text-sm text-ink">
              📚 复习课程：第{{ plan.lesson.id }}课「{{ plan.lesson.title }}」
            </li>
            <li class="rounded-2xl bg-cream p-3.5 text-sm text-ink">
              🎯 目标口诀：{{ plan.lesson.tip }}
            </li>
            <li class="rounded-2xl bg-cream p-3.5 text-sm text-ink">
              🧊 完成复原：至少 {{ plan.goalSolves }} 次
            </li>
            <li class="rounded-2xl bg-cream p-3.5 text-sm text-ink">
              ⏱️ 挑战一次计时模式
            </li>
          </ul>
          <p class="muted mt-3 text-center">连续打卡 {{ plan.streak }} 天 · 多鼓励，不比较 💛</p>
          <button class="btn-primary mt-4 w-full" :disabled="sharing" @click="onMakePlan">
            <Share2 class="h-4 w-4" /> {{ sharing ? '生成中…' : '导出分享图（PNG）' }}
          </button>
        </div>
      </template>
      <canvas ref="planCanvasRef" class="hidden" />
    </template>
  </div>
</template>
