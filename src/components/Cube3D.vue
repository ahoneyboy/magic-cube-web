<script setup>
/**
 * Cube3D.vue —— 3D 魔方组件（Web 版对照小程序 packageCube/components/cube-view）
 *
 * Pointer Events（触屏/鼠标通用）→ 控制器 onTouchStart/Move/End；
 * state-first：逻辑状态由控制器立即提交，动画随后播放。
 * Props:
 *   cubeType '3x3'|'2x2'、interactive（允许转层）、touchEnabled（完全可交互）、
 *   autoSpin、allowSlices、facelet（外部受控状态，传入即 setState）
 * Expose: move/applyMoves/setState/getFacelet/isSolved/setInteractive/setTouchEnabled/
 *         resetView/setOrientation/highlight/clearHighlight/isAnimating/setAutoSpin
 */
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { createCube3D } from '../composables/useCube3D.js';

const props = defineProps({
  cubeType: { type: String, default: '3x3' },
  interactive: { type: Boolean, default: true },
  touchEnabled: { type: Boolean, default: true },
  autoSpin: { type: Boolean, default: false },
  allowSlices: { type: Boolean, default: false },
  swipeThreshold: { type: Number, default: 26 },
  facelet: { type: String, default: '' },
  resetViewOnFacelet: { type: Boolean, default: false }
});
const emit = defineEmits(['ready', 'move', 'solved', 'queueEmpty']);

const canvasRef = ref(null);
const stageRef = ref(null);
let controller = null;
let resizeObserver = null;
let activePointer = null;

onMounted(() => {
  controller = createCube3D(canvasRef.value, {
    width: stageRef.value.clientWidth,
    height: stageRef.value.clientHeight,
    cubeType: props.cubeType,
    autoSpin: props.autoSpin,
    allowSlices: props.allowSlices !== false,
    swipeThreshold: props.swipeThreshold,
    onMove: (n) => emit('move', n),
    onSolved: () => emit('solved'),
    onQueueEmpty: () => emit('queueEmpty'),
    onError: () => emit('queueEmpty')
  });
  controller.setInteractive(props.interactive);
  controller.setTouchEnabled(props.touchEnabled);
  if (props.facelet) {
    controller.setState(props.facelet, { resetView: props.resetViewOnFacelet });
  }
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      if (!stageRef.value) return;
      controller.resize(stageRef.value.clientWidth, stageRef.value.clientHeight);
    });
    resizeObserver.observe(stageRef.value);
  }
  emit('ready');
});

onBeforeUnmount(() => {
  if (resizeObserver) resizeObserver.disconnect();
  if (controller) controller.destroy();
  controller = null;
});

watch(
  () => props.interactive,
  (v) => controller && controller.setInteractive(v)
);
watch(
  () => props.touchEnabled,
  (v) => controller && controller.setTouchEnabled(v)
);
watch(
  () => props.facelet,
  (v) => {
    if (controller && v) controller.setState(v, { resetView: props.resetViewOnFacelet });
  }
);

// ---- Pointer Events 桥接 ----
function pointerPos(e) {
  const rect = canvasRef.value.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}
function onPointerDown(e) {
  if (activePointer !== null) return;
  activePointer = e.pointerId;
  canvasRef.value.setPointerCapture(e.pointerId);
  const { x, y } = pointerPos(e);
  controller.onTouchStart(x, y);
}
function onPointerMove(e) {
  if (activePointer !== e.pointerId) return;
  const { x, y } = pointerPos(e);
  controller.onTouchMove(x, y);
}
function onPointerUp(e) {
  if (activePointer !== e.pointerId) return;
  activePointer = null;
  try {
    canvasRef.value.releasePointerCapture(e.pointerId);
  } catch (err) {
    /* 忽略 */
  }
  controller.onTouchEnd();
}

// ---- 对外暴露（与控制器同形）----
function api() {
  return controller;
}
defineExpose({
  move: (n, o) => controller && controller.move(n, o),
  applyMoves: (s, o) => controller && controller.applyMoves(s, o),
  setState: (f, o) => controller && controller.setState(f, o),
  getFacelet: () => controller && controller.getFacelet(),
  isSolved: () => controller && controller.isSolved(),
  isAnimating: () => (controller ? controller.isAnimating() : false),
  setAutoSpin: (v) => controller && controller.setAutoSpin(v),
  setInteractive: (v) => controller && controller.setInteractive(v),
  setTouchEnabled: (v) => controller && controller.setTouchEnabled(v),
  resetView: () => controller && controller.resetView(),
  setOrientation: (y, p) => controller && controller.setOrientation(y, p),
  highlight: (n) => controller && controller.highlight(n),
  clearHighlight: () => controller && controller.clearHighlight(),
  __api: api
});
</script>

<template>
  <div ref="stageRef" class="cube-stage relative h-full w-full">
    <canvas
      ref="canvasRef"
      class="h-full w-full"
      @pointerdown.prevent="onPointerDown"
      @pointermove.prevent="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    />
  </div>
</template>
