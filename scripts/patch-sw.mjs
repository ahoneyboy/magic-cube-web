#!/usr/bin/env node
/**
 * patch-sw.mjs —— 在构建产物 dist/sw.js 末尾追加 Web Push 处理器
 * （对照小程序「订阅消息」的 Web 替代：push / notificationclick，需 HTTPS + 用户授权 + 推送服务端）
 */
import fs from 'node:fs';
import path from 'node:path';

const swPath = path.resolve(import.meta.dirname, '../dist/sw.js');
if (!fs.existsSync(swPath)) {
  console.error('dist/sw.js 不存在，请先 npm run build');
  process.exit(1);
}
let sw = fs.readFileSync(swPath, 'utf8');
if (sw.includes('magic-cube-push-handlers')) {
  console.log('push handlers 已存在，跳过');
  process.exit(0);
}

sw += `
/* magic-cube-push-handlers —— Web Push（对照小程序订阅消息的 Web 替代） */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: '魔力魔方', body: (event.data && event.data.text()) || '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || '魔力魔方', {
      body: data.body || '该练习今天的魔方口诀啦！',
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      tag: data.tag || 'magic-cube',
      data: { url: data.url || './' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes('magic-cube') || client.visibilityState === 'visible') {
          client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
`;
fs.writeFileSync(swPath, sw);
console.log('已追加 Web Push 处理器到 dist/sw.js');
