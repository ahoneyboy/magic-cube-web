<script setup>
/**
 * ScanView.vue —— 拍照识别（对照小程序 scan.js，Web 用 getUserMedia + canvas capture）
 * 引导 → 中心色标定 → 逐面拍摄（附 3D 姿态示意）→ 四角拖拽 + 自动对齐 →
 * 单面识别确认 → 六面组装修正 → 3D 回显 → 求解（进玩转页并自动打开解法面板）。
 */
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { Camera, RefreshCw, Check, ArrowRight, ScanLine, AlertTriangle, ChevronLeft, Wand2 } from 'lucide-vue-next';
import Cube3D from '../components/Cube3D.vue';
import * as scanState from '../engine/scanState.js';
import * as colorMatch from '../engine/colorMatch.js';
import { CUBE_COLORS, CUBE_COLORS_COLORBLIND, COLOR_SHAPE, COLOR_NAMES, scan as scanCfg } from '../engine/config/index.js';
import { useSettingsStore } from '../stores/settings.js';
import { useGameStore } from '../stores/game.js';
import { useRecordsStore } from '../stores/records.js';
import { useLessonsStore } from '../stores/lessons.js';
import { useUiStore } from '../stores/ui.js';
import { useSound } from '../composables/useSound.js';
import { useVoice } from '../composables/useVoice.js';
import { loadPixels, sampleCell, buildEdgeMap, autoAlignCorners, drawAdjust } from '../composables/useScan.js';

const CAM_AZ = (Math.atan2(0.9, 1.3) * 180) / Math.PI; // ≈34.7°，与 3D 默认视角一致
const FACE_VIEW = {
  U: { yaw: CAM_AZ, pitch: 90 },
  D: { yaw: CAM_AZ, pitch: -90 },
  F: { yaw: CAM_AZ, pitch: 0 },
  B: { yaw: CAM_AZ - 180, pitch: 0 },
  R: { yaw: CAM_AZ - 90, pitch: 0 },
  L: { yaw: CAM_AZ - 270, pitch: 0 }
};

const router = useRouter();
const settings = useSettingsStore();
const game = useGameStore();
const records = useRecordsStore();
const lessons = useLessonsStore();
const ui = useUiStore();
const { play } = useSound();
const voice = useVoice();

const step = ref('guide'); // guide | calib | capture | adjust | cellcheck | correct | review
const palette = computed(() => (settings.colorblind ? CUBE_COLORS_COLORBLIND : CUBE_COLORS));

// ---- 会话状态（对照 scan.js 的实例字段）----
let session = scanState.newScanSession();
let faceLetter = { U: 'U', D: 'D', F: 'F', B: 'B', R: 'R', L: 'L' };
let calibration = null;
const calibColors = ref([]);
const measuredCenters = {}; // 每面实测中心色 RGB
const cellSamples = {}; // 每面 9 格样本（最后统一重判用）
let corrected = false; // 用户手工改过就不再自动重判

const faceIndex = ref(0);
const currentFace = ref('U');
const orientTip = ref(scanState.ORIENT_HINT.U.tip);
const gridCells = ref([]);
const calibNote = ref('');
const netFaces = ref([]);
const reviewingFacelet = ref('');
const pickerShow = ref(false);
const pickerCell = ref(null);
let pickingCell = null;
const cameraError = ref('');

// ---- 相机 ----
const videoRef = ref(null);
let stream = null;

async function startCamera() {
  stopCamera();
  cameraError.value = '';
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 1280 } },
      audio: false
    });
    if (videoRef.value) {
      videoRef.value.srcObject = stream;
      await videoRef.value.play();
    }
  } catch (e) {
    cameraError.value = '无法打开摄像头（' + (e.name || '未知错误') + '）。可以用下方「从相册选择」上传照片。';
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
}

// 相册兜底（等价 chooseMedia）
const fileRef = ref(null);
function pickFile() {
  fileRef.value && fileRef.value.click();
}
function onFilePicked(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    enterAdjust(reader.result);
  };
  reader.readAsDataURL(file);
}

onMounted(() => {
  initCalibration();
});
onBeforeUnmount(() => {
  stopCamera();
  voice.stop();
});

// ---- 引导 / 标定 ----
function onGuideStart() {
  step.value = 'calib';
}

