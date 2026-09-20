/**
 * records.js —— 成绩记录 / 统计 / 打卡 / 使用时长 / 家长 PIN
 * （逻辑对照小程序 utils/records.js + wcaRules.js 移植，存储换 localforage）
 */
import { defineStore } from 'pinia';
import { DB_KEYS, dbGet, dbSet, touchCheckin, addPlaytime } from './db.js';
import { computeLevel, todayKey, LEVELS } from './recordsMath.js';
import { averageOf, bestOf, meanOf, effectiveMs } from '../engine/wcaRules.js';

const MAX_RECORDS = 500;
const ROUND_SIZE_DEFAULT = 5;

export const MODE_NAME = { free: '自由玩', guided: '跟做', timer: '计时', scan: '拍照', wca: '赛场', drill: '训练' };

export const useRecordsStore = defineStore('records', {
  state: () => ({
    list: [],
    checkin: { dates: {} },
    playtime: {},
    parent: { pin: '' },
    loaded: false
  }),
  actions: {
    async init() {
      const [list, checkin, playtime, parent] = await Promise.all([
        dbGet(DB_KEYS.RECORDS, []),
        dbGet(DB_KEYS.CHECKIN, { dates: {} }),
        dbGet(DB_KEYS.PLAYTIME, {}),
        dbGet(DB_KEYS.PARENT, { pin: '' })
      ]);
      this.list = Array.isArray(list) ? list : [];
      this.checkin = checkin || { dates: {} };
      this.playtime = playtime || {};
      this.parent = parent || { pin: '' };
      this.loaded = true;
    },
    async addRecord(entry) {
      const record = {
        id: 'r' + Date.now() + Math.floor(Math.random() * 1000),
        durationMs: Math.max(0, Math.round(entry.durationMs || 0)),
        mode: entry.mode || 'free', // free | guided | timer | scan | wca | drill
        cubeType: entry.cubeType || '3x3',
        scramble: entry.scramble || '',
        date: entry.date || new Date().toISOString(),
        penalty: entry.penalty || '', // '' | '+2' | 'DNF'
        roundId: entry.roundId || ''
      };
      this.list.unshift(record);
      if (this.list.length > MAX_RECORDS) this.list.length = MAX_RECORDS;
      await dbSet(DB_KEYS.RECORDS, { list: this.list });
      await touchCheckin(record.durationMs);
      this.checkin = await dbGet(DB_KEYS.CHECKIN, { dates: {} });
      return record;
    },
    async clearRecords() {
      this.list = [];
      await dbSet(DB_KEYS.RECORDS, { list: [] });
    },
    getStats(cubeType = '3x3') {
      const list = this.list.filter((r) => (r.cubeType || '3x3') === cubeType);
      const toWca = (l) => l.map((r) => ({ ms: r.durationMs, penalty: r.penalty || '' }));
      if (!list.length) {
        return { count: 0, best: null, avg: null, ao5: null, ao12: null, recent: [], todayCount: 0, dnfCount: 0, plus2Count: 0 };
      }
      const wcaList = toWca(list);
      const today = new Date().toDateString();
      const a5 = averageOf(toWca(list.slice(0, 5)), 5);
      const a12 = averageOf(toWca(list.slice(0, 12)), 12);
      return {
        count: list.length,
        best: bestOf(wcaList),
        avg: meanOf(wcaList),
        ao5: a5 && !a5.isDNF ? a5.value : null,
        ao12: a12 && !a12.isDNF ? a12.value : null,
        ao5DNF: !!(a5 && a5.isDNF),
        dnfCount: list.filter((r) => r.penalty === 'DNF').length,
        plus2Count: list.filter((r) => r.penalty === '+2').length,
        recent: list.slice(0, 20),
        todayCount: list.filter((r) => new Date(r.date).toDateString() === today).length
      };
    },
    levelOf(cubeType = '3x3') {
      const stats = this.getStats(cubeType);
      return computeLevel(stats.ao5 || stats.avg || stats.best);
    },
    // ---- 打卡 ----
    getStreak() {
      let streak = 0;
      const d = new Date();
      if (!this.checkin.dates?.[todayKey(d)]) d.setDate(d.getDate() - 1); // 今天没打卡不打断连续（温和设计）
      for (;;) {
        if (this.checkin.dates?.[todayKey(d)]) {
          streak++;
          d.setDate(d.getDate() - 1);
        } else break;
      }
      return streak;
    },
    getMonth(year, month) {
      const prefix = year + '-' + String(month).padStart(2, '0');
      const out = {};
      Object.keys(this.checkin.dates || {}).forEach((k) => {
        if (k.indexOf(prefix) === 0) out[k] = this.checkin.dates[k];
      });
      return out;
    },
    // ---- 使用时长 ----
    async logPlaytime(minutes) {
      await addPlaytime(minutes);
      this.playtime = (await dbGet(DB_KEYS.PLAYTIME, {})) || {};
    },
    getPlaytimeToday() {
      return this.playtime[todayKey()] || 0;
    },
    getPlaytimeDays(n) {
      const out = [];
      const d = new Date();
      for (let i = n - 1; i >= 0; i--) {
        const dd = new Date(d.getTime() - i * 86400000);
        const key = todayKey(dd);
        out.push({
          date: key,
          minutes: this.playtime[key] || 0,
          solves: (this.checkin.dates?.[key] || {}).solves || 0
        });
      }
      return out;
    },
    // ---- 家长 PIN ----
    async setParentPin(pin) {
      this.parent = { pin: String(pin || '') };
      await dbSet(DB_KEYS.PARENT, { ...this.parent });
    },
    getParentPin() {
      return this.parent.pin || '';
    }
  }
});

export { LEVELS, computeLevel };
