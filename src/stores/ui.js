/**
 * ui.js —— 全局 UI 状态：轻提示 / 庆祝动画 / 使用时长心跳
 */
import { defineStore } from 'pinia';
import { useRecordsStore } from './records.js';

let toastTimer = null;
let playtimeTimer = null;

export const useUiStore = defineStore('ui', {
  state: () => ({
    toast: null, // { text, tone: 'info'|'success'|'warn' }
    celebrate: false,
    tabbarHidden: false
  }),
  actions: {
    showToast(text, tone = 'info', duration = 2200) {
      this.toast = { text, tone };
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        this.toast = null;
      }, duration);
    },
    celebrateOnce(ms = 2600) {
      this.celebrate = true;
      setTimeout(() => {
        this.celebrate = false;
      }, ms);
    },
    /** 使用时长心跳：每分钟记 1 分钟（家长报告用） */
    startPlaytimeHeartbeat() {
      const records = useRecordsStore();
      clearInterval(playtimeTimer);
      playtimeTimer = setInterval(() => {
        records.logPlaytime(1);
      }, 60000);
    },
    stopPlaytimeHeartbeat() {
      clearInterval(playtimeTimer);
    }
  }
});