function initCalibration() {
  faceLetter = { U: 'U', D: 'D', F: 'F', B: 'B', R: 'R', L: 'L' };
  calibColors.value = Object.keys(CUBE_COLORS).map((f) => ({ face: f, color: palette.value[f], letter: f }));
  calibration = colorMatch.buildCalibration(CUBE_COLORS);
}

let pickingFace = null; // 标定改色时的目标面
function onPickCalib(face) {
  pickingFace = face;
  pickerCell.value = { letter: faceLetter[face] };
  pickerShow.value = true;
}

function onCalibDone() {
  faceIndex.value = 0;
  currentFace.value = scanState.SCAN_ORDER[0];
  orientTip.value = scanState.ORIENT_HINT[scanState.SCAN_ORDER[0]].tip;
  step.value = 'capture';
  startCamera();
}

// ---- 拍摄 → 对齐 ----
const photoUrl = ref('');
const canvasRef = ref(null);
const photoCanvasRef = ref(null);
let imgEl = null;
let buffer = null;
let edgeMap = null;
let corners = [];
let dragging = -1;

function onShutter() {
  const video = videoRef.value;
  if (!video || !video.videoWidth) {
    ui.showToast('摄像头还没准备好', 'warn');
    return;
  }
  const cv = document.createElement('canvas');
  const side = Math.min(video.videoWidth, video.videoHeight);
  cv.width = cv.height = side; // 方形裁剪，与拍摄指引一致
  cv.getContext('2d').drawImage(video, (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side, 0, 0, side, side);
  enterAdjust(cv.toDataURL('image/jpeg', 0.92));
}

async function enterAdjust(url) {
  photoUrl.value = url;
  step.value = 'adjust';
  stopCamera();
  await nextTick();
  const cv = photoCanvasRef.value;
  if (!cv) return;
  const cw = cv.clientWidth;
  const ch = cw; // 方形
  cv.width = cw * 2;
  cv.height = ch * 2;
  const ctx = cv.getContext('2d');
  ctx.scale(2, 2);

  imgEl = new Image();
  imgEl.onload = () => {
    const s = Math.min(cw, ch) * 0.72;
    const cx = cw / 2;
    const cy = ch / 2;
    corners = [
      { x: cx - s / 2, y: cy - s / 2 },
      { x: cx + s / 2, y: cy - s / 2 },
      { x: cx + s / 2, y: cy + s / 2 },
      { x: cx - s / 2, y: cy + s / 2 }
    ];
    buffer = loadPixels(imgEl);
    if (!buffer) {
      ui.showToast('照片读取失败，请重拍', 'warn');
      onRetake();
      return;
    }
    edgeMap = buildEdgeMap(buffer);
    corners = autoAlignCorners(edgeMap, corners, cw, ch);
    drawAdjust(ctx, imgEl, corners, cw, ch);
  };
  imgEl.onerror = () => {
    ui.showToast('照片加载失败', 'warn');
    onRetake();
  };
  imgEl.src = url;
}

function onRetake() {
  photoUrl.value = '';
  gridCells.value = [];
  step.value = 'capture';
  startCamera();
}

// 四角拖拽（Pointer Events）
function canvasPos(e) {
  const rect = photoCanvasRef.value.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top, cw: rect.width, ch: rect.height };
}
function onCanvasDown(e) {
  if (!photoCanvasRef.value) return;
  const { x, y } = canvasPos(e);
  let idx = -1;
  let best = 52 * 52;
  corners.forEach((c, i) => {
    const d = (c.x - x) * (c.x - x) + (c.y - y) * (c.y - y);
    if (d < best) {
      best = d;
      idx = i;
    }
  });
  dragging = idx;
  if (photoCanvasRef.value.setPointerCapture) photoCanvasRef.value.setPointerCapture(e.pointerId);
}
function onCanvasMove(e) {
  if (dragging < 0 || !photoCanvasRef.value) return;
  const { x, y, cw, ch } = canvasPos(e);
  corners[dragging] = { x: Math.max(4, Math.min(cw - 4, x)), y: Math.max(4, Math.min(ch - 4, y)) };
  const ctx = photoCanvasRef.value.getContext('2d');
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  drawAdjust(ctx, imgEl, corners, cw, ch);
}
function onCanvasUp() {
  dragging = -1;
}
function onAutoAlign() {
  if (!photoCanvasRef.value) return;
  const cw = photoCanvasRef.value.clientWidth;
  const ch = photoCanvasRef.value.clientHeight;
  corners = autoAlignCorners(edgeMap, corners, cw, ch);
  const ctx = photoCanvasRef.value.getContext('2d');
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  drawAdjust(ctx, imgEl, corners, cw, ch);
}

