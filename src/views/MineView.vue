<script setup>
/**
 * MineView.vue —— 我的 / 设置（对照小程序 mine.js + Web 专属替代）
 * 资料昵称（本地净化）/ 成就徽章 / 打卡日历 / 贴纸收藏 / 设置开关 / 数据导出导入。
 */
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  Volume2, VolumeX, Mic, MicOff, Glasses, Type, Grid3x3, Download, Upload,
  ChevronRight, Pencil, Check, BarChart3, ShieldCheck, Fingerprint, Star, Flame, Trophy
} from 'lucide-vue-next';
import { useSettingsStore } from '../stores/settings.js';
import { useGameStore } from '../stores/game.js';
import { useRecordsStore } from '../stores/records.js';
import { useUiStore } from '../stores/ui.js';
import { exportAll, importAll } from '../stores/db.js';
import { todayKey } from '../stores/recordsMath.js';
import { checkNickname } from '../utils/nickname.js';
import { COLOR_SHAPE, CUBE_COLORS } from '../engine/config/index.js';

const CUBE_COLOR_PREVIEW = CUBE_COLORS;

const router = useRouter();
const settings = useSettingsStore();
const game = useGameStore();
const records = useRecordsStore();
const ui = useUiStore();

const editing = ref(false);
const editValue = ref('');
const fileRef = ref(null);
const calendar = ref([]);

onMounted(refresh);

function refresh() {
  const now = new Date();
  const month = records.getMonth(now.getFullYear(), now.getMonth() + 1);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
  const cal = [];
  for (let i = 0; i < firstDay; i++) cal.push({ key: 'e' + i, empty: true });
  for (let d = 1; d <= daysInMonth; d++) {
    const key = todayKey(new Date(now.getFullYear(), now.getMonth(), d));
    const info = month[key];
    cal.push({ key: 'd' + d, day: d, checked: !!info, solves: info ? info.solves : 0 });
  }
  calendar.value = cal;
}

// ---- 昵称（本地净化，对照 contentSafe.js 的本地部分）----
function onEditDone() {
  const res = checkNickname(editValue.value);
  if (!res.ok) {
    ui.showToast(res.message, 'warn');
    return;
  }
  settings.update({ nickname: res.value });
  editing.value = false;
}

