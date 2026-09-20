/**
 * settings.js —— 设置 / 本机身份（对照小程序 records.js 设置段 + store 语义）
 * 字段与 §6 一致：sound, voice, scrambleSec, demoSec, colorblind, largeFont, allowSlices, nickname
 */
import { defineStore } from 'pinia';
import { DB_KEYS, dbGet, dbSet } from './db.js';
import { normalizeSec, SPEED_MIN_SEC } from './recordsMath.js';

export const DEFAULT_SETTINGS = {
  sound: true,
  voice: true,
  scrambleSec: 0.5,
  demoSec: 0.5,
  colorblind: false,
  largeFont: false,
  allowSlices: false,
  nickname: '小小魔方玩家',
  // Web 专属：本地匿名身份（微信登录的替代）
  userId: '',
  dailyLimitMin: 30
};

function makeUserId() {
  return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    ...DEFAULT_SETTINGS,
    loaded: false
  }),
  getters: {
    scrambleDurationMs: (s) => Math.round(normalizeSec(s.scrambleSec, SPEED_MIN_SEC) * 1000),
    demoDurationMs: (s) => Math.round(normalizeSec(s.demoSec, SPEED_MIN_SEC) * 1000)
  },
  actions: {
    async init() {
      const saved = await dbGet(DB_KEYS.SETTINGS, {});
      Object.assign(this, DEFAULT_SETTINGS, saved || {});
      if (!this.userId) {
        this.userId = makeUserId();
        await this.persist();
      }
      this.loaded = true;
    },
    async persist() {
      const { loaded, ...rest } = this.$state;
      await dbSet(DB_KEYS.SETTINGS, JSON.parse(JSON.stringify(rest)));
    },
    update(patch) {
      Object.assign(this, patch);
      return this.persist();
    },
    setScrambleSec(v) {
      this.scrambleSec = normalizeSec(v, SPEED_MIN_SEC);
      return this.persist();
    },
    setDemoSec(v) {
      this.demoSec = normalizeSec(v, SPEED_MIN_SEC);
      return this.persist();
    },
    toggle(key) {
      this[key] = !this[key];
      return this.persist();
    }
  }
});
