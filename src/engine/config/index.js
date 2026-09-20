/**
 * config/index.js —— 全局配置（配色 / 主题 / 颜色名称 / 插件开关 / 识别参数）
 * 魔方配色为标准配色：白顶黄底、绿前蓝后、红右橙左。
 * CUBE_COLORS 的键是 facelet 字母，3D 渲染与拍照识别共用此表。
 */
const CUBE_COLORS = {
  U: '#F8FAFC',
  D: '#FFD93D',
  F: '#51CF66',
  B: '#339AF0',
  R: '#FF6B6B',
  L: '#FFA94D'
};
// 色弱模式高对比配色（P10 无障碍）：与标准色一一对应
const CUBE_COLORS_COLORBLIND = {
  U: '#FFFFFF',
  D: '#FFD400',
  F: '#1EA94C',
  B: '#0D6FD8',
  R: '#D0342C',
  L: '#FF8C00'
};
// 色弱辅助图案（识别页/修正页叠加在色块上的符号）
const COLOR_SHAPE = { U: '●', D: '▬', F: '▲', B: '★', R: '✚', L: '◗' };
const COLOR_NAMES = {
  U: '白色',
  D: '黄色',
  F: '绿色',
  B: '蓝色',
  R: '红色',
  L: '橙色'
};
const THEME = {
  primary: '#FF8A3D',
  bg: '#FFF9EE',
  card: '#FFFFFF',
  textDark: '#3D3A37',
  textLight: '#9AA0A6'
};
// 语音插件（微信同声传译）：未接入时 voice.js 自动降级为纯文字
const tts = {
  enabled: false
};
// 云函数内容安全（可选）：部署 msgSecCheck 云函数后开启
const cloud = {
  checkMsg: false,
  checkMsgFn: 'msgSecCheck'
};
// 触摸与识别参数（P2/P5）
const swipeThresholdPx = 26; // 触摸转层滑动阈值（像素，可调）
const scan = {
  cellCenterRatio: 0.6,   // 色块取样中心区域比例（排除阴影渐变边缘）
  subGrid: 5,             // 每格取样子网格（取中位数抗高光）
  saturationFloor: 0.12,  // 饱和度下限（过滤灰色高光）
  valueCeiling: 0.97      // 明度上限（过滤镜面反光）
};

export { CUBE_COLORS, CUBE_COLORS_COLORBLIND, COLOR_SHAPE, COLOR_NAMES, THEME, tts, cloud, swipeThresholdPx, scan };
