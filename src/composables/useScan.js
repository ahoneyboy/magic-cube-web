/**
 * useScan.js —— 拍照识别管线（Web 移植，逻辑对照小程序 scan.js 页面内的像素处理段）
 *
 * 管线（§5.5，全部用引擎的 colorMatch/scanState）：
 *   照片缩样 240×240 读像素 → 每格中心 60% 取 5×5 子网格逐通道中位数
 *   → 实测中心色做参照 + 白平衡归一 → 相对最近邻（色度×2.6 + 相对亮度×0.9）
 *   → 不确定格打「?」→ 六面拍完用全部实测中心色统一重判 → 校验
 *
 * 自动对齐：边缘能量（灰度梯度）+ 网格线平均梯度打分 + 多起点（当前四角与 5 种居中缩放）爬山。
 */

/**
 * 把图片缩样到 240×240 并读出像素
 * @param {HTMLImageElement|HTMLCanvasElement} img
 * @returns {{ pixels: Uint8ClampedArray, w: number, h: number } | null}
 */
export function loadPixels(img) {
  try {
    const W = 240;
    const H = 240;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const c2 = cv.getContext('2d', { willReadFrequently: true });
    c2.clearRect(0, 0, W, H);
    c2.drawImage(img, 0, 0, W, H); // 与显示画布同一"拉伸"方式 → 归一化坐标一致
    const data = c2.getImageData(0, 0, W, H).data;
    if (!data || data.length === 0) return null;
    return { pixels: data, w: W, h: H };
  } catch (e) {
    return null;
  }
}

/** 四角四边形 → 网格交点（画布坐标） */
export function gridPointPx(corners, u, v) {
  const lerp = (a, b, t) => a + (b - a) * t;
  const tx = lerp(corners[0].x, corners[1].x, u);
  const ty = lerp(corners[0].y, corners[1].y, u);
  const bx = lerp(corners[3].x, corners[2].x, u);
  const by = lerp(corners[3].y, corners[2].y, u);
  return { x: lerp(tx, bx, v), y: lerp(ty, by, v) };
}

/** 缩样缓冲的双线性取样（pixels 为 240×240 RGBA；u/v ∈ 0-1） */
export function sampleImage(buffer, u, v) {
  const { pixels, w, h } = buffer;
  const x = u * (w - 1);
  const y = v * (h - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const px = (xx, yy) => {
    const xi = Math.max(0, Math.min(w - 1, xx));
    const yi = Math.max(0, Math.min(h - 1, yy));
    const o = (yi * w + xi) * 4;
    return [pixels[o], pixels[o + 1], pixels[o + 2]];
  };
  const p00 = px(x0, y0);
  const p10 = px(x0 + 1, y0);
  const p01 = px(x0, y0 + 1);
  const p11 = px(x0 + 1, y0 + 1);
  const lerp = (a, b, t) => a + (b - a) * t;
  return {
    r: lerp(lerp(p00[0], p10[0], fx), lerp(p01[0], p11[0], fx), fy),
    g: lerp(lerp(p00[1], p10[1], fx), lerp(p01[1], p11[1], fx), fy),
    b: lerp(lerp(p00[2], p10[2], fx), lerp(p01[2], p11[2], fx), fy)
  };
}

/**
 * 一格的像素样本（中心 60% 区域的 5×5 子网格）
 * @param {Object} buffer loadPixels 结果
 * @param {Array} corners 四角（画布坐标）
 * @param {number} r 行 0-2
 * @param {number} c 列 0-2
 * @param {Object} cfg config.scan（subGrid 等）
 * @param {number} cw 画布宽（归一化用）
 * @param {number} ch 画布高
 */
export function sampleCell(buffer, corners, r, c, cfg, cw, ch) {
  const g = cfg.subGrid;
  const samples = [];
  for (let sr = 0; sr < g; sr++) {
    for (let sc = 0; sc < g; sc++) {
      const u = (c + (0.2 + (0.6 * (sr + 0.5)) / g)) / 3;
      const v = (r + (0.2 + (0.6 * (sc + 0.5)) / g)) / 3;
      const p = gridPointPx(corners, u, v);
      const s = sampleImage(buffer, p.x / cw, p.y / ch);
      if (s) samples.push(s);
    }
  }
  return samples;
}

/** 灰度梯度强度图（一次 O(W*H)）：网格线落在色块边缘时能量最高 */
export function buildEdgeMap(buffer) {
  const { pixels, w, h } = buffer;
  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    gray[i] = 0.299 * pixels[p] + 0.587 * pixels[p + 1] + 0.114 * pixels[p + 2];
  }
  const edge = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      edge[i] = Math.abs(gray[i + 1] - gray[i - 1]) + Math.abs(gray[i + w] - gray[i - w]);
    }
  }
  return { w, h, edge };
}