// ---- 识别 ----
const recognizing = ref(false);
function currentRefs() {
  const refs = colorMatch.refsFromCenters(measuredCenters, faceLetter);
  const whiteRef = colorMatch.pickWhiteRef(measuredCenters, faceLetter, CUBE_COLORS);
  return { refs, whiteRef, ready: Object.keys(refs).length >= 2 && !!whiteRef };
}

function recognizeFace() {
  if (recognizing.value) return;
  recognizing.value = true;
  setTimeout(() => {
    try {
      const face = currentFace.value;
      const cw = photoCanvasRef.value ? photoCanvasRef.value.clientWidth : 300;
      const ch = cw;
      const grid = [];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          grid.push(sampleCell(buffer, corners, r, c, scanCfg, cw, ch));
        }
      }
      // 中心块（索引 4）就是这一面的颜色 → 当作实测参照
      const centerRgb = colorMatch.medianRgb(grid[4]);
      if (centerRgb) measuredCenters[face] = centerRgb;
      cellSamples[face] = grid;

      const usable = grid.filter((s) => s && s.length >= 4).length;
      if (!buffer || usable < 9) {
        recognizing.value = false;
        window.alert('没能从这张照片读出颜色。请确认照片里有完整的一面魔方，把四个角对准魔方四角，再重拍一次。');
        onRetake();
        return;
      }
      const { refs, whiteRef, ready } = currentRefs();
      const cells = grid.map((samples) =>
        ready ? colorMatch.classifyRelative(samples, refs, { whiteRef }) : colorMatch.classify(samples, calibration)
      );
      gridCells.value = cells.map((c) => ({
        letter: c.letter,
        color: palette.value[c.letter],
        shape: COLOR_SHAPE[c.letter],
        rejected: c.rejected,
        uncertain: !!c.uncertain
      }));
      calibNote.value = ready
        ? '已用照片里实测的中心色做参照（灯光色偏已自动校正）'
        : '中心色标定中…（拍完一面后即可自动校准）';
      recognizing.value = false;
      step.value = 'cellcheck';
    } catch (e) {
      recognizing.value = false;
      ui.showToast('识别失败：' + (e.message || ''), 'warn');
    }
  }, 30);
}

// ---- 单面确认 / 修正 ----
function onCellTap(idx) {
  pickingCell = { face: currentFace.value, idx, from: 'grid' };
  pickerCell.value = { idx, letter: gridCells.value[idx].letter };
  pickerShow.value = true;
}
function onPickLetter(letter) {
  if (pickingFace) {
    // 标定改色：该面实际是什么颜色
    const face = pickingFace;
    calibColors.value = calibColors.value.map((c) => (c.face === face ? { face, color: palette.value[letter], letter } : c));
    faceLetter = { ...faceLetter, [face]: letter };
    const map = {};
    calibColors.value.forEach((c) => {
      map[c.face] = c.color;
    });
    calibration = colorMatch.buildCalibration(map);
    pickingFace = null;
  } else if (pickingCell.from === 'grid') {
    gridCells.value = gridCells.value.map((c, i) =>
      i === pickingCell.idx ? { letter, color: palette.value[letter], shape: COLOR_SHAPE[letter], rejected: false, uncertain: false } : c
    );
  } else {
    corrected = true;
    scanState.applyCorrection(session, pickingCell.face, pickingCell.idx, letter);
    showNet();
  }
  pickerShow.value = false;
  play('pop');
}

function onFaceConfirm() {
  const face = currentFace.value;
  const letters = gridCells.value.map((c) => c.letter).join('');
  scanState.setFace(session, face, letters.split(''));
  const nextIdx = faceIndex.value + 1;
  if (nextIdx >= scanState.SCAN_ORDER.length) {
    // 六面齐了：用全部实测中心色重新判一遍（明显减少灯光导致的误判）
    const changed = reclassifyAll();
    showNet();
    if (changed) ui.showToast('已按实测中心色重新校准', 'info');
  } else {
    const f = scanState.SCAN_ORDER[nextIdx];
    play('pop');
    faceIndex.value = nextIdx;
    currentFace.value = f;
    orientTip.value = scanState.ORIENT_HINT[f].tip;
    gridCells.value = [];
    photoUrl.value = '';
    step.value = 'capture';
    startCamera();
  }
}

