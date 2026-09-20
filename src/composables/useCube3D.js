/**
 * useCube3D.js —— 3D 魔方渲染控制器（Web 版，逻辑对照小程序 packageCube/utils/cube3d.js 移植）
 *
 * 职责（与小程序一致）：
 * - 渲染 3x3 / 2x2 魔方（圆角贴纸柔和配色）
 * - 触摸转层：表面滑动 → raycast 命中小块 → swipe.js 判定转层 → 90° 缓动；
 *   拖动中实时高亮将转的层；空白拖拽 = 视角旋转（Pointer Events，触屏/鼠标通用）
 * - 动画队列：连续输入排队执行，state-first（逻辑立即提交、动画随后播放）
 * - highlight(notation)：层高亮 + 转动方向箭头（跟做 / 演示）
 * - 视角锁定与复位（白顶绿前 ≈ 相机方向 (0.9, 0.85, 1.3)）
 *
 * 逻辑状态委托 engine/cubeTypes.js（3x3 → engine/cube.js，2x2 → engine/cube2.js）。
 */
import * as THREE from 'three';
import { getType } from '../engine/cubeTypes.js';
import { analyzeSwipe } from './swipe.js';

const CUBE_COLORS_HEX = {
  U: 0xf8fafc, D: 0xffd93d, F: 0x51cf66, B: 0x339af0, R: 0xff6b6b, L: 0xffa94d
};
export function colorHexOf(letter) {
  return CUBE_COLORS_HEX[letter] || 0xcccccc;
}

// 各面顺时针 90° 的整数旋转矩阵（与 engine/cube.js 的 ROTATE_CW 一致）
// 导出供单测验证「渲染位姿 === 逻辑位姿」（与 engine/cube.js 的 QUARTER 置换表互检）
export const INT_ROT = {
  U: [[0, 0, -1], [0, 1, 0], [1, 0, 0]],
  D: [[0, 0, 1], [0, 1, 0], [-1, 0, 0]],
  R: [[1, 0, 0], [0, 0, 1], [0, -1, 0]],
  L: [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
  F: [[0, 1, 0], [-1, 0, 0], [0, 0, 1]],
  B: [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  M: [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
  E: [[0, 0, 1], [0, 1, 0], [-1, 0, 0]],
  S: [[0, 1, 0], [-1, 0, 0], [0, 0, 1]]
};

const MOVE_RE = /^([URFDLB]|[MES]|[urfdlb])(2|')?$/;

const MOVE_AXIS = {
  R: { v: [1, 0, 0], cw: -1 }, L: { v: [-1, 0, 0], cw: -1 },
  U: { v: [0, 1, 0], cw: -1 }, D: { v: [0, -1, 0], cw: -1 },
  F: { v: [0, 0, 1], cw: -1 }, B: { v: [0, 0, -1], cw: -1 },
  M: { v: [-1, 0, 0], cw: -1 }, E: { v: [0, -1, 0], cw: -1 }, S: { v: [0, 0, 1], cw: -1 }
};

const NOTATION_AXIS = { U: 1, D: 1, R: 0, L: 0, F: 2, B: 2, M: 0, E: 1, S: 2 };

export function layersOfNotation(notation) {
  const ch = notation[0];
  const face = ch.toUpperCase();
  const axis = NOTATION_AXIS[face];
  const isSlice = face === 'M' || face === 'E' || face === 'S';
  const coord = isSlice ? 0 : 'URF'.indexOf(face) >= 0 ? 1 : -1;
  const list = [coord];
  if (ch >= 'a' && ch <= 'z') list.push(0); // 宽层：外层 + 中层
  return { axis, coords: list };
}

export function mulVec(m, v) {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]
  ];
}

export function mulMat(a, b) {
  const out = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r][c] = a[r][0] * b[0][c] + a[r][1] * b[1][c] + a[r][2] * b[2][c];
    }
  }
  return out;
}

