/**
 * lessons.js —— 课程进度存档（对照小程序 game.js 课程段 + store 语义）
 */
import { defineStore } from 'pinia';
import { DB_KEYS, dbGet, dbSet } from './db.js';

export const useLessonsStore = defineStore('lessons', {
  state: () => ({
    completed: {}, // stageId -> stars(1-3)
    loaded: false
  }),
  actions: {
    async init() {
      const p = await dbGet(DB_KEYS.LESSONS, { completed: {} });
      this.completed = (p && p.completed) || {};
      this.loaded = true;
    },
    /** 完成一课：返回是否首次（供弹庆祝/发经验） */
    async completeLesson(stageId, stars) {
      const firstTime = !this.completed[stageId];
      this.completed = { ...this.completed, [stageId]: Math.max(this.completed[stageId] || 0, stars || 1) };
      await dbSet(DB_KEYS.LESSONS, { completed: this.completed });
      return firstTime;
    },
    isUnlocked(stageOrder, stageId) {
      if (stageOrder <= 1) return true; // 第 1 课始终解锁
      return !!this.completed[stageId - 1];
    },
    getLessonsDone() {
      // 只统计基础 7 课（进阶课 id 从 101 开始）
      return Object.keys(this.completed).filter((k) => Number(k) <= 7).length;
    },
    getAdvancedDone() {
      return Object.keys(this.completed).filter((k) => Number(k) >= 101).length;
    }
  }
});