function reclassifyAll() {
  if (corrected) return false;
  const { refs, whiteRef, ready } = currentRefs();
  if (!ready) return false;
  let changed = 0;
  scanState.SCAN_ORDER.forEach((f) => {
    const grid = cellSamples[f];
    if (!grid) return;
    const letters = grid.map((samples) => colorMatch.classifyRelative(samples, refs, { whiteRef }).letter);
    const next = letters.join('');
    if (session.faces[f] !== next) changed++;
    scanState.setFace(session, f, letters);
  });
  return changed > 0;
}

// ---- 全网修正 ----
function showNet() {
  netFaces.value = scanState.SCAN_ORDER.map((f) => ({
    face: f,
    name: COLOR_NAMES[f] + '面',
    cells: session.faces[f].split('').map((letter) => ({
      letter,
      color: palette.value[letter],
      shape: COLOR_SHAPE[letter]
    }))
  }));
  step.value = 'correct';
}

function onNetCellTap(face, idx) {
  pickingCell = { face, idx, from: 'net' };
  pickerCell.value = { idx, face, letter: session.faces[face][idx] };
  pickerShow.value = true;
}

function onFaceRetap(f) {
  const idx = scanState.SCAN_ORDER.indexOf(f);
  faceIndex.value = idx;
  currentFace.value = f;
  orientTip.value = scanState.ORIENT_HINT[f].tip;
  gridCells.value = [];
  photoUrl.value = '';
  step.value = 'capture';
  startCamera();
}

function unsureFaces() {
  const out = [];
  const { refs, whiteRef, ready } = currentRefs();
  if (!ready) return out;
  scanState.SCAN_ORDER.forEach((f) => {
    const grid = cellSamples[f];
    if (!grid) return;
    const hasUnsure = grid.some((samples, i) => {
      if (i === 4) return false;
      return colorMatch.classifyRelative(samples, refs, { whiteRef }).uncertain;
    });
    if (hasUnsure) out.push(f);
  });
  return out;
}

function onNetConfirm() {
  const v = scanState.validate(session);
  if (!v.ok) {
    const badSet = Array.from(new Set((v.badFaces || []).concat(unsureFaces())));
    const faces = badSet.map((f) => COLOR_NAMES[f] + '面').join('、');
    window.alert((v.message || '') + (faces ? `\n建议重拍：${faces}` : ''));
    return;
  }
  game.recordEvent(
    'scan_success',
    {},
    { stats: records.getStats('3x3'), streakDays: records.getStreak(), lessonsDone: lessons.getLessonsDone(), skillLevel: records.levelOf().id }
  );
  reviewingFacelet.value = v.state;
  step.value = 'review';
}

// ---- 3D 回显 → 求解 ----
const reviewCubeRef = ref(null);
function onReviewCubeReady() {
  if (reviewCubeRef.value && reviewingFacelet.value) {
    reviewCubeRef.value.setState(reviewingFacelet.value, { resetView: true });
    reviewCubeRef.value.setInteractive(false);
  }
}
function onReviewRetake() {
  session = scanState.newScanSession();
  corrected = false;
  Object.keys(measuredCenters).forEach((k) => delete measuredCenters[k]);
  Object.keys(cellSamples).forEach((k) => delete cellSamples[k]);
  faceIndex.value = 0;
  currentFace.value = 'U';
  orientTip.value = scanState.ORIENT_HINT.U.tip;
  gridCells.value = [];
  photoUrl.value = '';
  step.value = 'capture';
  startCamera();
}
function onReviewConfirm() {
  // 与"打乱后看解法"一致：进玩转页并自动打开解法面板
  router.push({ path: '/play', query: { fromScan: '1', facelet: reviewingFacelet.value } });
}

const currentFaceName = computed(() => COLOR_NAMES[currentFace.value] + '面');
</script>

