/**
 * colorMatch.js —— 颜色识别核心（RGB/HSV 转换 + 最近邻分类，纯函数）
 *
 * 抗干扰策略（P5 常见坑）：
 * - 每个色块取中心 60% 区域的子网格采样，逐通道取「中位数」——抗阴影渐变与局部反光
 * - 高光过滤：V 过高且 S 过低的样本（镜面反光）不参与分类
 * - HSV 空间与标定中心色最近邻（H 环形距离加权）
 */



import * as config from './config/index.js';
function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// 标定色（facelet 字母 → HSV），通常来自中心色标定
function buildCalibration(centerColors) {
  // centerColors: { U: '#F8FAFC', ... }（hex）
  const out = {};
  Object.keys(centerColors).forEach((k) => {
    const [r, g, b] = hexToRgb(centerColors[k]);
    out[k] = rgbToHsv(r, g, b);
  });
  return out;
}

function hueDist(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * 单个色块 → facelet 字母
 * @param {Array} samples 像素样本数组 [{r,g,b}...]（中心 60% 区域子网格）
 * @param {Object} calibration buildCalibration 结果
 * @returns { letter, confidence, rejected } rejected=因高光全部被滤掉
 */
function classify(samples, calibration) {
  const cfg = config.scan;
  // 逐通道取中位数（抗局部高光/阴影）
  const rs = samples.map((s) => s.r).sort((a, b) => a - b);
  const gs = samples.map((s) => s.g).sort((a, b) => a - b);
  const bs = samples.map((s) => s.b).sort((a, b) => a - b);
  const mid = (arr) => arr[Math.floor(arr.length / 2)];
  const rgb = { r: mid(rs), g: mid(gs), b: mid(bs) };
  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);

  const isGlare = hsv.s < cfg.saturationFloor && hsv.v > cfg.valueCeiling;
  const isShadow = hsv.v < 0.12;

  let best = null;
  let bestScore = Infinity;
  Object.keys(calibration).forEach((k) => {
    const c = calibration[k];
    // H 环形距离（0-180），S/V 距离加权；白色等低饱和色以 S/V 为主
    const hd = hueDist(hsv.h, c.h) / 180;
    const sd = Math.abs(hsv.s - c.s);
    const vd = Math.abs(hsv.v - c.v);
    const weightHue = Math.min(hsv.s, c.s) < 0.25 ? 0.5 : 1.6; // 低饱和色弱化色相
    const score = weightHue * hd + 1.0 * sd + 1.0 * vd;
    if (score < bestScore) {
      bestScore = score;
      best = k;
    }
  });

  return {
    letter: best,
    confidence: Math.max(0, 1 - bestScore),
    rgb,
    hsv,
    rejected: isGlare || isShadow,
    glare: isGlare,
    shadow: isShadow
  };
}

/**
 * 6 个标定色两两可区分性自检（中心色标定后的鲁棒性检查）
 * 返回 { ok, pairs: [ {a,b,dist} ] }（dist < 0.25 视为易混淆）
 */
function calibrationQuality(calibration) {
  const keys = Object.keys(calibration);
  const pairs = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = calibration[keys[i]];
      const b = calibration[keys[j]];
      const weightHue = Math.min(a.s, b.s) < 0.25 ? 0.5 : 1.6;
      const d = weightHue * (hueDist(a.h, b.h) / 180) + Math.abs(a.s - b.s) + Math.abs(a.v - b.v);
      pairs.push({ a: keys[i], b: keys[j], dist: d });
    }
  }
  const close = pairs.filter((p) => p.dist < 0.25);
  return { ok: close.length === 0, pairs: close };
}

// ============================================================================
// 实测中心色 + 白平衡归一 + 相对分类（推荐路径）
//
// 只用"理想色卡"去比照片颜色，遇到灯光色偏（暖光/冷光）和相机白平衡就会错，
// 尤其白↔黄、红↔橙最易混。正确做法：
//   1) 每面拍到的中心块就是该面颜色 → 直接当实测参照；
//   2) 用白色面的实测中心做白平衡增益，把整体色偏扣掉；
//   3) 在归一后的空间里比"色度 + 相对亮度"，而不是比绝对 RGB。
// ============================================================================

/** 多像素样本 → 逐通道中位数（抗高光/阴影） */
function medianRgb(samples) {
  if (!samples || !samples.length) return null;
  const rs = samples.map((s) => s.r).sort((a, b) => a - b);
  const gs = samples.map((s) => s.g).sort((a, b) => a - b);
  const bs = samples.map((s) => s.b).sort((a, b) => a - b);
  const mid = (arr) => arr[Math.floor(arr.length / 2)];
  return { r: mid(rs), g: mid(gs), b: mid(bs) };
}

/** 白平衡增益：把白色参考拉回中性灰，从而扣掉灯光色偏 */
function whiteBalance(rgb, whiteRef) {
  if (!whiteRef) return { r: rgb.r, g: rgb.g, b: rgb.b };
  const wr = Math.max(8, whiteRef.r);
  const wg = Math.max(8, whiteRef.g);
  const wb = Math.max(8, whiteRef.b);
  const lum = (wr + wg + wb) / 3;
  return {
    r: (rgb.r * lum) / wr,
    g: (rgb.g * lum) / wg,
    b: (rgb.b * lum) / wb
  };
}

