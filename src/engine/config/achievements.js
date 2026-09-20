/**
 * achievements.js（config）—— 徽章 / 等级 / 经验规则配置（P9）
 *
 * 设计要求：规则引擎配置化，数值可调整。check(ctx) 接收聚合上下文：
 *   {
 *     stats,          // records.getStats()
 *     totalSolves,    // 累计复原次数
 *     streakDays,     // 连续打卡天数
 *     lessonsDone,    // 已完成课程数
 *     scanSuccess,    // 拍照识别成功次数
 *     cube2Solved,    // 2x2 复原次数
 *     xp              // 当前经验值
 *   }
 */

const XP_PER_EVENT = {
  solve: 10,        // 每次复原（含跟做）
  timer: 15,        // 计时模式复原
  scan_success: 20, // 拍照识别成功
  lesson_done: 30,  // 完成一课
  checkin: 5        // 每日首次复原即打卡
};

// 经验等级（每级所需累计经验）
const XP_LEVELS = [
  { level: 1, name: '新手上路', need: 0, emoji: '🌱' },
  { level: 2, name: '小试身手', need: 50, emoji: '⭐' },
  { level: 3, name: '渐入佳境', need: 150, emoji: '✨' },
  { level: 4, name: '魔方达人', need: 350, emoji: '🎯' },
  { level: 5, name: '复原大师', need: 700, emoji: '🏆' },
  { level: 6, name: '传奇玩家', need: 1200, emoji: '👑' }
];

const BADGES = [
  {
    id: 'first_solve',
    name: '第一次复原',
    icon: '🎉',
    desc: '完成第一次复原',
    check: (ctx) => ctx.totalSolves >= 1
  },
  {
    id: 'ten_solves',
    name: '小有成就',
    icon: '🔟',
    desc: '累计复原 10 次',
    check: (ctx) => ctx.totalSolves >= 10
  },
  {
    id: 'fifty_solves',
    name: '百炼成钢',
    icon: '💪',
    desc: '累计复原 50 次',
    check: (ctx) => ctx.totalSolves >= 50
  },
  {
    id: 'first_scan',
    name: '火眼金睛',
    icon: '📷',
    desc: '第一次拍照识别成功',
    check: (ctx) => ctx.scanSuccess >= 1
  },
  {
    id: 'first_lesson',
    name: '开学啦',
    icon: '📚',
    desc: '完成第一课',
    check: (ctx) => ctx.lessonsDone >= 1
  },
  {
    id: 'all_lessons',
    name: '满学而归',
    icon: '🎓',
    desc: '完成全部 7 课',
    check: (ctx) => ctx.lessonsDone >= 7
  },
  {
    id: 'streak_3',
    name: '坚持三天',
    icon: '🔥',
    desc: '连续 3 天打卡',
    check: (ctx) => ctx.streakDays >= 3
  },
  {
    id: 'streak_7',
    name: '一周之约',
    icon: '📅',
    desc: '连续 7 天打卡',
    check: (ctx) => ctx.streakDays >= 7
  },
  {
    id: 'level_skilled',
    name: '进阶选手',
    icon: '⭐',
    desc: '平均成绩达到"进阶"段位',
    check: (ctx) => ctx.skillLevel === 'advanced' || ctx.skillLevel === 'skilled' || ctx.skillLevel === 'master'
  },
  {
    id: 'level_master',
    name: '高手驾到',
    icon: '🏆',
    desc: '平均成绩达到"高手"段位',
    check: (ctx) => ctx.skillLevel === 'master'
  },
  {
    id: 'first_2x2',
    name: '小方块挑战',
    icon: '🧩',
    desc: '第一次复原 2x2',
    check: (ctx) => ctx.cube2Solved >= 1
  },
  {
    id: 'speed_60s',
    name: '破分钟',
    icon: '⚡',
    desc: '计时模式跑进 1 分钟',
    check: (ctx) => ctx.bestTimerMs != null && ctx.bestTimerMs < 60 * 1000
  }
];

export { XP_PER_EVENT, XP_LEVELS, BADGES };
