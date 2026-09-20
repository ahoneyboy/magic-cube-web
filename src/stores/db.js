/**
 * db.js —— localforage / IndexedDB 封装（对照小程序 utils/store.js 职责）
 *
 * - 库名 magic-cube；键：settings / records / lessons / xp / badges / stickers / drill / sync
 * - 所有对象写入时附加 updatedAt
 * - 导出 / 导入 JSON：{ app:'magic-cube', version:1, exportedAt, data }
 */
import localforage from 'localforage';
import { todayKey } from './recordsMath.js';

export const DB_KEYS = {
  SETTINGS: 'settings',
  RECORDS: 'records',
  LESSONS: 'lessons',
  XP: 'xp',
  BADGES: 'badges',
  STICKERS: 'stickers',
  DRILL: 'drill',
  SYNC: 'sync',
  // 小程序同语义的内部键（打卡日历 / 使用时长 / 家长 PIN）
  CHECKIN: 'checkin',
  PLAYTIME: 'playtime',
  PARENT: 'parent'
};

export const db = localforage.createInstance({
  name: 'magic-cube',
  storeName: 'kv'
});

/** 读取（带 fallback） */
export async function dbGet(key, fallback) {
  try {
    const v = await db.getItem(key);
    return v == null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

/** 写入（附加 updatedAt） */
export async function dbSet(key, value) {
  const payload = value && typeof value === 'object' && !Array.isArray(value)
    ? { ...value, updatedAt: Date.now() }
    : value;
  try {
    await db.setItem(key, payload);
    return true;
  } catch (e) {
    return false;
  }
}

export async function dbRemove(key) {
  try {
    await db.removeItem(key);
  } catch (e) {
    /* 忽略 */
  }
}

// ---- 导出 / 导入 ----
export async function exportAll() {
  const data = {};
  for (const key of Object.values(DB_KEYS)) {
    const v = await dbGet(key, null);
    if (v != null) data[key] = v;
  }
  return {
    app: 'magic-cube',
    version: 1,
    exportedAt: new Date().toISOString(),
    data
  };
}

export async function importAll(exported) {
  if (!exported || exported.app !== 'magic-cube' || !exported.data) {
    throw new Error('文件格式不对：需要「魔力魔方」导出的 JSON');
  }
  for (const [key, value] of Object.entries(exported.data)) {
    if (Object.values(DB_KEYS).includes(key)) {
      // 直接写入（保留其 updatedAt 语义）
      await db.setItem(key, value);
    }
  }
  return true;
}

// ---- 打卡 / 时长（对照 records.js touchCheckin/addPlaytime）----
export async function touchCheckin(durationMs) {
  const data = (await dbGet(DB_KEYS.CHECKIN, { dates: {} })) || { dates: {} };
  const key = todayKey();
  const d = data.dates[key] || { solves: 0, ms: 0 };
  d.solves += 1;
  d.ms += durationMs || 0;
  data.dates[key] = d;
  await db.setItem(DB_KEYS.CHECKIN, { ...data, updatedAt: Date.now() });
}

export async function addPlaytime(minutes) {
  const data = (await dbGet(DB_KEYS.PLAYTIME, {})) || {};
  const key = todayKey();
  data[key] = (data[key] || 0) + minutes;
  await db.setItem(DB_KEYS.PLAYTIME, { ...data, updatedAt: Date.now() });
}