function chromaOf(rgb) {
  const sum = rgb.r + rgb.g + rgb.b + 1e-6;
  return { c0: rgb.r / sum, c1: rgb.g / sum, lum: sum / 3 };
}

/**
 * 相对分类：拿实测中心色当参照
 * @param {Array} samples 像素样本
 * @param {Object} refs { U:{r,g,b}, D:{...} } 实测中心色（键为 facelet 字母）
 * @param {Object} opts { whiteRef, ambiguity }
 * @returns { letter, confidence, uncertain, rgb, norm, ranking }
 */
function classifyRelative(samples, refs, opts) {
  opts = opts || {};
  const raw = medianRgb(samples);
  if (!raw) return { letter: null, confidence: 0, uncertain: true, rejected: true };
  const keys = Object.keys(refs || {});
  if (!keys.length) return { letter: null, confidence: 0, uncertain: true };
  const white = opts.whiteRef;
  const s = whiteBalance(raw, white);
  const sc = chromaOf(s);
  const scores = keys.map((k) => {
    const rc = chromaOf(whiteBalance(refs[k], white));
    const dc = Math.hypot(sc.c0 - rc.c0, sc.c1 - rc.c1); // 色度距离（区分色相）
    const dl = Math.abs(sc.lum - rc.lum) / Math.max(sc.lum, rc.lum, 1e-6); // 相对亮度（区分白/黄、亮/暗）
    return { k, score: dc * 2.6 + dl * 0.9 };
  });
  scores.sort((a, b) => a.score - b.score);
  const best = scores[0];
  const second = scores[1] || { score: best.score + 1 };
  const margin = (second.score - best.score) / (second.score + 1e-6);
  const ambiguity = opts.ambiguity != null ? opts.ambiguity : 0.05;
  const outlier = opts.outlier != null ? opts.outlier : 0.17; // best 分数过大 = 不像任何参照色
  const hsv = rgbToHsv(raw.r, raw.g, raw.b);
  // 过曝判定要跟"实测白色"比：纯白贴纸本身也是低饱和高亮度，不能一概算高光
  const whiteHsv = white ? rgbToHsv(white.r, white.g, white.b) : null;
  const isGlare = !!whiteHsv && hsv.v > Math.max(0.98, whiteHsv.v * 1.02) && hsv.s < Math.max(0.08, whiteHsv.s + 0.04);
  const isShadow = hsv.v < 0.1;
  return {
    letter: best.k,
    confidence: Math.max(0, Math.min(1, margin)),
    bestScore: best.score,
    // 只有"两色几乎一样近"、"谁都不像"或"明显过曝"才提示不确定（正常色块不打扰用户）
    uncertain: margin < ambiguity || best.score > outlier || isGlare || isShadow,
    rejected: isGlare || isShadow,
    glare: isGlare,
    shadow: isShadow,
    rgb: raw,
    norm: s,
    ranking: scores.slice(0, 3).map((x) => x.k)
  };
}

/**
 * 用实测中心色组装参照表
 * @param {Object} measured { U:{r,g,b}, ... } 每面实测中心色
 * @param {Object} faceLetter { U:'U', D:'D', ... } 每面实际是什么颜色（用户标定）
 */
function refsFromCenters(measured, faceLetter) {
  const refs = {};
  Object.keys(measured || {}).forEach((f) => {
    const letter = (faceLetter && faceLetter[f]) || f;
    if (measured[f]) refs[letter] = measured[f];
  });
  return refs;
}

/** 找出白色参照（用于白平衡）：优先"被标定为白色"的那面 */
function pickWhiteRef(measured, faceLetter, paletteHex) {
  // 找"最白"的那张标定色（饱和度最低、亮度最高）作为白平衡参照
  let target = 'U';
  let best = null;
  Object.keys(paletteHex || {}).forEach((k) => {
    const rgb = hexToRgb(paletteHex[k]);
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    const score = hsv.v - hsv.s; // 越白分越高
    if (!best || score > best.score) best = { score, k };
  });
  if (best) target = best.k;
  const keys = Object.keys(measured || {});
  for (const f of keys) {
    const letter = (faceLetter && faceLetter[f]) || f;
    if (letter === target && measured[f]) return measured[f];
  }
  // 没拍到白色面：退而取最亮的一个中心
  let brightest = null;
  keys.forEach((f) => {
    const m = measured[f];
    if (!m) return;
    const lum = m.r + m.g + m.b;
    if (!brightest || lum > brightest.lum) brightest = { lum, rgb: m };
  });
  return brightest ? brightest.rgb : null;
}

export { rgbToHsv, hexToRgb, buildCalibration, classify, calibrationQuality, hueDist, medianRgb, whiteBalance, classifyRelative, refsFromCenters, pickWhiteRef };
