/**
 * scanState.js —— 拍照识别的六面状态组装与校验（P5）
 *
 * 六面拍摄顺序 U → D → F → B → R → L；每面照片 3x3 网格按行优先
 * 映射到该面 facelet（拍摄朝向约定见 ORIENT_HINT，与 cube.js 的
 * ROWCOL 约定一致：每面"从外侧正视、上边为提示面"）。
 */



import * as colorMatch from './colorMatch.js';
import { FACES, SOLVED } from './cube.js';
import { analyzeState } from './cubies.js';
// 每面拍摄时的持握朝向提示："上边朝 X / 正对自己"
// 拍摄提示：统一说成"把 XX 面朝向镜头，画面里 YY 面在上边"（避免"朝上/在上方"混淆）
const ORIENT_HINT = {
  U: { up: 'B', tip: '白色面朝向镜头 · 画面里蓝色面在上边' },
  D: { up: 'F', tip: '黄色面朝向镜头 · 画面里绿色面在上边' },
  F: { up: 'U', tip: '绿色面朝向镜头 · 画面里白色面在上边' },
  B: { up: 'U', tip: '蓝色面朝向镜头 · 画面里白色面在上边' },
  R: { up: 'U', tip: '红色面朝向镜头 · 画面里白色面在上边' },
  L: { up: 'U', tip: '橙色面朝向镜头 · 画面里白色面在上边' }
};

const SCAN_ORDER = ['U', 'D', 'F', 'B', 'R', 'L'];

function newScanSession() {
  return { faces: {}, current: 0 };
}

function currentFace(session) {
  return SCAN_ORDER[session.current];
}

/**
 * 记录一面识别结果
 * @param {Object} session
 * @param {string} face 'U'...
 * @param {string[]} grid9 9 个 facelet 字母（照片行优先）
 */
function setFace(session, face, grid9) {
  session.faces[face] = grid9.join('');
}

/**
 * 组装 54 位状态（六面齐了才可调用）
 */
function assemble(session) {
  const parts = [];
  for (const f of FACES) {
    if (!session.faces[f]) return null;
    parts.push(session.faces[f]);
  }
  return parts.join('');
}

/**
 * 完整校验：每色 9 个 → 中心色 → 块级可解性
 * 返回 { ok, code?, message?, badFaces? }（badFaces 提示重拍哪个面）
 */
function validate(session) {
  const state = assemble(session);
  if (!state) {
    return { ok: false, code: 'SCAN_INCOMPLETE', message: '还有面没拍完' };
  }
  // 颜色计数与归属面检查 → 定位需要重拍的面
  const counts = {};
  for (const ch of state) counts[ch] = (counts[ch] || 0) + 1;
  const badFaces = [];
  for (const f of FACES) {
    const faceState = session.faces[f];
    const centerIdx = 4;
    if (faceState[centerIdx] !== f) {
      badFaces.push(f);
    }
  }
  for (const f of FACES) {
    if (counts[f] !== 9) {
      return {
        ok: false,
        code: 'SCAN_BAD_COUNTS',
        message: `${COUNT_NAME[f]}数量不对（应为 9 个，当前 ${counts[f] || 0} 个），请检查识别结果`,
        badFaces: dedupe(badFaces)
      };
    }
  }
  const check = analyzeState(state);
  if (!check.ok) {
    return { ok: false, code: check.code, message: check.message, badFaces: dedupe(badFaces) };
  }
  return { ok: true, state };
}

const COUNT_NAME = { U: '白色', D: '黄色', F: '绿色', B: '蓝色', R: '红色', L: '橙色' };

function dedupe(arr) {
  return Array.from(new Set(arr));
}

// 单面识别时的"块级预检"：一张照片内的颜色组合数量统计
function faceColorCounts(grid9) {
  const counts = {};
  for (const ch of grid9) counts[ch] = (counts[ch] || 0) + 1;
  return counts;
}

// 修正页：把第 idx 个色块改为 letter
function applyCorrection(session, face, index, letter) {
  const arr = session.faces[face].split('');
  arr[index] = letter;
  session.faces[face] = arr.join('');
}

export { ORIENT_HINT, SCAN_ORDER, newScanSession, currentFace, setFace, assemble, validate, applyCorrection, faceColorCounts, SOLVED, colorMatch };
