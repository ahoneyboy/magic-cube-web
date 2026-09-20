/**
 * game.js —— 游戏化引擎（对照小程序 utils/game.js 移植；规则读自引擎的 config/achievements.js）
 * XP 与等级、徽章解锁、贴纸收藏。打卡与激励"温和不惩罚"：只有获得，没有扣减。
 */
import { defineStore } from 'pinia';
import { DB_KEYS, dbGet, dbSet } from './db.js';
import { XP_PER_EVENT, XP_LEVELS, BADGES } from '../engine/config/achievements.js';

// 贴纸收藏墙（对照 game.js COLLECTION_ITEMS；Web 用 lucide 图标代替 emoji）
export const COLLECTION_ITEMS = [
  { id: 'sticker_cubie', name: '小方块贴纸', needXp: 30, icon: 'square' },
  { id: 'sticker_bubble', name: '泡泡贴纸', needXp: 80, icon: 'circle' },
  { id: 'pet_cubie', name: '魔方小宠', needXp: 200, icon: 'egg' },
  { id: 'pet_grow', name: '小宠长大', needXp: 500, icon: 'bird' },
  { id: 'frame_gold', name: '金色头像框', needXp: 900, icon: 'medal' }
];

function xpLevelOf(xp) {
  let cur = XP_LEVELS[0];
  for (const l of XP_LEVELS) {
    if (xp >= l.need) cur = l;
  }
  const next = XP_LEVELS.find((l) => l.need > xp) || null;
  return { ...cur, next, nextNeed: next ? next.need : null };
}

export const useGameStore = defineStore('game', {
  state: () => ({
    xp: 0,
    unlocked: {}, // badgeId -> timestamp
    counters: {
      totalSolves: 0,
      scanSuccess: 0,
      cube2Solved: 0,
      bestTimerMs: null
    },
    loaded: false
  }),
  getters: {
    level: (s) => xpLevelOf(s.xp),
    collection: (s) =>
      COLLECTION_ITEMS.map((it) => ({
        ...it,
        owned: s.xp >= it.needXp,
        progress: Math.min(1, s.xp / it.needXp)
      })),
    badgesView: (s) => BADGES.map((b) => ({ ...b, owned: !!s.unlocked[b.id] }))
  },
  actions: {
    async init() {
      const d = await dbGet(DB_KEYS.XP, null);
      if (d) {
        this.xp = d.xp || 0;
        this.unlocked = d.unlocked || {};
        this.counters = { totalSolves: 0, scanSuccess: 0, cube2Solved: 0, bestTimerMs: null, ...(d.counters || {}) };
      }
      // badges 键单独存（§6 数据架构）
      const badges = await dbGet(DB_KEYS.BADGES, null);
      if (badges && badges.unlocked) this.unlocked = badges.unlocked;
      this.loaded = true;
    },
    async persist() {
      await dbSet(DB_KEYS.XP, { xp: this.xp, unlocked: this.unlocked, counters: this.counters });
      await dbSet(DB_KEYS.BADGES, { unlocked: this.unlocked });
    },
    /**
     * 记录一次事件，返回本次新解锁的内容（供页面弹庆祝）
     * @param {'solve'|'timer'|'scan_success'|'lesson_done'|'checkin'} event
     * @param {Object} detail { durationMs, cubeType }
     * @param {Object} ctxData { stats, streakDays, lessonsDone }（由调用方从 records/lessons store 注入，保持引擎解耦）
     */
    recordEvent(event, detail = {}, ctxData = {}) {
      const xpConf = XP_PER_EVENT[event] || 0;
      const beforeLevel = xpLevelOf(this.xp).level;
      this.xp += xpConf;

      const c = this.counters;
      if (event === 'solve' || event === 'timer') {
        c.totalSolves += 1;
        if ((detail.cubeType || '3x3') === '2x2') c.cube2Solved += 1;
        if (event === 'timer') {
          if (c.bestTimerMs == null || detail.durationMs < c.bestTimerMs) {
            c.bestTimerMs = detail.durationMs;
          }
        }
      }
      if (event === 'scan_success') c.scanSuccess += 1;

      const ctx = {
        stats: ctxData.stats || {},
        totalSolves: c.totalSolves,
        streakDays: ctxData.streakDays || 0,
        lessonsDone: ctxData.lessonsDone || 0,
        scanSuccess: c.scanSuccess,
        cube2Solved: c.cube2Solved,
        bestTimerMs: c.bestTimerMs,
        skillLevel: ctxData.skillLevel || 'novice'
      };

      const newBadges = [];
      BADGES.forEach((b) => {
        if (!this.unlocked[b.id]) {
          let ok = false;
          try {
            ok = !!b.check(ctx);
          } catch (e) {
            ok = false;
          }
          if (ok) {
            this.unlocked = { ...this.unlocked, [b.id]: Date.now() };
            newBadges.push(b);
          }
        }
      });

      this.persist();
      const after = xpLevelOf(this.xp);
      return {
        xpGained: xpConf,
        levelUp: after.level > beforeLevel ? after : null,
        level: after,
        newBadges
      };
    }
  }
});

export { xpLevelOf, XP_LEVELS };