function identityMat() {
  return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function roundedSquareShape(size, radius) {
  const s = size / 2;
  const r = radius;
  const sh = new THREE.Shape();
  sh.moveTo(-s + r, -s);
  sh.lineTo(s - r, -s);
  sh.quadraticCurveTo(s, -s, s, -s + r);
  sh.lineTo(s, s - r);
  sh.quadraticCurveTo(s, s, s - r, s);
  sh.lineTo(-s + r, s);
  sh.quadraticCurveTo(-s, s, -s, s - r);
  sh.lineTo(-s, -s + r);
  sh.quadraticCurveTo(-s, -s, -s + r, -s);
  return sh;
}

function quatToMatrixArr(q) {
  const [x, y, z, w] = q;
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]
  ];
}
function mulMatVecArr(m, v) {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]
  ];
}

/**
 * 创建 3D 魔方控制器
 * @param {HTMLCanvasElement} canvas
 * @param {Object} opts {
 *   width, height, cubeType: '3x3'|'2x2', autoSpin, quality,
 *   swipeThreshold: px（默认 26）, onSolved, onMove(notation), onQueueEmpty
 * }
 */
export function createCube3D(canvas, opts = {}) {
  const cubeType = opts.cubeType || '3x3';
  const type = getType(cubeType);
  const N = type.n;

  const width = opts.width || 300;
  const height = opts.height || 300;
  // 几何常量：视距自适应(fitDistance)与渲染共用
  const bodySize = N === 2 ? 1.46 : 0.94;
  const gap = 0.06;
  const spacing = bodySize + gap; // 相邻小块中心距
  const half = (spacing * (N - 1)) / 2;

  const lowEnd = opts.quality === 'low';
  const dprCap = lowEnd ? 1.5 : 2.5;
  const dpr = Math.min(window.devicePixelRatio || 2, dprCap);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !lowEnd });
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height, false);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 100);

  // 视距自适应：保证任意旋转朝向下整个魔方都在视野内
  function fitDistance(aspect) {
    const halfExtent = N === 2 ? (bodySize + gap) / 2 + bodySize / 2 : 1.5;
    const need = halfExtent * Math.sqrt(3) * 1.12; // 半对角线 + 12% 余量
    const halfTan = Math.tan(((30 / 2) * Math.PI) / 180);
    const safeAspect = Math.max(0.45, Math.min(aspect, 1));
    return Math.max(need / halfTan, need / (halfTan * safeAspect));
  }
  camera.position.set(0.9, 0.85, 1.3).normalize().multiplyScalar(fitDistance(width / height));
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();

  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.6);
  keyLight.position.set(5, 8, 6);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.22);
  fillLight.position.set(-5, -4, -6);
  scene.add(fillLight);

  const cubeGroup = new THREE.Group();
  scene.add(cubeGroup);

  // ---- 几何与材质 ----
  const bodyGeo = new THREE.BoxGeometry(bodySize, bodySize, bodySize);
  const stickerGeo = new THREE.ShapeGeometry(roundedSquareShape(bodySize * 0.87, bodySize * 0.19));

  const DIRS = [
    { n: [0, 1, 0], face: 'U' },
    { n: [0, -1, 0], face: 'D' },
    { n: [1, 0, 0], face: 'R' },
    { n: [-1, 0, 0], face: 'L' },
    { n: [0, 0, 1], face: 'F' },
    { n: [0, 0, -1], face: 'B' }
  ];

  const cubies = [];
  const stickerMeshes = [];
  const disposables = [bodyGeo, stickerGeo];

  const coordList = [];
  for (let x = 0; x < N; x++) {
    for (let y = 0; y < N; y++) {
      for (let z = 0; z < N; z++) {
        if (N === 3 && x === 1 && y === 1 && z === 1) continue;
        coordList.push([x, y, z]);
      }
    }
  }
  const toLogic = (v) => (N === 2 ? (v === 0 ? -1 : 1) : v - 1);

  coordList.forEach((g) => {
    const pos = [toLogic(g[0]), toLogic(g[1]), toLogic(g[2])];
    const group = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, new THREE.MeshLambertMaterial({ color: 0x2e3238 }));
    disposables.push(body.material);
    group.add(body);

    DIRS.forEach(({ n, face }) => {
      const outward =
        (n[0] !== 0 && n[0] === pos[0]) ||
        (n[1] !== 0 && n[1] === pos[1]) ||
        (n[2] !== 0 && n[2] === pos[2]);
      if (!outward) return;
      const mat = new THREE.MeshLambertMaterial({ color: CUBE_COLORS_HEX[face] });
      const sticker = new THREE.Mesh(stickerGeo, mat);
      const nv = new THREE.Vector3(n[0], n[1], n[2]);
      sticker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), nv);
      sticker.position.set(n[0] * (bodySize / 2 + 0.002), n[1] * (bodySize / 2 + 0.002), n[2] * (bodySize / 2 + 0.002));
      sticker.userData.cubieIndex = cubies.length;
      sticker.userData.baseNormal = [n[0], n[1], n[2]];
      disposables.push(mat);
      group.add(sticker);
      stickerMeshes.push(sticker);
    });

    // 统一使用逻辑坐标（-1/0/1）定位：与 bakeLayer 的坐标系一致
    group.position.set(pos[0] * half, pos[1] * half, pos[2] * half);
    cubeGroup.add(group);
    cubies.push({ mesh: group, logicPos: pos, logicMat: identityMat() });
  });

  // ---- 预分配的临时对象（渲染/动画每帧零新建）----
  const qDelta = new THREE.Quaternion();
  const eulerTmp = new THREE.Euler(0, 0, 0, 'XYZ');
  const axisTmp = new THREE.Vector3();
  const matTmp = new THREE.Matrix4();
  const HIT_VECTOR_Z = new THREE.Vector3(0, 0, 1);
  void HIT_VECTOR_Z;

  // ---- 视角旋转 ----
  let autoSpin = opts.autoSpin === true && !lowEnd;
  let userTouched = false;

  function rotateView(dy, dx) {
    eulerTmp.set(dy * 0.008, dx * 0.008, 0);
    qDelta.setFromEuler(eulerTmp);
    cubeGroup.quaternion.premultiply(qDelta);
  }

  // ---- 动画队列 ----
  const pivot = new THREE.Group();
  cubeGroup.add(pivot);

  const QUEUE_CAP = 40;
  let queue = [];
  let busy = false;
  let epoch = 0;

  function selectLayer(axis, coords) {
    return cubies.filter((c) => coords.indexOf(c.logicPos[axis]) >= 0);
  }

  function bakeLayer(layer, notation) {
    const face = notation[0].toUpperCase();
    const quarters = notation.length === 1 ? 1 : notation[1] === '2' ? 2 : 3;
    let rot = INT_ROT[face];
    if (!rot) {
      const e = new Error('未知转动记号：' + notation);
      e.code = 'CUBE_MOVE_BAD_NOTATION';
      throw e;
    }
    for (let q = 1; q < quarters; q++) rot = mulMat(rot, INT_ROT[face]);
    layer.forEach((c) => {
      c.logicPos = mulVec(rot, c.logicPos);
      c.logicMat = mulMat(rot, c.logicMat);
      cubeGroup.add(c.mesh);
      c.mesh.position.set(c.logicPos[0] * half, c.logicPos[1] * half, c.logicPos[2] * half);
      const m = c.logicMat;
      matTmp.set(
        m[0][0], m[0][1], m[0][2], 0,
        m[1][0], m[1][1], m[1][2], 0,
        m[2][0], m[2][1], m[2][2], 0,
        0, 0, 0, 1
      );
      c.mesh.quaternion.setFromRotationMatrix(matTmp);
      c.mesh.updateMatrix();
    });
  }

  function drain() {
    if (busy) return;
    const item = queue.shift();
    if (!item) {
      if (opts.onQueueEmpty) opts.onQueueEmpty();
      return;
    }
    busy = true;
    const layers = layersOfNotation(item.notation);
    const layer = selectLayer(layers.axis, layers.coords);
    layer.forEach((c) => pivot.add(c.mesh));

    // 目标角度：记号顺时针 = 绕外法向 -90°；' 反向；2 = 180°
    const suffix = item.notation.length === 1 ? '' : item.notation[1];
    const def = MOVE_AXIS[item.notation[0].toUpperCase()];
    axisTmp.set(def.v[0], def.v[1], def.v[2]);
    const targetAngle = suffix === "'" ? Math.PI / 2 : suffix === '2' ? Math.PI : -Math.PI / 2;

    // 时长上限 12s：速度设置支持 0.5~10 秒/步，不能被截断（旧实现上限 800ms 导致设置无效）
    const duration = Math.max(80, Math.min(item.duration || 250, 12000));
    const myEpoch = epoch;
    let start = null;

    function frame(ts) {
      if (destroyed) return;
      if (myEpoch !== epoch) {
        pivot.quaternion.set(0, 0, 0, 1);
        busy = false;
        drain();
        return;
      }
      if (start === null) start = ts == null ? Date.now() : ts;
      const t = Math.min((ts == null ? Date.now() : ts) - start, duration) / duration;
      const e = easeInOutCubic(t);
      pivot.quaternion.setFromAxisAngle(axisTmp, targetAngle * e);
      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        pivot.quaternion.set(0, 0, 0, 1);
        bakeLayer(layer, item.notation);
        busy = false;
        if (item.onStep) item.onStep(item.notation);
        if (item.onDone) item.onDone();
        if (cubeModel.isSolved() && opts.onSolved) opts.onSolved();
        drain();
      }
    }
    requestAnimationFrame(frame);
  }

  // 逻辑状态（state-first）
  const cubeModel = type.createCube(type.SOLVED);

  function move(notation, moveOpts) {
    if (typeof notation !== 'string' || !MOVE_RE.test(notation)) {
      const e = new Error('非法转动记号：' + notation);
      e.code = 'CUBE_MOVE_BAD_NOTATION';
      throw e;
    }
    cubeModel.move(notation); // 逻辑立即提交（非法记号在此抛出，不产生半程动画）
    if (queue.length >= QUEUE_CAP) {
      // 防连点失控：丢弃最早的待播动画，逻辑状态保持一致（渲染一次性追平）
      const dropped = queue.shift();
      if (dropped && dropped.onDropped) dropped.onDropped();
      epoch++;
      pivot.quaternion.set(0, 0, 0, 1);
      cubies.forEach((c) => {
        cubeGroup.add(c.mesh);
        c.mesh.position.set(c.logicPos[0] * half, c.logicPos[1] * half, c.logicPos[2] * half);
        const m = c.logicMat;
        matTmp.set(
          m[0][0], m[0][1], m[0][2], 0,
          m[1][0], m[1][1], m[1][2], 0,
          m[2][0], m[2][1], m[2][2], 0,
          0, 0, 0, 1
        );
        c.mesh.quaternion.setFromRotationMatrix(matTmp);
        c.mesh.updateMatrix();
      });
    }
    moveOpts = moveOpts || {};
    queue.push({
      notation,
      onStep: moveOpts.onStep,
      onDone: moveOpts.onDone,
      duration: moveOpts.duration
    });
    if (opts.onMove) opts.onMove(notation);
    drain();
    return true;
  }

  function applyMoves(seq, moveOpts) {
    if (moveOpts && moveOpts.resetView) resetView();
    const list = type.parseSequence(seq);
    list.forEach((m) => move(m, moveOpts));
    return list.length;
  }

  function setState(facelet, stateOpts) {
    if (stateOpts && stateOpts.resetView) resetView();
    cubeModel.setState(facelet);
    queue = [];
    epoch++;
    pivot.quaternion.set(0, 0, 0, 1);
    // 几何复位 + 按 facelet 重着色
    coordList.forEach((g, i) => {
      const c = cubies[i];
      cubeGroup.add(c.mesh);
      const home = [toLogic(g[0]), toLogic(g[1]), toLogic(g[2])];
      c.logicPos = home;
      c.logicMat = identityMat();
      c.mesh.position.set(home[0] * half, home[1] * half, home[2] * half);
      c.mesh.quaternion.set(0, 0, 0, 1);
      c.mesh.updateMatrix();
      c.mesh.children.forEach((child) => {
        if (child.userData.baseNormal == null) return;
        const idx = type.faceletIndexAt(c.logicPos, child.userData.baseNormal);
        const colorLetter = facelet[idx];
        child.material.color.set(colorHexOf(colorLetter));
      });
    });
    return true;
  }

  function getFacelet() {
    return cubeModel.getFacelet();
  }
  function isSolved() {
    return cubeModel.isSolved();
  }
  function isAnimating() {
    return busy || queue.length > 0;
  }
  function setAutoSpin(v) {
    autoSpin = !!v;
    if (autoSpin) userTouched = false;
  }

  // 默认视角方向（白顶绿前、稍偏右上）
  const DEFAULT_VIEW = { x: 0.9, y: 0.85, z: 1.3 };
  const viewEuler = new THREE.Euler();
  const qYawTmp = new THREE.Quaternion();
  const qPitchTmp = new THREE.Quaternion();
  // 先绕 X 俯仰（把要展示的面翻到正前方），再绕 Y 偏航（把该面转到正对镜头）
  function setOrientation(yawDeg, pitchDeg) {
    viewEuler.set(((pitchDeg || 0) * Math.PI) / 180, 0, 0);
    qPitchTmp.setFromEuler(viewEuler);
    viewEuler.set(0, ((yawDeg || 0) * Math.PI) / 180, 0);
    qYawTmp.setFromEuler(viewEuler);
    cubeGroup.quaternion.copy(qPitchTmp);
    cubeGroup.quaternion.premultiply(qYawTmp);
    userTouched = false;
    return true;
  }

  function resetView() {
    cubeGroup.quaternion.set(0, 0, 0, 1); // 白顶绿前 = 无整体旋转
    cubeGroup.rotation.set(0, 0, 0);
    camera.position
      .set(DEFAULT_VIEW.x, DEFAULT_VIEW.y, DEFAULT_VIEW.z)
      .normalize()
      .multiplyScalar(fitDistance(camera.aspect));
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    userTouched = false;
    return true;
  }

  // 交互锁：false = 只允许转视角
  function setInteractive(v) {
    interactive = !!v;
    if (!interactive) touch.decided = true;
  }

  // 触摸总开关：false = 完全不可交互
  function setTouchEnabled(v) {
    touchEnabled = !!v;
    if (!touchEnabled) {
      touch.mode = null;
      touch.decided = true;
    }
  }

  // ---- 触摸：raycast + 滑动判定 ----
  let raycaster = null;
  const ndcTmp = new THREE.Vector2();
  const normalTmp = new THREE.Vector3();

  function hitTest(canvasX, canvasY) {
    if (!raycaster) raycaster = new THREE.Raycaster();
    ndcTmp.set((canvasX / width) * 2 - 1, -(canvasY / height) * 2 + 1);
    raycaster.setFromCamera(ndcTmp, camera);
    const hits = raycaster.intersectObjects(stickerMeshes, false);
    if (!hits || !hits.length) return null;
    const hit = hits[0];
    const sticker = hit.object;
    const cubie = cubies[sticker.userData.cubieIndex];
    // 世界法向 → 局部法向（去掉视角旋转）
    normalTmp.copy(hit.face.normal).transformDirection(sticker.matrixWorld);
    const q = cubeGroup.quaternion;
    const inv = quatToMatrixArr([q.x, q.y, q.z, q.w]);
    const nLocal = mulMatVecArr(inv, [normalTmp.x, normalTmp.y, normalTmp.z]);
    // 取主导轴
    const abs = [Math.abs(nLocal[0]), Math.abs(nLocal[1]), Math.abs(nLocal[2])];
    let ai = 0;
    if (abs[1] > abs[ai]) ai = 1;
    if (abs[2] > abs[ai]) ai = 2;
    const snapped = [0, 0, 0];
    snapped[ai] = nLocal[ai] > 0 ? 1 : -1;
    return {
      cubieIndex: sticker.userData.cubieIndex,
      pos: cubie.logicPos.slice(),
      normalLocal: snapped,
      stickerLocal: [
        cubie.logicPos[0] + snapped[0] * 0.5,
        cubie.logicPos[1] + snapped[1] * 0.5,
        cubie.logicPos[2] + snapped[2] * 0.5
      ]
    };
  }

  // 相机基向量（世界系，用于滑动方向换算）
  const camBasis = (() => {
    const e = camera.position;
    const l = e.length();
    const fwd = new THREE.Vector3(-e.x / l, -e.y / l, -e.z / l);
    const r = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const u = new THREE.Vector3().crossVectors(r, fwd).normalize();
    return { right: [r.x, r.y, r.z], up: [u.x, u.y, u.z] };
  })();

  // 触摸手势状态与精度参数
  const swipeThreshold = opts.swipeThreshold || 26;
  const PREVIEW_MIN = 14;
  const SCORE_HIGH = 0.8;
  const SCORE_MID = 0.65;
  const MARGIN_MID = 0.15;
  const SCORE_FINAL = 0.55;
  const allowSlices = opts.allowSlices !== false && N === 3;
  let interactive = opts.interactive !== false;
  let touchEnabled = true;
  const touch = {
    mode: null, // 'layer' | 'view'
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    hit: null,
    decided: false,
    previewNotation: null
  };

  // ---- 拖动预览：实时高亮"将要转的层" ----
  let previewMesh = null;
  const previewGeo = new THREE.BoxGeometry(1, 1, 1);
  const previewMat = new THREE.MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.3 });
  disposables.push(previewGeo, previewMat);

  function showLayerPreview(notation) {
    if (!notation) {
      if (previewMesh) previewMesh.visible = false;
      return;
    }
    if (!previewMesh) {
      previewMesh = new THREE.Mesh(previewGeo, previewMat);
      previewMesh.visible = false;
      cubeGroup.add(previewMesh);
    }
    const layers = layersOfNotation(notation);
    const size = half * 2 + bodySize * 1.06;
    const dims = [size, size, size];
    dims[layers.axis] = spacing * 1.08;
    previewMesh.scale.set(dims[0], dims[1], dims[2]);
    const center = [0, 0, 0];
    center[layers.axis] = layers.coords.length > 1 ? 0 : layers.coords[0] * half;
    previewMesh.position.set(center[0], center[1], center[2]);
    previewMesh.visible = true;
  }

  function clearPreview() {
    touch.previewNotation = null;
    showLayerPreview(null);
  }

  function evaluateSwipe(x, y) {
    const acc = [x - touch.startX, y - touch.startY];
    const dist = Math.hypot(acc[0], acc[1]);
    if (dist < PREVIEW_MIN) return null;
    const q = cubeGroup.quaternion;
    const r = analyzeSwipe({
      pos: touch.hit.pos,
      stickerLocal: touch.hit.stickerLocal,
      swipe: acc,
      camRight: camBasis.right,
      camUp: camBasis.up,
      viewQuat: [q.x, q.y, q.z, q.w],
      allowSlices,
      n: N
    });
    if (!r) return null;
    r.dist = dist;
    return r;
  }

  function commitSwipe(notation) {
    touch.decided = true;
    clearPreview();
    move(notation, { duration: 220 });
  }

  function onTouchStart(x, y) {
    userTouched = true;
    touch.mode = null;
    touch.decided = false;
    touch.startX = touch.lastX = x;
    touch.startY = touch.lastY = y;
    clearPreview();
    if (!touchEnabled) {
      touch.hit = null;
      touch.decided = true;
      return;
    }
    touch.hit = hitTest(x, y);
    // 禁止转层时，命中魔方也只当作视角拖拽
    touch.mode = touch.hit && interactive ? 'layer' : 'view';
  }

  function onTouchMove(x, y) {
    const dx = x - touch.lastX;
    const dy = y - touch.lastY;
    touch.lastX = x;
    touch.lastY = y;
    if (!touchEnabled) return;
    if (touch.mode === 'view') {
      rotateView(dy, dx);
      return;
    }
    if (touch.mode !== 'layer' || touch.decided) return;
    if (!interactive) return;
    // 动画中屏蔽误触（仍允许转视角）
    if (isAnimating()) return;
    if (!touch.hit) return;
    const r = evaluateSwipe(x, y);
    if (!r) {
      clearPreview();
      return;
    }
    // 拖动中实时预览将要转的层
    if (touch.previewNotation !== r.notation) {
      touch.previewNotation = r.notation;
      showLayerPreview(r.notation);
    }
    if (r.dist >= swipeThreshold && (r.score >= SCORE_HIGH || (r.score >= SCORE_MID && r.margin >= MARGIN_MID))) {
      commitSwipe(r.notation);
    }
  }

  function onTouchEnd() {
    const wasLayer = touch.mode === 'layer';
    touch.mode = null;
    if (!wasLayer || touch.decided || !touchEnabled || !interactive || !touch.hit) {
      clearPreview();
      return;
    }
    // 抬手补判：方向足够明确才执行，模糊滑动宁可不转
    const r = evaluateSwipe(touch.lastX, touch.lastY);
    clearPreview();
    if (r && r.dist >= swipeThreshold * 0.8 && r.score >= SCORE_FINAL) {
      commitSwipe(r.notation);
    }
  }

  // ---- 高亮与方向箭头（跟做 / 演示）----
  let highlightGroup = null;
  function clearHighlight() {
    if (highlightGroup) {
      cubeGroup.remove(highlightGroup);
      highlightGroup = null;
    }
  }

  function highlight(notation) {
    clearHighlight();
    if (!notation) return;
    const layers = layersOfNotation(notation);
    const def = MOVE_AXIS[notation[0].toUpperCase()];
    const suffix = notation.length === 1 ? '' : notation[1];

    highlightGroup = new THREE.Group();
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(
        layers.axis === 0 ? spacing * 1.04 : half * 2 + bodySize * 1.04,
        layers.axis === 1 ? spacing * 1.04 : half * 2 + bodySize * 1.04,
        layers.axis === 2 ? spacing * 1.04 : half * 2 + bodySize * 1.04
      ),
      new THREE.MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.22 })
    );
    const center = [0, 0, 0];
    center[layers.axis] = layers.coords.length > 1 ? 0 : layers.coords[0] * half;
    slab.position.set(center[0], center[1], center[2]);
    highlightGroup.add(slab);

    if (suffix !== '2') {
      const dirSign = def.cw * (suffix === "'" ? -1 : 1);
      const axisUnit = new THREE.Vector3(def.v[0], def.v[1], def.v[2]);
      const point = new THREE.Vector3();
      const others = [0, 1, 2].filter((i) => i !== layers.axis);
      point.setComponent(others[0], half);
      point.setComponent(others[1], -half);
      point.setComponent(layers.axis, layers.coords[0] * half);
      const vel = new THREE.Vector3().crossVectors(axisUnit.multiplyScalar(dirSign), point);
      if (vel.length() > 1e-6) {
        const arrow = new THREE.ArrowHelper(vel.normalize(), point, spacing * 1.6, 0xff8a3d, spacing * 0.55, spacing * 0.35);
        highlightGroup.add(arrow);
      }
    }
    cubeGroup.add(highlightGroup);
  }

  function resize(newWidth, newHeight) {
    renderer.setSize(newWidth, newHeight, false);
    camera.aspect = newWidth / newHeight;
    camera.position.setLength(fitDistance(camera.aspect));
    camera.updateProjectionMatrix();
  }

  let destroyed = false;
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    queue = [];
    clearHighlight();
    try {
      disposables.forEach((d) => d.dispose && d.dispose());
      renderer.dispose();
    } catch (e) {
      /* 忽略销毁异常 */
    }
  }

  // ---- 渲染循环 ----
  function render(ts) {
    if (destroyed) return;
    try {
      if (autoSpin && !userTouched && !busy && queue.length === 0) {
        eulerTmp.set(0, 0.0035, 0);
        qDelta.setFromEuler(eulerTmp);
        cubeGroup.quaternion.premultiply(qDelta);
      }
      renderer.render(scene, camera);
    } catch (e) {
      destroyed = true;
      if (opts.onError) {
        try {
          opts.onError(e);
        } catch (e2) {
          /* 忽略 */
        }
      }
      return;
    }
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);

  return {
    move,
    applyMoves,
    setState,
    getFacelet,
    isSolved,
    isAnimating,
    setAutoSpin,
    setOrientation,
    resetView,
    setInteractive,
    setTouchEnabled,
    highlight,
    clearHighlight,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    resize,
    destroy,
    queueLength: () => queue.length,
    // 测试钩子：校验"渲染位姿 === 逻辑位姿"
    __cubies: () => cubies,
    __camera: () => camera,
    __cubeModel: () => cubeModel
  };
}