/** 网格线（横竖各 4 条）上的平均边缘能量：越贴合魔方贴纸边界分越高 */
export function lineScore(edgeMap, corners, cw, ch) {
  if (!edgeMap) return 0;
  let sum = 0;
  let n = 0;
  const probe = (u, v) => {
    const p = gridPointPx(corners, u, v);
    const x = Math.round((p.x / cw) * (edgeMap.w - 1));
    const y = Math.round((p.y / ch) * (edgeMap.h - 1));
    if (x < 1 || y < 1 || x >= edgeMap.w - 1 || y >= edgeMap.h - 1) return;
    sum += edgeMap.edge[y * edgeMap.w + x];
    n++;
  };
  const K = 10; // 每条线取 10 个采样点
  for (let i = 0; i <= 3; i++) {
    for (let k = 0; k < K; k++) {
      const t = (k + 0.5) / K;
      probe(i / 3, t); // 竖线
      probe(t, i / 3); // 横线
    }
  }
  return n ? sum / n : 0;
}

/**
 * 自动对齐：多起点（不同大小/居中 + 当前四角）爬山，目标函数 = 网格线贴合色块边缘
 * @returns {Array<{x:number,y:number}>} 最优四角（画布坐标）
 */
export function autoAlignCorners(edgeMap, initCorners, cw, ch) {
  const side = Math.min(cw, ch);
  const cx = cw / 2;
  const cy = ch / 2;
  const makeQuad = (s) => [
    { x: cx - s / 2, y: cy - s / 2 },
    { x: cx + s / 2, y: cy - s / 2 },
    { x: cx + s / 2, y: cy + s / 2 },
    { x: cx - s / 2, y: cy + s / 2 }
  ];
  const starts = [0.72, 0.55, 0.62, 0.85, 0.95].map((r) => makeQuad(side * r));
  starts.unshift(initCorners.map((c) => ({ x: c.x, y: c.y }))); // 当前四角作为第一起点

  let best = null;
  let bestScore = -Infinity;
  starts.forEach((init) => {
    let cs = init;
    let score = lineScore(edgeMap, cs, cw, ch);
    const maxStep = side * 0.09;
    for (let step = maxStep; step >= 1.5; step /= 2) {
      let improved = true;
      let guard = 0;
      while (improved && guard++ < 60) {
        improved = false;
        for (let i = 0; i < 4; i++) {
          for (const d of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
            const trial = cs.map((c) => ({ x: c.x, y: c.y }));
            trial[i].x = Math.max(2, Math.min(cw - 2, trial[i].x + d[0]));
            trial[i].y = Math.max(2, Math.min(ch - 2, trial[i].y + d[1]));
            const sc = lineScore(edgeMap, trial, cw, ch);
            if (sc > score + 1e-6) {
              cs = trial;
              score = sc;
              improved = true;
            }
          }
        }
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = cs;
    }
  });
  return best || initCorners;
}

/** 在 canvas 上绘制对齐视图（照片 + 网格线 + 四角手柄） */
export function drawAdjust(ctx, img, corners, cw, ch) {
  ctx.clearRect(0, 0, cw, ch);
  ctx.drawImage(img, 0, 0, cw, ch);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 3; i++) {
    const p0 = gridPointPx(corners, i / 3, 0);
    const p3 = gridPointPx(corners, i / 3, 3);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.stroke();
    const q0 = gridPointPx(corners, 0, i / 3);
    const q3 = gridPointPx(corners, 3, i / 3);
    ctx.beginPath();
    ctx.moveTo(q0.x, q0.y);
    ctx.lineTo(q3.x, q3.y);
    ctx.stroke();
  }
  corners.forEach((c) => {
    ctx.beginPath();
    ctx.arc(c.x, c.y, 12, 0, Math.PI * 2);
    ctx.fillStyle = '#FF8A3D';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  });
}