<template>
  <div class="page">
    <header class="mb-3 flex items-center gap-3">
      <button class="tap rounded-xl px-2 text-subtle" @click="step === 'guide' ? router.back() : (step = 'guide')">
        <ChevronLeft class="h-5 w-5" />
      </button>
      <div>
        <h1 class="text-2xl font-bold">拍照识别</h1>
        <p class="muted">拍六张照片，自动识别并求解</p>
      </div>
    </header>

    <!-- ① 引导 -->
    <div v-if="step === 'guide'" class="card p-5">
      <div class="mb-4 flex items-center justify-center gap-2 text-brand">
        <ScanLine class="h-10 w-10" />
      </div>
      <ol class="space-y-3 text-sm leading-relaxed text-subtle">
        <li class="flex gap-2"><b class="chip shrink-0">1</b>找一个光线均匀的地方，避免阴影挡住魔方。</li>
        <li class="flex gap-2"><b class="chip shrink-0">2</b>按顺序拍 6 个面：白 → 黄 → 绿 → 蓝 → 红 → 橙。每张照片会让魔方正对镜头、提示面朝上。</li>
        <li class="flex gap-2"><b class="chip shrink-0">3</b>拍完把四角对齐（会自动对齐，也可以手动拖角），系统自动识别颜色，拿不准的格子会打「?」。</li>
        <li class="flex gap-2"><b class="chip shrink-0">4</b>六面拍完确认无误，就能看解法啦！</li>
      </ol>
      <button class="btn-primary mt-5 w-full" @click="onGuideStart">
        <Camera class="h-4 w-4" /> 开始
      </button>
    </div>

    <!-- ② 中心色标定 -->
    <div v-else-if="step === 'calib'" class="card p-5">
      <p class="section-title">中心色标定</p>
      <p class="muted mt-1">默认标准配色。如果你的魔方配色不一样，点色块改一下。</p>
      <div class="mt-3 grid grid-cols-6 gap-2">
        <button
          v-for="c in calibColors"
          :key="c.face"
          class="tap flex flex-col items-center gap-1"
          @click="onPickCalib(c.face)"
        >
          <span class="h-10 w-10 rounded-xl shadow-inner ring-1 ring-black/10" :style="{ background: c.color }" />
          <span class="text-[10px] text-faint">{{ COLOR_NAMES[c.face] }}</span>
        </button>
      </div>
      <button class="btn-primary mt-5 w-full" @click="onCalibDone">
        就这样，去拍照 <ArrowRight class="h-4 w-4" />
      </button>
    </div>

    <!-- ③ 拍摄 -->
    <div v-else-if="step === 'capture'" class="card overflow-hidden">
      <div class="flex items-center justify-between px-4 pt-3">
        <span class="chip">第 {{ faceIndex + 1 }}/6 面</span>
        <span class="text-sm font-semibold text-brand">{{ currentFaceName }}朝向镜头</span>
      </div>
      <p class="px-4 pt-1 text-center text-sm text-subtle">📌 {{ orientTip }}</p>

      <div class="relative mt-2 aspect-square w-full bg-black">
        <video ref="videoRef" playsinline muted class="h-full w-full object-cover" />
        <div class="pointer-events-none absolute inset-[6%] rounded-2xl border-2 border-dashed border-white/70" />
        <div class="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
          <div v-for="i in 9" :key="i" class="border border-white/20" />
        </div>
      </div>

      <div v-if="cameraError" class="mx-4 mt-2 flex items-start gap-1.5 rounded-xl bg-orange-50 p-2.5 text-xs text-orange-500">
        <AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0" /> {{ cameraError }}
      </div>

      <div class="grid grid-cols-3 gap-2 p-4">
        <button class="btn-ghost" @click="pickFile">相册</button>
        <button class="btn-primary" @click="onShutter">
          <Camera class="h-4 w-4" /> 拍摄
        </button>
        <button class="btn-ghost" @click="startCamera">
          <RefreshCw class="h-4 w-4" /> 重开
        </button>
      </div>
      <input ref="fileRef" type="file" accept="image/*" capture="environment" class="hidden" @change="onFilePicked" />
    </div>

    <!-- ④ 对齐 -->
    <div v-else-if="step === 'adjust'" class="card p-4">
      <p class="section-title mb-2">对齐四个角</p>
      <canvas
        ref="photoCanvasRef"
        class="aspect-square w-full rounded-2xl bg-black"
        @pointerdown.prevent="onCanvasDown"
        @pointermove.prevent="onCanvasMove"
        @pointerup="onCanvasUp"
        @pointercancel="onCanvasUp"
      />
      <p class="muted mt-2 text-center">已自动对齐；不准就拖动橙色角点调整</p>
      <div class="mt-3 grid grid-cols-2 gap-2">
        <button class="btn-ghost" @click="onRetake">
          <RefreshCw class="h-4 w-4" /> 重拍
        </button>
        <button class="btn-primary" :disabled="recognizing" @click="recognizeFace">
          <Wand2 class="h-4 w-4" /> {{ recognizing ? '识别中…' : '识别这一面' }}
        </button>
      </div>
    </div>

    <!-- ⑤ 单面确认 -->
    <div v-else-if="step === 'cellcheck'" class="card p-4">
      <p class="section-title">确认 {{ currentFaceName }}（{{ currentFace }}）</p>
      <p class="muted mt-1">{{ calibNote }}</p>
      <div class="mx-auto mt-3 grid max-w-xs grid-cols-3 gap-2">
        <button
          v-for="(c, i) in gridCells"
          :key="i"
          class="tap relative flex items-center justify-center rounded-2xl ring-1 ring-black/10"
          :class="c.uncertain ? 'ring-2 ring-orange-400' : ''"
          :style="{ background: c.color }"
          @click="onCellTap(i)"
        >
          <span v-if="settings.colorblind" class="text-lg text-white/90 drop-shadow">{{ c.shape }}</span>
          <span v-if="c.uncertain" class="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-orange-400 text-[11px] font-bold text-white">?</span>
        </button>
      </div>
      <p class="muted mt-2 text-center">点色块可改成别的颜色</p>
      <div class="mt-3 grid grid-cols-2 gap-2">
        <button class="btn-ghost" @click="onRetake">
          <RefreshCw class="h-4 w-4" /> 重拍
        </button>
        <button class="btn-primary" @click="onFaceConfirm">
          <Check class="h-4 w-4" /> 没问题
        </button>
      </div>
    </div>

    <!-- ⑥ 六面修正 -->
    <div v-else-if="step === 'correct'" class="card p-4">
      <p class="section-title">检查六面</p>
      <p class="muted mt-1">中心块应与该面颜色一致；点任何格子可以改。</p>
      <div class="mt-3 grid grid-cols-3 gap-3">
        <div v-for="nf in netFaces" :key="nf.face" class="rounded-2xl bg-cream p-2">
          <div class="grid grid-cols-3 gap-1">
            <button
              v-for="(c, i) in nf.cells"
              :key="i"
              class="aspect-square rounded-md ring-1 ring-black/10"
              :style="{ background: c.color }"
              :title="COLOR_NAMES[c.letter]"
              @click="onNetCellTap(nf.face, i)"
            />
          </div>
          <div class="mt-1.5 flex items-center justify-between">
            <span class="text-[11px] text-faint">{{ nf.name }}</span>
            <button class="text-[11px] font-semibold text-brand" @click="onFaceRetap(nf.face)">重拍</button>
          </div>
        </div>
      </div>
      <button class="btn-primary mt-4 w-full" @click="onNetConfirm">
        <Check class="h-4 w-4" /> 没问题，去求解
      </button>
    </div>

    <!-- ⑦ 3D 回显 -->
    <div v-else-if="step === 'review'" class="card p-4">
      <p class="section-title mb-2 text-center">识别结果（可拖动检查）</p>
      <div class="mx-auto h-72 max-w-sm">
        <Cube3D ref="reviewCubeRef" :interactive="false" :touch-enabled="true" :facelet="reviewingFacelet" @ready="onReviewCubeReady" />
      </div>
      <div class="mt-3 grid grid-cols-2 gap-2">
        <button class="btn-ghost" @click="onReviewRetake">
          <RefreshCw class="h-4 w-4" /> 重新拍
        </button>
        <button class="btn-primary" @click="onReviewConfirm">
          <ArrowRight class="h-4 w-4" /> 去看解法
        </button>
      </div>
    </div>

    <!-- 颜色选择弹层 -->
    <div
      v-if="pickerShow"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-8"
      @click.self="pickerShow = false"
    >
      <div class="w-full max-w-xs rounded-3xl bg-white p-5">
        <p class="section-title mb-3 text-center">把它改成哪种颜色？</p>
        <div class="grid grid-cols-6 gap-2">
          <button
            v-for="(name, letter) in COLOR_NAMES"
            :key="letter"
            class="tap flex flex-col items-center gap-1"
            @click="onPickLetter(letter)"
          >
            <span class="h-9 w-9 rounded-xl ring-1 ring-black/10" :style="{ background: palette[letter] }" />
            <span class="text-[10px] text-faint">{{ name }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