// ---- 数据导出 / 导入 ----
async function onExport() {
  const data = await exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `magic-cube-backup-${todayKey()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  ui.showToast('已导出备份 JSON', 'success');
}

function onImportTap() {
  fileRef.value && fileRef.value.click();
}
async function onImportFile(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const text = await file.text();
    await importAll(JSON.parse(text));
    await Promise.all([settings.init(), records.init(), game.init()]);
    refresh();
    ui.showToast('导入成功', 'success');
  } catch (err) {
    ui.showToast(err.message || '导入失败：文件格式不对', 'warn', 3500);
  }
}

const toggles = computed(() => [
  { key: 'sound', label: '音效', desc: '转动 / 成功 / 弹窗音', onIcon: Volume2, offIcon: VolumeX },
  { key: 'voice', label: '语音', desc: '报时与提示朗读', onIcon: Mic, offIcon: MicOff },
  { key: 'colorblind', label: '色弱模式', desc: '高对比配色 + 图案符号', onIcon: Glasses, offIcon: Glasses },
  { key: 'largeFont', label: '大字号', desc: '全局字号放大', onIcon: Type, offIcon: Type },
  { key: 'allowSlices', label: '中层转动', desc: '允许滑动转 M/E/S 中层', onIcon: Grid3x3, offIcon: Grid3x3 }
]);
</script>

<template>
  <div class="page">
    <header class="mb-3">
      <h1 class="text-2xl font-bold">我的</h1>
    </header>

    <!-- 资料 -->
    <div class="card p-4">
      <div class="flex items-center gap-3">
        <span class="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10">
          <Fingerprint class="h-7 w-7 text-brand" />
        </span>
        <div class="min-w-0 flex-1">
          <template v-if="!editing">
            <p class="truncate text-base font-semibold text-ink">{{ settings.nickname }}</p>
            <p class="muted">本机身份 · {{ settings.userId }}</p>
          </template>
          <template v-else>
            <div class="flex items-center gap-2">
              <input
                v-model="editValue"
                maxlength="12"
                class="h-10 w-full rounded-xl bg-cream px-3 text-sm outline-none"
                @keyup.enter="onEditDone"
              />
              <button class="tap rounded-xl px-2 text-brand" @click="onEditDone">
                <Check class="h-5 w-5" />
              </button>
            </div>
          </template>
        </div>
        <button v-if="!editing" class="tap flex items-center gap-1 rounded-xl px-2 text-sm text-brand" @click="editing = true; editValue = settings.nickname">
          <Pencil class="h-4 w-4" /> 改
        </button>
      </div>
      <div class="mt-3 flex items-center justify-between rounded-2xl bg-cream p-3">
        <div>
          <p class="text-sm font-semibold text-ink">Lv.{{ game.level.level }} {{ game.level.name }}</p>
          <p class="muted mt-0.5">
            经验 {{ game.xp }}<template v-if="game.level.nextNeed"> · 下一级还需 {{ game.level.nextNeed - game.xp }}</template>
          </p>
        </div>
        <div class="flex gap-1.5">
          <span class="chip"><Flame class="h-3.5 w-3.5 text-orange-400" /> {{ records.getStreak() }} 天</span>
        </div>
      </div>
      <div class="mt-2 h-2 overflow-hidden rounded-full bg-cream">
        <div
          class="h-full rounded-full bg-brand transition-all"
          :style="{ width: (game.level.nextNeed ? Math.min(100, (game.xp / game.level.nextNeed) * 100) : 100) + '%' }"
        />
      </div>
    </div>

    <!-- 成就徽章 -->
    <div class="card mt-3 p-4">
      <p class="section-title mb-3 flex items-center gap-1.5">
        <Trophy class="h-4 w-4 text-brand" /> 成就徽章（{{ game.badgesView.filter((b) => b.owned).length }}/{{ game.badgesView.length }}）
      </p>
      <div class="grid grid-cols-3 gap-2 md:grid-cols-6">
        <div
          v-for="b in game.badgesView"
          :key="b.id"
          class="flex flex-col items-center gap-1 rounded-2xl p-2 text-center"
          :class="b.owned ? 'bg-brand/10' : 'bg-cream opacity-50'"
        >
          <span class="text-xl">{{ b.icon }}</span>
          <span class="text-[11px] font-medium leading-tight" :class="b.owned ? 'text-brand' : 'text-faint'">{{ b.name }}</span>
        </div>
      </div>
    </div>

    <!-- 打卡日历 -->
    <div class="card mt-3 p-4">
      <p class="section-title mb-3 flex items-center gap-1.5">
        <Flame class="h-4 w-4 text-brand" /> 本月打卡
      </p>
      <div class="grid grid-cols-7 gap-1 text-center">
        <span v-for="w in ['日', '一', '二', '三', '四', '五', '六']" :key="w" class="text-[10px] text-faint">{{ w }}</span>
        <template v-for="c in calendar" :key="c.key">
          <span v-if="c.empty" />
          <span
            v-else
            class="flex aspect-square items-center justify-center rounded-lg text-xs"
            :class="c.checked ? 'bg-brand text-white font-bold' : 'bg-cream text-faint'"
            :title="c.checked ? c.solves + ' 次复原' : ''"
          >{{ c.day }}</span>
        </template>
      </div>
    </div>

    <!-- 贴纸收藏墙 -->
    <div class="card mt-3 p-4">
      <p class="section-title mb-3 flex items-center gap-1.5">
        <Star class="h-4 w-4 text-brand" /> 贴纸收藏
      </p>
      <div class="grid grid-cols-5 gap-2">
        <div v-for="it in game.collection" :key="it.id" class="flex flex-col items-center gap-1">
          <span
            class="flex h-11 w-11 items-center justify-center rounded-2xl text-xl"
            :class="it.owned ? 'bg-brand/10' : 'bg-cream opacity-50'"
          >{{ it.owned ? { square: '🟨', circle: '🫧', egg: '🐣', bird: '🐧', medal: '🥇' }[it.icon] || '⭐' : '🔒' }}</span>
          <span class="text-center text-[10px] leading-tight" :class="it.owned ? 'text-ink' : 'text-faint'">{{ it.name }}</span>
        </div>
      </div>
    </div>

    <!-- 设置 -->
    <div class="card mt-3 divide-y divide-black/5">
      <div v-for="t in toggles" :key="t.key" class="flex items-center justify-between p-4">
        <div class="flex items-center gap-3">
          <component :is="settings[t.key] ? t.onIcon : t.offIcon" class="h-5 w-5 text-brand" />
          <div>
            <p class="text-sm font-semibold text-ink">{{ t.label }}</p>
            <p class="muted">{{ t.desc }}</p>
          </div>
        </div>
        <button
          class="relative h-7 w-12 shrink-0 rounded-full transition"
          :class="settings[t.key] ? 'bg-brand' : 'bg-gray-200'"
          :aria-label="t.label"
          @click="settings.toggle(t.key)"
        >
          <span
            class="absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all"
            :style="{ left: settings[t.key] ? '22px' : '2px' }"
          />
        </button>
      </div>
    </div>

    <!-- 色弱符号预览 -->
    <div v-if="settings.colorblind" class="card mt-3 flex items-center justify-between p-4">
      <span class="text-sm text-subtle">色弱符号对照</span>
      <span class="text-lg tracking-widest" style="color: #2D3748">
        <span v-for="(s, k) in COLOR_SHAPE" :key="k" class="ml-1" :style="{ color: CUBE_COLOR_PREVIEW[k] }">{{ s }}</span>
      </span>
    </div>

    <!-- 数据 -->
    <div class="card mt-3 divide-y divide-black/5">
      <router-link to="/stats" class="tap flex items-center justify-between p-4">
        <span class="flex items-center gap-3 text-sm font-semibold text-ink">
          <BarChart3 class="h-5 w-5 text-brand" /> 我的成绩
        </span>
        <ChevronRight class="h-4 w-4 text-faint" />
      </router-link>
      <router-link to="/parent" class="tap flex items-center justify-between p-4">
        <span class="flex items-center gap-3 text-sm font-semibold text-ink">
          <ShieldCheck class="h-5 w-5 text-brand" /> 家长模式
        </span>
        <ChevronRight class="h-4 w-4 text-faint" />
      </router-link>
      <button class="tap flex w-full items-center justify-between p-4" @click="onExport">
        <span class="flex items-center gap-3 text-sm font-semibold text-ink">
          <Download class="h-5 w-5 text-brand" /> 导出数据（JSON）
        </span>
        <ChevronRight class="h-4 w-4 text-faint" />
      </button>
      <button class="tap flex w-full items-center justify-between p-4" @click="onImportTap">
        <span class="flex items-center gap-3 text-sm font-semibold text-ink">
          <Upload class="h-5 w-5 text-brand" /> 导入数据
        </span>
        <ChevronRight class="h-4 w-4 text-faint" />
      </button>
      <input ref="fileRef" type="file" accept="application/json" class="hidden" @change="onImportFile" />
    </div>

    <p class="muted mt-4 text-center">
      数据全部保存在本机（IndexedDB）· 无账号体系 · 可导出 JSON 备份
    </p>
  </div>
</template>
